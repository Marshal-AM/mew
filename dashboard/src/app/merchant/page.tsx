"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Package } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { chartColors } from "@/lib/theme";
import { notify } from "@/lib/notify";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusBadgeVariant } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TxRow = {
  id: string;
  amount: number;
  status: string;
  product_name: string | null;
  created_at: string;
  pos_id: string;
};

type RevenueRow = { day: string; revenue: number; tx_count: number };

export default function MerchantOverviewPage() {
  const [status, setStatus] = useState("Loading…");
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;

    const [txRes, revRes] = await Promise.all([
      supabase.rpc("demo_merchant_fetch_transactions", { p_limit: 10, p_offset: 0 }),
      supabase.rpc("demo_merchant_revenue_by_day", { p_days: 30 }),
    ]);

    if (txRes.error || revRes.error) {
      const message = txRes.error?.message ?? revRes.error?.message ?? "Load failed";
      notify.error("Could not load overview", { description: message });
      setStatus("");
      return;
    }

    setTxs((txRes.data as TxRow[]) ?? []);
    setRevenue(
      ((revRes.data as RevenueRow[]) ?? []).map((r) => ({
        ...r,
        day: String(r.day).slice(0, 10),
      })),
    );
    setStatus("");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRevenue = revenue.reduce((s, r) => s + Number(r.revenue), 0);
  const totalTx = revenue.reduce((s, r) => s + Number(r.tx_count), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Demo merchant analytics and recent activity."
        status={status || undefined}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="30-day revenue (MOO)" value={totalRevenue.toFixed(2)} />
        <StatCard label="Confirmed transactions (30d)" value={totalTx} />
        <Card className="transition-spring hover:border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-muted-foreground">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/merchant/products">
                <Package className="h-4 w-4" />
                Manage POS products
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/merchant/transactions">
                <ArrowRightLeft className="h-4 w-4" />
                All transactions
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue}>
              <CartesianGrid stroke={chartColors.border} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: chartColors.muted }} />
              <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${chartColors.border}`,
                  fontSize: 13,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={chartColors.primary}
                fill={chartColors.primarySoft}
                fillOpacity={0.8}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>POS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono tabular-nums">{Number(tx.amount).toFixed(2)}</TableCell>
                  <TableCell>{tx.product_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(tx.status)}>{tx.status}</Badge>
                  </TableCell>
                  <TableCell>{tx.pos_id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
