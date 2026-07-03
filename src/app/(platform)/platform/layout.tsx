import type { ReactNode } from "react";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";
import { LoginButton } from "@/components/shared/auth-buttons";
import { LaunchGate } from "@/components/shared/launch-gate";
import { pageGridClass } from "@/components/shared/styles";
import { launched } from "@/flags";
import { getSession, isAdminSession } from "@/lib/auth/guards";
import { estimateBreadFromSeconds } from "@/lib/constants";
import { db } from "@/lib/db/db";
import {
  editorActivitySessions,
  projects,
  user as userTable,
  userBread,
} from "@/lib/db/schema";

// Projects in these states have either already had their bread credited or
// will never earn any, so they don't count toward the pending estimate.
const SETTLED_PROJECT_STATUSES = [
  "done",
  "paid_out",
  "fulfilled",
  "rejected",
] as const;

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await launched())) return <LaunchGate />;

  const session = await getSession();

  if (!session) {
    return (
      <div className={`${pageGridClass} min-h-screen`}>
        <main className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md rounded-[16px] border border-black bg-white p-8 text-center shadow-[6px_6px_0_#000]">
            <h1 className="text-3xl font-black text-black">Sign in required</h1>
            <p className="mt-3 text-sm text-black/60">
              You need to sign in with Hack Club to access the platform.
            </p>
            <div className="mt-6 flex justify-center">
              <LoginButton callbackURL="/platform" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isAdmin = await isAdminSession(session);

  // Editor projects earn regular bread; build ships (submissionSource
  // "manual") earn gold bread, so pending time is estimated per currency.
  const [userRow, [pendingTracked]] = await Promise.all([
    db
      .select({
        slackId: userTable.slackId,
        breadBalance: userBread.balance,
        goldBreadBalance: userBread.goldBalance,
      })
      .from(userTable)
      .leftJoin(userBread, eq(userBread.userId, userTable.id))
      .where(eq(userTable.id, session.user.id))
      .limit(1),
    db
      .select({
        bread: sql<number>`coalesce(sum(case when ${projects.submissionSource} = 'manual' then 0 else ${editorActivitySessions.activeSeconds} end), 0)::int`,
        gold: sql<number>`coalesce(sum(case when ${projects.submissionSource} = 'manual' then ${editorActivitySessions.activeSeconds} else 0 end), 0)::int`,
      })
      .from(editorActivitySessions)
      .innerJoin(projects, eq(projects.id, editorActivitySessions.projectId))
      .where(
        and(
          eq(editorActivitySessions.userId, session.user.id),
          notInArray(projects.status, [...SETTLED_PROJECT_STATUSES]),
        ),
      ),
  ]);

  const pendingBreadEstimate = estimateBreadFromSeconds(
    pendingTracked?.bread ?? 0,
  );
  const pendingGoldBreadEstimate = estimateBreadFromSeconds(
    pendingTracked?.gold ?? 0,
  );

  return (
    <div className={`${pageGridClass} min-h-screen`}>
      <PlatformSidebar
        isAdmin={isAdmin}
        user={
          session
            ? {
                name: session.user.name,
                email: session.user.email,
                slackId: userRow[0]?.slackId ?? null,
                breadBalance: userRow[0]?.breadBalance ?? 0,
                goldBreadBalance: userRow[0]?.goldBreadBalance ?? 0,
                pendingBreadEstimate,
                pendingGoldBreadEstimate,
              }
            : null
        }
      />
      <main className="min-h-screen py-10 pr-10 pl-[320px]">
        <div className="mx-auto max-w-[1320px]">{children}</div>
      </main>
    </div>
  );
}
