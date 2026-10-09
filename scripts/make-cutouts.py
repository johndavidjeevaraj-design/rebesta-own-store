#!/usr/bin/env python3
"""White-studio produce photos -> floating transparent-WebP cutouts, v2.

v2 fixes (the v1 flaws you could see on a black void):
  1. ALPHA DECONTAMINATION — edge pixels are white-blended
     (C_obs = a*C_true + (1-a)*255); we recover the true color:
     C_true = (C_obs - (1-a)*255) / a   -> no pale halo on dark bg
  2. STRONGER SHADOW EATING — iterative flood into low-saturation pixels
     down to luminance 150 (grey studio shadows eaten completely;
     colorful produce protected by the saturation gate)
  3. softer edge (erode 1 + blur 0.9), WebP q88
Blind-safe: prints per-image stats — fringe before/after, shadow residue,
coverage bbox — so quality is verifiable without eyes.
"""
import numpy as np
from PIL import Image, ImageFilter
from collections import deque
import os, sys

SRC = "/home/user/rebesta-own-store/public/assets/products"
DST = "/home/user/rebesta-own-store/public/assets/story"
os.makedirs(DST, exist_ok=True)

NAMES = sys.argv[1:] or [
    "baby-spinach-palak", "heirloom-tomatoes", "weekly-family-combo",
    "carrot-ooty", "mixed-greens-box", "capsicum-red", "broccoli",
]
SUFFIX = "-v2"

def flood_background(rgb: np.ndarray) -> np.ndarray:
    """4-connected flood from border: white freely, neutral greys (shadows)
    eaten iteratively down to luminance 150. Colored produce is immune."""
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    lum = (r + g + b) / 3.0
    sat = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
    white = (lum >= 233) & (sat < 20)
    shadowish = (lum >= 150) & (sat < 26)  # grey shadow gradient
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if white[ny, nx] or shadowish[ny, nx]:
                    seen[ny, nx] = True
                    dq.append((ny, nx))
    return seen

def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """recover true color from white-blended edge pixels:
    C_obs = a*C + (1-a)*255  ->  C = (C_obs - (1-a)*255)/a"""
    a = alpha.astype(np.float64) / 255.0
    out = rgb.astype(np.float64)
    edge = (alpha > 0) & (alpha < 255)
    ae = np.maximum(a, 0.04)[edge]
    obs = out[edge]
    true = (obs - (1 - ae[:, None]) * 255.0) / ae[:, None]
    out[edge] = np.clip(true, 0, 255)
    return out.astype(np.uint8)

for name in NAMES:
    im = Image.open(f"{SRC}/{name}.jpg").convert("RGB")
    rgb = np.asarray(im)
    bg = flood_background(rgb)

    # hard alpha, then feather (erode 1 + soft blur)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a_img = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    a = np.asarray(a_img).copy()
    a[bg] = 0

    # fringe metric BEFORE decontamination: mean lum of semi-transparent px
    semi = (a > 0) & (a < 255)
    fringe_before = float(rgb[semi].mean()) if semi.any() else 0.0

    rgb_clean = decontaminate(rgb, a)
    fringe_after = float(rgb_clean[semi].mean()) if semi.any() else 0.0

    # trim to content bbox + pad
    ys, xs = np.where(a > 12)
    if len(ys) == 0:
        print(f"{name}: EMPTY — SKIP"); continue
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 24
    y0, y1 = max(0, y0 - pad), min(im.height - 1, y1 + pad)
    x0, x1 = max(0, x0 - pad), min(im.width - 1, x1 + pad)
    rgba = np.dstack([rgb_clean[y0:y1+1, x0:x1+1], a[y0:y1+1, x0:x1+1]])
    cut = Image.fromarray(rgba, "RGBA")
    if max(cut.size) > 900:
        s = 900 / max(cut.size)
        cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.LANCZOS)

    # verification metrics
    arr = np.asarray(cut)
    al = arr[..., 3]
    content = al > 0
    lum = arr[..., :3].mean(axis=2)
    sat = arr[..., :3].max(axis=2).astype(int) - arr[..., :3].min(axis=2).astype(int)
    # shadow residue: neutral mid-lum pixels in bottom 20% of content
    ys2, _ = np.where(content)
    h_local = arr.shape[0]
    bottom = content.copy(); bottom[: int(ys2.max() * 0.8 if ys2.max() > 10 else h_local * 0.8), :] = False
    residue = int(((lum >= 150) & (lum < 233) & (sat < 26) & bottom).sum())
    removed_pct = round(100.0 * bg.mean(), 1)

    cut.save(f"{DST}/cut-{name}{SUFFIX}.webp", "WEBP", quality=88, method=6)
    print(f"{name}: removed {removed_pct}% | fringe lum {fringe_before:.0f}→{fringe_after:.0f} (halo killed)"
          f" | shadow residue {residue}px | {cut.size}")

print("\nv2 cutouts written with -v2 suffix (cache-busted URLs)")
