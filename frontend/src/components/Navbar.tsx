"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackendWarmupBadge } from "./BackendWarmupBadge";
import { cn } from "@/lib/utils";

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
    <header className="no-print mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-gutter-sm px-6 pt-6 pb-2 sm:gap-gutter-md">
      <Link
        href="/"
        className="flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Image
          src="/tsa-logo.png"
          alt="Technology Student Association Logo"
          width={140}
          height={84}
          priority
          className="h-9 w-auto shrink-0 object-contain"
        />
        <span className="font-headline text-headline-sm tracking-tight text-on-surface">
          Present
        </span>
      </Link>

      <nav
        aria-label="Studio navigation"
        className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest p-1"
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
    </header>
  );
}
