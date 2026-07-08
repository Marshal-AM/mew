# Compliance Officer RLS Exception

Merchants are isolated by merchant_id via RLS. Compliance officers have cross-merchant read on audit_log, review_queue, sanctions_cache, customers, frozen_addresses, and str_filings.

Set role: UPDATE auth.users SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"compliance_officer"}'::jsonb WHERE email = 'officer@yourorg.com';

Audit log is append-only. Cross-merchant audit reads should use compliance_fetch_audit_log() which logs to compliance_access_log.
