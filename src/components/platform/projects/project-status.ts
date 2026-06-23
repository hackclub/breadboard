export function projectStatusCopy(status: string) {
  if (status === "draft")
    return "Keep building. Submit your design when your schematic, code, README, journals, and time are ready.";
  if (status === "materials_review")
    return "Submitted and under review. A reviewer is checking your schematic, code, README, timelapse, time, and journals.";
  if (status === "kit_fulfillment")
    return "Approved. Your kit is in fulfillment and time no longer counts.";
  if (status === "kit_sent")
    return "Kit sent. Confirm receipt, build it, then submit a working demo video.";
  if (status === "building")
    return "Build the kit, then submit a working demo video.";
  if (status === "demo_review") return "Demo submitted for final review.";
  if (status === "done") return "Done. Currency awarded and ready for Unified.";
  if (status === "shipped")
    return "Snapshot in review. Keep editing, ship again after a decision.";
  if (status === "needs_changes")
    return "Revise the live project, then ship a new snapshot.";
  if (status === "reviewed")
    return "Approved. Keep building and ship more hours anytime.";
  if (status === "paid_out")
    return "Bread sent. Ship again when you add new work.";
  if (status === "fulfilled")
    return "Kit sent. Future progress can still be shipped.";
  if (status === "approved")
    return "Approved. Ship again when you add new work.";
  if (status === "rejected")
    return "Revise and ship a new snapshot when ready.";
  return status;
}

export const projectFlowSteps = [
  "Build",
  "Design review",
  "Kit fulfillment",
  "Build kit",
  "Demo review",
  "Done",
] as const;

export function projectStepMeta(status: string) {
  if (status === "materials_review" || status === "shipped") {
    return {
      step: 2,
      headline: "Under review",
      detail:
        "Reviewers are checking the schematic, code, README, journals, timelapse, and time.",
      tone: "red" as const,
    };
  }
  if (status === "needs_changes" || status === "rejected") {
    return {
      step: 1,
      headline: "Changes requested",
      detail:
        "Update the project based on the review note, then submit your design again.",
      tone: "yellow" as const,
    };
  }
  if (status === "kit_fulfillment" || status === "kit_approved") {
    return {
      step: 3,
      headline: "Kit in fulfillment",
      detail: "Your project was approved. The kit is being prepared.",
      tone: "green" as const,
    };
  }
  if (status === "kit_sent" || status === "fulfilled") {
    return {
      step: 4,
      headline: "Kit sent",
      detail: "Shipment is on the way.",
      tone: "green" as const,
    };
  }
  if (status === "building") {
    return {
      step: 4,
      headline: "Building kit",
      detail: "Build the physical project. Extra editor time is not tracked.",
      tone: "ink" as const,
    };
  }
  if (status === "demo_review") {
    return {
      step: 5,
      headline: "Demo under review",
      detail: "Your working demo video is submitted for final review.",
      tone: "red" as const,
    };
  }
  if (status === "done" || status === "paid_out") {
    return {
      step: 6,
      headline: "Done",
      detail: "Final demo approved. Currency awarded and ready for Unified.",
      tone: "green" as const,
    };
  }
  return {
    step: 1,
    headline: "Building",
    detail: "Keep working and journaling.",
    tone: "muted" as const,
  };
}

export function projectStatusLabel(status: string) {
  if (status === "needs_changes") return "Needs changes";
  if (status === "materials_review") return "Design review";
  if (status === "kit_fulfillment") return "Kit fulfillment";
  if (status === "kit_sent") return "Kit sent";
  if (status === "demo_review") return "Demo review";
  if (status === "paid_out") return "Paid out";
  if (status === "shipped") return "In review";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function canEditProjectCard(status: string) {
  return Boolean(status);
}

export function canShipProjectCard(status: string) {
  return [
    "draft",
    "needs_changes",
    "rejected",
    "reviewed",
    "paid_out",
    "fulfilled",
    "approved",
  ].includes(status);
}
