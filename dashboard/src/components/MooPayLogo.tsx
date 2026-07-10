import Image from "next/image";
import { cn } from "@/lib/utils";

type MooPayLogoProps = {
  height?: number;
  className?: string;
};

export function MooPayLogo({ height = 32, className }: MooPayLogoProps) {
  const width = Math.round(height * (497 / 171));
  return (
    <Image
      src="/moopay-logo.png"
      alt="MooPay"
      width={width}
      height={height}
      className={cn("h-auto w-auto", className)}
      priority
    />
  );
}
