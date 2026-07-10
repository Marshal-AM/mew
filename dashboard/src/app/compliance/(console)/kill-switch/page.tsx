"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/lib/session";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function KillSwitchPage() {
  const [suspended, setSuspended] = useState(false);
  const [reason, setReason] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_get_system_suspension");
    if (error) setStatus(error.message);
    else {
      const v = (data ?? {}) as Record<string, unknown>;
      setSuspended(Boolean(v.suspended));
      setMeta(v);
    }
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
    if (!res.ok) setStatus(json.error ?? "Update failed");
    else {
      setStatus(next ? "System suspended" : "System resumed");
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Kill Switch</h1>
      <p className="text-sm text-muted-foreground">{status}</p>
      {suspended ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          System-wide suspension is active. All new transactions will be held.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>System-wide suspension</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <p className="text-sm">
            Current state: <strong>{suspended ? "SUSPENDED" : "NORMAL"}</strong>
          </p>
          {meta.updated_at ? (
            <p className="text-xs text-muted-foreground">Last change: {String(meta.updated_at)}</p>
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
              <Button onClick={() => void toggle(false)}>Lift suspension</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
