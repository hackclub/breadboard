import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { projectEvents, projects, user } from "@/lib/db/schema";

type ReviewPhase = "materials" | "demo";
type ReviewDecision = "accepted" | "needs_changes" | "rejected";
type ProjectStatusKind = "reviewed" | "paid_out" | "fulfilled";
type KitShippingStatus = "being_fulfilled" | "sent";

type SlackBlock = Record<string, unknown>;
type SlackMessageResult = {
  channel?: string;
  ts?: string;
};

const TOOKLE_NAME = "Tookle";

const phaseLabels: Record<ReviewPhase, string> = {
  materials: "design review",
  demo: "demo review",
};

const projectStatusCopy: Record<
  ProjectStatusKind,
  { title: string; body: string; tone: string }
> = {
  reviewed: {
    title: "Project reviewed",
    body: "Your design review is complete.",
    tone: "Check Breadboard for the next step.",
  },
  paid_out: {
    title: "Bread awarded",
    body: "Your project payout was added.",
    tone: "That one shipped.",
  },
  fulfilled: {
    title: "Project fulfilled",
    body: "This project is wrapped up.",
    tone: "On to the next build.",
  },
};

const decisionLabels: Record<ReviewDecision, string> = {
  accepted: "accepted",
  needs_changes: "needs changes",
  rejected: "declined",
};

function slackEnabled() {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

function reviewChannelId() {
  return process.env.SLACK_REVIEW_CHANNEL_ID?.trim();
}

function appUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000";
  return `${base}${path}`;
}

function truncate(text: string, max = 180) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function projectPath(projectId: number) {
  return `/platform/projects?project=${projectId}`;
}

function reviewPath(projectId: number, phase: ReviewPhase) {
  return phase === "demo"
    ? `/platform/admin/review/demo/${projectId}`
    : `/platform/admin/review/${projectId}`;
}

async function postSlackMessage(input: {
  channel: string;
  text: string;
  blocks: SlackBlock[];
}): Promise<SlackMessageResult | null> {
  if (!slackEnabled()) return null;

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      text: input.text,
      blocks: input.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    channel?: string;
    ts?: string;
  } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? `Slack HTTP ${response.status}`);
  }
  return { channel: result.channel, ts: result.ts };
}

async function openDm(slackId: string) {
  if (!slackEnabled()) return null;

  const response = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: slackId }),
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    channel?: { id?: string };
  } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? `Slack HTTP ${response.status}`);
  }
  return result.channel?.id ?? null;
}

async function getProjectWithOwner(projectId: number) {
  const [row] = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      screenshotUrl: projects.screenshotUrl,
      userId: projects.userId,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerSlackId: user.slackId,
    })
    .from(projects)
    .innerJoin(user, eq(projects.userId, user.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  return row;
}

function projectContext(
  project: Awaited<ReturnType<typeof getProjectWithOwner>>,
) {
  if (!project) return [];
  return [
    {
      type: "mrkdwn",
      text: `*Project:* ${truncate(project.title, 80)}`,
    },
    {
      type: "mrkdwn",
      text: `*Owner:* ${
        project.ownerSlackId ? `<@${project.ownerSlackId}>` : project.ownerName
      }`,
    },
  ];
}

function button(text: string, url: string) {
  return {
    type: "button",
    text: { type: "plain_text", text },
    url,
  };
}

function logSlackError(context: string, error: unknown) {
  console.error(
    `[${TOOKLE_NAME}] ${context}`,
    error instanceof Error ? error.message : error,
  );
}

async function addSlackReaction(input: {
  channel: string;
  timestamp: string;
  name: string;
}) {
  if (!slackEnabled()) return;

  const response = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      timestamp: input.timestamp,
      name: input.name,
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (result?.error === "already_reacted") return;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? `Slack HTTP ${response.status}`);
  }
}

