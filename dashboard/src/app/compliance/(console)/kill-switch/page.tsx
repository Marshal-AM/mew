"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function KillSwitchPage() {
  const [suspended, setSuspended] = useState(false);
  const [reason, setReason] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_get_system_suspension");
    if (error) {
      notify.error("Could not load suspension state", { description: error.message });
      return;
    }
    const v = (data ?? {}) as Record<string, unknown>;
    setSuspended(Boolean(v.suspended));
    setMeta(v);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    const session = loadSession();
    if (!session) return;
    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/compliance-action`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ action: "set_suspension", suspended: next, reason: reason || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify.error("Update failed", { description: json.error ?? "Unknown error" });
    } else {
      notify.success(next ? "System suspended" : "System resumed");
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kill Switch"
        description="Halt all new transactions system-wide during incidents or maintenance."
      />

      {suspended ? (
        <StatusBanner
          variant="warning"
          message="System-wide suspension is active. All new transactions will be held."
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>System-wide suspension</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 max-w-lg">
          <p className="text-[13px] text-muted-foreground">
            Current state:{" "}
            <span className={`font-semibold ${suspended ? "text-destructive" : "text-secondary"}`}>
              {suspended ? "SUSPENDED" : "NORMAL"}
            </span>
          </p>
          {meta.updated_at ? (
            <p className="text-[11px] text-subtle uppercase tracking-wider">
              Last change: {String(meta.updated_at)}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {!suspended ? (
              <Button variant="destructive" onClick={() => void toggle(true)}>
                Suspend all transactions
              </Button>
            ) : (
              <Button variant="success" onClick={() => void toggle(false)}>
                Lift suspension
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
