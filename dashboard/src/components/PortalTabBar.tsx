"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalTab = {
  href: string;
  label: string;
  matchPrefix?: boolean;
};

type PortalTabBarProps = {
  tabs: PortalTab[];
  ariaLabel: string;
};

export function PortalTabBar({ tabs, ariaLabel }: PortalTabBarProps) {
  const pathname = usePathname();

  return (
    <nav className="tab-pill-bar w-fit max-w-full overflow-x-auto" aria-label={ariaLabel}>
      {tabs.map(({ href, label, matchPrefix }) => {
        const isActive = matchPrefix
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`tab-pill-btn ${isActive ? "active" : ""}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
