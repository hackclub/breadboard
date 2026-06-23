"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { updateOrderStatusFromForm } from "@/actions/shop";
import { BreadAmount } from "@/components/shared/bread-amount";
import { Button } from "@/components/ui/button";
import { Card, CardSection } from "@/components/ui/card";
import { Input, inputClass, Label } from "@/components/ui/input";
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
    <Card elevated={false} className="rounded-[12px]">
      <div className="grid gap-3 border-b border-black bg-[#f4f4f4] px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-lg font-semibold text-black">Order #{orderId}</p>
          <p className="text-sm text-black/60">{userEmail}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold text-black">
            <BreadAmount amount={totalCost} />
          </p>
          <p className="text-black/50">{createdAt}</p>
        </div>
      </div>

      <CardSection className="grid gap-4 p-5 lg:grid-cols-[1fr_360px]">
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
          <div className="flex flex-col gap-1">
            <Label htmlFor={`status-${orderId}`}>Status</Label>
            <select
              id={`status-${orderId}`}
              name="status"
              value={status}
              onChange={(event) =>
                setStatus(normalizeOrderStatus(event.target.value))
              }
              className={inputClass("bg-white py-2")}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`tracking-${orderId}`}>Tracking</Label>
            <Input
              id={`tracking-${orderId}`}
              type="url"
              name="trackingInfo"
              defaultValue={currentTracking ?? ""}
              placeholder="Tracking link"
              className="bg-white py-2"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            tone="ink"
            className="w-full"
          >
            {pending ? "Saving..." : "Save"}
          </Button>
          {state.message ? (
            <p className="text-sm font-bold text-[#BD0F32]" aria-live="polite">
              {state.message}
            </p>
          ) : null}
        </form>
      </CardSection>
    </Card>
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
