"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, statusBadgeVariant } from "@/components/ui/badge";

type QueueRow = {
  queue_id: string;
  queue_status: string;
  resolution: string | null;
  queue_created_at: string;
  transaction_id: string;
  amount: number;
  product_name: string | null;
  from_address: string;
  to_address: string;
  tx_status: string;
  pos_id: string;
};

export default function ReviewQueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_fetch_review_queue", { p_status: "open" });
    if (error) {
      notify.error("Could not load review queue", { description: error.message });
      setStatus("");
      return;
    }
    setRows((data as QueueRow[]) ?? []);
    setStatus(`${data?.length ?? 0} open item(s)`);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (queueId: string, action: "release" | "decline" | "escalate_str", txId: string) => {
    const supabase = getAuthenticatedClient();
    const session = loadSession();
    if (!supabase || !session) return;
    setBusyId(queueId);
    try {
      const { data, error } = await supabase.rpc("compliance_resolve_review", {
        p_queue_id: queueId,
        p_action: action,
        p_notes: null,
      });
      if (error) throw error;

      if (action === "release" && (data as { resume_required?: boolean })?.resume_required) {
        const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resume-transaction`;
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body: JSON.stringify({ transaction_id: txId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Resume failed");
      }
      const labels = { release: "released", decline: "declined", escalate_str: "escalated to STR" };
      notify.success(`Transaction ${labels[action]}`);
      await load();
    } catch (e) {
      notify.error("Action failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        description="Release, decline, or escalate flagged transactions awaiting compliance review."
        status={status || undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Open items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.queue_id}>
                  <TableCell>{new Date(r.queue_created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono tabular-nums">{Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell>{r.product_name ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.resolution ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(r.tx_status)}>{r.tx_status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busyId === r.queue_id}
                      onClick={() => void act(r.queue_id, "release", r.transaction_id)}
                    >
                      Release
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.queue_id}
                      onClick={() => void act(r.queue_id, "decline", r.transaction_id)}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === r.queue_id}
                      onClick={() => void act(r.queue_id, "escalate_str", r.transaction_id)}
                    >
                      STR
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
