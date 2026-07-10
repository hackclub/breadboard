import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PageHero, ProseCard } from "@/components/shared/docs-frame";
import { MarkdownView } from "./markdown-view";

// The tutorial lives as markdown at the repo root so it can double as a
// standalone doc. Read and split it at build time; force-static ensures the
// content is inlined into the prerender and the file isn't needed at runtime
// (important for the standalone Docker build).
export const dynamic = "force-static";

function loadTutorial() {
  try {
    const raw = readFileSync(
      join(process.cwd(), "docs", "tutorial.md"),
      "utf8",
    );
    const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "LED Workshop";
    // Drop the H1 (shown in the hero) and the Table of Contents (its anchor
    // links don't resolve without slugged headings). Render from the first
    // real section onward.
    const start = raw.indexOf("## What You Will Build");
    const body = start >= 0 ? raw.slice(start) : raw;
    return { title, body };
  } catch {
    // Never hard-fail the whole build if the doc is missing from the build
    // context; degrade to a pointer instead.
    return {
      title: "LED Workshop",
      body: "The workshop guide is temporarily unavailable. Ask in [#breadboard](https://hackclub.enterprise.slack.com/archives/C09EB0AE68M) if you need it.",
    };
  }
}

export default function WorkshopPage() {
  const { title, body } = loadTutorial();

  return (
    <section>
      <PageHero title="LED Workshop">
        <p className="mt-2 text-base text-black/80">{title}</p>
      </PageHero>

      <ProseCard>
        <MarkdownView source={body} />
      </ProseCard>
    </section>
  );
}
