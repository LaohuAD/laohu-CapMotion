#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def ease(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def prepare(path, crop):
    image = Image.open(path).convert("RGBA").crop(crop)
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius=20, fill=255)
    image.putalpha(mask.filter(ImageFilter.GaussianBlur(0.7)))
    return image


def scale_quad(quad, scale=1.0, dx=0.0, dy=0.0):
    center = quad.mean(axis=0)
    return center + (quad - center) * scale + np.array([dx, dy])


def destination_to_source_coefficients(destination, source_width, source_height):
    source = np.array(
        [[0, 0], [source_width - 1, 0], [0, source_height - 1], [source_width - 1, source_height - 1]],
        dtype=float,
    )
    matrix, values = [], []
    for (x, y), (u, v) in zip(destination, source):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return np.linalg.solve(np.asarray(matrix), np.asarray(values))


def warp(image, quad, opacity, width, height):
    coefficients = destination_to_source_coefficients(quad, image.width, image.height)
    warped = image.transform(
        (width, height), Image.Transform.PERSPECTIVE, coefficients, Image.Resampling.BICUBIC
    )
    if opacity < 1:
        warped.putalpha(warped.getchannel("A").point(lambda value: round(value * opacity)))
    return warped


def add_card(canvas, card):
    alpha = card.getchannel("A")
    glow_alpha = alpha.filter(ImageFilter.GaussianBlur(8)).point(lambda value: round(value * 0.22))
    glow = Image.new("RGBA", canvas.size, (255, 190, 88, 0))
    glow.putalpha(glow_alpha)
    canvas.alpha_composite(glow)
    canvas.alpha_composite(card)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    width = int(config["canvas"]["width"])
    height = int(config["canvas"]["height"])
    fps = int(config["canvas"]["fps"])
    start, end = map(float, config["active_range_seconds"])

    left_image = prepare(config["replacement_images"]["left"], (9, 3, 457, 651))
    right_image = prepare(config["replacement_images"]["right"], (10, 16, 465, 679))
    left_quad = np.asarray(config["stable_quads"]["left"], dtype=float)
    right_quad = np.asarray(config["stable_quads"]["right"], dtype=float)
    left_late = np.asarray(config["late_quads"]["left"], dtype=float)
    right_late = np.asarray(config["late_quads"]["right"], dtype=float)

    def motion_quads(time):
        if time <= 12.0:
            return left_quad, right_quad
        progress = ease((time - 12.0) / 0.5)
        return (
            left_quad + (left_late - left_quad) * progress,
            right_quad + (right_late - right_quad) * progress,
        )

    frame_count = round((end - start) * fps) + 1
    for index in range(frame_count):
        time = start + index / fps
        if time < 10.8:
            entry = ease((time - 10.5) / 0.3)
            left_opacity = right_opacity = entry
            current_left = scale_quad(left_quad, 0.91 + 0.09 * entry)
            current_right = scale_quad(right_quad, 0.91 + 0.09 * entry)
        elif time <= 13.20:
            left_opacity = right_opacity = 1.0
            current_left, current_right = motion_quads(time)
        elif time <= 13.45:
            progress = ease((time - 13.20) / 0.25)
            left_opacity = 1.0 if time <= 13.35 else 1.0 - ease((time - 13.35) / 0.10)
            right_opacity = 1.0
            current_left = scale_quad(left_late, 1.0 - 0.04 * progress, dx=-10 * progress)
            current_right = scale_quad(right_late, 1.0 - 0.04 * progress, dx=230 * progress)
        else:
            progress = ease((time - 13.45) / (end - 13.45))
            left_opacity = 0.0
            right_opacity = 1.0 - progress
            current_left = scale_quad(left_late, 0.96, dx=-10)
            current_right = scale_quad(right_late, 0.96 - 0.04 * progress, dx=230 + 110 * progress)

        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        if left_opacity > 0.001:
            add_card(canvas, warp(left_image, current_left, left_opacity, width, height))
        if right_opacity > 0.001:
            add_card(canvas, warp(right_image, current_right, right_opacity, width, height))
        canvas.save(output_dir / f"overlay_{index:04d}.png", optimize=True)

    print(json.dumps({"frames": frame_count, "start": start, "end": end, "output": str(output_dir)}))


if __name__ == "__main__":
    main()
