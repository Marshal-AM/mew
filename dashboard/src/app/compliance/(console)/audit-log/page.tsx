"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRow = {
  id: string;
  step: string;
  result: string;
  created_at: string;
  merchant_id: string | null;
  transaction_id: string | null;
  metadata: Record<string, unknown>;
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [step, setStep] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_fetch_audit_log", {
      p_merchant_id: null,
      p_limit: 100,
      p_step: step.trim() || null,
      p_from: null,
      p_to: null,
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    setRows((data as AuditRow[]) ?? []);
    setStatus(`${data?.length ?? 0} row(s)`);
  }, [step]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 items-end max-w-md">
          <div className="space-y-2 flex-1">
            <Label>Pipeline step</Label>
            <Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="e.g. fraud.velocity" />
          </div>
          <Button type="button" onClick={() => void load()}>
            Search
          </Button>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">{status}</p>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Tx</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.step}</TableCell>
                  <TableCell>{r.result}</TableCell>
                  <TableCell className="font-mono text-xs">{r.transaction_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {JSON.stringify(r.metadata)}
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
