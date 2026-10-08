import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { ProductView } from "@/components/product-view";

/* Static export — one page per product, generated from the catalog at build
   time. Products added after a build still work: Express falls back to the
   previous product page for handles without a v2 export. */
export const dynamicParams = false;

function loadCatalog(): any[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "..", "data", "products.json"), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : data.products || [];
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return loadCatalog().map((p) => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const product = loadCatalog().find((p) => p.handle === handle);
  if (!product) return { title: "Product not found — Rebesta Fresh" };
  const title = `${product.title} — Rebesta Fresh`;
  const description = `${product.title} — ₹${product.priceInr} / ${product.unitLabel}. ${product.description || ""}`.slice(0, 300);
  return {
    title,
    description,
    alternates: { canonical: `/products/${encodeURIComponent(product.handle)}` },
    openGraph: {
      title,
      description: `${product.title} at ₹${product.priceInr}/${product.unitLabel} — fresh from farms, delivered in Hosur.`,
      images: [{ url: product.image }],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProductView handle={decodeURIComponent(handle)} />;
}
