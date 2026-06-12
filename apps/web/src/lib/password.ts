/**
 * Strong-password policy (FR-AUTH-001).
 *
 * Shared by the server action that sets passwords (enforcement) and the client
 * form that previews the rules (UX). Pure module — no server-only deps.
 */
export const PASSWORD_MIN_LENGTH = 12;

/** Human-readable rules, shown under the password field. */
export const PASSWORD_RULES: readonly string[] = [
  `At least ${PASSWORD_MIN_LENGTH} characters`,
  "Upper and lower case letters",
  "At least one number",
  "At least one symbol",
];

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a password against the policy. Returns every failing rule so the UI
 * can show them, but callers that only need a yes/no can read `ok`.
 */
export function validatePassword(pw: string): PasswordCheck {
  const errors: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) {
    errors.push("Use both upper and lower case letters.");
  }
  if (!/[0-9]/.test(pw)) {
    errors.push("Include at least one number.");
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    errors.push("Include at least one symbol.");
  }
  return { ok: errors.length === 0, errors };
}
