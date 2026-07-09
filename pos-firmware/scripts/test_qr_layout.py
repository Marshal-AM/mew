#!/usr/bin/env python3
"""Validate payment QR layout on a 128x64 OLED before flashing firmware."""

from __future__ import annotations

import json
import sys
import time

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_L
except ImportError:
    print("Missing dependency: pip install qrcode", file=sys.stderr)
    sys.exit(2)

OLED_WIDTH = 128
OLED_HEIGHT = 64
MIN_SCALE = 2
POS_ID = "POS-001"
PAYMENT_TTL_SEC = 300


def sample_payment_json() -> str:
    exp = int(time.time()) + PAYMENT_TTL_SEC
    return f"{POS_ID}|1.00|a1b2c3|0123456789abcdef|{PAYMENT_TTL_SEC}"


def sample_demo_text() -> str:
    return "GR8 that U R here:)"


def pick_version_and_scale(payload: str) -> tuple[int, int, list[list[bool]]]:
    for version in range(1, 11):
        try:
            qr = qrcode.QRCode(
                version=version,
                error_correction=ERROR_CORRECT_L,
                box_size=1,
                border=0,
            )
            qr.add_data(payload)
            qr.make(fit=False)
        except (ValueError, qrcode.exceptions.DataOverflowError):
            continue

        module_count = len(qr.get_matrix())
        scale_w = OLED_WIDTH // module_count
        scale_h = OLED_HEIGHT // module_count
        scale = min(scale_w, scale_h)
        if scale < MIN_SCALE:
            continue

        return version, scale, qr.get_matrix()

    raise RuntimeError(
        f"no QR version 1-10 fits payload ({len(payload)} chars) with scale>={MIN_SCALE}"
    )


def render_ascii(matrix: list[list[bool]], scale: int) -> str:
    lines: list[str] = []
    for row in matrix:
        line = ""
        for cell in row:
            block = "##" if cell else ".."
            line += block * scale
        for _ in range(scale):
            lines.append(line)
    return "\n".join(lines)


def validate_payload(label: str, payload: str) -> None:
    version, scale, matrix = pick_version_and_scale(payload)
    module_count = len(matrix)
    qr_pixels = module_count * scale

    print(f"[OK] {label}")
    print(f"     chars={len(payload)} version={version} modules={module_count} scale={scale}")
    print(f"     qr_pixels={qr_pixels}x{qr_pixels} screen={OLED_WIDTH}x{OLED_HEIGHT}")
    print()
    print(render_ascii(matrix, scale))
    print()


def main() -> int:
    print("=== Moo POS - OLED QR layout test ===")
    print(f"Screen: {OLED_WIDTH}x{OLED_HEIGHT}, min scale: {MIN_SCALE}")
    print()

    validate_payload("demo text (your working example)", sample_demo_text())

    try:
        validate_payload("payment JSON (production payload)", sample_payment_json())
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    print("All QR layout checks passed.")
    print("Flash only after this preview looks correct:")
    print("  .\\scripts\\flash-s3.ps1 -Upload")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
