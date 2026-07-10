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
    <div className={cn("grid grid-cols-3 gap-2 max-w-sm", className)}>
      {slots.map(({ slot, name }) => (
        <div
          key={slot}
          className={cn(
            "rounded-md border p-3 text-center min-h-[72px] flex flex-col justify-center",
            name ? "bg-primary/5 border-primary/30" : "bg-muted/40 text-muted-foreground",
          )}
        >
          <span className="text-xs font-mono text-muted-foreground">Key {slot}</span>
          <span className="text-sm font-medium truncate">{name ?? "empty"}</span>
        </div>
      ))}
    </div>
  );
}
