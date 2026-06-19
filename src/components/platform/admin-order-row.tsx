"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { updateOrderStatusFromForm } from "@/actions/shop";
import type { OrderStatus, OrderStatusFormState } from "@/types";

type AdminOrderItem = {
  name: string;
  imageUrl: string;
  quantity: number;
};

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "being_fulfilled", label: "Being fulfilled" },
  { value: "sent", label: "Sent" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrderRow({
  orderId,
  currentStatus,
  currentTracking,
  userEmail,
  totalCost,
  items,
  createdAt,
}: {
  orderId: number;
  currentStatus: string;
  currentTracking: string | null;
  userEmail: string;
  totalCost: number;
  items: AdminOrderItem[];
  createdAt: string;
}) {
  const [status, setStatus] = useState<OrderStatus>(
    normalizeOrderStatus(currentStatus),
  );
  const [state, formAction, pending] = useActionState(
    updateOrderStatusFromForm,
    initialOrderStatusState,
  );

  useEffect(() => {
    if (state.success && state.status) setStatus(state.status);
  }, [state]);

  return (
    <div className="overflow-hidden rounded-[12px] border border-black bg-white">
      <div className="grid gap-3 border-b border-black bg-[#f4f4f4] px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-lg font-semibold text-black">Order #{orderId}</p>
          <p className="text-sm text-black/60">{userEmail}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold text-black">{totalCost} bread</p>
          <p className="text-black/50">{createdAt}</p>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.name}
              className="grid grid-cols-[72px_1fr] gap-3 rounded-[10px] border border-black/15 p-3"
            >
              <div className="relative h-[72px] w-[72px] rounded-[8px] border border-black bg-[#f4f4f4]">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="72px"
                  className="object-contain p-2"
                />
              </div>
              <div>
                <p className="font-semibold text-black">{item.name}</p>
                <p className="text-sm text-black/55">
                  Quantity: {item.quantity}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-black/50">Status</span>
            <select
              name="status"
              value={status}
              onChange={(event) =>
                setStatus(normalizeOrderStatus(event.target.value))
              }
              className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-black/50">Tracking</span>
            <input
              type="url"
              name="trackingInfo"
              defaultValue={currentTracking ?? ""}
              placeholder="Tracking link"
              className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BD0F32] disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {state.message ? (
            <p className="text-sm font-bold text-[#BD0F32]" aria-live="polite">
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

const initialOrderStatusState: OrderStatusFormState = { success: false };

function normalizeOrderStatus(status: string): OrderStatus {
  if (
    status === "pending" ||
    status === "being_fulfilled" ||
    status === "sent" ||
    status === "cancelled"
  ) {
    return status;
  }

  return "pending";
}
