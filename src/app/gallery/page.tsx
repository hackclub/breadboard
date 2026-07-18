import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { pageGridClass } from "@/components/shared/styles";
import { PageHero } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/card";
import { Steps } from "@/components/marketing/steps";
import {
  ProjectCircuitPreview,
  type CircuitSnapshot,
} from "@/components/gallery/ProjectCircuitPreview";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projectMaterials,
  projectSubmissions,
  projects,
  user,
} from "@/lib/db/schema";
import { parseCircuitSnapshot } from "@/lib/projects/circuit-snapshot";
import { storageReadUrl } from "@/lib/storage/urls";

export const dynamic = "force-dynamic";

type GalleryProject = {
  projectId: number;
  title: string;
  description: string;
  makerSlackId: string | null;
  screenshotUrl: string;
  playableUrl: string;
  codeUrl: string;
  hoursSpent: number;
  approvedHours: number | null;
  submittedAt: Date;
  kitType: string;
  circuit: CircuitSnapshot | null;
  shareable: boolean;
};

type ProgressProject = {
  projectId: number;
  title: string;
  description: string;
  makerSlackId: string | null;
  screenshotUrl: string;
  kitType: string;
  status: string;
  secondsSpent: number;
  circuit: CircuitSnapshot | null;
  shareable: boolean;
};

type ProjectStatus = (typeof projects.status.enumValues)[number];

const STATUS_LABELS: Partial<Record<ProjectStatus, string>> = {
  draft: "In the editor",
  materials_review: "In review",
  kit_approved: "Kit approved",
  kit_fulfillment: "Kit being packed",
  kit_sent: "Kit on the way",
  building: "Building",
  demo_review: "Demo in review",
  needs_changes: "Making changes",
  rejected: "Rejected",
};

// The gallery walks every non-archived project, grouped by how far along it
// is. Approved builds come from their submission snapshots (tier 1, rendered
// separately); everything else falls into one of these tiers by live status.
const PROGRESS_TIERS: {
  key: string;
  title: string;
  blurb: string;
  statuses: ProjectStatus[];
}[] = [
  {
    key: "in_review",
    title: "In review",
    blurb: "Submitted and waiting on a reviewer.",
    statuses: ["materials_review", "demo_review"],
  },
  {
    key: "in_progress",
    title: "In progress",
    blurb: "Being designed and built right now.",
    statuses: [
      "draft",
      "kit_approved",
      "kit_fulfillment",
      "kit_sent",
      "building",
      "needs_changes",
    ],
  },
  {
    key: "rejected",
    title: "Rejected",
    blurb: "Didn't make it through review.",
    statuses: ["rejected"],
  },
];

const ALL_TIER_STATUSES = PROGRESS_TIERS.flatMap((tier) => tier.statuses);
const SLACK_TEAM_BASE_URL = "https://hackclub.enterprise.slack.com/team";

type SlackUserInfoResponse = {
  ok?: boolean;
  user?: {
    name?: string;
    profile?: {
      display_name?: string;
      display_name_normalized?: string;
    };
  };
};

