"use client";

import { AppNavbar } from "@/components/AppNavbar";
import { PageContent } from "@/components/PageContent";

type AppShellProps = {
  mode: "merchant" | "compliance";
  children: React.ReactNode;
};

export function AppShell({ mode, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-background">
      <AppNavbar mode={mode} />
      <main className="mx-auto flex w-full min-w-0 max-w-[var(--page-max)] flex-1 flex-col overflow-x-clip px-[var(--page-gutter)] py-8">
        <div className="w-full min-w-0 max-w-full overflow-x-clip animate-fade-in-up">
          <PageContent>{children}</PageContent>
        </div>
      </main>
    </div>
  );
}
