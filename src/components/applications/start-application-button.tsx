import { startApplication } from "@/lib/applications/actions";
import { Button } from "@/components/ui/button";

/** Server form: starts or opens the signed-in student's application for this scholarship. */
export function StartApplicationButton({ scholarshipId, label = "Track in my workspace" }: { scholarshipId: string; label?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await startApplication(scholarshipId);
      }}
    >
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  );
}
