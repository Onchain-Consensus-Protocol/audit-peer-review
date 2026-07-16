import React from "react";

export function OCPHeaderBrand({ href = "/audit-review.html", suffix = "AUDIT PEER REVIEW" }: { href?: string; suffix?: string }) {
  return (
    <a href={href} className="group flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
      <img src="/logo.svg" alt="OCP" className="h-8 w-8 shrink-0 rounded-md object-contain transition-transform group-hover:scale-105" />
      <span className="font-display text-lg font-bold tracking-wide text-text transition-colors group-hover:text-accent md:text-xl">
        OCP
        <span className="ml-1 hidden text-sm font-normal text-text-muted sm:inline">/ {suffix}</span>
      </span>
    </a>
  );
}
