"use client";

import { gsap } from "gsap";
import Image from "next/image";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import {
  HiCheckCircle,
  HiChevronRight,
  HiMinus,
  HiPlus,
  HiShoppingBag,
  HiTrash,
  HiXMark,
} from "react-icons/hi2";
import { placeOrder } from "@/actions/shop";

type CartItem = {
  productId: number;
  name: string;
  imageUrl: string;
  price: number;
  stock: number | null;
  quantity: number;
};

type Address = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

const cartKey = "bb-cart";
const emptyAddress: Address = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      productId: Number(item?.productId),
      name: String(item?.name ?? "Product"),
      imageUrl: String(item?.imageUrl ?? ""),
      price: Number(item?.price),
      stock:
        item?.stock === null || item?.stock === undefined
          ? null
          : Number(item.stock),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
    }))
    .filter(
      (item) =>
        item.productId > 0 &&
        Number.isFinite(item.price) &&
        (item.stock === null || Number.isFinite(item.stock)),
    );
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeCart(JSON.parse(localStorage.getItem(cartKey) ?? "[]"));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(cartKey, JSON.stringify(items));
  window.dispatchEvent(new Event("cart-updated"));
}

function flyImageToCart(imageUrl: string, source: HTMLElement) {
  const cart = document.getElementById("shop-cart-button");
  if (!cart) return;

  const sourceRect = source.getBoundingClientRect();
  const cartRect = cart.getBoundingClientRect();
  const startSize = Math.min(132, Math.max(sourceRect.width * 0.56, 82));
  const startX = sourceRect.left + sourceRect.width / 2 - startSize / 2;
  const startY = sourceRect.top + sourceRect.height / 2 - startSize / 2;
  const endSize = 38;
  const endX = cartRect.left + cartRect.width / 2 - endSize / 2;
  const endY = cartRect.top + cartRect.height / 2 - endSize / 2;
  const lift = Math.max(55, Math.min(110, Math.abs(endY - startY) * 0.22));

  const flyer = document.createElement("div");
  flyer.className =
    "pointer-events-none fixed left-0 top-0 z-[70] overflow-hidden rounded-[18px] border border-black bg-white p-3 shadow-[8px_8px_0_#BD0F32]";
  flyer.style.width = `${startSize}px`;
  flyer.style.height = `${startSize}px`;
  flyer.style.transformOrigin = "50% 50%";

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = "";
  img.decoding = "async";
  img.className = "h-full w-full object-contain";
  flyer.appendChild(img);
  document.body.appendChild(flyer);

  gsap.set(flyer, {
    x: startX,
    y: startY,
    scale: 0.86,
    autoAlpha: 0,
    rotation: 0,
  });

  const timeline = gsap.timeline({
    defaults: { ease: "power3.inOut" },
    onComplete: () => flyer.remove(),
  });

  timeline
    .to(flyer, {
      autoAlpha: 1,
      scale: 1,
      y: startY - 14,
      duration: 0.16,
      ease: "power2.out",
    })
    .to(flyer, {
      x: startX + (endX - startX) * 0.5,
      y: Math.min(startY, endY) - lift,
      rotation: -2,
      duration: 0.34,
      ease: "power2.inOut",
    })
    .to(flyer, {
      x: endX,
      y: endY,
      width: endSize,
      height: endSize,
      scale: 1,
      rotation: 0,
      autoAlpha: 0,
      duration: 0.28,
      ease: "power3.in",
    });

  gsap.fromTo(
    cart,
    { scale: 1 },
    {
      scale: 1.1,
      duration: 0.14,
      yoyo: true,
      repeat: 1,
      delay: 0.68,
      ease: "power2.out",
      overwrite: "auto",
    },
  );
}

