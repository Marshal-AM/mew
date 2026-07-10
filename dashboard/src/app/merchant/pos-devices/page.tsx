"use client";

import { useEffect, useState } from "react";
import { DEMO_MERCHANT_ID, DEMO_MERCHANT_WALLET } from "@/lib/demo-merchant";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const defaultDeviceForm = {
  posId: "POS-001",
  payout: DEMO_MERCHANT_WALLET,
  label: "Main counter",
};

export default function MerchantPosDevicesPage() {
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [posId, setPosId] = useState(defaultDeviceForm.posId);
  const [payout, setPayout] = useState(defaultDeviceForm.payout);
  const [label, setLabel] = useState(defaultDeviceForm.label);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("pos_devices")
      .select("pos_id,payout_address,label,active,updated_at")
      .eq("merchant_id", DEMO_MERCHANT_ID)
      .order("pos_id");
    if (error) {
      notify.error("Could not load devices", { description: error.message });
      setStatus("");
      return;
    }
    setDevices(data ?? []);
    setStatus(`${data?.length ?? 0} device(s)`);
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setPosId(defaultDeviceForm.posId);
    setPayout(defaultDeviceForm.payout);
    setLabel(defaultDeviceForm.label);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from("pos_devices").upsert({
      pos_id: posId.trim(),
      merchant_id: DEMO_MERCHANT_ID,
      payout_address: payout.trim(),
      label: label.trim(),
      active: true,
    });
    setSaving(false);
    if (error) {
      notify.error("Could not save device", { description: error.message });
      return;
    }
    notify.success("Device saved");
    setDialogOpen(false);
    resetForm();
    await load();
  };

  const deactivate = async (id: string) => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { error } = await supabase.from("pos_devices").update({ active: false }).eq("pos_id", id);
    if (error) notify.error("Could not deactivate device", { description: error.message });
    else {
      notify.success("Device deactivated");
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS Devices"
        description="Register terminals and map each pos_id to a payout wallet address."
        status={status}
        actions={
          <Button type="button" onClick={openAddDialog}>
            Add device
          </Button>
        }
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add / update device</DialogTitle>
            <DialogDescription>
              Register a POS terminal or update an existing pos_id mapping.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="pos_id">pos_id</Label>
              <Input id="pos_id" value={posId} onChange={(e) => setPosId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout">payout_address</Label>
              <Input
                id="payout"
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-label">label</Label>
              <Input id="device-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save device"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                  <TableCell className="font-medium">{d.pos_id}</TableCell>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="font-mono text-xs">{d.payout_address}</TableCell>
                  <TableCell>{d.active ? "yes" : "no"}</TableCell>
                  <TableCell>
                    {d.active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void deactivate(d.pos_id)}
                      >
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
