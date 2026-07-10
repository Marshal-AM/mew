# POS product catalog

Merchants define products in Supabase (`products` table) with a keypad slot `pos_slot` (1–9). The POS syncs the catalog over WiFi; the wallet app and QR payload are unchanged.

## Flow

1. POS boots → `GET /functions/v1/pos-products?pos_id=POS-001`
2. Cashier presses `1`–`9` to pick a product (or `#` / `0` for no product)
3. Cashier enters amount on keypad → `#` → QR (amount only)
4. Wallet signs and sends payment over BLE (unchanged)
5. POS POSTs to `submit-transaction` with the wallet’s signed JSON **plus** `productId` (added by POS, not signed)
6. Pipeline stores `transactions.product_id` and `product_name`

## Demo seeds

| Slot | Product  | UUID |
|------|----------|------|
| 1    | Coffee   | `22222222-2222-4222-8222-222222222201` |
| 2    | Sandwich | `22222222-2222-4222-8222-222222222202` |
| 3    | Water    | `22222222-2222-4222-8222-222222222203` |

Merchant: `11111111-1111-4111-8111-111111111111` (wallet `0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844`).

## Deploy

1. Run migration `20250710120000_pos_product_selection.sql` (or updated `setup.sql`)
2. Deploy edge function: `supabase functions deploy pos-products`

## Manage products

Insert or update rows in `products` with `merchant_id`, `name`, `pos_slot` (1–9), and `active = true`. The POS re-syncs on boot (and retries every 30s until loaded).

**Preferred:** use the dashboard **Products** page at `/merchant/products` (manual CRUD + keypad slot map preview). See [`dashboard/README.md`](../../dashboard/README.md).
