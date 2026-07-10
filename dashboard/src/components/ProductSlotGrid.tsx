import { cn } from "@/lib/utils";

export type SlotProduct = {
  pos_slot: number | null;
  name: string;
  active: boolean;
};

type ProductSlotGridProps = {
  products: SlotProduct[];
  className?: string;
};

export function ProductSlotGrid({ products, className }: ProductSlotGridProps) {
  const slots = Array.from({ length: 9 }, (_, i) => {
    const slot = i + 1;
    const match = products.find((p) => p.active && p.pos_slot === slot);
    return { slot, name: match?.name ?? null };
  });

  return (
    <div className={cn("grid grid-cols-3 gap-3 max-w-sm mx-auto", className)}>
      {slots.map(({ slot, name }) => (
        <div
          key={slot}
          className={cn(
            "rounded-xl border p-3 text-center min-h-[80px] flex flex-col justify-center transition-spring",
            name
              ? "bg-primary-soft border-primary/30 hover:border-primary/50"
              : "bg-surface border-border text-muted",
          )}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">Key {slot}</span>
          <span className="text-[13px] font-semibold text-navy truncate mt-1">{name ?? "empty"}</span>
        </div>
      ))}
    </div>
  );
}
