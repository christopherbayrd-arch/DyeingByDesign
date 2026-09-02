import Link from "next/link";
import SignupForm from "@/components/SignupForm";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-bone/10 bg-inkdeep/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="Dyeing By Design" width={190} height={113} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-faded">
            Real botanicals, hand-cut stencils, and a careful pass of bleach. Hand made in
            Maine, one shirt at a time.
          </p>
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
            <li><Link className="transition hover:text-goldlight" href="/cart">Your cart</Link></li>
          </ul>
        </div>

        <div>
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
