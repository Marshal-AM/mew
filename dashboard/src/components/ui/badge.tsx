import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-soft text-primary",
        secondary: "border-transparent bg-surface text-muted-foreground",
        success: "border-success/20 bg-success-soft text-secondary-foreground",
        warning: "border-warning/30 bg-warning-soft text-foreground",
        destructive: "border-destructive/20 bg-destructive-soft text-destructive",
        outline: "border-border text-foreground bg-surface-elevated",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function statusBadgeVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "confirmed":
      return "success";
    case "pending_review":
    case "held":
    case "pending":
      return "warning";
    case "declined":
      return "destructive";
    default:
      return "secondary";
  }
}
