import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moo Dashboard",
  description: "Merchant dashboard and compliance console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
