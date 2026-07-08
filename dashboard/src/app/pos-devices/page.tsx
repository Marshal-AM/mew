"use client";

import { useEffect, useState } from "react";
import { SESSION_STORAGE_KEY } from "@/lib/siwe";
import { getSupabaseWithSession } from "@/lib/supabase";

type PosDevice = {
  pos_id: string;
  payout_address: string;
  label: string;
  active: boolean;
  updated_at: string;
};

function loadSession(): { access_token: string; refresh_token: string } | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { access_token: string; refresh_token: string };
  } catch {
    return null;
  }
}

export default function PosDevicesPage() {
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [posId, setPosId] = useState("POS-001");
  const [payout, setPayout] = useState("");
  const [label, setLabel] = useState("Main counter");

  const load = async () => {
    const session = loadSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    const supabase = getSupabaseWithSession(session.access_token, session.refresh_token);

    const { data: merchant, error: merchantErr } = await supabase.from("merchants").select("id").limit(1).single();
    if (merchantErr || !merchant) {
      setStatus(merchantErr?.message ?? "No merchant linked to this wallet");
      return;
    }
    setMerchantId(merchant.id);

    const { data, error } = await supabase
      .from("pos_devices")
      .select("pos_id,payout_address,label,active,updated_at")
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
    if (!merchantId) return;
    const session = loadSession();
    if (!session) return;
    const supabase = getSupabaseWithSession(session.access_token, session.refresh_token);
    const { error } = await supabase.from("pos_devices").upsert({
      pos_id: posId.trim(),
      merchant_id: merchantId,
      payout_address: payout.trim(),
      label: label.trim(),
      active: true,
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Saved");
    await load();
  };

  const deactivate = async (id: string) => {
    const session = loadSession();
    if (!session) return;
    const supabase = getSupabaseWithSession(session.access_token, session.refresh_token);
    const { error } = await supabase.from("pos_devices").update({ active: false }).eq("pos_id", id);
    if (error) setStatus(error.message);
    else await load();
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h1>POS Devices</h1>
      <p>{status}</p>
      <p><a href="/compliance">Compliance console</a> | <a href="/login">Re-login</a></p>

      <section style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #ccc" }}>
        <h2>Add / update device</h2>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <input value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="pos_id" />
          <input value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="payout_address" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" />
          <button type="button" onClick={() => void save()}>Save</button>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Registered devices</h2>
        <ul>
          {devices.map((d) => (
            <li key={d.pos_id} style={{ marginBottom: "0.75rem" }}>
              <strong>{d.pos_id}</strong> — {d.label} — {d.payout_address} {d.active ? "" : "(inactive)"}
              {d.active ? (
                <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => void deactivate(d.pos_id)}>Deactivate</button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
