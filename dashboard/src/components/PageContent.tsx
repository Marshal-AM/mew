export function PageContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`w-full min-w-0 max-w-full space-y-6 ${className}`}>{children}</section>
  );
}
