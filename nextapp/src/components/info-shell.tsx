"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import Reveal from "@/components/reveal";

/* Inner prose page chrome: solid header, warm card, footer — in the v3 look. */
export function InfoShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      <SiteHeader variant="solid" />
      <main className="mx-auto max-w-3xl px-4 pt-10">
        <Reveal>
          <div className="mb-6">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-leaf">
              {eyebrow}
            </span>
            <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-forest sm:text-[32px]">{title}</h1>
            <p className="mt-2 max-w-xl text-[14px] font-medium leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-10">
            <div className="prose-page">{children}</div>
          </div>
        </Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}
