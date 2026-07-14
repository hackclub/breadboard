import "server-only";

import { randomUUID } from "node:crypto";
import type { db } from "@/lib/db/db";
import { currencyTransactions } from "@/lib/db/schema";

type CurrencyType =
  | "project_payout"
  | "shop_purchase"
  | "order_refund"
  | "admin_adjustment";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Append-only ledger for every bread balance change. The `userBread` row is a
// running total; this table is the audit trail that total is reconcilable
// against. `idempotencyKey` is unique, so a deterministic key makes a retried
// mutation (e.g. a double-submitted approval) a no-op rather than a
// double-credit; pass a random key when each call is a genuinely distinct
// event. Always call inside the same transaction as the balance update so the
// two can't diverge.
export async function recordCurrencyTransaction(
  tx: Tx | typeof db,
  entry: {
    userId: string;
    type: CurrencyType;
    currency?: "bread" | "gold"; // which balance moved; defaults to bread
    amount: number; // signed: credit > 0, debit < 0
    actorId?: string | null;
    balanceAfter?: number | null;
    sourceEntityType?: string;
    sourceEntityId?: string;
    idempotencyKey?: string;
    note?: string;
  },
): Promise<void> {
  await tx
    .insert(currencyTransactions)
    .values({
      userId: entry.userId,
      actorId: entry.actorId ?? null,
      type: entry.type,
      currency: entry.currency ?? "bread",
      amount: entry.amount,
      balanceAfter: entry.balanceAfter ?? null,
      sourceEntityType: entry.sourceEntityType ?? "",
      sourceEntityId: entry.sourceEntityId ?? "",
      idempotencyKey: entry.idempotencyKey ?? randomUUID(),
      note: entry.note ?? "",
    })
    .onConflictDoNothing({ target: currencyTransactions.idempotencyKey });
}
