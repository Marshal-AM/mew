"use client";

import { AppShell } from "@/components/AppShell";
import { RoleGuard } from "@/components/RoleGuard";

export default function ComplianceConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowed={["compliance_officer"]} loginPath="/compliance/login">
      <AppShell mode="compliance">{children}</AppShell>
    </RoleGuard>
  );
}
