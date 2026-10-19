"use client";

import { useEffect, useState } from "react";
import { ProductView } from "@/components/product-view";

function handleFromCurrentPath(): string {
  const lastSegment = window.location.pathname.split("/").filter(Boolean).pop() || "";
  let decoded = lastSegment;
  try {
    decoded = decodeURIComponent(lastSegment);
  } catch {
    // Keep the original segment; the allowlist below will still make it safe.
  }
  return decoded.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

/* Express serves this Next-exported shell for valid product slugs that were
   added after the last static build. Resolve the real slug in the browser so
   ProductView can use the live product API without the Vite fallback. */
export function ProductFallbackView() {
  const [handle, setHandle] = useState("");

  useEffect(() => {
    const currentHandle = handleFromCurrentPath();
    setHandle(currentHandle);
    if (!currentHandle) return;

    const canonicalUrl = `${window.location.origin}/products/${encodeURIComponent(currentHandle)}`;
    const syncCanonical = () => {
      const canonicals = Array.from(document.head.querySelectorAll('link[rel="canonical"]')) as HTMLLinkElement[];
      let canonical = canonicals[0];
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      if (canonical.href !== canonicalUrl) canonical.href = canonicalUrl;
      canonicals.slice(1).forEach((duplicate) => duplicate.remove());
    };
    syncCanonical();
    const observer = new MutationObserver(syncCanonical);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }, []);

  return <ProductView handle={handle} />;
}
