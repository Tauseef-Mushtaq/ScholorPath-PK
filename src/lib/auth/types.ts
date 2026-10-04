export type AuthFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
  /** Echoed back so the email field survives a failed submit. Never echo passwords. */
  email?: string;
};
