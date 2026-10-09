#!/usr/bin/env python3
"""White-studio produce photos -> floating transparent-WebP cutouts.

Blind-safe pipeline (no human eyes needed):
  1. background = near-white OR near-neutral pixels CONNECTED to the border
     (flood fill) — colored produce is protected automatically
  2. neutral shadows (grey gradient under produce) get eaten by letting the
     flood grow into low-saturation pixels down to luminance ~185
  3. feathered edge: 1px erode + soft blur on alpha — no white fringe
  4. trim to content bbox, pad, resize <=900px, save WebP
Also prints per-image stats for verification and color-centroids used to
place X-ray hotspots on the actual produce, not on empty pixels.
"""
import numpy as np
from PIL import Image, ImageFilter
import json, os, sys

SRC = "/home/user/rebesta-own-store/public/assets/products"
DST = "/home/user/rebesta-own-store/public/assets/story"
os.makedirs(DST, exist_ok=True)

NAMES = sys.argv[1:] or [
    "baby-spinach-palak", "heirloom-tomatoes", "weekly-family-combo",
    "carrot-ooty", "mixed-greens-box", "capsicum-red", "broccoli",
]

def flood_background(rgb: np.ndarray) -> np.ndarray:
    """4-connected flood from border over near-white/near-neutral pixels."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    lum = (r + g + b) / 3.0
    sat = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
    neutral = sat < 22
    white = (lum >= 233) & neutral
    shadowish = (lum >= 182) & neutral  # grey studio shadows
    bg = np.zeros((h, w), dtype=bool)
    bg[0, :] = white[0, :]; bg[-1, :] = white[-1, :]
    bg[:, 0] = white[:, 0]; bg[:, -1] = white[:, -1]
    # BFS — grow through white always; grow into shadowish only from existing bg
    from collections import deque
    dq = deque()
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x]: dq.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and (y, x) not in dq: dq.append((y, x))
    # simpler: seed all border bg pixels
    dq = deque()
    seeds = np.argwhere(bg)
    for y, x in seeds: dq.append((int(y), int(x)))
    seen = bg.copy()
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if white[ny, nx] or (shadowish[ny, nx] and (white[y, x] or shadowish[y, x])):
                    # grow: white propagates freely; neutral shadows only eaten
                    # when attached to the studio field (which they always are)
                    seen[ny, nx] = True
                    dq.append((ny, nx))
    return seen

def color_centroid(rgb: np.ndarray, alpha: np.ndarray, mode: str):
    """centroid of a color-targeted mask inside opaque content — hotspot anchor"""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    if mode == "red":     m = (r > g + 35) & (r > b + 35)
    elif mode == "green": m = (g > r + 18) & (g > b + 12)
    elif mode == "brown": m = (r > g + 8) & (g > b + 8) & (r > 90) & (r < 215)
    else:                 m = np.ones_like(r, dtype=bool)
    m &= alpha > 200
    if m.sum() < 400:
        ys, xs = np.where(alpha > 200)
        if len(ys) == 0: return None
        return float(xs.mean()), float(ys.mean()), float(m.sum())
    ys, xs = np.where(m)
    return float(xs.mean()), float(ys.mean()), float(m.sum())

out_meta = {}
for name in NAMES:
    im = Image.open(f"{SRC}/{name}.jpg").convert("RGB")
    rgb = np.asarray(im)
    bg = flood_background(rgb)
    alpha = np.where(bg, 0, 255).astype(np.uint8)

    # stats BEFORE feather: residual near-white inside content
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
    content = alpha > 0
    residual_white = int(((lum >= 238) & (sat < 14) & content).sum())
    removed_pct = round(100.0 * bg.mean(), 1)

    # feather: erode 1px then soft blur — kills halo fringe
    a_img = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
    a = np.asarray(a_img).copy()
    a[bg] = 0  # never reintroduce bg

    # trim to content bbox + pad
    ys, xs = np.where(a > 12)
    if len(ys) == 0:
        print(f"{name}: EMPTY CUTOUT — SKIP"); continue
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 24
    y0, y1 = max(0, y0 - pad), min(im.height - 1, y1 + pad)
    x0, x1 = max(0, x0 - pad), min(im.width - 1, x1 + pad)
    rgba = np.dstack([rgb[y0:y1+1, x0:x1+1], a[y0:y1+1, x0:x1+1]])
    cut = Image.fromarray(rgba, "RGBA")
    if max(cut.size) > 900:
        s = 900 / max(cut.size)
        cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.LANCZOS)

    # centroids for hotspot anchoring (in final cutout coords)
    arr = np.asarray(cut)
    cent = {}
    for label, mode in (("red", "red"), ("green", "green"), ("brown", "brown"), ("any", "any")):
        c = color_centroid(arr[..., :3], arr[..., 3], mode)
        if c:
            cent[label] = {"x": round(c[0] / cut.width, 3), "y": round(c[1] / cut.height, 3), "px": int(c[2])}
    # ground point = bottom-center of dense content (for the shadow ellipse)
    solid = arr[..., 3] > 200
    ys2, xs2 = np.where(solid)
    bottom_band = solid[int(solid.shape[0] * 0.82):, :]
    bys, bxs = np.where(bottom_band)
    ground = {"x": round(float(bxs.mean()) / cut.width, 3), "y": round((int(bys.mean()) + int(solid.shape[0] * 0.82)) / cut.height, 3)} if len(bys) else {"x": 0.5, "y": 0.95}

    cut.save(f"{DST}/cut-{name}.webp", "WEBP", quality=82, method=6)
    out_meta[name] = {
        "size": cut.size, "removed_pct": removed_pct, "residual_white_px": residual_white,
        "centroids": cent, "ground": ground,
        "coverage_w": round((x1 - x0) / im.width, 3), "coverage_h": round((y1 - y0) / im.height, 3),
    }
    print(f"{name}: removed {removed_pct}% | residual-white in content: {residual_white}px | cut {cut.size} | ground {ground}")

with open(f"{DST}/cutouts.json", "w") as f:
    json.dump(out_meta, f, indent=1)
print("\nmeta -> public/assets/story/cutouts.json")
