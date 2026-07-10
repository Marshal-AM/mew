"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    setOpenReviews(rq.data?.length ?? 0);
    setFrozenCount(fr.data?.length ?? 0);
    setSuspended(Boolean((sus.data as { suspended?: boolean })?.suspended));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Compliance Console</h1>
      {suspended ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          System-wide suspension is ACTIVE — all new transactions are held.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Open review queue</CardDescription>
            <CardTitle className="text-3xl">{openReviews}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/compliance/review-queue" className="text-sm underline">
              View queue
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Frozen addresses</CardDescription>
            <CardTitle className="text-3xl">{frozenCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/compliance/frozen" className="text-sm underline">
              Manage freezes
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Kill switch</CardDescription>
            <CardTitle className="text-3xl">{suspended ? "ON" : "OFF"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/compliance/kill-switch" className="text-sm underline">
              Toggle suspension
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
