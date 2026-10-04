/** Deterministic, idempotent text normalization. Does not add, translate or rewrite words. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")                      // zero-width characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")  // control chars (keep \t \n)
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t]/g, " ")
    .split("\n").map((l) => l.replace(/ {2,}/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
