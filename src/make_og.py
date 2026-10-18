#!/usr/bin/env python3
"""Generate assets/og-gift-budget.png (1200x630). python3 src/make_og.py"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

BRAND = "Winterwick Studio"
ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = pathlib.Path("/home/claude/lab-build/planner/fonts")  # OFL: Fraunces, Lato
W, H = 1200, 630
CREAM, GREEN, BERRY, INK = "#faf6ee", "#1f4d3a", "#9b1d36", "#55625b"

im = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(im)
d.rectangle([0, 0, W, 18], fill=GREEN)
for x in range(30, W, 44):
    d.ellipse([x - 5, 40, x + 5, 50], fill=BERRY)
serif = lambda s: ImageFont.truetype(str(FONTS / "Fraunces-Display.ttf"), s)
sans = lambda s: ImageFont.truetype(str(FONTS / "Lato-Bold.ttf"), s)
d.text((80, 120), "FREE HOLIDAY TOOL", font=sans(30), fill=BERRY)
d.text((80, 170), "Christmas Gift", font=serif(104), fill=GREEN)
d.text((80, 285), "Budget Calculator", font=serif(104), fill=GREEN)
d.text((80, 435), "One total. A fair split by priority. Every cent accounted for.", font=sans(34), fill=INK)
d.text((80, 535), BRAND, font=serif(40), fill=GREEN)
for x, y, r, c in ((1080, 548, 26, BERRY), (1124, 556, 22, "#b8293f")):
    d.ellipse([x - r, y - r, x + r, y + r], fill=c)
out = ROOT / "assets" / "og-gift-budget.png"
im.save(out, optimize=True)
print("wrote", out.relative_to(ROOT), im.size)
