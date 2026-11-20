import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 500
BG = (27, 94, 32)
WHITE = (255, 255, 255)
YELLOW = (255, 214, 0)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# --- decorative tally marks (left side) ---
def tally(draw, ox, oy, scale=1.0, alpha=80):
    s = scale
    c = (255, 255, 255)
    w = max(1, int(5 * s))
    overlay = Image.new("RGBA", img.size, (0,0,0,0))
    od = ImageDraw.Draw(overlay)
    coords = [
        ((ox+0,  oy),    (ox+0,  oy+40*s)),
        ((ox+12*s, oy),  (ox+12*s, oy+40*s)),
        ((ox+24*s, oy),  (ox+24*s, oy+40*s)),
        ((ox+36*s, oy),  (ox+36*s, oy+40*s)),
        ((ox-4*s, oy+30*s), (ox+40*s, oy+10*s)),  # diagonal
        ((ox+52*s, oy),  (ox+52*s, oy+40*s)),
        ((ox+64*s, oy),  (ox+64*s, oy+40*s)),
    ]
    color = (255, 255, 255, alpha)
    for (x1,y1),(x2,y2) in coords:
        od.line([(x1,y1),(x2,y2)], fill=color, width=w)
    return overlay

# Left tally group
ov1 = tally(draw, 60, 200, scale=2.5, alpha=60)
img_rgba = img.convert("RGBA")
img_rgba = Image.alpha_composite(img_rgba, ov1)

# Right tally group (mirrored position)
ov2 = tally(draw, 730, 200, scale=2.5, alpha=60)
img_rgba = Image.alpha_composite(img_rgba, ov2)

img = img_rgba.convert("RGB")
draw = ImageDraw.Draw(img)

# --- text ---
try:
    font_big  = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 110)
    font_sub  = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 48)
    font_tag  = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 32)
except:
    font_big = font_sub = font_tag = ImageFont.load_default()

def center_text(draw, y, text, font, color):
    bb = draw.textbbox((0, 0), text, font=font)
    w = bb[2] - bb[0]
    draw.text(((W - w) / 2, y), text, font=font, fill=color)

center_text(draw, 140, "Toepen", font_big, YELLOW)
center_text(draw, 270, "Score Tracker", font_sub, WHITE)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feature_graphic.png")
img.save(out)
print(f"Saved: {out} ({W}x{H})")
