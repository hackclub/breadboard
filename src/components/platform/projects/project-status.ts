export function projectStatusCopy(status: string) {
  if (status === "draft")
    return "Build your schematic, write code, and journal. Submit your design when ready.";
  if (status === "materials_review")
    return "A reviewer is checking your design. You'll hear back soon.";
  if (status === "kit_fulfillment")
    return "Your kit is being prepared and shipped. Track it in fulfillment.";
  if (status === "kit_sent")
    return "Kit is on the way. Confirm receipt, then build the physical project.";
  if (status === "building")
    return "Build your kit. Take photos and video of it working, then submit your demo.";
  if (status === "demo_review")
    return "Demo submitted for final review. Almost done!";
  if (status === "done")
    return "Done. Currency awarded. Keep building and ship an update anytime to earn more.";
  if (status === "shipped")
    return "Snapshot in review. Keep editing, ship again after a decision.";
  if (status === "needs_changes")
    return "Reviewer requested changes. Fix your design and submit again.";
  if (status === "reviewed")
    return "Approved. Keep building and ship more hours anytime.";
  if (status === "paid_out") return "Currency awarded. Spend it in the shop!";
  if (status === "fulfilled")
    return "Kit sent. Future progress can still be shipped.";
  if (status === "approved")
    return "Approved. Ship again when you add new work.";
  if (status === "rejected")
    return "Revise and ship a new snapshot when ready.";
  return status;
}

export const projectFlowSteps = [
  "Make project",
  "Submit design",
  "Design review",
  "Kit sent",
  "Build kit",
  "Submit demo",
  "Demo review",
  "Get currency",
] as const;

export function projectStepMeta(status: string) {
  if (status === "materials_review" || status === "shipped") {
    return {
      step: 3,
      headline: "Design review",
      detail:
        "A reviewer is checking your schematic, code, README, and journals.",
      tone: "red" as const,
    };
  }
  if (status === "needs_changes" || status === "rejected") {
    return {
      step: 2,
      headline: "Changes requested",
      detail:
        "Update your project based on the review note, then submit again.",
      tone: "yellow" as const,
    };
  }
  if (status === "kit_fulfillment" || status === "kit_approved") {
    return {
      step: 4,
      headline: "Kit sent",
      detail: "Your design was approved. The kit is being shipped to you.",
      tone: "green" as const,
    };
  }
  if (status === "kit_sent" || status === "fulfilled") {
    return {
      step: 4,
      headline: "Kit sent",
      detail: "Your kit is on the way. Confirm receipt when it arrives.",
      tone: "green" as const,
    };
  }
  if (status === "building") {
    return {
      step: 5,
      headline: "Build your kit",
      detail:
        "Build the physical project, take photos and video of it working.",
      tone: "ink" as const,
    };
  }
  if (status === "demo_review") {
    return {
      step: 7,
      headline: "Demo review",
      detail: "A reviewer is checking your final demo video and build journal.",
      tone: "red" as const,
    };
  }
  if (status === "done" || status === "paid_out") {
    return {
      step: 8,
      headline: "Done — currency awarded",
      detail: "Currency awarded. Ship an update anytime to earn more.",
      tone: "green" as const,
    };
  }
  if (status === "approved") {
    return {
      step: 8,
      headline: "Approved — currency awarded",
      detail:
        "Bread awarded for your hours. Keep building and ship updates anytime.",
      tone: "green" as const,
    };
  }
  return {
    step: 1,
    headline: "Make your project",
    detail: "Build your schematic, write code, and journal your progress.",
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

export function isAfterKitApproved(status: string) {
  return [
    "kit_fulfillment",
    "kit_sent",
    "building",
    "demo_review",
    "done",
    "paid_out",
    "fulfilled",
  ].includes(status);
}

// Any state can ship except while a submission is actively awaiting review:
// design review (materials_review / the "shipped" in-review alias) or a pending
// demo. Update ships from every other state are reviewed in place. Mirrors the
// server guard in assertProjectCanShip so the button and the action agree.
export function canShipProjectCard(status: string) {
  return !["materials_review", "shipped", "demo_review"].includes(status);
}

// States where the project already had a ship approved, so a new ship from here
// is an update that pays bread for the new hours. Besides the terminal states
// this includes the post-approval, pre-demo states (kit through building):
// those already cleared design review once, and their update is reviewed in
// place without disturbing the demo they still owe. Excludes the active-review
// states (materials_review / shipped / demo_review), which can't ship again.
export function isUpdateShipStatus(status: string) {
  return [
    "reviewed",
    "paid_out",
    "fulfilled",
    "approved",
    "done",
    "kit_approved",
    "kit_fulfillment",
    "kit_sent",
    "building",
  ].includes(status);
}
