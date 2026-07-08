export function buildSiweMessage(params: {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
}): string {
  const issuedAt = new Date().toISOString();
  return `${params.domain} wants you to sign in with your Ethereum account:\n${params.address}\n\nURI: ${params.uri}\nVersion: 1\nChain ID: ${params.chainId}\nNonce: ${params.nonce}\nIssued At: ${issuedAt}`;
}

export const SESSION_STORAGE_KEY = "moo_dashboard_session";
