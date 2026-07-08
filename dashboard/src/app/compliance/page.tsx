"use client";

import { useCallback, useEffect, useState } from "react";
import { SESSION_STORAGE_KEY } from "@/lib/siwe";
import { getSupabaseWithSession } from "@/lib/supabase";

type FraudRule = {
  id: string;
  merchant_id: string | null;
  rule_type: string;
  threshold_value: number;
  active: boolean;
};

export default function CompliancePage() {
  const [status, setStatus] = useState("Loading...");
  const [rows, setRows] = useState<unknown[]>([]);
  const [fraudRules, setFraudRules] = useState<FraudRule[]>([]);
  const [editType, setEditType] = useState("max_per_tap");
  const [editThreshold, setEditThreshold] = useState("500");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      window.location.href = "/login";
      return;
    }
    const session = JSON.parse(raw) as { access_token: string; refresh_token: string };
    const supabase = getSupabaseWithSession(session.access_token, session.refresh_token);

    const [auditRes, rulesRes] = await Promise.all([
      supabase.rpc("compliance_fetch_audit_log", { p_merchant_id: null, p_limit: 20 }),
      supabase.rpc("compliance_fetch_fraud_rules"),
    ]);

    if (auditRes.error) {
      setStatus(auditRes.error.message);
      return;
    }
    if (rulesRes.error) {
      setStatus(rulesRes.error.message);
      return;
    }

    setRows(auditRes.data ?? []);
    setFraudRules((rulesRes.data as FraudRule[]) ?? []);
    setStatus(`Loaded ${auditRes.data?.length ?? 0} audit rows, ${rulesRes.data?.length ?? 0} fraud rules.`);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as { access_token: string; refresh_token: string };
    const supabase = getSupabaseWithSession(session.access_token, session.refresh_token);
    setSaving(true);
    const { error } = await supabase.rpc("compliance_upsert_fraud_rule", {
      p_rule_type: editType,
      p_threshold: Number(editThreshold),
      p_merchant_id: null,
      p_active: true,
    });
    setSaving(false);
    if (error) {
      setStatus(`Save failed: ${error.message}`);
      return;
    }
    await loadData();
    setStatus(`Updated global ${editType} threshold to ${editThreshold}.`);
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 900 }}>
      <h1>Compliance Console</h1>
      <p>{status}</p>
      <p>
        <a href="/pos-devices">Merchant POS devices</a>
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Fraud Rules</h2>
        <p>Global thresholds (editable without redeploy).</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.5rem" }}>Rule</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.5rem" }}>Threshold</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.5rem" }}>Active</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "0.5rem" }}>Scope</th>
            </tr>
          </thead>
          <tbody>
            {fraudRules.map((rule) => (
              <tr key={rule.id}>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>{rule.rule_type}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>{rule.threshold_value}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>{rule.active ? "yes" : "no"}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                  {rule.merchant_id ? "merchant" : "global"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={saveRule} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select value={editType} onChange={(e) => setEditType(e.target.value)}>
            <option value="max_per_tap">max_per_tap</option>
            <option value="daily_amount">daily_amount</option>
            <option value="daily_tx_count">daily_tx_count</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            value={editThreshold}
            onChange={(e) => setEditThreshold(e.target.value)}
            style={{ width: 120 }}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Update global rule"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Audit Log (recent)</h2>
        <pre style={{ background: "#111", color: "#eee", padding: "1rem", overflow: "auto" }}>
          {JSON.stringify(rows, null, 2)}
        </pre>
      </section>
    </main>
  );
}
