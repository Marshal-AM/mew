import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  status?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  status,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 shrink-0 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-fade-in-up",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-subtitle max-w-2xl">{description}</p> : null}
        {status ? <p className="text-[13px] text-muted pt-1">{status}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
