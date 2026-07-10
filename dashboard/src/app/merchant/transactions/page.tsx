"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_MERCHANT_ID } from "@/lib/demo-merchant";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { PageHeader } from "@/components/PageHeader";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Badge, statusBadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  from_address: string;
  to_address: string;
  tx_hash: string | null;
};

export default function MerchantTransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [status, setStatus] = useState("Loading…");

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("demo_merchant_fetch_transactions", {
      p_limit: 200,
      p_offset: 0,
    });
    if (error) {
      notify.error("Could not load transactions", { description: error.message });
      setStatus("");
      return;
    }
    setRows((data as TxRow[]) ?? []);
    setStatus(`${data?.length ?? 0} transaction(s)`);
  }, []);

  useEffect(() => {
    void load();
    const supabase = getAuthenticatedClient();
    if (!supabase) return;

    const channel = supabase
      .channel("demo-merchant-tx")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `merchant_id=eq.${DEMO_MERCHANT_ID}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const csv = useMemo(() => {
    const header = "date,amount,status,product_name,pos_id,from_address,to_address,tx_hash";
    const lines = rows.map((r) =>
      [
        r.created_at,
        r.amount,
        r.status,
        r.product_name ?? "",
        r.pos_id,
        r.from_address,
        r.to_address,
        r.tx_hash ?? "",
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }, [rows]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "demo-merchant-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Live feed of confirmed and pending payments. Updates in real time when new transactions arrive."
        status={status}
        actions={
          <Button variant="outline" onClick={downloadCsv}>
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>All transactions</CardTitle>
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
                <TableHead>From</TableHead>
                <TableHead>Tx hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono tabular-nums">{Number(tx.amount).toFixed(2)}</TableCell>
                  <TableCell>{tx.product_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(tx.status)}>{tx.status}</Badge>
                  </TableCell>
                  <TableCell>{tx.pos_id}</TableCell>
                  <TableCell className="font-mono text-xs">{tx.from_address.slice(0, 10)}…</TableCell>
                  <TableCell className="font-mono text-xs">
                    {tx.tx_hash ? (
                      <a
                        href={`https://amoy.polygonscan.com/tx/${tx.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:text-primary-hover underline-offset-2 hover:underline"
                      >
                        {tx.tx_hash.slice(0, 10)}…
                      </a>
                    ) : (
                      "—"
                    )}
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
