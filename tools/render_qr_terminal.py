#!/usr/bin/env python3
"""Render a QR code in the terminal for quick verification."""

from __future__ import annotations

import sys

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_L
except ImportError:
    print("Missing dependency: pip install qrcode", file=sys.stderr)
    raise SystemExit(2)


def render_terminal(payload: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_L,
        box_size=1,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    matrix = qr.get_matrix()

    lines: list[str] = []
    for row in matrix:
        # Use plain ASCII so Windows terminals always render it.
        line = "".join("##" if cell else ".." for cell in row)
        lines.append(line)
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) > 1:
        payload = sys.argv[1]
    else:
        payload = "POS-001|2.58|2fe7d4|2c056006e6ee3c35|300"

    print(f"Payload ({len(payload)} chars): {payload}")
    print()
    print(render_terminal(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
