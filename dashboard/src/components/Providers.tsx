"use client";

import { AppToaster } from "@/components/AppToaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
