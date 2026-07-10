import sys
import time
from typing import Optional

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
    try:
        waiting = ser.in_waiting
        if waiting:
            return ser.read(waiting).decode("utf-8", errors="replace"), True
        line = ser.readline()
        if line:
            return line.decode("utf-8", errors="replace"), True
        return "", True
    except serial.SerialException as exc:
        log(f"[spk] serial read error: {exc}")
        return "", False


def drain(ser: serial.Serial, seconds: float, label: str = "listen") -> str:
    end = time.time() + seconds
    buf = ""
    last_heartbeat = 0.0
    log(f"[spk] {label}: waiting up to {seconds:.0f}s...")
    while time.time() < end:
        now = time.time()
        if now - last_heartbeat >= 5.0:
            remaining = max(0, end - now)
            log(f"[spk] {label}: still listening ({remaining:.0f}s left, {len(buf)} bytes)")
            last_heartbeat = now

        text, ok = read_available(ser)
        if not ok:
            log(f"[spk] {label}: port lost — press EN on the board and re-run")
            break
        if text:
            print(text, end="", flush=True)
            buf += text
        time.sleep(0.05)

    log(f"[spk] {label}: finished ({len(buf)} bytes captured)")
    return buf


def main() -> int:
    log("[spk] spk_diag.py starting — MAX98357A speaker/amp test")
    log("[spk] You should hear 880 Hz then 440 Hz beeps during the test.")
    ports = list(list_ports.comports())
    log(f"[spk] found {len(ports)} serial port(s)")

    port = find_esp_port()
    if not port:
        log("ERROR: no Espressif USB port found (VID 303A)")
        return 1

    log(f"[spk] selected port: {port}")
    try:
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = 115200
        ser.timeout = 0.5
        ser.dtr = False
        ser.rts = False
        ser.open()
    except serial.SerialException as exc:
        log(f"ERROR: could not open {port}: {exc}")
        return 1

    log("Listening for boot log (25s)...")
    boot = drain(ser, 25.0, label="boot")
    if "Audio ready" not in boot and "Moo POS firmware" not in boot:
        log("NOTE: no boot banner yet — listening another 15s...")
        drain(ser, 15.0, label="boot-retry")

    for cmd in (b"S", b"s", b"S\r\n"):
        log(f"Sending speaker diagnostic command {cmd!r}...")
        ser.write(cmd)
        ser.flush()
        time.sleep(0.2)

        deadline = time.time() + 45
        captured = ""
        last_heartbeat = 0.0
        log("[spk] waiting for [SPK] response (up to 45s)...")
        while time.time() < deadline:
            now = time.time()
            if now - last_heartbeat >= 5.0:
                remaining = max(0, deadline - now)
                log(f"[spk] command wait: {remaining:.0f}s left, has_SPK={('[SPK]' in captured)}")
                last_heartbeat = now

            text, ok = read_available(ser)
            if not ok:
                ser.close()
                return 3
            if text:
                print(text, end="", flush=True)
                captured += text

            if "[SPK] ===== done =====" in captured:
                ser.close()
                if "I2S SPEAKER PATH OK" in captured:
                    log("Speaker I2S path OK in software.")
                    if "no pin toggling" in captured.lower():
                        log("WARNING: no GPIO activity on amp pins — check wiring.")
                    log("If you heard no beeps: tie MAX98357A SD pin to 3.3V.")
                    return 0
                log("Speaker diagnostic finished with errors — see log above.")
                return 2

        if "[SPK]" in captured:
            break
        log(f"[spk] no [SPK] output for command {cmd!r}")

    ser.close()
    log("ERROR: no [SPK] output. Flash latest firmware, press EN, re-run.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
