"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

function formatAddress(address: string) {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type WalletAddressChipProps = {
  address: string;
  className?: string;
};

export function WalletAddressChip({ address, className }: WalletAddressChipProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      notify.success("Wallet address copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Could not copy address");
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span className="font-mono tabular-nums" title={address}>
        {formatAddress(address)}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        aria-label="Copy wallet address"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-secondary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
