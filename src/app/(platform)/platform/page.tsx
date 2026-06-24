import { and, desc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { FaHandPeace } from "react-icons/fa6";
import { HiArrowRight, HiPencilSquare } from "react-icons/hi2";
import { LoginButton } from "@/components/shared/auth-buttons";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardSection, Surface } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import { projects } from "@/lib/db/schema";
import { canEditProject, statusLabel } from "@/lib/utils";

const helpCards = [
  {
    title: "Plan the circuit",
    href: "/get-started",
    image: null,
  },
  { title: "Use the guides", href: "/guides", image: "/assets/Build.png" },
  {
    title: "Check shipping rules",
    href: "/requirements",
    image: "/assets/Recieve.png",
  },
];

export default async function PlatformDashboardPage() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="max-w-3xl">
        <Surface>
          <div className="flex items-center gap-3">
            <FaHandPeace className="size-7 text-[#BD0F32]" />
            <h1 className="text-3xl font-black text-black">Sup</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-black/60">
            Log in to see your projects and continue building.
          </p>
          <div className="mt-5">
            <LoginButton callbackURL="/platform" />
          </div>
        </Surface>
      </main>
    );
  }

  const userProjects = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      status: projects.status,
      reviewNote: projects.reviewNote,
    })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .orderBy(desc(projects.updatedAt))
    .limit(6);

  return (
    <main className="max-w-6xl space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1fr_390px]">
        <Surface>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <FaHandPeace className="size-7 text-[#BD0F32]" />
                <h1 className="text-3xl font-black text-black">
                  Sup {session.user.name?.split(" ")[0]}
                </h1>
              </div>
            </div>
            <Link
              href="/platform/projects"
              className={buttonClass({
                tone: "primary",
                size: "sm",
                className: "shrink-0",
              })}
            >
              New project
            </Link>
          </div>
        </Surface>

        <Link
          href="/gallery"
          className="group relative min-h-44 overflow-hidden rounded-[16px] border border-black bg-black text-white shadow-[4px_4px_0_#BD0F32]"
        >
          <Image
            src="/assets/Build.png"
            alt="Breadboard build"
            fill
            sizes="390px"
            className="object-cover opacity-65 transition group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
          <div className="absolute right-4 bottom-4 left-4">
            <p className="text-xs font-black tracking-[0.18em] text-white/70 uppercase">
              Need ideas?
            </p>
            <p className="mt-1 text-2xl font-black">Browse the gallery</p>
          </div>
        </Link>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <Surface className="p-3">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-black">Your projects</h2>
              <span className="text-xs text-black/45">latest first</span>
            </div>
            <Link
              href="/platform/projects"
              className="text-sm font-black text-[#BD0F32] no-underline hover:text-black"
            >
              All projects
            </Link>
          </div>

          {userProjects.length > 0 ? (
            <div className="divide-y divide-black/10">
              {userProjects.map((project) => {
                const editable = canEditProject(project.status);

                return (
                  <div
                    key={project.id}
                    className="grid gap-3 px-3 py-4 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-xl font-black text-black">
                          {project.title}
                        </h3>
                        <Badge>{statusLabel(project.status)}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-black/55">
                        {project.reviewNote ||
                          project.description ||
                          "No description yet."}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {editable ? (
                        <Link
                          href={`/editor/${project.id}`}
                          className={buttonClass({ tone: "ink", size: "sm" })}
                        >
                          <HiPencilSquare className="size-4" />
                          Editor
                        </Link>
                      ) : null}
                      <Link
                        href="/platform/projects"
                        className={buttonClass({
                          tone: "paper",
                          size: "sm",
                          className: "shadow-none",
                        })}
                      >
                        Details
                        <HiArrowRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No projects yet"
                description="Start one when you are ready."
                action={
                  <Link
                    href="/platform/projects"
                    className={buttonClass({ tone: "primary" })}
                  >
                    Create project
                  </Link>
                }
              />
            </div>
          )}
        </Surface>

        <div className="grid gap-3 content-start">
          {helpCards.map((card) => (
            <Card
              key={card.href}
              className="group transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#BD0F32]"
            >
              <Link
                href={card.href}
                className="grid grid-cols-[92px_1fr] text-black no-underline"
              >
                <div className="relative min-h-24 bg-[#f4f4f4]">
                  {card.image ? (
                    <Image
                      src={card.image}
                      alt=""
                      fill
                      sizes="92px"
                      className="object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full min-h-24 w-full items-center justify-center bg-white px-2 text-center text-[10px] font-black tracking-[0.12em] text-black/35 uppercase">
                      Add image here
                    </div>
                  )}
                </div>
                <div className="flex items-center p-4">
                  <p className="text-lg font-black leading-tight">
                    {card.title}
                  </p>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
