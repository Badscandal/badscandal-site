#!/usr/bin/env python3
"""BADSCANDAL v2 asset tiles — layered warm gradient blobs + heavy grain
on ink, matching the brand reference image. Original generated artwork."""
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

INK = (7, 5, 3)
PALETTE = [
    (255, 78, 26),    # blaze
    (240, 121, 30),   # uv orange
    (255, 180, 84),   # ember
    (122, 38, 32),    # maroon
    (154, 148, 140),  # silver
]

def blob_tile(w, h, seed, label=None, n_blobs=4):
    random.seed(seed)
    base = Image.new("RGB", (w // 2, h // 2), INK)
    d = ImageDraw.Draw(base, "RGBA")
    for i in range(n_blobs):
        c = random.choice(PALETTE)
        bx = random.uniform(-0.2, 1.0) * base.width
        by = random.uniform(-0.2, 1.0) * base.height
        br = random.uniform(0.25, 0.6) * base.width
        a = random.randint(70, 150)
        d.ellipse([bx - br, by - br * 0.7, bx + br, by + br * 0.7], fill=c + (a,))
    base = base.filter(ImageFilter.GaussianBlur(base.width * 0.12))
    base = ImageEnhance.Brightness(base).enhance(0.9)
    img = base.resize((w, h))
    # grain
    g = Image.new("L", (w // 2, h // 2))
    g.putdata([random.randint(0, 46) for _ in range((w // 2) * (h // 2))])
    g = g.resize((w, h))
    img.paste(Image.new("RGB", (w, h), (255, 255, 255)), (0, 0), g.point(lambda p: p // 5))
    d2 = ImageDraw.Draw(img)
    if label:
        d2.text((18, h - 30), label.upper(), fill=(243, 233, 221, 200))
    return img

OUT = "/home/claude/bs-v2/assets"
JOBS = [
    # work thumbs 3:2
    ("work-friendly", 1200, 800, 11), ("work-film", 1200, 800, 23),
    ("work-bycardoso", 1200, 800, 37), ("work-yorkst", 1200, 800, 41),
    ("work-v1", 1200, 800, 53),
    # service tiles 4:5
    ("svc-music", 800, 1000, 61), ("svc-direction", 800, 1000, 67),
    ("svc-video", 800, 1000, 71), ("svc-web", 800, 1000, 73),
    ("svc-brand", 800, 1000, 79), ("svc-content", 800, 1000, 83),
    # collage
    ("col-1", 900, 1200, 91), ("col-2", 1200, 900, 97),
    ("col-3", 900, 900, 101), ("col-4", 1200, 800, 103),
    # about / cta backdrops
    ("about-loop", 1200, 900, 107), ("cta-bg", 1600, 900, 109),
]
import os
os.makedirs(OUT, exist_ok=True)
for name, w, h, seed in JOBS:
    blob_tile(w, h, seed).save(f"{OUT}/{name}.webp", "WEBP", quality=68, method=4)
print("tiles done:", len(JOBS))
