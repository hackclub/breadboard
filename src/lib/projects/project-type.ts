/**
 * Single source of truth for the build-vs-design distinction.
 *
 * "design" earns regular bread and ships a kit, whether it was designed in
 * the editor or tracked off-platform. "build" is a finished off-platform
 * build: approval pays gold bread and no kit ships. Distinct from
 * submissionSource, which only records where the work was tracked
 * (editor vs manual). Payout and fulfillment code must branch through
 * isBuildShip, never on submissionSource.
 */
export type ProjectType = "build" | "design";

export function isBuildShip(
  project: { projectType: string } | string,
): boolean {
  const type = typeof project === "string" ? project : project.projectType;
  return type === "build";
}

/** Narrow a raw DB string to the ProjectType union (unknown values → design). */
export function asProjectType(value: string | null | undefined): ProjectType {
  return value === "build" ? "build" : "design";
}
