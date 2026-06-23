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
import { BreadAmount } from "@/components/shared/bread-amount";
import { Modal } from "@/components/shared/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataPanel,
  DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableScroll,
} from "@/components/ui/table";
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
      <DataPanel
        title="Users"
        description="Search, sort, and manage accounts."
        action={
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users..."
            className="w-full bg-white sm:w-80"
          />
        }
      >
        <TableScroll>
          <DataTable className="min-w-[980px]">
            <TableHead>
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
                <TableHeaderCell>Admin</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-black/70">{user.email}</TableCell>
                  <TableCell className="font-black text-black">
                    <BreadAmount amount={user.balance} />
                  </TableCell>
                  <TableCell className="text-black/70">
                    {user.orderCount} total / {user.pendingOrderCount} pending
                  </TableCell>
                  <TableCell className="text-black/70">
                    {user.activeSessionCount}
                  </TableCell>
                  <TableCell>
                    <Badge tone={user.admin ? "red" : "muted"}>
                      {user.admin ? "Admin" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => setSelected(user)}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </TableScroll>
      </DataPanel>

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
    <TableHeaderCell>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="font-black uppercase tracking-[0.12em] text-white/90 hover:text-white"
      >
        {label}{" "}
        {sort.key === sortKey ? (sort.direction === "asc" ? "↑" : "↓") : ""}
      </button>
    </TableHeaderCell>
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
          <p className="mt-1 text-5xl font-black text-black">
            <BreadAmount amount={user.balance} size="lg" />
          </p>
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
