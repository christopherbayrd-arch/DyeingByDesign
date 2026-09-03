import Link from "next/link";
import InstagramLink from "@/components/InstagramLink";
import SignupForm from "@/components/SignupForm";
import { asset } from "@/lib/assets";
import { INSTAGRAM_HANDLE } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-bone/10 bg-inkdeep/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-3">
        <div className="sm:col-span-2 md:col-span-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset("/images/logo.png")}
            alt="Dyeing By Design"
            width={150}
            height={150}
            className="rounded-full"
          />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-faded">
            Real botanicals, hand-cut stencils, and a careful pass of bleach. Hand made in
            Maine, one shirt at a time.
          </p>
          <InstagramLink className="mt-4 inline-flex items-baseline gap-2 text-sm font-medium text-bone transition hover:text-goldlight">
            <span>{INSTAGRAM_HANDLE}</span>
            <span className="text-xs text-faded">on Instagram ↗</span>
          </InstagramLink>
          <p className="mt-4 text-xs text-faded/70">
            © {new Date().getFullYear()} Dyeing By Design
          </p>
        </div>

        <div className="text-sm">
          <p className="kicker mb-4">Around the shop</p>
          <ul className="space-y-2.5 text-faded">
            <li><Link className="transition hover:text-goldlight" href="/shop">The lineup</Link></li>
            <li><Link className="transition hover:text-goldlight" href="/custom">Custom designs</Link></li>
            <li><Link className="transition hover:text-goldlight" href="/about">How it&apos;s made + care</Link></li>
            <li><Link className="transition hover:text-goldlight" href="/artist">Meet the artist</Link></li>
            <li><InstagramLink className="transition hover:text-goldlight" /></li>
            <li><Link className="transition hover:text-goldlight" href="/cart">Your cart</Link></li>
          </ul>
        </div>

        <div className="@container">
          <p className="kicker mb-4">First dibs on drops</p>
          <p className="mb-3 text-sm leading-relaxed text-faded">
            Small numbered batches a few times a year. Gone when they&apos;re gone — the
            list hears first.
          </p>
          <SignupForm />
        </div>
      </div>
    </footer>
  );
}
