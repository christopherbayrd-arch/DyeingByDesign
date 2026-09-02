// Shared bits for the custom request flow (form + API + email)

export const REQUEST_KINDS = [
  { key: "leaves", label: "Leaves / botanical", hint: "Mail us leaves, or tell us what to go find." },
  { key: "logo", label: "Logo stencil", hint: "Your business, team, or brand — cut as a stencil." },
  { key: "graphic", label: "Graphic / silhouette", hint: "A shape, an icon, a piece of art you love." },
  { key: "other", label: "Something else", hint: "Not sure which? Just describe it." },
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number]["key"];

export function isRequestKind(v: string): v is RequestKind {
  return REQUEST_KINDS.some((k) => k.key === v);
}

export function kindLabel(k: string) {
  return REQUEST_KINDS.find((x) => x.key === k)?.label ?? "Something else";
}

export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ARTWORK_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf";
export const ARTWORK_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
]);
