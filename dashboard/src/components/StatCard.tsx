import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
};

export function StatCard({ label, value, href, linkLabel, className }: StatCardProps) {
  return (
    <Card className={cn("transition-spring hover:border-primary/30", className)}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight text-navy tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      {href && linkLabel ? (
        <CardContent className="pt-0">
          <Link
            href={href}
            className="text-[13px] font-medium text-primary hover:text-primary-hover transition-colors"
          >
            {linkLabel} →
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}
