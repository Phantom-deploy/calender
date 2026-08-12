#!/usr/bin/env python3
"""Generate the app icons. Run: python3 tools/make_icons.py

No image libraries required — shapes are rasterized from signed distance
fields and written out as PNGs with zlib. Re-run after changing the design.
"""

import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
BG = (47, 111, 237)      # accent blue
FG = (255, 255, 255)


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    qx, qy = abs(px - cx) - (hw - r), abs(py - cy) - (hh - r)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    return outside + min(max(qx, qy), 0.0) - r


def sd_circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r


def cover(sd):
    """Antialiased coverage for a distance in pixel units."""
    return min(1.0, max(0.0, 0.5 - sd))


def blend(dst, color, a):
    if a <= 0:
        return dst
    r, g, b, da = dst
    cr, cg, cb = color
    na = a + da * (1 - a)
    if na == 0:
        return (0, 0, 0, 0)
    out = tuple((c * a + d * da * (1 - a)) / na for c, d in ((cr, r), (cg, g), (cb, b)))
    return (out[0], out[1], out[2], na)


def render(size, maskable=False):
    s = float(size)
    # Full-bleed for maskable/iOS; rounded card for generic icons.
    bg_radius = 0.0 if maskable else 0.225 * s
    scale = 0.78 if maskable else 1.0          # keep the glyph inside the safe zone
    cx = cy = s / 2

    # calendar body
    bw, bh = 0.30 * s * scale, 0.275 * s * scale
    br = 0.075 * s * scale
    stroke = 0.055 * s * scale
    body_cy = cy + 0.035 * s * scale

    # header bar of the calendar
    head_y = body_cy - bh + 0.085 * s * scale

    px_rows = []
    for y in range(size):
        row = bytearray()
        py = y + 0.5
        for x in range(size):
            px = x + 0.5
            p = (0.0, 0.0, 0.0, 0.0)

            if bg_radius:
                p = blend(p, BG, cover(sd_round_rect(px, py, cx, cy, s / 2, s / 2, bg_radius)))
            else:
                p = blend(p, BG, 1.0)

            # body outline
            d = sd_round_rect(px, py, cx, body_cy, bw, bh, br)
            p = blend(p, FG, cover(abs(d) - stroke / 2))

            # header fill (clipped to the body)
            if py < head_y:
                head = max(d, -(head_y - py))
                p = blend(p, FG, cover(head))

            # two hanging tabs above the body
            tab_r = 0.028 * s * scale
            for tx in (cx - 0.155 * s * scale, cx + 0.155 * s * scale):
                top = body_cy - bh - 0.075 * s * scale
                d_tab = sd_round_rect(px, py, tx, top, tab_r, 0.055 * s * scale, tab_r)
                p = blend(p, FG, cover(d_tab))

            # a single marked day
            p = blend(p, FG, cover(sd_circle(px, py, cx, body_cy + 0.085 * s * scale, 0.036 * s * scale)))

            r, g, b, a = p
            row += bytes((round(r), round(g), round(b), round(a * 255)))
        px_rows.append(bytes(row))
    return px_rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {len(png) / 1024:.1f} KB")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for size, maskable, name in [
        (180, True, "icon-180.png"),        # iOS home screen
        (192, False, "icon-192.png"),
        (512, False, "icon-512.png"),
        (512, True, "icon-512-maskable.png"),
    ]:
        write_png(os.path.join(OUT, name), render(size, maskable), size)
