"use client";

import { useEffect, useState } from "react";
import { DEMO_MERCHANT_ID, DEMO_MERCHANT_WALLET } from "@/lib/demo-merchant";
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

type PosDevice = {
  pos_id: string;
  payout_address: string;
  label: string;
  active: boolean;
  updated_at: string;
};

export default function MerchantPosDevicesPage() {
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [posId, setPosId] = useState("POS-001");
  const [payout, setPayout] = useState(DEMO_MERCHANT_WALLET);
  const [label, setLabel] = useState("Main counter");

  const load = async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("pos_devices")
      .select("pos_id,payout_address,label,active,updated_at")
      .eq("merchant_id", DEMO_MERCHANT_ID)
      .order("pos_id");
    if (error) {
      setStatus(error.message);
      return;
    }
    setDevices(data ?? []);
    setStatus(`${data?.length ?? 0} device(s)`);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { error } = await supabase.from("pos_devices").upsert({
      pos_id: posId.trim(),
      merchant_id: DEMO_MERCHANT_ID,
      payout_address: payout.trim(),
      label: label.trim(),
      active: true,
    });
    if (error) setStatus(error.message);
    else {
      setStatus("Saved");
      await load();
    }
  };

  const deactivate = async (id: string) => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { error } = await supabase.from("pos_devices").update({ active: false }).eq("pos_id", id);
    if (error) setStatus(error.message);
    else await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">POS Devices</h1>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add / update device</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 max-w-lg">
          <div className="space-y-2">
            <Label>pos_id</Label>
            <Input value={posId} onChange={(e) => setPosId(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>payout_address</Label>
            <Input value={payout} onChange={(e) => setPayout(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button type="button" onClick={() => void save()}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered devices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.pos_id}>
                  <TableCell>{d.pos_id}</TableCell>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="font-mono text-xs">{d.payout_address}</TableCell>
                  <TableCell>{d.active ? "yes" : "no"}</TableCell>
                  <TableCell>
                    {d.active ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => void deactivate(d.pos_id)}>
                        Deactivate
                      </Button>
                    ) : null}
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
