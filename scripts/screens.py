#!/usr/bin/env python3
"""Подгоняет скриншоты под точные размеры магазинов.
Положи скрины в store/screens/in и запусти: npm run screens
Результат: store/screens/out/<магазин>/... (без обрезки, с тёмными полями по краям при несовпадении пропорций)."""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Нужен Pillow: pip install pillow')

ROOT = os.path.join(os.path.dirname(__file__), '..', 'store', 'screens')
SRC = os.path.join(ROOT, 'in')
OUT = os.path.join(ROOT, 'out')
BG = (7, 5, 10)
# (ширина, высота) в альбомной ориентации; для портретных скринов стороны меняются местами
TARGETS = {
    'appstore-iphone-6.9': (2868, 1320),
    'appstore-iphone-6.5': (2778, 1284),
    'appstore-ipad-13': (2752, 2064),
    'googleplay-phone': (1920, 1080),
    'googleplay-tablet': (2560, 1600),
}


def fit(img, w, h):
    k = min(w / img.width, h / img.height)
    im = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    canvas = Image.new('RGB', (w, h), BG)
    canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas


def main():
    os.makedirs(SRC, exist_ok=True)
    files = [f for f in sorted(os.listdir(SRC)) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not files:
        sys.exit(f'Положи скриншоты в {os.path.relpath(SRC)}')
    for name, (w, h) in TARGETS.items():
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for f in files:
            img = Image.open(os.path.join(SRC, f)).convert('RGB')
            tw, th = (w, h) if img.width >= img.height else (h, w)
            fit(img, tw, th).save(os.path.join(OUT, name, os.path.splitext(f)[0] + '.png'))
        print(f'{name}: {len(files)} шт.')


if __name__ == '__main__':
    main()
