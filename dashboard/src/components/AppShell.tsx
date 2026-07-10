"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DEMO_MERCHANT_WALLET } from "@/lib/demo-merchant";
import { clearSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string };

const merchantNav: NavItem[] = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/transactions", label: "Transactions" },
  { href: "/merchant/products", label: "Products" },
  { href: "/merchant/pos-devices", label: "POS Devices" },
];

const complianceNav: NavItem[] = [
  { href: "/compliance", label: "Overview" },
  { href: "/compliance/review-queue", label: "Review Queue" },
  { href: "/compliance/audit-log", label: "Audit Log" },
  { href: "/compliance/frozen", label: "Frozen Addresses" },
  { href: "/compliance/kill-switch", label: "Kill Switch" },
  { href: "/compliance/fraud-rules", label: "Fraud Rules" },
];

type AppShellProps = {
  mode: "merchant" | "compliance";
  children: React.ReactNode;
};

export function AppShell({ mode, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = mode === "merchant" ? merchantNav : complianceNav;

  const logout = () => {
    clearSession();
    router.push(mode === "compliance" ? "/compliance/login" : "/login");
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-muted/30 p-4 flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {mode === "merchant" ? "Merchant" : "Compliance"}
          </p>
          <h1 className="font-semibold text-lg">Moo Dashboard</h1>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm hover:bg-accent",
                pathname === item.href && "bg-accent font-medium",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          {mode === "merchant" ? (
            <p className="text-xs text-muted-foreground break-all">
              Analytics: {DEMO_MERCHANT_WALLET}
            </p>
          ) : null}
          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
