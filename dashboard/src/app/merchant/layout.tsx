"use client";

import { AppShell } from "@/components/AppShell";
import { RoleGuard } from "@/components/RoleGuard";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["merchant"]} loginPath="/login">
      <AppShell mode="merchant">{children}</AppShell>
    </RoleGuard>
  );
}
