import { cn } from "@/lib/utils";

type StatusBannerProps = {
  message: string;
  variant?: "warning" | "error" | "info" | "success";
  className?: string;
};

export function StatusBanner({ message, variant = "info", className }: StatusBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-[13px] leading-relaxed",
        variant === "warning" && "border-warning/30 bg-warning-soft text-foreground",
        variant === "error" && "border-destructive/30 bg-destructive-soft text-foreground",
        variant === "success" && "border-success/30 bg-success-soft text-foreground",
        variant === "info" && "border-primary/30 bg-primary-soft text-foreground",
        className,
      )}
    >
      {message}
    </div>
  );
}
