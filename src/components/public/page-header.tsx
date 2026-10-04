import { cn } from "@/lib/utils";

/** Consistent heading block for public inner pages. */
export function PageHeader({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("space-y-3", className)}>
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {description ? <p className="max-w-2xl text-lg text-muted-foreground">{description}</p> : null}
      {children}
    </header>
  );
}