function safeUrl(value: string) {
  const storageUrl = storageReadUrl(value);
  if (storageUrl.startsWith("/")) return storageUrl;
  try {
    const url = new URL(storageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function shouldOptimizeImage(src: string) {
  if (src.startsWith("/api/uploads/")) return false;
  try {
    const { hostname, protocol } = new URL(src);
    return (
      protocol === "https:" &&
      (hostname === "cdn.hackclub.com" || hostname === "assets.hackclub.com")
    );
  } catch {
    return false;
  }
}

async function getApprovedProjects(): Promise<GalleryProject[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      title: projects.title,
      description: projects.description,
      makerSlackId: user.slackId,
      screenshotUrl: projectSubmissions.screenshotUrl,
      playableUrl: projectSubmissions.playableUrl,
      codeUrl: projectSubmissions.codeUrl,
      hoursSpent: projectSubmissions.hoursSpent,
      approvedHours: projectSubmissions.approvedHours,
      submittedAt: projectSubmissions.submittedAt,
      kitType: projects.kitType,
      editorData: projects.editorData,
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projectSubmissions.projectId, projects.id))
    .innerJoin(user, eq(projectSubmissions.userId, user.id))
    .where(inArray(projectSubmissions.status, ["approved", "fulfilled"]))
    .orderBy(desc(projectSubmissions.submittedAt));

  // Rows arrive newest-first, so the first row per project is its latest
  // approved snapshot.
  const newestByProject = new Map<number, GalleryProject>();
  for (const { editorData, ...row } of rows) {
    if (!newestByProject.has(row.projectId))
      newestByProject.set(row.projectId, {
        ...row,
        circuit: row.screenshotUrl ? null : parseCircuitSnapshot(editorData),
        shareable: editorData.length > 0,
      });
  }

  return [...newestByProject.values()].sort(
    (a, b) =>
      (b.approvedHours ?? b.hoursSpent) - (a.approvedHours ?? a.hoursSpent),
  );
}

async function getProgressProjects(): Promise<ProgressProject[]> {
  const activity = db
    .select({
      projectId: editorActivitySessions.projectId,
      trackedSeconds:
        sql<number>`coalesce(sum(${editorActivitySessions.activeSeconds}), 0)::int`.as(
          "tracked_seconds",
        ),
    })
    .from(editorActivitySessions)
    .groupBy(editorActivitySessions.projectId)
    .as("activity");

  const rows = await db
    .select({
      projectId: projects.id,
      title: projects.title,
      description: projects.description,
      makerSlackId: user.slackId,
      screenshotUrl: projects.screenshotUrl,
      kitType: projects.kitType,
      status: projects.status,
      hoursSpent: projects.hoursSpent,
      editorData: projects.editorData,
      trackedSeconds: sql<number>`coalesce(${activity.trackedSeconds}, 0)::int`,
    })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .leftJoin(activity, eq(activity.projectId, projects.id))
    .where(
      and(
        eq(projects.archived, false),
        inArray(projects.status, ALL_TIER_STATUSES),
      ),
    );

  // Off-platform projects have no editor state to draw, but they upload
  // schematics/screenshots as materials — use the newest of those as the
  // card image before giving up and showing the placeholder.
  const materialImageByProject = await getMaterialImages(
    rows
      .filter((row) => !row.screenshotUrl && !row.editorData)
      .map((row) => row.projectId),
  );

  return (
    rows
      .map(({ hoursSpent, trackedSeconds, editorData, ...row }) => ({
        ...row,
        screenshotUrl:
          row.screenshotUrl ||
          (materialImageByProject.get(row.projectId) ?? ""),
        // Editor time is the live signal; self-reported hours cover off-platform
        // projects that never touch the editor.
        secondsSpent: trackedSeconds > 0 ? trackedSeconds : hoursSpent * 3600,
        circuit: row.screenshotUrl ? null : parseCircuitSnapshot(editorData),
        shareable: editorData.length > 0,
      }))
      // Nothing to show (no photo, no circuit, no uploaded materials) means
      // nothing on the gallery.
      .filter((project) => project.screenshotUrl || project.circuit)
  );
}

// Newest active screenshot material per project, falling back to a schematic
// when it's clearly an image file (schematics may also be PDFs).
async function getMaterialImages(
  projectIds: number[],
): Promise<Map<number, string>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: projectMaterials.projectId,
      type: projectMaterials.type,
      url: projectMaterials.url,
    })
    .from(projectMaterials)
    .where(
      and(
        eq(projectMaterials.active, true),
        inArray(projectMaterials.type, ["screenshot", "schematic"]),
        inArray(projectMaterials.projectId, projectIds),
      ),
    )
    .orderBy(desc(projectMaterials.createdAt));

  // Rows arrive newest-first; keep the newest of each type per project.
  const screenshots = new Map<number, string>();
  const schematics = new Map<number, string>();
  for (const row of rows) {
    if (!row.url) continue;
    if (row.type === "screenshot") {
      if (!screenshots.has(row.projectId))
        screenshots.set(row.projectId, row.url);
    } else if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(row.url)) {
      if (!schematics.has(row.projectId))
        schematics.set(row.projectId, row.url);
    }
  }
  const byProject = new Map(schematics);
  for (const [projectId, url] of screenshots) byProject.set(projectId, url);
  return byProject;
}

function publicSlackDisplayName(userInfo: SlackUserInfoResponse["user"]) {
  const name =
    userInfo?.profile?.display_name_normalized ||
    userInfo?.profile?.display_name ||
    userInfo?.name ||
    "";
  const cleaned = name.trim().replace(/^@+/, "");
  return cleaned ? `@${cleaned}` : null;
}

