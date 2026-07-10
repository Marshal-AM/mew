"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { MooPayLogo } from "@/components/MooPayLogo";
import { PortalTabBar, type PortalTab } from "@/components/PortalTabBar";
import { WalletAddressChip } from "@/components/WalletAddressChip";
import { Button } from "@/components/ui/button";
import { clearSession, loadSession } from "@/lib/session";
import { notify } from "@/lib/notify";

const merchantTabs: PortalTab[] = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/transactions", label: "Transactions" },
  { href: "/merchant/products", label: "Products" },
  { href: "/merchant/pos-devices", label: "POS Devices" },
];

const complianceTabs: PortalTab[] = [
  { href: "/compliance", label: "Overview" },
  { href: "/compliance/review-queue", label: "Review Queue" },
  { href: "/compliance/audit-log", label: "Audit Log" },
  { href: "/compliance/frozen", label: "Frozen" },
  { href: "/compliance/kill-switch", label: "Kill Switch" },
  { href: "/compliance/fraud-rules", label: "Fraud Rules" },
];

type AppNavbarProps = {
  mode: "merchant" | "compliance";
};

export function AppNavbar({ mode }: AppNavbarProps) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const tabs = mode === "merchant" ? merchantTabs : complianceTabs;
  const homeHref = mode === "merchant" ? "/merchant" : "/compliance";
  const ariaLabel = mode === "merchant" ? "Merchant console" : "Compliance console";

  useEffect(() => {
    setWalletAddress(loadSession()?.wallet_address ?? null);
  }, []);

  const logout = () => {
    clearSession();
    notify.success("Signed out");
    router.push(mode === "compliance" ? "/compliance/login" : "/login");
  };

  return (
    <header className="shrink-0 bg-transparent pt-4 md:pt-6">
      <div className="flex h-[72px] w-full items-center justify-between gap-4 bg-transparent px-[7.5%] transition-all duration-300">
        <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-6 lg:gap-8">
          <Link
            href={homeHref}
            className="shrink-0 transition-spring hover:scale-105"
            aria-label="MooPay home"
          >
            <MooPayLogo height={36} className="h-9 md:h-10 w-auto" />
          </Link>
          <PortalTabBar tabs={tabs} ariaLabel={ariaLabel} />
        </div>
        <div className="nav-pill flex shrink-0 items-center gap-2">
          {walletAddress ? <WalletAddressChip address={walletAddress} /> : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-full p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={logout}
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
