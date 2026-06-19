import { desc, eq } from "drizzle-orm";
import { LoginButton } from "@/components/shared/auth-buttons";
import { PageHero } from "@/components/shared/platform-docs-frame";
import { ProjectsBoard } from "@/components/platform/projects-board";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import type { PlatformProject } from "@/types";

const projectColumns = {
  id: projects.id,
  title: projects.title,
  email: projects.email,
  playableUrl: projects.playableUrl,
  codeUrl: projects.codeUrl,
  screenshotUrl: projects.screenshotUrl,
  description: projects.description,
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
};

type ProjectRow = Omit<PlatformProject, "kitType"> & { kitType: string };

function normalizeProjectRow(project: ProjectRow): PlatformProject {
  return {
    ...project,
    kitType: project.kitType === "esp32" ? "esp32" : "arduino",
  };
}

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session) {
    return (
      <>
        <PageHero title="My Projects" />
        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-6 shadow-[4px_4px_0_#000]">
          <LoginButton callbackURL="/platform/projects" />
        </div>
      </>
    );
  }

  const projectRows = await db
    .select(projectColumns)
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .orderBy(desc(projects.updatedAt));
  const userProjects = projectRows.map(normalizeProjectRow);

  return (
    <>
      <PageHero title="My Projects">
        <p className="mt-2 text-sm text-black/60">
          Build, edit, and submit projects.
        </p>
      </PageHero>
      <ProjectsBoard projects={userProjects} />
    </>
  );
}
