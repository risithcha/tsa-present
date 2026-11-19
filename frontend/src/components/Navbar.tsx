"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioWaveform, History, Mic } from "lucide-react";
import { BackendWarmupBadge } from "./BackendWarmupBadge";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Practice Studio", icon: Mic, match: (p: string) => p === "/" },
    {
      href: "/history",
      label: "History",
      icon: History,
      match: (p: string) => p.startsWith("/history") || p.startsWith("/report"),
    },
  ];

  return (
    <header className="no-print sticky top-0 z-40 border-b border-white/[0.08] bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-105">
              <AudioWaveform className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white sm:text-base">
                TSA <span className="text-cyan-400">Present</span>
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-widest text-slate-400 sm:block">
                AI Speech Studio
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
                    active
                      ? "bg-indigo-500/20 text-white shadow-sm ring-1 ring-indigo-400/30"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <BackendWarmupBadge />
        </div>
      </div>
    </header>
  );
}
