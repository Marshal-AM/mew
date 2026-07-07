import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moo Dashboard",
  description: "Merchant dashboard — Phase 9",
};

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Moo Dashboard</h1>
      <p>Merchant transaction and revenue views — Phase 9</p>
    </main>
  );
}
