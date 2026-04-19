"use client";

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(8,13,25,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1260px] items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-3 text-white">
          <BrandLogo size="md" />
        </Link>

        <div className="hidden items-center gap-6 text-sm text-white/70 xl:flex">
          <Link href="/dashboard" className="hover:text-white">Overview</Link>
          <Link href="/bank" className="hover:text-white">Bank</Link>
          <Link href="/dev" className="hover:text-white">Developers</Link>
          <Link href="/subscription" className="hover:text-white">Subscription</Link>
          <Link href="/register" className="hover:text-white">Create profile</Link>
        </div>

        <div className="hidden min-w-[250px] items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 lg:flex">
          <span className="mr-2">Search dashboard, cards, transfers</span>
          <span className="ml-auto text-white/35">/</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/65 md:block">
            Secure session
          </div>
          <Link href="/login" className="neo-btn neo-btn--primary hidden md:inline-flex">
            Connect again
          </Link>
        </div>
      </div>
    </nav>
  );
}
