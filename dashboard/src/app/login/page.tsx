"use client";

import { useState } from "react";
import { BrowserProvider } from "ethers";
import { buildSiweMessage, SESSION_STORAGE_KEY } from "@/lib/siwe";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const [status, setStatus] = useState("Connect your merchant wallet to sign in.");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!eth) throw new Error("No Ethereum wallet found. Install MetaMask.");

      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/merchant-auth`;
      const nonceRes = await fetch(fnUrl);
      const nonceJson = (await nonceRes.json()) as { nonce?: string; error?: string };
      if (!nonceRes.ok || !nonceJson.nonce) {
        throw new Error(nonceJson.error ?? "Failed to fetch nonce");
      }

      const message = buildSiweMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        chainId: 80002,
        nonce: nonceJson.nonce,
      });

      const signature = await signer.signMessage(message);
      const authRes = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const authJson = (await authRes.json()) as {
        session?: { access_token: string; refresh_token: string };
        error?: string;
      };
      if (!authRes.ok || !authJson.session) {
        throw new Error(authJson.error ?? "Authentication failed");
      }

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authJson.session));
      const supabase = getSupabase();
      await supabase.auth.setSession(authJson.session);
      window.location.href = "/pos-devices";
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
      <h1>Merchant Login</h1>
      <p>Sign in with your wallet (SIWE-style) to manage POS devices.</p>
      <p>{status}</p>
      <button type="button" onClick={() => void signIn()} disabled={busy} style={{ padding: "0.75rem 1.25rem" }}>
        {busy ? "Signing in..." : "Connect Wallet"}
      </button>
    </main>
  );
}
