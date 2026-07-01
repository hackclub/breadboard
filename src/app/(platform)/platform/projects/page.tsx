import { and, desc, eq, sql } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { ProjectsBoard } from "@/components/platform/projects-board";
import { Surface } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  countryFromHackClubClaims,
  getHackClubClaims,
} from "@/lib/auth/hackclub";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectJournals,
  projects,
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
  journalCount: sql<number>`(
    SELECT COUNT(*) FROM ${projectJournals}
    WHERE ${projectJournals.projectId} = ${projects.id}
  )`.mapWith(Number),
  trackedSeconds: sql<number>`(
    SELECT coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int
    FROM ${editorActivitySessions}
    WHERE ${editorActivitySessions.projectId} = ${projects.id}
  )`.mapWith(Number),
};

type ProjectRow = Omit<PlatformProject, "kitType"> & { kitType: string };

function normalizeProjectRow(project: ProjectRow): PlatformProject {
  return {
    ...project,
    kitType: project.kitType === "esp32" ? "esp32" : "arduino",
    journalCount: project.journalCount ?? 0,
    submissionSource: project.submissionSource ?? "editor",
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

  return <ProjectsBoard projects={userProjects} />;
}
