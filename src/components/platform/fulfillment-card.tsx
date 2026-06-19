"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { updateOrderStatusFromForm } from "@/actions/shop";
import type { OrderStatus, OrderStatusFormState } from "@/types";

type FulfillmentItem = {
  id: number;
  name: string;
  imageUrl: string;
  quantity: number;
};

export function FulfillmentCard({
  order,
  items,
}: {
  order: {
    id: number;
    status: "pending" | "being_fulfilled" | "sent" | "cancelled";
    totalCost: number;
    userEmail: string;
    shippingName: string;
    shippingLine1: string;
    shippingLine2: string;
    shippingCity: string;
    shippingRegion: string;
    shippingPostalCode: string;
    shippingCountry: string;
  };
  items: FulfillmentItem[];
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState(order.status);
  const [state, formAction, pending] = useActionState(
    updateOrderStatusFromForm,
    initialOrderStatusState,
  );

  useEffect(() => {
    if (state.success && state.status) setStatus(state.status);
  }, [state]);

  const accepted = status === "being_fulfilled";
  const allChecked = items.every((item) => checked[item.id]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-black bg-white">
      <div className="grid gap-4 border-b border-black bg-[#f4f4f4] p-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-black/55">
            Order #{order.id}
          </p>
          <h2 className="mt-2 text-3xl font-black text-black">
            {accepted ? order.shippingName || order.userEmail : "Packing list"}
          </h2>
          <p className="mt-1 text-sm text-black/60">
            {accepted
              ? order.userEmail
              : "Accept the order to view the address."}
          </p>
        </div>
        <div className="rounded-[12px] border border-black bg-white px-5 py-4 lg:text-right">
          <p className="text-sm font-bold text-black/55">Total</p>
          <p className="text-2xl font-black text-black">
            {order.totalCost} bread
          </p>
          <p className="mt-1 text-sm font-semibold text-black/55">
            {status.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {items.map((item) => (
            <label
              key={item.id}
              className="grid cursor-pointer gap-4 rounded-[14px] border border-black bg-white p-4 transition hover:bg-[#f4f4f4] sm:grid-cols-[96px_1fr_120px_auto] sm:items-center"
            >
              <div className="relative h-24 w-24 rounded-[12px] border border-black bg-[#f4f4f4]">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="96px"
                  className="object-contain p-2"
                />
              </div>
              <div>
                <p className="text-xl font-semibold text-black">{item.name}</p>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  Pack this item
                </p>
              </div>
              <div className="rounded-[10px] border border-black bg-white px-4 py-3 text-center text-black">
                <p className="text-xs font-semibold text-black/50">Qty</p>
                <p className="text-4xl font-black leading-none">
                  {item.quantity}
                </p>
              </div>
              <input
                type="checkbox"
                disabled={!accepted}
                checked={checked[item.id] ?? false}
                onChange={(event) =>
                  setChecked({ ...checked, [item.id]: event.target.checked })
                }
                className="size-8 accent-[#BD0F32] disabled:opacity-30"
              />
            </label>
          ))}
        </div>

        <div className="space-y-4">
          {accepted ? (
            <div className="rounded-[14px] border border-black bg-[#f4f4f4] p-5">
              <p className="text-sm font-semibold text-black/45">Ship to</p>
              <div className="mt-3 space-y-1 text-sm font-semibold text-black">
                <p>{order.shippingName}</p>
                <p>{order.shippingLine1}</p>
                {order.shippingLine2 ? <p>{order.shippingLine2}</p> : null}
                <p>
                  {order.shippingCity}, {order.shippingRegion}{" "}
                  {order.shippingPostalCode}
                </p>
                <p>{order.shippingCountry}</p>
              </div>
            </div>
          ) : null}

          <div className="rounded-[14px] border border-black bg-white p-5">
            {status === "pending" ? (
              <OrderStatusForm
                action={formAction}
                orderId={order.id}
                status="being_fulfilled"
                submitLabel="Accept order"
                pendingLabel="Accepting..."
                pending={pending}
              />
            ) : (
              <div className="space-y-3">
                <OrderStatusForm
                  action={formAction}
                  orderId={order.id}
                  status="pending"
                  submitLabel="Undo accept"
                  pendingLabel="Saving..."
                  pending={pending}
                  tone="secondary"
                />
                <OrderStatusForm
                  action={formAction}
                  orderId={order.id}
                  status="sent"
                  submitLabel="Fulfilled"
                  pendingLabel="Saving..."
                  pending={pending}
                  disabled={!allChecked}
                  tracking
                />
                {!allChecked ? (
                  <p className="text-xs font-semibold text-black/50">
                    Tick every item before fulfilling.
                  </p>
                ) : null}
              </div>
            )}
            {state.message ? (
              <p
                className="mt-3 text-sm font-bold text-[#BD0F32]"
                aria-live="polite"
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const initialOrderStatusState: OrderStatusFormState = { success: false };

function OrderStatusForm({
  action,
  orderId,
  status,
  submitLabel,
  pendingLabel,
  pending,
  disabled = false,
  tracking = false,
  tone = "primary",
}: {
  action: (formData: FormData) => void;
  orderId: number;
  status: OrderStatus;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  tracking?: boolean;
  tone?: "primary" | "secondary";
}) {
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />
      {tracking ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-black/50">Tracking link</span>
          <input
            type="url"
            name="trackingInfo"
            required
            className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
          />
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending || disabled}
        className={
          tone === "primary"
            ? "w-full rounded border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BD0F32] disabled:cursor-not-allowed disabled:opacity-50"
            : "w-full rounded border border-black px-4 py-2.5 text-sm font-semibold transition hover:bg-black hover:text-white disabled:opacity-50"
        }
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
