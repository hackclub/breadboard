"use client";

import { useMemo, useState } from "react";

interface AuditEntry {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function describeAuditEntry(entry: AuditEntry) {
  const action = entry.action
    .replace(/^admin\./, "")
    .replace(/^editor\./, "editor.")
    .replace(/\./g, " -> ")
    .replace(/_/g, " ");

  const target = entry.entityId
    ? `${entry.entityType} ${entry.entityId}`
    : entry.entityType;

  return `${entry.actorName} ${action} on ${target}`;
}

function formatDetails(details: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0)
    return "No details recorded.";
  return JSON.stringify(details, null, 2);
}

function AuditEntryDetails({
  details,
}: {
  details: Record<string, unknown> | null;
}) {
  return (
    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-black">
      {formatDetails(details)}
    </pre>
  );
}

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;

    return entries.filter((entry) => {
      const text = [
        entry.id,
        entry.actorName,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.createdAt,
        describeAuditEntry(entry),
        formatDetails(entry.details),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }, [entries, search]);

  return (
    <section className="rounded-[12px] border border-black bg-white">
      <div className="border-b border-black/15 p-4">
        <label
          className="block text-sm font-bold text-black"
          htmlFor="audit-search"
        >
          Search audit logs
        </label>
        <input
          id="audit-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search actor, action, entity, ID, timestamp, or details"
          className="mt-2 w-full rounded border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
        />
        <p className="mt-2 text-sm text-black/55">
          {filtered.length} of {entries.length} logs shown. Newest first.
        </p>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {filtered.length > 0 ? (
          <ol className="divide-y divide-black/15">
            {filtered.map((entry) => (
              <li key={entry.id} className="p-4">
                <p className="text-base font-semibold text-black">
                  {describeAuditEntry(entry)}
                </p>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="font-semibold text-black/50">Time</dt>
                    <dd className="font-mono text-black">
                      {formatTimestamp(entry.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-black/50">Actor</dt>
                    <dd className="break-words text-black">
                      {entry.actorName}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-black/50">Action</dt>
                    <dd className="break-words font-mono text-black">
                      {entry.action}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-black/50">Target</dt>
                    <dd className="break-words text-black">
                      {entry.entityType}
                      {entry.entityId ? ` ${entry.entityId}` : ""}
                    </dd>
                  </div>
                </dl>

                <details
                  className="mt-3 rounded border border-black/10 bg-zinc-50 p-3"
                  open
                >
                  <summary className="cursor-pointer text-sm font-semibold text-black">
                    Details
                  </summary>
                  <AuditEntryDetails details={entry.details} />
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <div className="p-8 text-center text-sm text-black/60">
            No audit logs match that search.
          </div>
        )}
      </div>
    </section>
  );
}
