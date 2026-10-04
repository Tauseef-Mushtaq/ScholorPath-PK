import { cn } from "@/lib/utils";

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        error ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary",
      )}
    >
      {error ?? success}
    </p>
  );
}
