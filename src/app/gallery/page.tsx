import { desc, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { pageGridClass } from "@/components/shared/styles";
import { PageHero } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/card";
import { Steps } from "@/components/marketing/steps";
import { db } from "@/lib/db/db";
import { projectSubmissions, projects, user } from "@/lib/db/schema";
import { storageReadUrl } from "@/lib/storage/urls";

export const dynamic = "force-dynamic";

type GalleryProject = {
  projectId: number;
  title: string;
  description: string;
  makerName: string;
  screenshotUrl: string;
  playableUrl: string;
  codeUrl: string;
  hoursSpent: number;
  approvedHours: number | null;
  submittedAt: Date;
  kitType: string;
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

async function getGalleryProjects(): Promise<GalleryProject[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      title: projects.title,
      description: projects.description,
      makerName: user.name,
      screenshotUrl: projectSubmissions.screenshotUrl,
      playableUrl: projectSubmissions.playableUrl,
      codeUrl: projectSubmissions.codeUrl,
      hoursSpent: projectSubmissions.hoursSpent,
      approvedHours: projectSubmissions.approvedHours,
      submittedAt: projectSubmissions.submittedAt,
      kitType: projects.kitType,
    })
    .from(projectSubmissions)
    .innerJoin(projects, eq(projectSubmissions.projectId, projects.id))
    .innerJoin(user, eq(projectSubmissions.userId, user.id))
    .where(inArray(projectSubmissions.status, ["approved", "fulfilled"]))
    .orderBy(desc(projectSubmissions.submittedAt));

  const newestByProject = new Map<number, GalleryProject>();
  for (const row of rows) {
    if (!newestByProject.has(row.projectId))
      newestByProject.set(row.projectId, row);
  }

  return [...newestByProject.values()];
}

export default async function GalleryPage() {
  const galleryProjects = await getGalleryProjects();

  return (
    <div className={`${pageGridClass} min-h-screen`}>
      <Header isSticky />
      <main className="min-h-screen px-6 pt-24 pb-16 md:pt-28 md:px-8">
        <PageHero title="Gallery">
          <p className="mt-2 text-base text-black/80">
            Newest approved shipments from Breadboard builders.
          </p>
        </PageHero>
        {galleryProjects.length > 0 ? (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {galleryProjects.map((project) => (
              <GalleryCard key={project.projectId} project={project} />
            ))}
          </section>
        ) : (
          <Surface className="bg-[#f4f4f4] p-8">
            <p className="text-base text-black/50 italic">
              No approved projects yet.
            </p>
          </Surface>
        )}
        <Steps />
      </main>
      <Footer />
    </div>
  );
}

function GalleryCard({ project }: { project: GalleryProject }) {
  const screenshot = safeUrl(project.screenshotUrl);
  const demo = safeUrl(project.playableUrl);
  const code = safeUrl(project.codeUrl);
  const hours = project.approvedHours ?? project.hoursSpent;

  return (
    <article className="group overflow-hidden rounded-[22px] border border-black bg-white shadow-[5px_5px_0_#000] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_#BD0F32]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-black bg-[#f4f4f4]">
        {screenshot ? (
          <Image
            src={screenshot}
            alt={`${project.title} screenshot`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            unoptimized={!shouldOptimizeImage(screenshot)}
            className="object-cover transition duration-300 group-hover:scale-[1.04]"
          />
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
          {project.kitType === "esp32" ? "ESP32" : "Arduino"}
        </div>
      </div>

      <div className="flex min-h-72 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-2xl font-black leading-tight text-black">
              {project.title || "Untitled project"}
            </h2>
            <p className="mt-1 text-sm font-bold text-[#BD0F32]">
              by {project.makerName}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-black bg-[#BD0F32] px-3 py-2 text-center text-white shadow-[2px_2px_0_#000]">
            <p className="text-xl font-black leading-none">{hours}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.12em]">
              hrs
            </p>
          </div>
        </div>

        <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-black/60">
          {project.description || "No description provided."}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {demo ? (
            <Link
              href={demo}
              target="_blank"
              className="rounded-xl border border-black bg-black px-4 py-2 text-sm font-black text-white no-underline shadow-[2px_2px_0_#BD0F32] transition hover:bg-[#BD0F32]"
            >
              Demo
            </Link>
          ) : null}
          {code ? (
            <Link
              href={code}
              target="_blank"
              className="rounded-xl border border-black bg-white px-4 py-2 text-sm font-black text-black no-underline shadow-[2px_2px_0_#000] transition hover:bg-black hover:text-white"
            >
              Code
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
