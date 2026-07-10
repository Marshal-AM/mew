"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DashboardRole } from "@/lib/session";
import { loadSession } from "@/lib/session";

type RoleGuardProps = {
  allowed: DashboardRole[];
  children: React.ReactNode;
  loginPath: string;
};

export function RoleGuard({ allowed, children, loginPath }: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.replace(loginPath);
      return;
    }
    if (!allowed.includes(session.role)) {
      router.replace(session.role === "compliance_officer" ? "/compliance" : "/merchant");
      return;
    }
    setReady(true);
  }, [allowed, loginPath, pathname, router]);

  if (!ready) {
    return <p className="p-6 text-sm text-muted-foreground">Checking session…</p>;
  }

  return <>{children}</>;
}