export function ShopCart() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<{
    orderId: number;
    totalCost: number;
    merged: boolean;
  } | null>(null);
  const [address, setAddress] = useState<Address>(emptyAddress);

  useEffect(() => {
    const syncCart = () => setItems(loadCart());
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => {
      window.removeEventListener("cart-updated", syncCart);
    };
  }, []);

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  const setQuantity = (productId: number, quantity: number) => {
    const next = items
      .map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: Math.min(
                item.stock ?? Number.POSITIVE_INFINITY,
                Math.max(1, quantity),
              ),
            }
          : item,
      )
      .filter((item) => item.quantity > 0);
    setItems(next);
    saveCart(next);
  };

  const removeItem = (productId: number) => {
    const next = items.filter((item) => item.productId !== productId);
    setItems(next);
    saveCart(next);
  };

  const order = async () => {
    if (!address.name || !address.line1 || !address.city || !address.country) {
      setMessage("Name, address, city, and country are required.");
      return;
    }
    if (items.length === 0) {
      setMessage("Cart is empty.");
      return;
    }

    setPlacing(true);
    setMessage(null);
    try {
      const result = await placeOrder(
        items.map(({ productId, quantity }) => ({ productId, quantity })),
        address,
      );
      setItems([]);
      saveCart([]);
      setCheckout(false);
      setAddress(emptyAddress);
      setPlacedOrder(result);
      setMessage(
        `Order #${result.orderId} placed for ${result.totalCost} bread.${
          result.merged ? " Added to your existing pending order." : ""
        }`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to place order.",
      );
    } finally {
      setPlacing(false);
    }
  };

  return (
    <>
      <button
        id="shop-cart-button"
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-full border border-black bg-white px-4 py-2.5 font-semibold text-black shadow-sm transition hover:bg-black hover:text-white"
      >
        <span className="relative grid size-8 place-items-center rounded-full bg-black text-white">
          <HiShoppingBag className="size-5" />
          {count > 0 ? (
            <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border border-black bg-[#BD0F32] text-[10px] font-black text-white">
              {count}
            </span>
          ) : null}
        </span>
        {total > 0 ? (
          <span className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">
            {total} bread
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              setOpen(false);
              setCheckout(false);
            }}
          />
          <div className="absolute top-0 right-0 flex h-full w-full max-w-xl flex-col border-l border-black bg-white shadow-xl">
            <div className="border-b border-black bg-white p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="mt-1 text-3xl font-black text-black">
                    {placedOrder
                      ? "Order placed"
                      : checkout
                        ? "Checkout"
                        : "Your cart"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setCheckout(false);
                  }}
                  className="grid size-10 place-items-center rounded-full border border-black bg-white text-black transition hover:bg-black hover:text-white"
                >
                  <HiXMark className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {placedOrder ? (
                <div className="rounded-[14px] border border-black bg-white p-6 text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-full bg-green-50">
                    <HiCheckCircle className="size-10 text-green-700" />
                  </div>
                  <h3 className="mt-2 text-3xl font-black text-black">
                    Order placed
                  </h3>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-black/60">
                    Order #{placedOrder.orderId} is in. We’ll review it and
                    start fulfillment soon. You can track it from your Orders
                    tab.
                  </p>
                  <div className="mt-6 rounded-[12px] bg-[#f4f4f4] p-4">
                    <p className="text-sm font-bold text-black/55">Total</p>
                    <p className="text-3xl font-black text-black">
                      {placedOrder.totalCost} bread
                    </p>
                    {placedOrder.merged ? (
                      <p className="mt-2 text-sm font-semibold text-black/60">
                        Added to your existing pending order.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPlacedOrder(null);
                      setMessage(null);
                      setOpen(false);
                    }}
                    className="mt-6 w-full rounded border border-black bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#BD0F32]"
                  >
                    Done
                  </button>
                </div>
              ) : !checkout ? (
                items.length === 0 ? (
                  <div className="rounded-[16px] border-[1.5px] border-dashed border-black bg-white p-8 text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#fffaf1]">
                      <HiShoppingBag className="size-9 text-[#BD0F32]" />
                    </div>
                    <p className="text-2xl font-black text-black">
                      Your cart is empty
                    </p>
                    <p className="mt-2 text-sm text-black/60">
                      Add parts, tools, or grants from the shop to start an
                      order.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item) => (
                      <div
                        key={item.productId}
                        className="rounded-[14px] border border-black bg-white p-4"
                      >
                        <div className="grid grid-cols-[72px_1fr_auto] gap-4">
                          <div className="relative h-[72px] w-[72px] overflow-hidden rounded-[10px] border border-black bg-[#f4f4f4]">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={item.name}
                                fill
                                sizes="72px"
                                className="object-contain p-2"
                              />
                            ) : null}
                          </div>
                          <div>
                            <p className="font-black text-black">{item.name}</p>
                            <p className="mt-1 text-sm text-black/60">
                              {item.price} bread each
                            </p>
                            {item.stock !== null ? (
                              <p className="mt-1 text-xs font-bold text-[#BD0F32]">
                                Only {item.stock} left
                              </p>
                            ) : null}
                          </div>
                          <p className="text-lg font-semibold text-black">
                            {item.price * item.quantity} bread
                          </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/10 pt-4">
                          <div className="flex items-center overflow-hidden rounded-full border border-black bg-[#f4f4f4]">
                            <button
                              type="button"
                              onClick={() =>
                                item.quantity === 1
                                  ? removeItem(item.productId)
                                  : setQuantity(
                                      item.productId,
                                      item.quantity - 1,
                                    )
                              }
                              className="px-4 py-2 font-black transition hover:bg-black hover:text-white"
                            >
                              <HiMinus className="size-4" />
                            </button>
                            <span className="min-w-10 border-x border-black bg-white px-4 py-2 text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQuantity(item.productId, item.quantity + 1)
                              }
                              disabled={
                                item.stock !== null &&
                                item.quantity >= item.stock
                              }
                              className="px-4 py-2 font-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <HiPlus className="size-4" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId)}
                            aria-label={`Remove ${item.name}`}
                            className="text-red-700 transition hover:scale-110 hover:text-red-900"
                          >
                            <HiTrash className="size-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-5">
                  <div className="rounded-[18px] border-[1.5px] border-black bg-white p-5 shadow-[4px_4px_0_#000]">
                    <p className="text-sm font-semibold text-black/50">
                      Review items
                    </p>
                    <div className="mt-4 space-y-3">
                      {items.map((item) => (
                        <div
                          key={item.productId}
                          className="grid grid-cols-[56px_1fr_auto] gap-3"
                        >
                          <div className="relative h-14 w-14 rounded-[8px] border border-black bg-[#f4f4f4]">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={item.name}
                                fill
                                sizes="56px"
                                className="object-contain p-1.5"
                              />
                            ) : null}
                          </div>
                          <div>
                            <p className="text-sm font-black text-black">
                              {item.name}
                            </p>
                            <p className="text-xs text-black/55">
                              Qty {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-black text-black">
                            {item.price * item.quantity} bread
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[18px] border-[1.5px] border-black bg-white p-5 shadow-[4px_4px_0_#000]">
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-black/50">
                      Shipping address
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["name", "Full name", "sm:col-span-2"],
                          ["line1", "Address line 1", "sm:col-span-2"],
                          ["line2", "Address line 2", "sm:col-span-2"],
                          ["city", "City", ""],
                          ["region", "Region/state", ""],
                          ["postalCode", "Postal code", ""],
                          ["country", "Country", ""],
                        ] as const
                      ).map(([key, label, className]) => (
                        <label
                          key={key}
                          className={`flex flex-col gap-1 ${className}`}
                        >
                          <span className="text-xs font-bold text-black/60">
                            {label}
                          </span>
                          <input
                            type="text"
                            value={address[key]}
                            onChange={(event) =>
                              setAddress({
                                ...address,
                                [key]: event.target.value,
                              })
                            }
                            className="rounded-[10px] border border-black bg-[#f4f4f4] px-3 py-2 text-sm outline-none transition focus:bg-white focus:ring-4 focus:ring-[#BD0F32]/20"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {message && !placedOrder ? (
                <p
                  className={`mt-5 rounded-[12px] border px-4 py-3 text-sm font-semibold ${
                    message.startsWith("Order #")
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-red-300 bg-red-50 text-red-800"
                  }`}
                >
                  {message}
                </p>
              ) : null}
            </div>

            <div className="border-t-[1.5px] border-black bg-white p-6">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-black/60">Order total</span>
                <span className="text-3xl font-black text-black">
                  {total} bread
                </span>
              </div>
              {placedOrder ? null : checkout ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckout(false)}
                    className="rounded-full border border-black px-4 py-3 text-sm font-bold transition hover:bg-black hover:text-white"
                  >
                    Back to cart
                  </button>
                  <button
                    type="button"
                    onClick={order}
                    disabled={placing || items.length === 0}
                    className="rounded-full border border-black bg-[#BD0F32] px-4 py-3 text-sm font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {placing ? "Placing..." : "Place order"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCheckout(true)}
                  disabled={items.length === 0}
                  className="w-full rounded-full border border-black bg-[#BD0F32] px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_#000] transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    Checkout
                    <HiChevronRight className="size-5" />
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AddToCartButton({
  productId,
  name,
  imageUrl,
  price,
  stock,
}: {
  productId: number;
  name: string;
  imageUrl: string;
  price: number;
  stock: number | null;
}) {
  const [added, setAdded] = useState(false);

  const add = (event: MouseEvent<HTMLButtonElement>) => {
    const stored = loadCart();
    const existing = stored.find((item) => item.productId === productId);
    if (stock !== null && existing && existing.quantity >= stock) return;

    const card = event.currentTarget.closest("[data-product-card]");
    const image = card?.querySelector("[data-product-image]");
    flyImageToCart(
      imageUrl,
      image instanceof HTMLElement ? image : event.currentTarget,
    );

    const next = existing
      ? stored.map((item) =>
          item.productId === productId
            ? {
                ...item,
                stock,
                quantity: Math.min(
                  stock ?? Number.POSITIVE_INFINITY,
                  item.quantity + 1,
                ),
              }
            : item,
        )
      : [
          ...stored,
          {
            productId,
            name,
            imageUrl,
            price: Number(price),
            stock,
            quantity: 1,
          },
        ];

    saveCart(next);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={add}
      disabled={stock !== null && stock <= 0}
      className="w-full rounded-full border border-black bg-[#BD0F32] px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#f4f4f4] disabled:text-black/40"
    >
      {stock !== null && stock <= 0
        ? "Out of stock"
        : added
          ? "Added"
          : "Add to cart"}
    </button>
  );
}
