#!/usr/bin/env python3
"""Generate bleach-style leaf artwork SVGs for Dyeing By Design."""
import math, random

INK = "#1a160f"
CANVAS = 900

def bleach_bg(seed):
    """Mottled bleached-fabric background: warm ambers + grain + splatter."""
    rng = random.Random(seed)
    blobs = []
    for _ in range(9):
        cx, cy = rng.randint(60, 840), rng.randint(60, 840)
        r = rng.randint(160, 380)
        light = rng.choice(["#e9d5a9", "#dfc28c", "#c9a267", "#a37c48"])
        op = round(rng.uniform(0.18, 0.42), 2)
        blobs.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{light}" opacity="{op}" filter="url(#blur)"/>')
    spl = []
    for _ in range(90):
        cx, cy = rng.randint(10, 890), rng.randint(10, 890)
        r = round(rng.uniform(0.8, 5.2), 1)
        op = round(rng.uniform(0.35, 0.9), 2)
        spl.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#f4e7c3" opacity="{op}"/>')
    for _ in range(14):
        cx, cy = rng.randint(40, 860), rng.randint(40, 860)
        rx, ry = rng.randint(6, 18), rng.randint(3, 9)
        rot = rng.randint(0, 180)
        spl.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#efe0b8" opacity="0.5" transform="rotate({rot} {cx} {cy})"/>')
    return f'''<defs>
  <filter id="blur"><feGaussianBlur stdDeviation="65"/></filter>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="{seed}" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 0.5 0"/>
  </filter>
</defs>
<rect width="900" height="900" fill="#c49b62"/>
{''.join(blobs)}
<rect width="900" height="900" filter="url(#grain)" opacity="0.55"/>
{''.join(spl)}'''

def mirror(pts):
    """Full outline from right-half points (top->bottom), mirrored back up the left."""
    right = pts
    left = [(-x, y) for x, y in reversed(pts[1:-1])]
    return right + left

def poly_path(pts, cx=450, close=True):
    d = f'M {cx + pts[0][0]:.0f},{pts[0][1]:.0f} ' + ' '.join(
        f'L {cx + x:.0f},{y:.0f}' for x, y in pts[1:])
    return d + (' Z' if close else '')

# ---------- polar leaf generators ----------
def tri(t):
    """Triangle wave in [-1,1] with period 1."""
    return 4 * abs(t - math.floor(t + 0.5)) - 1

def maple_outline():
    """Sugar maple: 5 pointed lobes via polar lobe envelope + toothed edge."""
    pts = []
    for i in range(261):
        th = math.radians(-125 + 250 * i / 260)   # 0 = straight up
        deg = abs(math.degrees(th))
        lobe = abs(math.cos(th * 3.6))            # peaks at 0, +-50, +-100 deg
        e = (0.50 + 0.50 * lobe ** 2.0) ** 1.35   # pointier tips, moderate sinuses
        ser = 0.035 * tri(th * 2.8) * (0.35 + 0.65 * lobe)
        taper = 1 - 0.18 * (deg / 125) ** 1.5     # lower lobes shorter
        r = 310 * (e + ser) * taper
        pts.append((math.sin(th) * r, -math.cos(th) * r))
    return pts

def oak_outline():
    """White oak: obovate blade with rounded lobes on the sides."""
    pts = []
    for i in range(361):
        th = math.radians(-172 + 344 * i / 360)
        a, b = 168, 252
        base = (a * b) / math.sqrt((b * math.sin(th)) ** 2 + (a * math.cos(th)) ** 2)
        gate = abs(math.sin(th)) ** 0.6           # bumps only on sides
        lobes = 0.86 + 0.26 * (abs(math.sin(th * 5.0)) ** 1.2) * gate
        r = base * lobes
        pts.append((math.sin(th) * r, -math.cos(th) * r))
    return pts

def leaf_path(pts, cx, cy, scale=1.0, stem=90):
    """Close outline through a petiole/stem below the blade."""
    first, last = pts[0], pts[-1]
    d = f'M {cx + first[0]*scale:.0f},{cy + first[1]*scale:.0f} ' + ' '.join(
        f'L {cx + x*scale:.0f},{cy + y*scale:.0f}' for x, y in pts[1:])
    # stem: from last point curve to stem foot, back up to first point
    sx, sy = cx, cy + (abs(last[1]) + stem) * scale
    d += (f' Q {cx + last[0]*scale*0.15:.0f},{cy + (abs(last[1])+stem*0.45)*scale:.0f} {sx + 5*scale:.0f},{sy:.0f}'
          f' L {sx - 5*scale:.0f},{sy:.0f}'
          f' Q {cx + first[0]*scale*0.15:.0f},{cy + (abs(first[1])+stem*0.45)*scale:.0f} {cx + first[0]*scale:.0f},{cy + first[1]*scale:.0f} Z')
    return d

def scatter_svg(outline_pts, seed, placements):
    """Product art: one hero leaf + smaller scattered ones, like the real spray layouts."""
    leaves = []
    for (cx, cy, scale, rot) in placements:
        d = leaf_path(outline_pts, 0, 0, scale)
        leaves.append(f'<g transform="translate({cx} {cy}) rotate({rot})"><path d="{d}" fill="{INK}"/></g>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">
{bleach_bg(seed)}
{''.join(leaves)}
</svg>'''

def maple_parts(scale=1.0):
    """Maple as a union of sharp spikes + web + base wedge (paper-cut style)."""
    hub = (0.0, 0.0)
    parts = []
    def rot(deg, x, y):
        a = math.radians(deg)
        return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a))
    def spike(deg, L, hw):
        tipx, tipy = rot(deg, 0, -L)
        p1 = rot(deg, -hw, 30)
        p2 = rot(deg, hw, 30)
        return f'<path d="M {p1[0]*scale:.0f},{p1[1]*scale:.0f} L {tipx*scale:.0f},{tipy*scale:.0f} L {p2[0]*scale:.0f},{p2[1]*scale:.0f} Z" fill="{INK}"/>'
    spikes = [(0, 300, 54), (48, 252, 50), (-48, 252, 50), (96, 210, 46), (-96, 210, 46)]
    for deg, L, hw in spikes:
        parts.append(spike(deg, L, hw))
        # serration: two small teeth flanking each spike
        for side in (1, -1):
            bx, by = rot(deg, 0, -L * 0.52)
            tx, ty = rot(deg + side * 34, 0, -L * 0.80)
            parts.append(f'<path d="M {(bx - 14)*scale:.0f},{(by + 10)*scale:.0f} L {tx*scale:.0f},{ty*scale:.0f} L {(bx + 14)*scale:.0f},{(by + 10)*scale:.0f} Z" fill="{INK}"/>')
    # web + base wedge + stem
    parts.append(f'<circle cx="0" cy="0" r="{118*scale:.0f}" fill="{INK}"/>')
    parts.append(f'<path d="M {-128*scale:.0f},{36*scale:.0f} L {128*scale:.0f},{36*scale:.0f} L {0:.0f},{150*scale:.0f} Z" fill="{INK}"/>')
    parts.append(f'<path d="M {-7*scale:.0f},{120*scale:.0f} L {7*scale:.0f},{120*scale:.0f} L {10*scale:.0f},{300*scale:.0f} L {24*scale:.0f},{322*scale:.0f} L {2*scale:.0f},{312*scale:.0f} L {-8*scale:.0f},{300*scale:.0f} Z" fill="{INK}"/>')
    return ''.join(parts)

def maple_svg():
    leaves = []
    for (cx, cy, scale, rotdeg) in [(440, 390, 1.0, -7), (755, 170, 0.36, 26), (150, 730, 0.32, -40)]:
        leaves.append(f'<g transform="translate({cx} {cy}) rotate({rotdeg})">{maple_parts(scale)}</g>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">
{bleach_bg(7)}
{''.join(leaves)}
</svg>'''

def oak_svg():
    return scatter_svg(oak_outline(), 13, [
        (450, 400, 0.98, 5),
        (140, 190, 0.36, -28),
        (760, 720, 0.33, 34),
    ])

# ---------- FERN (ostrich fern: plume of tapered pinnae) ----------
def fern_svg():
    rng = random.Random(3)
    parts = []
    n = 19
    x0, y0, x1, y1 = 470, 800, 415, 120   # rachis from base to tip (slight lean)
    # rachis as tapered polygon
    parts.append(f'<path d="M {x0-7},{y0} C {x0-16},{600} {x1-8},{360} {x1-2},{y1} '
                 f'C {x1+2},{360} {x0+2},{600} {x0+7},{y0} Z" fill="{INK}"/>')
    for i in range(n):
        t = i / (n - 1)
        # position along rachis (matching the C curve approximately)
        bx = x0 + (x1 - x0) * t - 10 * math.sin(math.pi * t)
        by = y0 + (y1 - y0) * t
        # plume length profile: longest ~55% up, short at both ends
        L = 200 * (math.sin(math.pi * (0.08 + 0.86 * t)) ** 0.9)
        if L < 18:
            continue
        ang_up = 38 + 30 * t   # pinnae sweep upward more near tip
        for side in (1, -1):
            a = math.radians(ang_up)
            dx, dy = side * math.cos(a) * L, -math.sin(a) * L * 0.55
            w = max(7, L * 0.16) * rng.uniform(0.9, 1.1)
            tipx, tipy = bx + dx, by + dy
            # slender curved pinna: two quadratics meeting at tip
            nx, ny = -dy, dx  # normal
            nl = math.hypot(nx, ny) or 1
            nx, ny = nx / nl * w, ny / nl * w
            c1x, c1y = bx + dx * 0.45 + nx, by + dy * 0.45 + ny
            c2x, c2y = bx + dx * 0.45 - nx, by + dy * 0.45 - ny
            parts.append(f'<path d="M {bx:.0f},{by:.0f} Q {c1x:.0f},{c1y:.0f} {tipx:.0f},{tipy:.0f} '
                         f'Q {c2x:.0f},{c2y:.0f} {bx:.0f},{by:.0f} Z" fill="{INK}"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">
{bleach_bg(21)}
<g transform="rotate(3 450 450)">{''.join(parts)}</g>
</svg>'''

# ---------- SUMAC logo mark (simplified frond, single color) ----------
def sumac_mark(color="#c98d45"):
    parts = []
    x0, y0, x1, y1 = 50, 88, 50, 14   # vertical stem
    parts.append(f'<rect x="48.6" y="{y1+6}" width="2.8" height="{y0-y1-6}" rx="1.4" fill="{color}"/>')
    pairs = 5
    for i in range(pairs):
        t = i / (pairs - 1)
        by = 78 - t * 52
        L = 30 * (1 - 0.45 * t)
        for side in (1, -1):
            a = math.radians(34 + 10 * t)
            dx, dy = side * math.cos(a) * L, -math.sin(a) * L * 0.6
            w = max(2.6, L * 0.16)
            tipx, tipy = 50 + dx, by + dy
            nx, ny = -dy, dx
            nl = math.hypot(nx, ny) or 1
            nx, ny = nx / nl * w, ny / nl * w
            c1x, c1y = 50 + dx * 0.45 + nx, by + dy * 0.45 + ny
            c2x, c2y = 50 + dx * 0.45 - nx, by + dy * 0.45 - ny
            parts.append(f'<path d="M 50,{by:.1f} Q {c1x:.1f},{c1y:.1f} {tipx:.1f},{tipy:.1f} Q {c2x:.1f},{c2y:.1f} 50,{by:.1f} Z" fill="{color}"/>')
    # terminal leaflet
    parts.append(f'<path d="M 50,{y1+10} Q 46.5,{y1+4} 50,{y1-4} Q 53.5,{y1+4} 50,{y1+10} Z" fill="{color}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{"".join(parts)}</svg>'

with open('public/images/maple.svg', 'w') as f: f.write(maple_svg())
with open('public/images/oak.svg', 'w') as f: f.write(oak_svg())
with open('public/images/fern.svg', 'w') as f: f.write(fern_svg())
with open('public/images/leaf-mark.svg', 'w') as f: f.write(sumac_mark())
with open('app/icon.svg', 'w') as f: f.write(sumac_mark())
print("wrote maple.svg oak.svg fern.svg leaf-mark.svg app/icon.svg")
