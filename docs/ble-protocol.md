# Moo BLE Chunk Protocol (Phase 4)

POS is the BLE peripheral (GATT server). Wallet is the central (GATT client).

## GATT UUIDs

| Role | UUID |
|------|------|
| Service | `6d6f6f01-0000-4000-8000-000000000001` |
| Wallet → POS write | `6d6f6f02-0000-4000-8000-000000000002` |
| POS → wallet notify | `6d6f6f03-0000-4000-8000-000000000003` |

## Advertisement

- Local name: `Moo-{posId}` (e.g. `Moo-POS-001`)
- Service UUID included in advertising data

## Binary write frame (wallet → POS)

```
[0] seq   uint8  0 .. total-1
[1] total uint8  1 .. 255
[2..]   payload bytes
```

Max chunk payload = `min(mtu - 3, 244) - 2`. Default **18** bytes when MTU is 23.

## Logical message + CRC

Before chunking, the sender appends **CRC-16/CCITT-FALSE** (poly `0x1021`, init `0xFFFF`) as **big-endian** 2 bytes to the UTF-8 message.

Receiver reassembles all chunks, verifies CRC on the full buffer, then strips the last 2 bytes to get the message.

## Notify JSON (POS → wallet)

| Type | Example |
|------|---------|
| Chunk ack | `{"t":"ca","s":0}` |
| Complete | `{"t":"ok","len":1234}` |
| Error | `{"t":"err","m":"crc"}` |

## Stop-and-wait

Wallet sends chunk `seq`, waits for `{"t":"ca","s":seq}` before sending the next chunk.

## Dev pairing

- Static passkey: `123456` (both sides)
- Encrypted write characteristic after bonding

## Echo (Phase 4 test)

After successful RX, POS echoes the verified message back to the wallet using the same chunk format on the notify characteristic (wallet reassembles from notifications).