async function storeReviewChannelMessage(input: {
  projectId: number;
  phase: ReviewPhase;
  channel?: string;
  ts?: string;
}) {
  if (!input.channel || !input.ts) return;

  await db.insert(projectEvents).values({
    projectId: input.projectId,
    type: input.phase === "demo" ? "demo_submitted" : "materials_submitted",
    sourceEntityType: "slack_review_channel",
    sourceEntityId: input.ts,
    details: {
      channel: input.channel,
      ts: input.ts,
      phase: input.phase,
    },
  });
}

function slackMessageFromEventDetails(details: Record<string, unknown> | null) {
  const channel = details?.channel;
  const ts = details?.ts;
  if (typeof channel !== "string" || typeof ts !== "string") return null;
  return { channel, ts };
}

async function addReviewDoneReaction(projectId: number, phase: ReviewPhase) {
  const [event] = await db
    .select({ details: projectEvents.details })
    .from(projectEvents)
    .where(
      and(
        eq(projectEvents.projectId, projectId),
        eq(
          projectEvents.type,
          phase === "demo" ? "demo_submitted" : "materials_submitted",
        ),
        eq(projectEvents.sourceEntityType, "slack_review_channel"),
      ),
    )
    .orderBy(desc(projectEvents.createdAt))
    .limit(1);

  if (!event) return;
  const message = slackMessageFromEventDetails(event.details ?? null);
  if (!message) return;

  await addSlackReaction({
    channel: message.channel,
    timestamp: message.ts,
    name: "white_check_mark",
  });
}

function reviewDecisionCopy(
  phase: ReviewPhase,
  decision: ReviewDecision,
  bread?: number,
) {
  if (decision === "accepted" && phase === "materials") {
    return {
      title: "Design review accepted",
      body: "Nice, your design got accepted. Your kit will ship soon. Once it arrives, confirm it in Breadboard, build your project, then submit a working demo video.",
    };
  }

  if (decision === "accepted" && phase === "demo") {
    return {
      title: "Demo review accepted",
      body: `YAY, your project's demo got accepted. You got ${bread ?? 0} bread.`,
    };
  }

  const label = phase === "demo" ? "Demo review" : "Design review";
  return {
    title: `${label} ${decisionLabels[decision]}`,
    body: `${label} ${
      decision === "needs_changes" ? "needs changes" : "failed"
    }. A reviewer left you this note:`,
  };
}

export async function notifyReviewSubmitted(
  projectId: number,
  phase: ReviewPhase,
) {
  try {
    const [project, channel] = await Promise.all([
      getProjectWithOwner(projectId),
      Promise.resolve(reviewChannelId()),
    ]);
    if (!project) return;

    const label = phaseLabels[phase];
    const projectUrl = appUrl(projectPath(projectId));
    const reviewUrl = appUrl(reviewPath(projectId, phase));

    if (channel) {
      try {
        const message = await postSlackMessage({
          channel,
          text: `${TOOKLE_NAME}: new ${label} for ${project.title}`,
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: `New ${label}` },
            },
            {
              type: "section",
              fields: projectContext(project),
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `${TOOKLE_NAME} found something ready to review.`,
                },
              ],
            },
            {
              type: "actions",
              elements: [button("Review", reviewUrl)],
            },
          ],
        });
        await storeReviewChannelMessage({
          projectId,
          phase,
          channel: message?.channel ?? channel,
          ts: message?.ts,
        });
      } catch (error) {
        logSlackError("review channel notification failed", error);
      }
    }

    if (project.ownerSlackId) {
      const dm = await openDm(project.ownerSlackId);
      if (dm) {
        await postSlackMessage({
          channel: dm,
          text: `${TOOKLE_NAME}: your ${label} is in review`,
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: "In review" },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${truncate(project.title, 80)}* is now in ${label}. Tookle will nudge you when it changes.`,
              },
            },
            {
              type: "actions",
              elements: [button("Open project", projectUrl)],
            },
          ],
        });
      }
    }
  } catch (error) {
    logSlackError("review notification failed", error);
  }
}

export async function notifyReviewDecision(
  projectId: number,
  phase: ReviewPhase,
  decision: ReviewDecision,
  details?: { note?: string; bread?: number },
) {
  try {
    await addReviewDoneReaction(projectId, phase);

    const project = await getProjectWithOwner(projectId);
    if (!project?.ownerSlackId) return;

    const dm = await openDm(project.ownerSlackId);
    if (!dm) return;

    const copy = reviewDecisionCopy(phase, decision, details?.bread);
    const fields = [
      {
        type: "mrkdwn",
        text: `*Project:* ${truncate(project.title, 80)}`,
      },
      {
        type: "mrkdwn",
        text: `*Review:* ${phaseLabels[phase]}`,
      },
    ];
    if (typeof details?.bread === "number" && details.bread > 0) {
      fields.push({ type: "mrkdwn", text: `*Bread:* ${details.bread}` });
    }

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: { type: "plain_text", text: copy.title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: copy.body },
      },
      { type: "section", fields },
    ];

    const note = truncate(details?.note ?? "", 240);
    if (note) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Reviewer note:*\n${note}` },
      });
    }

    blocks.push({
      type: "actions",
      elements: [button("Open project", appUrl(projectPath(projectId)))],
    });

    await postSlackMessage({
      channel: dm,
      text: `${TOOKLE_NAME}: ${copy.title} for ${project.title}`,
      blocks,
    });
  } catch (error) {
    logSlackError("review decision notification failed", error);
  }
}

