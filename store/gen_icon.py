import os
from PIL import Image, ImageDraw

SIZE = 512
SCALE = SIZE / 108
stroke = max(1, round(5 * SCALE))
color = (255, 255, 255, 255)
bg = (27, 94, 32, 255)  # #1B5E20

img = Image.new("RGBA", (SIZE, SIZE), bg)
draw = ImageDraw.Draw(img)

def line(x1, y1, x2, y2):
    sx1, sy1 = x1 * SCALE, y1 * SCALE
    sx2, sy2 = x2 * SCALE, y2 * SCALE
    draw.line([(sx1, sy1), (sx2, sy2)], fill=color, width=stroke)
    r = stroke // 2
    draw.ellipse([sx1-r, sy1-r, sx1+r, sy1+r], fill=color)
    draw.ellipse([sx2-r, sy2-r, sx2+r, sy2+r], fill=color)

# Group 1: 4 vertical marks + diagonal cross
line(32, 34, 32, 74)
line(40, 34, 40, 74)
line(48, 34, 48, 74)
line(56, 34, 56, 74)
line(28, 64, 60, 44)

# Group 2: 2 vertical marks
line(72, 34, 72, 74)
line(80, 34, 80, 74)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "play_store_icon.png")
img.save(out)
print(f"Saved: {out} ({SIZE}x{SIZE})")
