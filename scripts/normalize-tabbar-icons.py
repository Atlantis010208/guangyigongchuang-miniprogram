from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ICON_NAMES = (
    "home",
    "cases",
    "services",
    "tools",
    "profile",
    "learning",
    "designer-tools",
    "projects",
)

CANVAS_SIZE = (64, 60)
MAX_GLYPH_SIZE = 50


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Icon has no visible pixels")
    return bbox


def normalize_pair(default_path: Path, active_path: Path) -> tuple[Image.Image, Image.Image]:
    source_images = [
        Image.open(default_path).convert("RGBA"),
        Image.open(active_path).convert("RGBA"),
    ]
    cropped = [image.crop(alpha_bbox(image)) for image in source_images]

    ratios = [image.width / image.height for image in cropped]
    reference_ratio = sum(ratios) / len(ratios)
    if reference_ratio >= 1:
        target_size = (MAX_GLYPH_SIZE, max(1, round(MAX_GLYPH_SIZE / reference_ratio)))
    else:
        target_size = (max(1, round(MAX_GLYPH_SIZE * reference_ratio)), MAX_GLYPH_SIZE)

    normalized = []
    for glyph in cropped:
        resized = glyph.resize(target_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        offset = (
            (CANVAS_SIZE[0] - target_size[0]) // 2,
            (CANVAS_SIZE[1] - target_size[1]) // 2,
        )
        canvas.alpha_composite(resized, offset)
        normalized.append(canvas)

    return normalized[0], normalized[1]


def make_preview(asset_dir: Path, output_path: Path) -> None:
    cell_size = (96, 84)
    preview = Image.new(
        "RGB",
        (cell_size[0] * len(ICON_NAMES), cell_size[1] * 2),
        "white",
    )
    for row, state in enumerate(("default", "active")):
        for column, name in enumerate(ICON_NAMES):
            icon = Image.open(asset_dir / f"tab-{name}-{state}.png").convert("RGBA")
            x = column * cell_size[0] + (cell_size[0] - CANVAS_SIZE[0]) // 2
            y = row * cell_size[1] + (cell_size[1] - CANVAS_SIZE[1]) // 2
            preview.paste(icon, (x, y), icon)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output_path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize tab icon scale and alignment.")
    parser.add_argument("asset_dir", type=Path)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()

    for name in ICON_NAMES:
        default_path = args.asset_dir / f"tab-{name}-default.png"
        active_path = args.asset_dir / f"tab-{name}-active.png"
        default_icon, active_icon = normalize_pair(default_path, active_path)
        default_icon.save(default_path, optimize=True)
        active_icon.save(active_path, optimize=True)

        default_bbox = alpha_bbox(default_icon)
        active_bbox = alpha_bbox(active_icon)
        if default_bbox != active_bbox:
            raise ValueError(f"State alignment mismatch for {name}: {default_bbox} != {active_bbox}")

    if args.preview:
        make_preview(args.asset_dir, args.preview)

    print(f"Normalized {len(ICON_NAMES) * 2} tab icons in {args.asset_dir}")


if __name__ == "__main__":
    main()
