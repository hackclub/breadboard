// Pure composition of the Unified DB justification from precomputed parts.
// Kept free of server-only imports so the review workspace (a client
// component) can re-render the template live while the reviewer edits the
// approved hours and justification, before anything is committed. The parts
// themselves (dates, time evidence, feedback rounds, reviewer) come from the
// database via src/lib/ysws/unified.ts.

export type UnifiedJustificationParts = {
  // "This is the first design ship of ... Submitted <ISO>."
  shipLine: string;
  // The time-evidence paragraph (editor time, recordings, journals).
  evidence: string;
  // "Where to experience and verify the project" block: live simulation,
  // static GitHub Pages demo, frozen editor versions. Empty when the ship has
  // no links to offer.
  links: string;
  // "This ship was approved at <ISO> after N rounds of feedback." or the
  // pending-approval variant shown in live previews.
  approvalIntro: string;
  // "Hours were verified ... by <name> (<email>) ..."
  reviewerLine: string;
  claimedHours: number;
  inspectUrl: string;
  contactEmail: string;
};

export function composeUnifiedJustification(
  parts: UnifiedJustificationParts,
  approvedHours: number,
  reviewerJustification: string,
) {
  // Keep the fractional value the reviewer sees. Flooring here truncated e.g.
  // 2.9 approved hours to 2 and invented a ~1h deflation the reviewer never
  // applied. Round the deflation to a tenth so float noise (2.9 - 2.0) doesn't
  // print as 0.8999999999h.
  const hours = Math.max(0, Number(approvedHours) || 0);
  const deflation =
    Math.round(Math.max(0, parts.claimedHours - hours) * 10) / 10;
  const hoursLine =
    deflation > 0
      ? `${parts.claimedHours}h were claimed for this ship; ${hours}h were approved (${deflation}h deflation applied).`
      : `${hours}h were approved, out of the ${parts.claimedHours}h claimed for this ship.`;
  return [
    parts.shipLine,
    parts.evidence,
    parts.links,
    `${parts.approvalIntro} ${parts.reviewerLine} ${hoursLine}`,
    `The reviewer was asked to justify why this ship meets the standards of the Unified DB:\n\n${
      reviewerJustification.trim() || "(no reviewer justification recorded)"
    }`,
    `!! To inspect the full review for this ship, including timelapses, journals, and screen evidence, see: ${parts.inspectUrl} (Breadboard admin access required)`,
    `For any questions, please reach out to ${parts.contactEmail}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
