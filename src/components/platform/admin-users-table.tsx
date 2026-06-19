"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  addUserBread,
  deductUserBread,
  deleteUser,
  setUserBread,
  updateUserProfile,
} from "@/actions/admin/users";
import { Modal } from "@/components/shared/modal";
import { slackPfpUrl } from "@/lib/utils/slack-pfp";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  slackId: string | null;
  emailVerified: boolean;
  admin: boolean;
  createdAt: string;
  updatedAt: string;
  balance: number;
  orderCount: number;
  pendingOrderCount: number;
  accountProviders: string[];
  activeSessionCount: number;
};

type SortKey =
  | "name"
  | "email"
  | "balance"
  | "orderCount"
  | "activeSessionCount";

type SortState = { key: SortKey; direction: "asc" | "desc" };

function compareValues(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function AdminUsersTable({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({
    key: "balance",
    direction: "desc",
  });
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const filteredUsers = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return users
      .filter((user) =>
        lowerQuery
          ? `${user.name} ${user.email} ${user.id}`
              .toLowerCase()
              .includes(lowerQuery)
          : true,
      )
      .sort((a, b) => {
        const result = compareValues(a[sort.key], b[sort.key]);
        return sort.direction === "asc" ? result : -result;
      });
  }, [users, query, sort]);

  const setSortKey = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <>
      <div className="overflow-hidden rounded-[14px] border border-black bg-white shadow-[5px_5px_0_#000]">
        <div className="flex items-center justify-between gap-4 border-b border-black bg-[#f4f4f4] px-5 py-4">
          <div>
            <h2 className="text-2xl font-black text-black">Users</h2>
            <p className="mt-1 text-sm text-black/55">
              Search and manage accounts.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users..."
            className="w-80 rounded-[10px] border border-black bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
          />
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-black text-white">
            <tr>
              <SortableHeader
                label="User"
                sortKey="name"
                sort={sort}
                onSort={setSortKey}
              />
              <SortableHeader
                label="Email"
                sortKey="email"
                sort={sort}
                onSort={setSortKey}
              />
              <SortableHeader
                label="Bread"
                sortKey="balance"
                sort={sort}
                onSort={setSortKey}
              />
              <SortableHeader
                label="Orders"
                sortKey="orderCount"
                sort={sort}
                onSort={setSortKey}
              />
              <SortableHeader
                label="Sessions"
                sortKey="activeSessionCount"
                sort={sort}
                onSort={setSortKey}
              />
              <th className="px-4 py-3 font-semibold">Admin</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className="bg-white transition hover:bg-[#fffaf1]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 overflow-hidden rounded-full border border-black bg-[#f4f4f4]">
                      <UserAvatar user={user} />
                    </div>
                    <div>
                      <p className="font-black text-black">{user.name}</p>
                      <p className="text-xs text-black/45">
                        {user.id.slice(0, 10)}...
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-black/70">{user.email}</td>
                <td className="px-4 py-3 font-black text-black">
                  {user.balance}
                </td>
                <td className="px-4 py-3 text-black/70">
                  {user.orderCount} total / {user.pendingOrderCount} pending
                </td>
                <td className="px-4 py-3 text-black/70">
                  {user.activeSessionCount}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded border px-2 py-1 text-xs font-semibold ${
                      user.admin
                        ? "border-[#BD0F32] bg-[#BD0F32] text-white"
                        : "border-black/20 bg-[#f4f4f4] text-black/45"
                    }`}
                  >
                    {user.admin ? "Admin" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelected(user)}
                    className="rounded border border-black bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <UserModal
          user={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function UserAvatar({ user }: { user: AdminUser }) {
  const avatarUrl = slackPfpUrl(user.slackId);

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        fill
        sizes="40px"
        className="object-cover"
        unoptimized
      />
    );
  }

  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        fill
        sizes="40px"
        className="object-cover"
      />
    );
  }

  return (
    <div className="grid h-full place-items-center font-black text-[#BD0F32]">
      {user.name.slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="font-black uppercase tracking-[0.12em] text-white/90 hover:text-white"
      >
        {label}{" "}
        {sort.key === sortKey ? (sort.direction === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}

function UserModal({
  user,
  currentUserId,
  onClose,
}: {
  user: AdminUser;
  currentUserId: string;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(1);
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    image: user.image ?? "",
    emailVerified: user.emailVerified,
    admin: user.admin,
  });

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    run(async () => {
      if (user.id === currentUserId)
        throw new Error("You cannot delete yourself");
      if (
        !confirm(
          `Delete ${user.email}? This removes sessions, balances, cart, and orders.`,
        )
      )
        return;
      await deleteUser(user.id);
      onClose();
    });

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="User management"
      title={user.name}
      maxWidth="xl"
      footer={
        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black bg-white px-5 py-3 text-sm font-black shadow-[3px_3px_0_#000] hover:bg-black hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => run(() => updateUserProfile(user.id, form))}
            disabled={saving}
            className="rounded-full border border-black bg-[#BD0F32] px-5 py-3 text-sm font-black text-white shadow-[3px_3px_0_#000] hover:bg-black disabled:opacity-50"
          >
            Save profile
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm font-bold text-black/60">{user.email}</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="w-full rounded-[10px] border border-black px-3 py-2 text-sm"
            placeholder="Name"
          />
          <input
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            className="w-full rounded-[10px] border border-black px-3 py-2 text-sm"
            placeholder="Email"
          />
          <input
            value={form.image}
            onChange={(event) =>
              setForm({ ...form, image: event.target.value })
            }
            className="w-full rounded-[10px] border border-black px-3 py-2 text-sm"
            placeholder="Image URL"
          />
          <label className="flex items-center gap-2 text-sm font-black text-black">
            <input
              type="checkbox"
              checked={form.emailVerified}
              onChange={(event) =>
                setForm({ ...form, emailVerified: event.target.checked })
              }
              className="size-4 accent-[#BD0F32]"
            />
            Email verified
          </label>
          <label className="flex items-center gap-2 text-sm font-black text-black">
            <input
              type="checkbox"
              checked={form.admin}
              onChange={(event) =>
                setForm({ ...form, admin: event.target.checked })
              }
              disabled={user.id === currentUserId}
              className="size-4 accent-[#BD0F32] disabled:opacity-40"
            />
            Admin user
          </label>
          <dl className="grid gap-3 rounded-[12px] border border-black/15 bg-[#f4f4f4] p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-black">Providers</dt>
              <dd>{user.accountProviders.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="font-black">Created</dt>
              <dd>{user.createdAt}</dd>
            </div>
            <div>
              <dt className="font-black">Updated</dt>
              <dd>{user.updatedAt}</dd>
            </div>
            <div>
              <dt className="font-black">Sessions</dt>
              <dd>{user.activeSessionCount}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[12px] border border-black bg-[#f4f4f4] p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#BD0F32]">
            Bread
          </p>
          <p className="mt-1 text-5xl font-black text-black">{user.balance}</p>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="mt-4 w-full rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
          />
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => run(() => addUserBread(user.id, amount))}
              disabled={saving}
              className="rounded-full border border-black bg-[#BD0F32] px-4 py-2 text-sm font-black text-white hover:bg-black"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => run(() => deductUserBread(user.id, amount))}
              disabled={saving}
              className="rounded-full border border-black bg-white px-4 py-2 text-sm font-black hover:bg-black hover:text-white"
            >
              Deduct
            </button>
            <button
              type="button"
              onClick={() => run(() => setUserBread(user.id, amount))}
              disabled={saving}
              className="rounded-full border border-black bg-white px-4 py-2 text-sm font-black hover:bg-black hover:text-white"
            >
              Set to amount
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving || user.id === currentUserId}
              className="mt-3 rounded-full border border-red-700 bg-red-50 px-4 py-2 text-sm font-black text-red-700 hover:bg-red-700 hover:text-white disabled:opacity-50"
            >
              Delete user
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
