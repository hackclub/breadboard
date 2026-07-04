import { and, eq, notInArray, sql } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { AdminInProgressTable } from "@/components/platform/admin-in-progress-table";
import { AccessCard } from "@/components/ui/access-card";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projects,
  projectTimelapses,
  user,
} from "@/lib/db/schema";
import { asProjectType } from "@/lib/projects/project-type";

// Projects that have finished their lifecycle (or will never earn anything)
// aren't "in progress", so they're left out of the activity view.
const SETTLED_PROJECT_STATUSES = [
  "done",
  "paid_out",
  "fulfilled",
  "rejected",
] as const;

// Latest of two timestamps, treating null as "no activity".
function latest(...values: (string | null)[]): string | null {
  let max: number | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (max === null || time > max) max = time;
  }
  return max === null ? null : new Date(max).toISOString();
}

export default async function AdminInProgressPage() {
  const session = await getSession();
  if (!session) {
    return (
      <AccessCard
        eyebrow="In progress"
        title="In progress"
        message="Log in to see in-progress projects."
      >
        <LoginButton callbackURL="/platform/admin/in-progress" />
      </AccessCard>
    );
  }
  if (!(await isAdminSession(session))) {
    return (
      <AccessCard
        eyebrow="In progress"
        title="In progress"
        message="Admin access is required."
      />
    );
  }

  // One grouped aggregate pass per table (instead of four correlated
  // subqueries per project row), joined without fanning out the row set.
  const activity = db
    .select({
      projectId: editorActivitySessions.projectId,
      lastRecordingAt:
        sql<Date | null>`max(${editorActivitySessions.lastActivityAt})`.as(
          "last_recording_at",
        ),
      trackedSeconds:
        sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`.as(
          "tracked_seconds",
        ),
    })
    .from(editorActivitySessions)
    .groupBy(editorActivitySessions.projectId)
    .as("activity");

  // YouTube attachments carry a youtube.com playback URL; everything else in
  // project_timelapses is a Lapse timelapse.
  const media = db
    .select({
      projectId: projectTimelapses.projectId,
      lastYoutubeAt:
        sql<Date | null>`max(${projectTimelapses.syncedAt}) filter (where ${projectTimelapses.playbackUrl} like '%youtube.com%')`.as(
          "last_youtube_at",
        ),
      lastLapseAt:
        sql<Date | null>`max(coalesce(${projectTimelapses.recordedAt}, ${projectTimelapses.syncedAt})) filter (where ${projectTimelapses.playbackUrl} not like '%youtube.com%')`.as(
          "last_lapse_at",
        ),
    })
    .from(projectTimelapses)
    .groupBy(projectTimelapses.projectId)
    .as("media");

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      projectType: projects.projectType,
      submissionSource: projects.submissionSource,
      trackedSeconds: sql<number>`coalesce(${activity.trackedSeconds}, 0)::int`,
      lastRecordingAt: activity.lastRecordingAt,
      lastYoutubeAt: media.lastYoutubeAt,
      lastLapseAt: media.lastLapseAt,
      createdAt: projects.createdAt,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerSlackId: user.slackId,
    })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .leftJoin(activity, eq(activity.projectId, projects.id))
    .leftJoin(media, eq(media.projectId, projects.id))
    .where(
      and(
        eq(projects.archived, false),
        notInArray(projects.status, [...SETTLED_PROJECT_STATUSES]),
      ),
    )
    // Most recently active first, never-active last, so the limit keeps the
    // rows the table actually shows at the top (an unordered limit would
    // return an arbitrary subset once projects exceed it).
    .orderBy(
      sql`greatest(${activity.lastRecordingAt}, ${media.lastYoutubeAt}, ${media.lastLapseAt}) desc nulls last`,
    )
    .limit(1000);

  const toIso = (value: Date | string | null) =>
    value ? new Date(value).toISOString() : null;

  // Rows arrive most-recently-active first from the query's ORDER BY.
  const projectsData = rows.map((row) => {
    const lastRecording = toIso(row.lastRecordingAt);
    const lastYoutube = toIso(row.lastYoutubeAt);
    const lastLapse = toIso(row.lastLapseAt);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      projectType: asProjectType(row.projectType),
      submissionSource: row.submissionSource,
      trackedSeconds: row.trackedSeconds,
      lastRecordingAt: lastRecording,
      lastYoutubeAt: lastYoutube,
      lastLapseAt: lastLapse,
      lastActivityAt: latest(lastRecording, lastYoutube, lastLapse),
      createdAt: row.createdAt.toISOString(),
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
      ownerSlackId: row.ownerSlackId,
    };
  });

  return (
    <main className="max-w-7xl">
      <AdminInProgressTable projects={projectsData} />
    </main>
  );
}
