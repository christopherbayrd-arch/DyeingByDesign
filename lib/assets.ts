import { ASSET_HASHES } from "@/lib/assetManifest";

// Turns "/images/logo.png" into "/images/logo.png?v=1a2b3c4d" using the content
// hash baked in at build time (scripts/hash-assets.mjs). When a file in public/
// changes, its URL changes with it, so no browser or CDN can keep serving the
// old version after a deploy. Anything not in public/ — Blob uploads, external
// URLs, already-versioned paths — passes straight through.
export function asset(src: string): string {
  const hash = ASSET_HASHES[src];
  return hash ? `${src}?v=${hash}` : src;
}
