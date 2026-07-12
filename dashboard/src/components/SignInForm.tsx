"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrowserProvider } from "ethers";
import { buildSiweMessage } from "@/lib/siwe";
import { fetchSupabaseFunction } from "@/lib/supabase-functions";
import { saveSession } from "@/lib/session";
import type { DashboardRole } from "@/lib/session";
import { isUserRejectedWallet, notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MooPayLogo } from "@/components/MooPayLogo";

type SignInFormProps = {
  title: string;
  description: string;
  expectedRole?: DashboardRole;
  redirectMerchant?: string;
  redirectCompliance?: string;
  footer?: React.ReactNode;
};

export function SignInForm({
  title,
  description,
  expectedRole,
  redirectMerchant = "/merchant",
  redirectCompliance = "/compliance",
  footer,
}: SignInFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (!eth) {
        notify.error("No wallet detected", {
          description: "Install MetaMask or another Ethereum browser wallet, then try again.",
        });
        return;
      }

      notify.info("Connecting wallet", {
        description: "Approve the connection request in your wallet extension.",
      });

      const provider = new BrowserProvider(eth as never);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const { response: nonceRes, data: nonceJson } = await fetchSupabaseFunction("merchant-auth");
      const nonce = nonceJson.nonce as string | undefined;
      if (!nonceRes.ok || !nonce) {
        notify.error("Could not start sign-in", {
          description: (nonceJson.error as string) ?? `Server returned HTTP ${nonceRes.status}`,
        });
        return;
      }

      notify.info("Confirm signature", {
        description: "Sign the SIWE message in your wallet to finish logging in.",
      });

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
        notify.error("Authentication failed", {
          description: (authJson.error as string) ?? `Server returned HTTP ${authRes.status}`,
        });
        return;
      }

      const role = (authJson.role as DashboardRole | undefined) ?? "merchant";

      saveSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        merchant_id: authJson.merchant_id as string | undefined,
        wallet_address: authJson.wallet_address as string | undefined,
        role,
      });

      // Merchant login always opens the merchant dashboard for any wallet.
      // Compliance login still lands on the compliance console.
      const destination =
        expectedRole === "compliance_officer" ? redirectCompliance : redirectMerchant;
      notify.success("Signed in", {
        description:
          expectedRole === "compliance_officer"
            ? "Opening compliance console…"
            : "Opening merchant dashboard…",
      });
      router.replace(destination);
    } catch (err) {
      if (isUserRejectedWallet(err)) {
        notify.warning("Signature cancelled", {
          description: "No changes were made. Tap Connect Wallet when you're ready to try again.",
        });
        return;
      }
      notify.error("Login failed", {
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-background">
      <header className="shrink-0 bg-transparent pt-4 md:pt-6">
        <div className="flex h-[72px] w-full items-center justify-center bg-transparent px-[7.5%]">
          <MooPayLogo height={40} />
        </div>
      </header>
      <main className="mx-auto flex w-full min-w-0 max-w-[var(--page-max)] flex-1 flex-col justify-center px-[var(--page-gutter)] py-8">
        <div className="w-full max-w-md mx-auto flex flex-col items-center gap-8 animate-fade-in-up">
        <p className="text-[13px] text-muted-foreground max-w-sm text-center">{description}</p>

        <Card className="w-full">
          <CardHeader className="items-center text-center">
            <CardTitle>{title}</CardTitle>
            <CardDescription>Polygon Amoy · Sign-In with Ethereum</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" className="w-full" size="lg" onClick={() => void signIn()} disabled={busy}>
              {busy ? "Waiting for wallet…" : "Connect Wallet"}
            </Button>
          </CardContent>
        </Card>

        {footer ? <div className="text-center text-[13px] text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function MerchantLoginFooter() {
  return (
    <>
      Need the compliance console?{" "}
      <Link href="/compliance/login" className="font-medium text-primary hover:text-primary-hover">
        Sign in here
      </Link>
      <span className="block mt-2 text-subtle text-[12px]">
        Any connected wallet can open the merchant dashboard.
      </span>
    </>
  );
}

export function ComplianceLoginFooter() {
  return (
    <>
      Merchant account?{" "}
      <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
        Sign in here
      </Link>
      <span className="block mt-2 text-subtle text-[12px]">
        Your wallet must be in COMPLIANCE_OFFICER_WALLETS on the backend.
      </span>
    </>
  );
}
