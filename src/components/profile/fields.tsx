import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Common = { id: string; name: string; label: string; error?: string; hint?: string; required?: boolean };

function Wrap({ id, label, error, hint, required, children }: Common & { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField(
  props: Common & { defaultValue?: string; type?: "text" | "date" | "number"; maxLength?: number; inputMode?: "decimal" | "text"; autoComplete?: string },
) {
  const { id, label, error, hint, required, defaultValue, ...rest } = props;
  return (
    <Wrap {...{ id, name: rest.name, label, error, hint, required }}>
      <Input
        id={id}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
    </Wrap>
  );
}

export function SelectField(
  props: Common & { defaultValue?: string; options: readonly { value: string; label: string }[] },
) {
  const { id, name, label, error, hint, required, defaultValue, options } = props;
  return (
    <Wrap {...{ id, name, label, error, hint, required }}>
      <select
        // Remount when the default changes: React 19 resets uncontrolled forms after an action, and a
        // <select> whose defaultValue changed would otherwise fall back to its first option.
        key={defaultValue ?? ""}
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive",
        )}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Wrap>
  );
}

export function TextAreaField(
  props: Common & { defaultValue?: string; maxLength?: number; rows?: number },
) {
  const { id, name, label, error, hint, required, defaultValue, maxLength, rows = 4 } = props;
  return (
    <Wrap {...{ id, name, label, error, hint, required }}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
      />
    </Wrap>
  );
}
