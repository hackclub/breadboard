export function clean(value: unknown) {
  return String(value ?? "").trim();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

export function statusLabel(status: string) {
  if (status === "needs_changes") return "Needs changes";
  if (status === "paid_out") return "Paid out";
  if (status === "being_fulfilled") return "Being fulfilled";
  return status.replace(/_/g, " ");
}

export function canEditProject(status: string) {
  return Boolean(status);
}

export function canShipProject(status: string) {
  return status !== "shipped";
}

export function normalizeBread(amount: number) {
  return Math.max(0, Math.floor(Number(amount) || 0));
}

// Reason an admin gives when moving a balance by hand. Lives here rather than in
// the action module because "use server" files can only export async functions.
export const MAX_ADJUSTMENT_REASON_LENGTH = 200;

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
