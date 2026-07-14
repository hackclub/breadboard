// Single source of truth for which project statuses accrue editor time,
// shared by the server heartbeat gate and the editor client UI (this module
// must stay dependency-free so client components can import it).
//
// Tracking pauses only while a ship is under review: the submission is a
// frozen snapshot and shouldn't grow under the reviewer. Every reviewed state
// keeps tracking, both the kit phase and the terminal approved states
// (approved, done, reviewed, paid_out, fulfilled), so makers can keep working
// and ship updates for more bread. Time tracked after a ship can't inflate
// that ship's payout: the demo pays the hours approved at materials review,
// and update ships claim only time beyond the last approved ship's snapshot.
export const TRACKING_BLOCKED_PROJECT_STATUSES = new Set([
  "materials_review",
  "shipped",
  "demo_review",
]);

export function isTrackingBlockedStatus(status: string) {
  return TRACKING_BLOCKED_PROJECT_STATUSES.has(status);
}
