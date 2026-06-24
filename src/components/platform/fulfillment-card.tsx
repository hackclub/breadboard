"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  HiArrowPath,
  HiArrowRight,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiCube,
  HiExclamationTriangle,
  HiMapPin,
  HiPaperAirplane,
  HiTruck,
} from "react-icons/hi2";
import { updateOrderStatusFromForm } from "@/actions/shop";
import type { OrderStatus, OrderStatusFormState } from "@/types";

type FulfillmentItem = {
  id: number;
  name: string;
  imageUrl: string;
  quantity: number;
};

type FulfillmentOrder = {
  id: number;
  status: "pending" | "being_fulfilled" | "sent" | "cancelled";
  totalCost: number;
  userEmail: string;
  source: string;
  projectId: number | null;
  acceptedAt: Date | null;
  shippingName: string;
  shippingLine1: string;
  shippingLine2: string;
  shippingCity: string;
  shippingRegion: string;
  shippingPostalCode: string;
  shippingCountry: string;
};

const initialOrderStatusState: OrderStatusFormState = { success: false };

function statusCopy(status: FulfillmentOrder["status"]) {
  if (status === "pending") return "Ready to accept";
  if (status === "being_fulfilled") return "Packing now";
  if (status === "sent") return "Sent";
  return "Cancelled";
}

function safeImage(src: string) {
  return src || "/assets/arduino.png";
}