export async function notifyProjectStatus(
  projectId: number,
  status: ProjectStatusKind,
  details?: { note?: string; bread?: number },
) {
  try {
    const project = await getProjectWithOwner(projectId);
    if (!project?.ownerSlackId) return;

    const dm = await openDm(project.ownerSlackId);
    if (!dm) return;

    const copy = projectStatusCopy[status];
    const fields = [
      {
        type: "mrkdwn",
        text: `*Project:* ${truncate(project.title, 80)}`,
      },
    ];
    if (typeof details?.bread === "number" && details.bread > 0) {
      fields.push({ type: "mrkdwn", text: `*Bread:* ${details.bread}` });
    }

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: { type: "plain_text", text: copy.title },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${copy.body} ${copy.tone}`,
        },
      },
      { type: "section", fields },
    ];

    const note = truncate(details?.note ?? "", 240);
    if (note) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Reviewer note:*\n${note}` },
      });
    }

    blocks.push({
      type: "actions",
      elements: [button("Open project", appUrl(projectPath(projectId)))],
    });

    await postSlackMessage({
      channel: dm,
      text: `${TOOKLE_NAME}: ${copy.title} for ${project.title}`,
      blocks,
    });
  } catch (error) {
    logSlackError("status notification failed", error);
  }
}

export async function notifyKitShippingStatus(
  projectId: number,
  status: KitShippingStatus,
  details?: { trackingUrl?: string; note?: string },
) {
  try {
    const project = await getProjectWithOwner(projectId);
    if (!project?.ownerSlackId) return;

    const dm = await openDm(project.ownerSlackId);
    if (!dm) return;

    const sent = status === "sent";
    const title = sent ? "Kit sent" : "Kit packing";
    const body = sent
      ? "Your kit was just sent out."
      : "Your kit is being packed now.";

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: { type: "plain_text", text: title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: body },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Project:* ${truncate(project.title, 80)}`,
          },
        ],
      },
    ];

    const note = truncate(details?.note ?? "", 240);
    if (note) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Shipping note:*\n${note}` },
      });
    }

    const actions = [button("Open project", appUrl(projectPath(projectId)))];
    if (sent && details?.trackingUrl) {
      actions.unshift(button("Track kit", details.trackingUrl));
    }
    blocks.push({ type: "actions", elements: actions });

    await postSlackMessage({
      channel: dm,
      text: `${TOOKLE_NAME}: ${title} for ${project.title}`,
      blocks,
    });
  } catch (error) {
    logSlackError("kit shipping notification failed", error);
  }
}
