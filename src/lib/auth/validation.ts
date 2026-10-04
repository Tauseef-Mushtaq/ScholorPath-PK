export const PASSWORD_MIN = 8;
/** bcrypt (used by Supabase Auth) only considers the first 72 bytes. */
export const PASSWORD_MAX = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateEmail(email: string): string | undefined {
  if (!email) return "Email is required.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Enter a valid email address.";
  return undefined;
}

export function validateNewPassword(
  password: string,
  confirmPassword: string,
): { password?: string; confirmPassword?: string } {
  const errors: { password?: string; confirmPassword?: string } = {};
  if (password.length < PASSWORD_MIN) {
    errors.password = `Password must be at least ${PASSWORD_MIN} characters.`;
  } else if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    errors.password = `Password must be at most ${PASSWORD_MAX} bytes.`;
  }
  if (!errors.password && password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}