async function getSlackDisplayNames(
  slackIds: (string | null)[],
): Promise<Map<string, string>> {
  const token = process.env.SLACK_BOT_TOKEN;
  const uniqueIds = [...new Set(slackIds.filter((id): id is string => !!id))];
  const displayNames = new Map<string, string>();
  if (!token || uniqueIds.length === 0) return displayNames;

  await Promise.all(
    uniqueIds.map(async (slackId) => {
      try {
        const response = await fetch(
          `https://slack.com/api/users.info?user=${encodeURIComponent(slackId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as SlackUserInfoResponse;
        if (!payload.ok) return;
        const displayName = publicSlackDisplayName(payload.user);
        if (displayName) displayNames.set(slackId, displayName);
      } catch {
        // Gallery should still render if Slack is briefly unavailable.
      }
    }),
  );

  return displayNames;
}

export default async function GalleryPage() {
  const [approvedProjects, progressProjects] = await Promise.all([
    getApprovedProjects(),
    getProgressProjects(),
  ]);
  const slackDisplayNames = await getSlackDisplayNames([
    ...approvedProjects.map((project) => project.makerSlackId),
    ...progressProjects.map((project) => project.makerSlackId),
  ]);

  // A project with an approved submission already has a card in the top
  // section; don't show its live row again further down.
  const approvedIds = new Set(approvedProjects.map((p) => p.projectId));
  const tiers = PROGRESS_TIERS.map((tier) => ({
    ...tier,
    projects: progressProjects
      .filter(
        (p) =>
          !approvedIds.has(p.projectId) &&
          tier.statuses.includes(p.status as ProjectStatus),
      )
      .sort((a, b) => b.secondsSpent - a.secondsSpent),
  }));

  const isEmpty =
    approvedProjects.length === 0 &&
    tiers.every((tier) => tier.projects.length === 0);

  return (
    <div className={`${pageGridClass} min-h-screen`}>
      <Header isSticky />
      <main className="min-h-screen px-6 pt-24 pb-16 md:pt-28 md:px-8">
        <PageHero title="Gallery">
          <p className="mt-2 text-base text-black/80">
            Every Breadboard project, from first wire to approved shipment.
          </p>
        </PageHero>
        {isEmpty ? (
          <Surface className="bg-[#f4f4f4] p-8">
            <p className="text-base text-black/50 italic">No projects yet.</p>
          </Surface>
        ) : (
          <>
            {approvedProjects.length > 0 ? (
              <GallerySection>
                {approvedProjects.map((project) => (
                  <GalleryCard
                    key={project.projectId}
                    project={project}
                    makerDisplayName={
                      project.makerSlackId
                        ? (slackDisplayNames.get(project.makerSlackId) ?? null)
                        : null
                    }
                  />
                ))}
              </GallerySection>
            ) : null}
            {tiers.map((tier) =>
              tier.projects.length > 0 ? (
                <GallerySection key={tier.key}>
                  {tier.projects.map((project) => (
                    <ProgressCard
                      key={project.projectId}
                      project={project}
                      makerDisplayName={
                        project.makerSlackId
                          ? (slackDisplayNames.get(project.makerSlackId) ??
                            null)
                          : null
                      }
                    />
                  ))}
                </GallerySection>
              ) : null,
            )}
          </>
        )}
        <Steps />
      </main>
      <Footer />
    </div>
  );
}

function GallerySection({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function CardImage({
  screenshotUrl,
  title,
  kitType,
  circuit,
}: {
  screenshotUrl: string;
  title: string;
  kitType: string;
  circuit: CircuitSnapshot | null;
}) {
  const screenshot = safeUrl(screenshotUrl);

  return (
    <div className="relative aspect-[4/3] overflow-hidden border-b border-black bg-[#f4f4f4]">
      {screenshot ? (
        <Image
          src={screenshot}
          alt={`${title} screenshot`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          unoptimized={!shouldOptimizeImage(screenshot)}
          className="object-cover transition duration-300 group-hover:scale-[1.04]"
        />
      ) : circuit ? (
        <ProjectCircuitPreview circuit={circuit} />
      ) : (
        <Image
          src="/assets/design.png"
          alt="Breadboard project placeholder"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover opacity-85 transition duration-300 group-hover:scale-[1.04]"
        />
      )}
      <div className="absolute top-3 left-3 rounded-full border border-black bg-white px-3 py-1 text-xs font-black text-black shadow-[2px_2px_0_#000]">
        {kitType === "esp32" ? "ESP32" : "Arduino"}
      </div>
    </div>
  );
}

// Stretched over the whole card so any click opens the project's read-only
// share page. Inner links (Demo/Code) sit above it via z-index.
function CardShareLink({
  projectId,
  title,
}: {
  projectId: number;
  title: string;
}) {
  return (
    <Link
      href={`/share/${projectId}`}
      target="_blank"
      aria-label={`Open ${title || "Untitled project"} in the viewer`}
      className="absolute inset-0 z-10"
    />
  );
}

function MakerAttribution({
  slackId,
  displayName,
}: {
  slackId: string | null;
  displayName: string | null;
}) {
  if (!slackId) {
    return <p className="mt-1 text-sm font-bold text-[#BD0F32]">by maker</p>;
  }

  return (
    <p className="mt-1 text-sm font-bold text-[#BD0F32]">
      by{" "}
      <Link
        href={`${SLACK_TEAM_BASE_URL}/${slackId}`}
        target="_blank"
        rel="noreferrer"
        className="relative z-20 underline decoration-[#BD0F32]/35 underline-offset-2 hover:decoration-[#BD0F32]"
        aria-label="Open maker Slack profile"
      >
        {displayName ?? "maker"}
      </Link>
    </p>
  );
}

function GalleryCard({
  project,
  makerDisplayName,
}: {
  project: GalleryProject;
  makerDisplayName: string | null;
}) {
  const demo = safeUrl(project.playableUrl);
  const code = safeUrl(project.codeUrl);

  return (
    <article className="group relative overflow-hidden rounded-[22px] border border-black bg-white shadow-[5px_5px_0_#000] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_#BD0F32]">
      {project.shareable ? (
        <CardShareLink projectId={project.projectId} title={project.title} />
      ) : null}
      <CardImage
        screenshotUrl={project.screenshotUrl}
        title={project.title}
        kitType={project.kitType}
        circuit={project.circuit}
      />

      <div className="flex min-h-72 flex-col p-5">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-2xl font-black leading-tight text-black">
            {project.title || "Untitled project"}
          </h3>
          <MakerAttribution
            slackId={project.makerSlackId}
            displayName={makerDisplayName}
          />
        </div>

        <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-black/60">
          {project.description || "No description provided."}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {demo ? (
            <Link
              href={demo}
              target="_blank"
              className="relative z-20 rounded-xl border border-black bg-black px-4 py-2 text-sm font-black text-white no-underline shadow-[2px_2px_0_#BD0F32] transition hover:bg-[#BD0F32]"
            >
              Demo
            </Link>
          ) : null}
          {code ? (
            <Link
              href={code}
              target="_blank"
              className="relative z-20 rounded-xl border border-black bg-white px-4 py-2 text-sm font-black text-black no-underline shadow-[2px_2px_0_#000] transition hover:bg-black hover:text-white"
            >
              Code
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ProgressCard({
  project,
  makerDisplayName,
}: {
  project: ProgressProject;
  makerDisplayName: string | null;
}) {
  const statusLabel =
    STATUS_LABELS[project.status as ProjectStatus] ?? "In progress";

  return (
    <article className="group relative overflow-hidden rounded-[22px] border border-black bg-white shadow-[5px_5px_0_#000] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_#BD0F32]">
      {project.shareable ? (
        <CardShareLink projectId={project.projectId} title={project.title} />
      ) : null}
      <CardImage
        screenshotUrl={project.screenshotUrl}
        title={project.title}
        kitType={project.kitType}
        circuit={project.circuit}
      />

      <div className="flex flex-col p-5">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-2xl font-black leading-tight text-black">
            {project.title || "Untitled project"}
          </h3>
          <MakerAttribution
            slackId={project.makerSlackId}
            displayName={makerDisplayName}
          />
        </div>

        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-black/60">
          {project.description || "No description yet."}
        </p>

        <div className="mt-auto pt-5">
          <span className="inline-block rounded-full border border-black bg-[#f4f4f4] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-black shadow-[2px_2px_0_#000]">
            {statusLabel}
          </span>
        </div>
      </div>
    </article>
  );
}
