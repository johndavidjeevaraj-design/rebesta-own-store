"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, LogOut, ShoppingBasket } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { InstallButton } from "@/components/install-button";
import { api, Product } from "@/lib/store";

const LIKE_KEY = "rebesta_own_likes_v1";

function readLikes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIKE_KEY) || "{}");
    return v && typeof v === "object" ? Object.keys(v) : [];
  } catch {
    return [];
  }
}

/* ❤️ Favourites — every product the customer liked on the shop/product pages.
   Device-local (no account needed), updates live when hearts are toggled. */
function FavouritesSection() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [liked, setLiked] = useState<string[]>([]);

  useEffect(() => {
    setLiked(readLikes());
    api<{ products?: Product[] }>("/api/products")
      .then((data) => setProducts(Array.isArray(data.products) ? data.products : []))
      .catch(() => setProducts([]));
    const sync = () => setLiked(readLikes());
    window.addEventListener("rebesta:likes-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rebesta:likes-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const favs = useMemo(
    () => (products || []).filter((p) => liked.includes(p.handle)),
    [products, liked]
  );
  const loading = products === null && liked.length > 0;

  return (
    <div className="mt-9">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Saved</h2>
      <h3 className="mt-2 flex items-center gap-2 font-display text-[21px] font-bold tracking-tight text-ink">
        Your favourites
        <Heart size={16} className="fill-carrot text-carrot" />
      </h3>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="aspect-[3/4] animate-pulse rounded-[20px] bg-[#f5f5f7]" />
          <div className="aspect-[3/4] animate-pulse rounded-[20px] bg-[#f5f5f7]" />
        </div>
      ) : favs.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {favs.map((p, i) => (
            <ProductCard key={p.handle} product={p} index={i} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[28px] bg-[#f5f5f7] p-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <Heart size={22} strokeWidth={1.8} />
          </span>
          <h3 className="mt-4 text-[15px] font-bold text-ink">No favourites yet</h3>
          <p className="mx-auto mt-1.5 max-w-[240px] text-[13px] font-medium text-muted-foreground">
            Tap the heart on any product and it will wait for you here.
          </p>
          <a className="fresh-grad mt-5 inline-flex h-11 items-center rounded-full px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05] active:scale-[0.98]" href="/shop">
            Browse vegetables
          </a>
        </div>
      )}
    </div>
  );
}

interface AccountCustomer {
  name?: string;
  phone?: string;
  createdAt?: string;
  phoneVerified?: boolean;
}

interface AccountOrder {
  id: string;
  placedAt?: string;
  status?: string;
  itemCount?: number;
  totalInr?: number;
  slot?: { label?: string };
}

/* Account/profile/orders are loaded and rendered by the Next component. */
export function AccountView() {
  const [customer, setCustomer] = useState<AccountCustomer | null>(null);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        const data = await response.json().catch(() => null);
        const current = data?.customer || null;
        if (cancelled) return;
        setCustomer(current);
        if (!current) return;

        setOrdersLoading(true);
        try {
          const orderResponse = await fetch("/api/auth/orders", { credentials: "same-origin" });
          const orderData = await orderResponse.json();
          if (cancelled) return;
          const list = Array.isArray(orderData.orders) ? orderData.orders : [];
          setOrders(list.sort((a: AccountOrder, b: AccountOrder) => String(b.placedAt || "").localeCompare(String(a.placedAt || ""))));
        } catch {
          if (!cancelled) setOrders([]);
        } finally {
          if (!cancelled) setOrdersLoading(false);
        }
      } catch {
        if (!cancelled) setCustomer(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* The session cookie may already have expired; return to the storefront. */
    }
    window.location.href = "/";
  }

  const since = customer?.createdAt ? new Date(customer.createdAt) : null;
  const sinceLabel = since && Number.isFinite(since.getTime())
    ? since.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "today";

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="pb-20">
        <section className="mx-auto max-w-xl px-4 pt-14 sm:pt-16">
          {loading ? (
            <div className="space-y-4" aria-label="Loading account">
              <div className="h-28 animate-pulse rounded-[28px] bg-[#f5f5f7]" />
              <div className="h-36 animate-pulse rounded-[28px] bg-[#f5f5f7]" />
            </div>
          ) : customer ? (
            <>
              <div className="account-panel rounded-[28px] border border-line bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] sm:p-7">
                <div className="flex items-center gap-4">
                  <span className="account-avatar grid h-14 w-14 shrink-0 place-items-center rounded-full bg-mint text-[17px] font-bold text-leaf" aria-hidden="true">
                    {(customer.name || "R").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[21px] font-semibold tracking-tight text-ink">{customer.name || "Rebesta customer"}</h1>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted-foreground">
                      {customer.phone || ""} · with Rebesta since {sinceLabel}
                      {customer.phoneVerified && (
                        <span className="verified-chip">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          verified
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-2 bg-white px-4 text-[13px] font-bold text-ink transition hover:bg-[#f5f5f7] disabled:opacity-60"
                    type="button" onClick={() => void signOut()} disabled={signingOut}
                  >
                    <LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </div>

              <section className="mt-9">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">History</h2>
                <h3 className="mt-2 font-display text-[21px] font-bold tracking-tight text-ink">Your orders</h3>
                {ordersLoading ? (
                  <div className="mt-5 space-y-3" aria-label="Loading orders">
                    <div className="h-20 animate-pulse rounded-[18px] bg-[#f5f5f7]" />
                    <div className="h-20 animate-pulse rounded-[18px] bg-[#f5f5f7]" />
                  </div>
                ) : orders.length ? (
                  <div className="mt-5">
                    {orders.map((order) => {
                      const status = String(order.status || "").replace(/_/g, " ").toLowerCase();
                      const state = /deliver/.test(status) ? "green" : /cancel/.test(status) ? "gray" : "orange";
                      const when = order.placedAt
                        ? new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                        : "";
                      const itemCount = Number(order.itemCount || 0);
                      return (
                        <a key={order.id} className="account-order" href={`/track?id=${encodeURIComponent(order.id)}`}>
                          <div className="ao-main">
                            <strong>{itemCount} item{itemCount === 1 ? "" : "s"} · ₹{Number(order.totalInr || 0).toLocaleString("en-IN")}</strong>
                            <span>{when}{order.slot?.label ? ` · ${order.slot.label}` : ""}</span>
                          </div>
                          <div className="ao-side">
                            <span className={`badge ${state}`}>{status || "order"}</span>
                            <span className="ao-id">{order.id}</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state mt-5 rounded-[28px] bg-[#f5f5f7] p-10 text-center">
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
                      <ShoppingBasket size={22} strokeWidth={1.8} />
                    </span>
                    <h3 className="mt-4 text-[15px] font-bold text-ink">No orders yet</h3>
                    <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">Your first Rebesta order will appear here.</p>
                    <a className="carrot-grad mt-5 inline-flex h-11 items-center rounded-full px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(232,71,12,0.35)] transition hover:brightness-[1.05]" href="/shop">Start shopping</a>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="rounded-[28px] bg-[#f5f5f7] p-10 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
                <ShoppingBasket size={26} strokeWidth={1.8} />
              </span>
              <h1 className="mt-5 font-display text-[24px] font-semibold tracking-tight text-ink">You&rsquo;re not signed in</h1>
              <p className="mx-auto mt-2 max-w-xs text-[14px] font-medium leading-relaxed text-muted-foreground">
                Sign in to see your orders and profile — or keep shopping, no account needed.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a className="fresh-grad inline-flex h-11 items-center rounded-full px-7 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05] active:scale-[0.98]" href="/login">Sign in</a>
              </div>
            </div>
          )}

          {/* ❤️ favourites — works with or without an account */}
          <FavouritesSection />

          <div className="mt-9">
            <InstallButton />
          </div>
        </section>
      </main>

      <style>{`
        .verified-chip { display:inline-flex; align-items:center; gap:4px; border-radius:9999px; background:#f0f5f0;
          color:#0d8736; padding:2px 8px 2px 6px; font-size:0.68rem; font-weight:700; }
        .verified-chip svg { width:11px; height:11px; }
        .account-order { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
          background:#fff; border:1px solid #e8e8ed; border-radius:18px; padding:16px 18px; margin-bottom:10px;
          text-decoration:none; transition:box-shadow .18s, transform .18s; }
        .account-order:hover { box-shadow:0 8px 24px rgba(0,0,0,0.08); transform:translateY(-1px); }
        .ao-main strong { display:block; font-size:0.95rem; font-weight:700; color:#1d1d1f; }
        .ao-main span { font-size:0.78rem; font-weight:500; color:#4a4a4f; }
        .ao-side { display:flex; align-items:center; gap:10px; }
        .ao-id { font-size:0.72rem; font-weight:600; color:#4a4a4f; font-variant-numeric:tabular-nums; }
        .badge { display:inline-flex; align-items:center; border-radius:9999px; padding:3px 10px; font-size:0.66rem; font-weight:700; }
        .badge.green { background:#f0f5f0; color:#0d8736; }
        .badge.orange { background:rgba(255,91,32,0.10); color:#d84a15; }
        .badge.gray { background:rgba(0,0,0,0.06); color:#4a4a4f; }
        .account-order.in { animation:orderIn .35s ease; }
        @keyframes orderIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      `}</style>
      <SiteFooter />
    </div>
  );
}
