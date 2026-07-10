"use client";

import { useCallback, useEffect, useState } from "react";
import { notify } from "@/lib/notify";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type FraudRule = {
  id: string;
  merchant_id: string | null;
  rule_type: string;
  threshold_value: number;
  active: boolean;
};

export default function FraudRulesPage() {
  const [rules, setRules] = useState<FraudRule[]>([]);
  const [editType, setEditType] = useState("max_per_tap");
  const [editThreshold, setEditThreshold] = useState("500");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("compliance_fetch_fraud_rules");
    if (error) {
      notify.error("Could not load fraud rules", { description: error.message });
      setStatus("");
      return;
    }
    setRules((data as FraudRule[]) ?? []);
    setStatus(`${data?.length ?? 0} rule(s)`);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.rpc("compliance_upsert_fraud_rule", {
      p_rule_type: editType,
      p_threshold: Number(editThreshold),
      p_merchant_id: null,
      p_active: true,
    });
    setSaving(false);
    if (error) {
      notify.error("Could not save rule", { description: error.message });
    } else {
      notify.success("Rule updated");
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fraud Rules"
        description="Configure global velocity and amount thresholds applied before transactions settle."
        status={status || undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Global thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-xs">{rule.rule_type}</TableCell>
                  <TableCell className="font-mono tabular-nums">{rule.threshold_value}</TableCell>
                  <TableCell>
                    <Badge variant={rule.active ? "success" : "secondary"}>
                      {rule.active ? "yes" : "no"}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.merchant_id ? "merchant" : "global"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <form onSubmit={save} className="flex flex-wrap gap-4 items-end mt-6 pt-6 border-t border-border-light">
            <div className="space-y-2">
              <Label>Rule type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="max_per_tap">max_per_tap</SelectItem>
                  <SelectItem value="daily_amount">daily_amount</SelectItem>
                  <SelectItem value="daily_tx_count">daily_tx_count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Threshold</Label>
              <Input
                type="number"
                className="w-32"
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Update rule"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
