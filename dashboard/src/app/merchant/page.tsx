"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEMO_MERCHANT_WALLET } from "@/lib/demo-merchant";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      setStatus(txRes.error?.message ?? revRes.error?.message ?? "Load failed");
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
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Demo merchant analytics — {DEMO_MERCHANT_WALLET}
        </p>
        {status ? <p className="text-sm text-amber-700 mt-2">{status}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>30-day revenue (MOO)</CardDescription>
            <CardTitle className="text-3xl">{totalRevenue.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed transactions (30d)</CardDescription>
            <CardTitle className="text-3xl">{totalTx}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quick links</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Link href="/merchant/products" className="text-primary underline block">
              Manage POS products
            </Link>
            <Link href="/merchant/transactions" className="text-primary underline block">
              All transactions
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="#0f172a" fill="#94a3b8" fillOpacity={0.4} />
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
                  <TableCell>{Number(tx.amount).toFixed(2)}</TableCell>
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
