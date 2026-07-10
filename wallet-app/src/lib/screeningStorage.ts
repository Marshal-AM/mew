const SCREENING_STATUS_KEY_PREFIX = "moo_screening_status_v2";
const SCREENING_NAME_KEY_PREFIX = "moo_screening_name_v2";

export function screeningStatusKey(walletAddress: string): string {
  return `${SCREENING_STATUS_KEY_PREFIX}:${walletAddress.toLowerCase()}`;
}

export function screeningNameKey(walletAddress: string): string {
  return `${SCREENING_NAME_KEY_PREFIX}:${walletAddress.toLowerCase()}`;
}
