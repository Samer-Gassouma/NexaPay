import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/35 text-white/80">
      <div className="mx-auto max-w-[1200px] px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <BrandLogo size="md" className="mb-3" />
            <p className="max-w-sm text-sm text-white/65">Open banking primitives on permissioned blockchain rails with local settlement and modern developer APIs.</p>
          </div>

          <div>
            <h5 className="mb-2 font-semibold text-white">Docs</h5>
            <ul className="space-y-1 text-sm text-white/60">
              <li>
                <Link href="/docs/API">API Reference</Link>
              </li>
              <li>
                <Link href="/docs/intro">Getting Started</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="mb-2 font-semibold text-white">Portals</h5>
            <ul className="space-y-1 text-sm text-white/60">
              <li>
                <Link href="/dashboard">Customer</Link>
              </li>
              <li>
                <Link href="/bank">Bank</Link>
              </li>
              <li>
                <Link href="/dev">Developer</Link>
              </li>
              <li>
                <Link href="/subscription">Subscription</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-white/50">Copyright © {new Date().getFullYear()} NexaPay. Built for secure Tunisian payments.</div>
      </div>
    </footer>
  );
}
