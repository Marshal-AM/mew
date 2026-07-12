"use client";

import { AppShell } from "@/components/AppShell";
import { RoleGuard } from "@/components/RoleGuard";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["merchant", "compliance_officer"]} loginPath="/login">
      <AppShell mode="merchant">{children}</AppShell>
    </RoleGuard>
  );
}
