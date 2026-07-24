import { and, desc, eq, sql } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { ProjectsBoard } from "@/components/platform/projects-board";
import { Surface } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  countryFromHackClubClaims,
  getHackClubClaims,
} from "@/lib/auth/hackclub";
import { offPlatformBuilds } from "@/flags";
import { asProjectType } from "@/lib/projects/project-type";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projects,
  projectSubmissions,
} from "@/lib/db/schema";
import type { PlatformProject } from "@/types";

const projectColumns = {
  id: projects.id,
  title: projects.title,
  email: projects.email,
  playableUrl: projects.playableUrl,
  demoVideoUrl: projects.demoVideoUrl,
  codeUrl: projects.codeUrl,
  screenshotUrl: projects.screenshotUrl,
  description: projects.description,
  howToUse: projects.howToUse,
  addressLine1: projects.addressLine1,
  addressLine2: projects.addressLine2,
  city: projects.city,
  region: projects.region,
  country: projects.country,
  postalCode: projects.postalCode,
  birthday: projects.birthday,
  firstName: projects.firstName,
  lastName: projects.lastName,
  hoursSpent: projects.hoursSpent,
  status: projects.status,
  reviewNote: projects.reviewNote,
  kitType: projects.kitType,
  submissionSource: projects.submissionSource,
  projectType: projects.projectType,
  // In a single-table select drizzle renders interpolated columns without a
  // table qualifier, so `${projects.id}` inside these subqueries resolved to
  // the subquery's own table and the counts came back 0 for everyone. The
  // outer table reference has to be qualified by hand.
  journalCount: sql<number>`(
    SELECT COUNT(*) FROM ${projectJournals}
    WHERE ${projectJournals.projectId} = ${projects}."id"
  )`.mapWith(Number),
  trackedSeconds: sql<number>`(
    SELECT coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int
    FROM ${editorActivitySessions}
    WHERE ${editorActivitySessions.projectId} = ${projects}."id"
  )`.mapWith(Number),
  // Whether a design submission is awaiting review. Drives the "update in
  // review" state on the card, since an update ship is reviewed in place and
  // never moves the project's status. Same hand-qualified outer reference as
  // the counts above.
  reviewPending: sql<boolean>`EXISTS (
    SELECT 1 FROM ${projectSubmissions}
    WHERE ${projectSubmissions.projectId} = ${projects}."id"
      AND ${projectSubmissions.type} = 'materials'
      AND ${projectSubmissions.status} = 'pending_review'
  )`.mapWith(Boolean),
};

type ProjectRow = Omit<PlatformProject, "kitType" | "projectType"> & {
  kitType: string;
  projectType: string;
};

function normalizeProjectRow(project: ProjectRow): PlatformProject {
  return {
    ...project,
    kitType:
      project.kitType === "esp32"
        ? "esp32"
        : project.kitType === "own"
          ? "own"
          : "arduino",
    journalCount: project.journalCount ?? 0,
    submissionSource: project.submissionSource ?? "editor",
    projectType: asProjectType(project.projectType),
  };
}

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session) {
    return (
      <>
        <PageHeader
          eyebrow="Workshop"
          title="Your projects"
          description="Sign in to create, edit, and submit your builds."
        />
        <Surface className="mt-6 bg-[#f4f4f4]">
          <LoginButton callbackURL="/platform/projects" />
        </Surface>
      </>
    );
  }

  let projectRows = await db
    .select(projectColumns)
    .from(projects)
    .where(
      and(eq(projects.userId, session.user.id), eq(projects.archived, false)),
    )
    .orderBy(desc(projects.updatedAt));

  try {
    const country = countryFromHackClubClaims(
      await getHackClubClaims(session.user.id),
    );
    if (country && projectRows.some((project) => project.country !== country)) {
      await db
        .update(projects)
        .set({ country })
        .where(
          and(
            eq(projects.userId, session.user.id),
            eq(projects.archived, false),
          ),
        );
      projectRows = projectRows.map((project) => ({ ...project, country }));
    }
  } catch {
    // Country is nice-to-have here; submit still refreshes and validates it.
  }
  const userProjects = projectRows.map(normalizeProjectRow);
  const offPlatformEnabled = await offPlatformBuilds();

  return (
    <ProjectsBoard
      projects={userProjects}
      offPlatformEnabled={offPlatformEnabled}
    />
  );
}
