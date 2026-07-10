import sys
import time
from typing import Optional

# Force line-buffered stdout so progress is visible when piped/redirected.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

import serial
from serial.tools import list_ports


def log(msg: str) -> None:
    print(msg, flush=True)


def find_esp_port() -> Optional[str]:
    for p in list_ports.comports():
        if p.vid == 0x303A and p.device:
            return p.device
    for name in ("COM6", "COM5"):
        if name in [x.device for x in list_ports.comports()]:
            return name
    return None


def read_available(ser: serial.Serial) -> tuple[str, bool]:
    """Read any waiting serial bytes. Returns (text, port_ok)."""
    try:
        waiting = ser.in_waiting
        if waiting:
            return ser.read(waiting).decode("utf-8", errors="replace"), True
        line = ser.readline()
        if line:
            return line.decode("utf-8", errors="replace"), True
        return "", True
    except serial.SerialException as exc:
        log(f"[diag] serial read error: {exc}")
        return "", False


def drain(ser: serial.Serial, seconds: float, label: str = "listen") -> str:
    end = time.time() + seconds
    buf = ""
    last_heartbeat = 0.0
    log(f"[diag] {label}: waiting up to {seconds:.0f}s for serial data...")
    while time.time() < end:
        now = time.time()
        if now - last_heartbeat >= 5.0:
            remaining = max(0, end - now)
            log(f"[diag] {label}: still listening ({remaining:.0f}s left, {len(buf)} bytes so far)")
            last_heartbeat = now

        text, ok = read_available(ser)
        if not ok:
            log(f"[diag] {label}: port lost — press EN on the board and re-run")
            break
        if text:
            print(text, end="", flush=True)
            buf += text
        time.sleep(0.05)

    log(f"[diag] {label}: finished ({len(buf)} bytes captured)")
    return buf


def main() -> int:
    log("[diag] deep_diag.py starting")
    ports = list(list_ports.comports())
    log(f"[diag] found {len(ports)} serial port(s)")
    for p in ports:
        vid = f"0x{p.vid:04X}" if p.vid is not None else "none"
        log(f"[diag]   {p.device} vid={vid} {p.description}")

    port = find_esp_port()
    if not port:
        log("ERROR: no Espressif USB port found (VID 303A)")
        return 1

    log(f"[diag] selected port: {port}")
    log(f"Opening {port} @ 115200 (DTR/RTS off to avoid bootloader)...")
    try:
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = 115200
        ser.timeout = 0.5
        ser.dtr = False
        ser.rts = False
        ser.open()
        log(f"[diag] port open OK (in_waiting={ser.in_waiting})")
    except serial.SerialException as exc:
        log(f"ERROR: could not open {port}: {exc}")
        return 1

    # Let boot finish after port open (WiFi/display can take 15-25s).
    log("Listening for boot log (25s)...")
    boot = drain(ser, 25.0, label="boot")
    if "Audio ready" not in boot and "Moo POS firmware" not in boot:
        log("NOTE: no boot banner yet — board may still be starting or USB CDC reconnecting.")
        log("Listening another 15s...")
        drain(ser, 15.0, label="boot-retry")

    for cmd in (b"P", b"p", b"P\r\n"):
        log(f"Sending command {cmd!r}...")
        ser.write(cmd)
        ser.flush()
        time.sleep(0.2)

        deadline = time.time() + 90
        captured = ""
        last_heartbeat = 0.0
        log("[diag] waiting for [DEEP] response (up to 90s)...")
        while time.time() < deadline:
            now = time.time()
            if now - last_heartbeat >= 5.0:
                remaining = max(0, deadline - now)
                log(f"[diag] command wait: {remaining:.0f}s left, {len(captured)} bytes, has_DEEP={('[DEEP]' in captured)}")
                last_heartbeat = now

            text, ok = read_available(ser)
            if not ok:
                log("[diag] port lost during command wait — press EN on the board and re-run")
                ser.close()
                return 3
            if text:
                print(text, end="", flush=True)
                captured += text

            if "[DEEP] ===== done =====" in captured:
                ser.close()
                log("Deep diagnostic complete.")
                return 0
            if "[DEEP] --- diagnosis ---" in captured and "[DEEP] ===== done =====" in captured:
                ser.close()
                log("Deep diagnostic complete.")
                return 0

        if "[DEEP]" in captured:
            log("[diag] partial [DEEP] output received, trying next command variant...")
            break
        log(f"[diag] no [DEEP] output for command {cmd!r}")

    ser.close()
    log("ERROR: no [DEEP] output received.")
    log("Try: press EN on the board, then re-run this script.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
