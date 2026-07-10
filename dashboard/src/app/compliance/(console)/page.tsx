"use client";

import { useCallback, useEffect, useState } from "react";
import { notify } from "@/lib/notify";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBanner } from "@/components/StatusBanner";

export default function ComplianceOverviewPage() {
  const [openReviews, setOpenReviews] = useState(0);
  const [frozenCount, setFrozenCount] = useState(0);
  const [suspended, setSuspended] = useState(false);

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const [rq, fr, sus] = await Promise.all([
      supabase.rpc("compliance_fetch_review_queue", { p_status: "open" }),
      supabase.rpc("compliance_fetch_frozen_addresses"),
      supabase.rpc("compliance_get_system_suspension"),
    ]);
    if (rq.error) {
      notify.error("Could not load review queue", { description: rq.error.message });
    }
    if (fr.error) {
      notify.error("Could not load frozen addresses", { description: fr.error.message });
    }
    if (sus.error) {
      notify.error("Could not load suspension state", { description: sus.error.message });
    }
    setOpenReviews(rq.data?.length ?? 0);
    setFrozenCount(fr.data?.length ?? 0);
    const isSuspended = Boolean((sus.data as { suspended?: boolean })?.suspended);
    setSuspended(isSuspended);
    if (isSuspended) {
      notify.warning("System-wide suspension is active", {
        description: "All new transactions are held.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Console"
        description="Monitor review queue, frozen addresses, and system-wide payment controls."
      />

      {suspended ? (
        <StatusBanner
          variant="warning"
          message="System-wide suspension is ACTIVE — all new transactions are held."
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Open review queue"
          value={openReviews}
          href="/compliance/review-queue"
          linkLabel="View queue"
        />
        <StatCard
          label="Frozen addresses"
          value={frozenCount}
          href="/compliance/frozen"
          linkLabel="Manage freezes"
        />
        <StatCard
          label="Kill switch"
          value={suspended ? "ON" : "OFF"}
          href="/compliance/kill-switch"
          linkLabel="Toggle suspension"
        />
      </div>
    </div>
  );
}
