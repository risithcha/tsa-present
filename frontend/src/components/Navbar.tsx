"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackendWarmupBadge } from "./BackendWarmupBadge";
import { cn } from "@/lib/utils";

/**
 * Geometric TSA Present brand mark combining architectural podium geometry
 * with studio speech waveform bars.
 */
function TsaPresentMark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary text-on-primary transition-colors duration-[120ms] ease-state-change group-hover:bg-primary-container"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-5 w-5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="4" y="9" width="2.5" height="6" rx="1.25" fill="currentColor" opacity="0.75" />
        <rect x="8.5" y="5.5" width="2.5" height="13" rx="1.25" fill="currentColor" />
        <rect x="13" y="4" width="2.5" height="16" rx="1.25" fill="currentColor" />
        <rect x="17.5" y="8" width="2.5" height="8" rx="1.25" fill="currentColor" opacity="0.75" />
      </svg>
    </span>
  );
}

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/",
      label: "Practice Studio",
      match: (p: string) => p === "/",
    },
    {
      href: "/history",
      label: "History",
      match: (p: string) => p.startsWith("/history") || p.startsWith("/report"),
    },
  ];

  return (
    <header className="no-print sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex min-h-16 max-w-[1280px] flex-wrap items-center justify-between gap-gutter-sm px-6 py-2.5 sm:gap-gutter-md">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <TsaPresentMark />
          <div className="flex items-baseline gap-1.5">
            <span className="font-headline text-headline-sm tracking-tight text-primary">
              TSA
            </span>
            <span className="font-headline text-headline-sm tracking-tight text-on-surface">
              Present
            </span>
          </div>
        </Link>

        <nav
          aria-label="Studio navigation"
          className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface p-1"
        >
          {navItems.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-label text-label-md transition-colors duration-[120ms] ease-state-change focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4",
                  active
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center">
          <BackendWarmupBadge />
        </div>
      </div>
    </header>
  );
}
