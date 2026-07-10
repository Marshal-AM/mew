"""Plain serial listen test — like pio device monitor + RST, reports byte count."""
import sys
import time

import serial
from serial.tools import list_ports

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


def main() -> int:
    print("[monitor-test] available ports:")
    for p in list_ports.comports():
        vid = f"0x{p.vid:04X}" if p.vid is not None else "none"
        print(f"  {p.device} vid={vid} {p.description}")

    port = None
    for p in list_ports.comports():
        if p.vid == 0x303A and p.device:
            port = p.device
            break
    if not port:
        print("[monitor-test] ERROR: no Espressif USB CDC port (VID 303A)")
        return 1

    print(f"[monitor-test] opening {port} @ 115200...")
    ser = serial.Serial(port, 115200, timeout=0.5)
    print("[monitor-test] pulsing DTR to trigger reset (like RST button)...")
    ser.dtr = False
    ser.rts = False
    time.sleep(0.1)
    ser.dtr = True
    time.sleep(0.1)
    ser.dtr = False
    time.sleep(0.5)

    buf = ""
    end = time.time() + 30
    last_heartbeat = 0.0
    print("[monitor-test] listening 30s for ANY serial output...")
    while time.time() < end:
        now = time.time()
        if now - last_heartbeat >= 5:
            print(f"[monitor-test] {max(0, end - now):.0f}s left, {len(buf)} bytes captured")
            last_heartbeat = now
        try:
            waiting = ser.in_waiting
            if waiting:
                chunk = ser.read(waiting).decode("utf-8", errors="replace")
                print(chunk, end="", flush=True)
                buf += chunk
            else:
                line = ser.readline()
                if line:
                    text = line.decode("utf-8", errors="replace")
                    print(text, end="", flush=True)
                    buf += text
        except serial.SerialException as exc:
            print(f"[monitor-test] read error: {exc}")
            break
        time.sleep(0.05)

    ser.close()
    print(f"\n[monitor-test] DONE: {len(buf)} bytes total")
    if buf:
        print("[monitor-test] SAMPLE (first 500 chars):")
        print(buf[:500])
        return 0

    print("[monitor-test] NO DATA — Serial is not reaching this port")
    return 2


if __name__ == "__main__":
    sys.exit(main())
