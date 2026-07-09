#!/usr/bin/env python3
"""Generate a clean PNG QR code for a payload."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
except ImportError as exc:
    print(f"Missing dependency: {exc}", file=sys.stderr)
    raise SystemExit(2)


def main() -> int:
    payload = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "POS-001|2.58|2fe7d4|2c056006e6ee3c35|300"
    )
    output = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("generated_qr.png")
    )

    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(output)

    print(f"Payload ({len(payload)} chars): {payload}")
    print(f"Saved QR PNG to: {output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
