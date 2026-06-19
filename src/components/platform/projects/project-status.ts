export function projectStatusCopy(status: string) {
  if (status === "draft") return "Keep building.";
  if (status === "shipped") return "Waiting for review.";
  if (status === "needs_changes") return "Fix the note and ship again.";
  if (status === "reviewed") return "Approved. Waiting for payout.";
  if (status === "paid_out") return "Bread sent.";
  if (status === "fulfilled") return "Kit sent.";
  if (status === "approved") return "Approved.";
  if (status === "rejected") return "Closed.";
  return status;
}

export function projectStatusLabel(status: string) {
  if (status === "needs_changes") return "Needs changes";
  if (status === "paid_out") return "Paid out";
  if (status === "shipped") return "In review";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function canEditProjectCard(status: string) {
  return status === "draft" || status === "needs_changes";
}

export function canShipProjectCard(status: string) {
  return status === "draft" || status === "needs_changes";
}
