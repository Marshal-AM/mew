"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/lib/session";
import { notify } from "@/lib/notify";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
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

type FrozenRow = {
  address: string;
  reason: string;
  order_ref: string | null;
  freeze_type: string;
  created_at: string;
};

export default function FrozenAddressesPage() {
  const [rows, setRows] = useState<FrozenRow[]>([]);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_fetch_frozen_addresses");
    if (error) {
      notify.error("Could not load frozen addresses", { description: error.message });
      setStatus("");
      return;
    }
    setRows((data as FrozenRow[]) ?? []);
    setStatus(`${data?.length ?? 0} frozen address(es)`);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const freeze = async (e: React.FormEvent) => {
    e.preventDefault();
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
      body: JSON.stringify({ action: "freeze", address, reason, order_ref: orderRef || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify.error("Freeze failed", { description: json.error ?? "Unknown error" });
    } else {
      notify.success("Address frozen");
      setAddress("");
      setReason("");
      setOrderRef("");
      await load();
    }
  };

  const unfreeze = async (addr: string) => {
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
      body: JSON.stringify({ action: "unfreeze", address: addr }),
    });
    const json = await res.json();
    if (!res.ok) {
      notify.error("Unfreeze failed", { description: json.error ?? "Unknown error" });
    } else {
      notify.success("Address unfrozen");
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Frozen Addresses"
        description="Block wallet addresses from sending or receiving funds through the payment pipeline."
        status={status || undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Freeze address</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={freeze} className="grid gap-4 max-w-lg">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} required className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Order reference</Label>
              <Input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
            </div>
            <Button type="submit" variant="destructive">
              Freeze address
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currently frozen</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Order ref</TableHead>
                <TableHead>Type</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.address}>
                  <TableCell className="font-mono text-xs">{r.address}</TableCell>
                  <TableCell>{r.reason}</TableCell>
                  <TableCell>{r.order_ref ?? "—"}</TableCell>
                  <TableCell>{r.freeze_type}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => void unfreeze(r.address)}>
                      Unfreeze
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
