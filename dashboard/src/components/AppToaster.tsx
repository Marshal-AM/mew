"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border bg-card text-foreground card-shadow font-sans",
          title: "text-[13px] font-semibold text-navy",
          description: "text-[12px] text-muted-foreground",
        },
      }}
    />
  );
}
