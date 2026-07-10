"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { buildSiweMessage } from "@/lib/siwe";
import { fetchSupabaseFunction } from "@/lib/supabase-functions";
import { saveSession } from "@/lib/session";
import type { DashboardRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SignInFormProps = {
  title: string;
  description: string;
  expectedRole?: DashboardRole;
  redirectMerchant?: string;
  redirectCompliance?: string;
};

export function SignInForm({
  title,
  description,
  expectedRole,
  redirectMerchant = "/merchant",
  redirectCompliance = "/compliance",
}: SignInFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState("Connect your wallet to sign in.");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!eth) throw new Error("No Ethereum wallet found. Install MetaMask.");

      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const { response: nonceRes, data: nonceJson } = await fetchSupabaseFunction("merchant-auth");
      const nonce = nonceJson.nonce as string | undefined;
      if (!nonceRes.ok || !nonce) {
        throw new Error((nonceJson.error as string) ?? "Failed to fetch nonce");
      }

      const message = buildSiweMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        chainId: 80002,
        nonce,
      });

      const signature = await signer.signMessage(message);
      const { response: authRes, data: authJson } = await fetchSupabaseFunction("merchant-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const session = authJson.session as
        | { access_token: string; refresh_token: string }
        | undefined;
      if (!authRes.ok || !session) {
        throw new Error((authJson.error as string) ?? "Authentication failed");
      }

      const role = (authJson.role as DashboardRole | undefined) ?? "merchant";
      if (expectedRole && role !== expectedRole) {
        throw new Error(`This login is for ${expectedRole} accounts only.`);
      }

      saveSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        merchant_id: authJson.merchant_id as string | undefined,
        wallet_address: authJson.wallet_address as string | undefined,
        role,
      });

      router.push(role === "compliance_officer" ? redirectCompliance : redirectMerchant);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{status}</p>
          <Button type="button" className="w-full" onClick={() => void signIn()} disabled={busy}>
            {busy ? "Signing in…" : "Connect Wallet"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
