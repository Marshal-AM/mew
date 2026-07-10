"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DashboardRole } from "@/lib/session";
import { loadSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { MooPayLogo } from "@/components/MooPayLogo";

type RoleGuardProps = {
  allowed: DashboardRole[];
  children: React.ReactNode;
  loginPath: string;
};

export function RoleGuard({ allowed, children, loginPath }: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    notifiedRef.current = false;
    setReady(false);

    const session = loadSession();
    if (!session) {
      if (!notifiedRef.current && pathname !== loginPath) {
        notifiedRef.current = true;
        notify.info("Sign in required", { description: "Connect your wallet to access the dashboard." });
      }
      router.replace(loginPath);
      return;
    }
    if (!allowed.includes(session.role)) {
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        const dest = session.role === "compliance_officer" ? "/compliance" : "/merchant";
        notify.warning("Wrong console for this account", {
          description:
            session.role === "compliance_officer"
              ? "This wallet is a compliance officer — redirecting to the compliance console."
              : "This wallet is a merchant — redirecting to the merchant dashboard.",
        });
        router.replace(dest);
      }
      return;
    }
    setReady(true);
  }, [allowed, loginPath, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-background">
        <main className="mx-auto flex w-full min-w-0 max-w-[var(--page-max)] flex-1 flex-col items-center justify-center px-[var(--page-gutter)] py-8">
          <MooPayLogo height={32} />
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