export function FulfillmentCard({
  order,
  items,
  kitType,
}: {
  order: FulfillmentOrder;
  items: FulfillmentItem[];
  kitType: string | null;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [addressChecked, setAddressChecked] = useState(false);
  const [labelChecked, setLabelChecked] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [state, formAction, pending] = useActionState(
    updateOrderStatusFromForm,
    initialOrderStatusState,
  );

  useEffect(() => {
    if (state.success && state.status) setStatus(state.status);
    if (state.success && state.status === "sent") {
      router.replace(`/platform/admin/fulfillment?skip=${order.id}`);
    }
  }, [state, router, order.id]);

  const isKitOrder = order.source === "project_kit";
  const kitImage =
    kitType === "esp32" ? "/assets/esp32.png" : "/assets/arduino.png";
  const accepted = status === "being_fulfilled" || status === "sent";
  const sent = status === "sent";
  const packedCount = items.filter((item) => checked[item.id]).length;
  const allPacked = items.length === 0 || packedCount === items.length;
  const canShip = accepted && allPacked && addressChecked && labelChecked;

  return (
    <div className="overflow-hidden rounded-[18px] border border-black bg-white shadow-[6px_6px_0_#000]">
      <div className="grid gap-4 border-b border-black bg-[#f4f4f4] p-6 xl:grid-cols-[1fr_340px] xl:items-stretch">
        <div className="flex gap-4">
          <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-black bg-white shadow-[3px_3px_0_#000]">
            {isKitOrder ? (
              <Image
                src={kitImage}
                alt="Kit"
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <HiTruck className="size-8 text-[#BD0F32]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black bg-black px-3 py-1 text-xs font-black text-white uppercase">
                {isKitOrder ? "Project kit" : "Shop order"}
              </span>
              <span className="rounded-full border border-black bg-white px-3 py-1 text-xs font-black text-black uppercase">
                Order #{order.id}
              </span>
              {order.projectId ? (
                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-black text-black/55 uppercase">
                  Project #{order.projectId}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-4xl font-black leading-tight text-black">
              {statusCopy(status)}
            </h2>
            <p className="mt-1 text-sm font-bold text-black/55">
              {accepted
                ? `${order.shippingName || order.userEmail} · ${order.userEmail}`
                : isKitOrder
                  ? "Accept locks the teen's latest address and starts kit packing."
                  : "Accept the order to reveal the address and start packing."}
            </p>
          </div>
        </div>

        <div className="grid gap-2 rounded-[14px] border border-black bg-white p-4">
          <ProgressRow
            active={accepted}
            done={accepted}
            label="Accept"
            icon={HiClipboardDocumentCheck}
          />
          <ProgressRow
            active={accepted && !sent}
            done={allPacked && accepted}
            label={`Pack ${packedCount}/${items.length}`}
            icon={HiCube}
          />
          <ProgressRow
            active={accepted && !sent}
            done={sent}
            label="Ship"
            icon={HiPaperAirplane}
          />
        </div>
      </div>

      {isKitOrder ? (
        <div className="border-b border-black bg-[#fffaf1] px-6 py-3 text-sm font-black text-black">
          Kit orders stay separate from shop orders. The address is pulled fresh
          when accepted, then becomes final.
        </div>
      ) : null}

      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-black/40">
                Packing checklist
              </p>
              <h3 className="text-2xl font-black text-black">Items to pack</h3>
            </div>
            <button
              type="button"
              disabled={!accepted || sent}
              onClick={() => {
                const next = Object.fromEntries(
                  items.map((item) => [item.id, true]),
                );
                setChecked(next);
              }}
              className="rounded-xl border border-black bg-white px-4 py-2 text-sm font-black text-black hover:bg-black hover:text-white disabled:opacity-40"
            >
              Check all
            </button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-black/25 bg-zinc-50 p-6 text-sm font-bold text-black/55">
              No line items found. You can still mark shipment details after
              accepting.
            </div>
          ) : null}

          {items.map((item) => {
            const packed = Boolean(checked[item.id]);
            return (
              <label
                key={item.id}
                className={`grid cursor-pointer gap-4 rounded-[14px] border border-black p-4 transition sm:grid-cols-[96px_1fr_96px_auto] sm:items-center ${
                  packed ? "bg-green-50" : "bg-white hover:bg-[#f4f4f4]"
                } ${!accepted || sent ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-[12px] border border-black bg-[#f4f4f4]">
                  <Image
                    src={safeImage(item.imageUrl)}
                    alt={item.name}
                    fill
                    sizes="96px"
                    className="object-contain p-2"
                  />
                </div>
                <div>
                  <p className="text-xl font-black text-black">{item.name}</p>
                  <p className="mt-1 text-sm font-bold text-black/55">
                    {packed ? "Packed" : "Put this in the package"}
                  </p>
                </div>
                <div className="rounded-[10px] border border-black bg-white px-4 py-3 text-center text-black">
                  <p className="text-xs font-black text-black/40 uppercase">
                    Qty
                  </p>
                  <p className="text-4xl font-black leading-none">
                    {item.quantity}
                  </p>
                </div>
                <input
                  type="checkbox"
                  disabled={!accepted || sent}
                  checked={packed}
                  onChange={(event) =>
                    setChecked({ ...checked, [item.id]: event.target.checked })
                  }
                  className="size-9 accent-[#BD0F32] disabled:opacity-30"
                />
              </label>
            );
          })}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[14px] border border-black bg-white p-5 shadow-[3px_3px_0_#000]">
            <div className="flex items-center gap-2 text-sm font-black text-black">
              <HiMapPin className="size-5 text-[#BD0F32]" />
              Address
            </div>
            {accepted ? (
              <div className="mt-3 space-y-1 rounded-xl bg-[#f4f4f4] p-4 text-sm font-bold text-black">
                <p>{order.shippingName}</p>
                <p>{order.shippingLine1}</p>
                {order.shippingLine2 ? <p>{order.shippingLine2}</p> : null}
                <p>
                  {order.shippingCity}, {order.shippingRegion}{" "}
                  {order.shippingPostalCode}
                </p>
                <p>{order.shippingCountry}</p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-[#f4f4f4] p-4 text-sm font-bold text-black/55">
                Accept first to reveal and lock the shipping address.
              </p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm font-black text-black/70">
              <input
                type="checkbox"
                disabled={!accepted || sent}
                checked={addressChecked}
                onChange={(event) => setAddressChecked(event.target.checked)}
                className="size-5 accent-[#BD0F32]"
              />
              Address copied to label
            </label>
          </section>

          <section className="rounded-[14px] border border-black bg-white p-5 shadow-[3px_3px_0_#000]">
            <div className="flex items-center gap-2 text-sm font-black text-black">
              <HiTruck className="size-5 text-[#BD0F32]" />
              Ship
            </div>
            {status === "pending" ? (
              <div className="mt-4 space-y-3">
                <OrderStatusForm
                  action={formAction}
                  orderId={order.id}
                  status="being_fulfilled"
                  submitLabel="Accept and lock address"
                  pendingLabel="Accepting..."
                  pending={pending}
                  icon={HiClipboardDocumentCheck}
                />
                <LinkButton
                  href={`/platform/admin/fulfillment?skip=${order.id}`}
                >
                  <HiArrowRight className="size-4" />
                  Skip this kit
                </LinkButton>
              </div>
            ) : sent ? (
              <div className="mt-4 rounded-xl border border-green-900/20 bg-green-50 p-4 text-sm font-black text-green-950">
                <HiCheckCircle className="mb-2 size-7" />
                This order is marked sent.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <LinkButton
                  href={`/platform/admin/fulfillment?skip=${order.id}`}
                >
                  <HiArrowRight className="size-4" />
                  Skip this kit
                </LinkButton>
                {!isKitOrder || !order.acceptedAt ? (
                  <OrderStatusForm
                    action={formAction}
                    orderId={order.id}
                    status="pending"
                    submitLabel="Undo accept"
                    pendingLabel="Saving..."
                    pending={pending}
                    tone="secondary"
                    icon={HiArrowPath}
                  />
                ) : null}
                <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-[#f4f4f4] p-3 text-sm font-black text-black/70">
                  <input
                    type="checkbox"
                    checked={labelChecked}
                    onChange={(event) => setLabelChecked(event.target.checked)}
                    className="size-5 accent-[#BD0F32]"
                  />
                  Label printed and attached
                </label>
                <OrderStatusForm
                  action={formAction}
                  orderId={order.id}
                  status="sent"
                  submitLabel="Mark sent and load next"
                  pendingLabel="Saving..."
                  pending={pending}
                  disabled={!canShip}
                  tracking
                  icon={HiPaperAirplane}
                />
                {!canShip ? (
                  <p className="flex gap-2 rounded-xl bg-yellow-50 p-3 text-xs font-bold text-yellow-950">
                    <HiExclamationTriangle className="size-4 shrink-0" />
                    Pack every item, copy the address, and attach the label
                    before marking sent.
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
          </section>
        </aside>
      </div>
    </div>
  );
}

function ProgressRow({
  active,
  done,
  label,
  icon: Icon,
}: {
  active: boolean;
  done: boolean;
  label: string;
  icon: typeof HiCube;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-black ${
        done
          ? "bg-green-100 text-green-950"
          : active
            ? "bg-[#BD0F32] text-white"
            : "bg-zinc-100 text-black/45"
      }`}
    >
      <Icon className="size-5" />
      {label}
    </div>
  );
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded border border-black px-3 py-2 text-sm font-black text-black no-underline transition hover:bg-black hover:text-white"
    >
      {children}
    </Link>
  );
}

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
  compact = false,
  icon: Icon,
}: {
  action: (formData: FormData) => void;
  orderId: number;
  status: OrderStatus;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  tracking?: boolean;
  tone?: "primary" | "secondary" | "danger";
  compact?: boolean;
  icon?: typeof HiCube;
}) {
  const buttonClass =
    tone === "primary"
      ? "border-black bg-black text-white hover:bg-[#BD0F32]"
      : tone === "danger"
        ? "border-red-950 bg-red-50 text-red-800 hover:bg-red-800 hover:text-white"
        : "border-black bg-white text-black hover:bg-black hover:text-white";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />
      {tracking ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-black/40">
              Tracking link (optional)
            </span>
            <input
              type="url"
              name="trackingInfo"
              placeholder="https://..."
              className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-black/40">
              Delivery note (optional)
            </span>
            <textarea
              name="adminNotes"
              rows={2}
              placeholder="Gate code, leave at door, etc."
              className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm"
            />
          </label>
        </>
      ) : null}
      <button
        type="submit"
        disabled={pending || disabled}
        className={`inline-flex w-full items-center justify-center gap-2 rounded border px-4 font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "py-2 text-sm" : "py-3 text-sm"
        } ${buttonClass}`}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
