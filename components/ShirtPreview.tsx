// A blank tee drawn as SVG and tinted with whatever color is picked.
// Not a photo of the actual design — it's there so people can see the
// blank they're choosing. Shading is done with semi-transparent overlays
// so it works on any color, black included.
import { COLORS } from "@/lib/products";

export default function ShirtPreview({
  color,
  size = 160,
  className = "",
}: {
  color: string | null;
  size?: number;
  className?: string;
}) {
  const c = COLORS.find((x) => x.key === color);
  const fill = c?.hex ?? "#3a3a3a";
  const isDark = c ? luminance(c.hex) < 0.25 : true;
  // Tee outline — chest-down, short sleeves, slight drape at the hem
  const tee =
    "M70 28 L88 20 Q100 40 112 20 L130 28 L172 46 L190 84 L152 98 L150 178 Q100 188 50 178 L48 98 L10 84 L28 46 Z";

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={c ? `${c.name} blank tee` : "Blank tee"}
      className={className}
    >
      <defs>
        <linearGradient id="tee-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="tee-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={isDark ? 0.16 : 0.22} />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="tee-clip">
          <path d={tee} />
        </clipPath>
      </defs>
      {/* soft drop shadow */}
      <ellipse cx="100" cy="186" rx="60" ry="6" fill="#000" opacity="0.25" />
      {/* the blank */}
      <path d={tee} fill={fill} stroke={isDark ? "rgba(240,231,209,0.28)" : "rgba(0,0,0,0.35)"} strokeWidth="1.5" strokeLinejoin="round" />
      <g clipPath="url(#tee-clip)">
        <rect x="0" y="0" width="200" height="200" fill="url(#tee-shade)" />
        <rect x="0" y="0" width="200" height="200" fill="url(#tee-light)" />
        {/* fold creases */}
        <path d="M72 104 Q78 140 70 178" stroke="#000" strokeOpacity="0.12" strokeWidth="3" fill="none" />
        <path d="M128 104 Q122 140 130 178" stroke="#000" strokeOpacity="0.12" strokeWidth="3" fill="none" />
        {/* sleeve seams */}
        <path d="M48 98 Q49 60 70 28" stroke="#000" strokeOpacity="0.18" strokeWidth="1.5" fill="none" />
        <path d="M152 98 Q151 60 130 28" stroke="#000" strokeOpacity="0.18" strokeWidth="1.5" fill="none" />
      </g>
      {/* collar */}
      <path d="M88 20 Q100 40 112 20" fill="none" stroke={isDark ? "rgba(240,231,209,0.35)" : "rgba(0,0,0,0.45)"} strokeWidth="2.5" />
    </svg>
  );
}

function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
