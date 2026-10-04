import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/actions";

/** Server Action form: POST + Next.js origin check protects against CSRF logout. */
export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm">
        Log out
      </Button>
    </form>
  );
}
