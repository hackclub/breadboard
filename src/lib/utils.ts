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
  return status === "draft" || status === "needs_changes";
}

export function canShipProject(status: string) {
  return status === "draft" || status === "needs_changes";
}

export function normalizeBread(amount: number) {
  return Math.max(0, Math.floor(Number(amount) || 0));
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
