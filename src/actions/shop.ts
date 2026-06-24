"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminSession, requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db/db";
import {
  cartItems,
  carts,
  orderItems,
  orders,
  products,
  projects,
  userBread,
} from "@/lib/db/schema";
import type {
  CheckoutItem,
  OrderStatusFormState,
  ShippingAddress,
} from "@/types";
import { shopOpen } from "@/flags";

const SHIPPING_FIELD_LIMIT = 120;
const PRODUCT_TEXT_LIMIT = 500;

const ORDER_STATUSES = [
  "pending",
  "being_fulfilled",
  "sent",
  "cancelled",
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];

type ProductInput = {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  stock?: number | null;
  active?: boolean;
};

function requirePositiveInt(value: unknown, label: string) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return number;
}

function normalizeNonNegativeInt(value: unknown, label: string) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater`);
  }
  return number;
}

function requiredText(value: string | undefined, label: string) {
  const text = value?.trim() ?? "";
  if (!text) throw new Error(`${label} is required`);
  if (text.length > SHIPPING_FIELD_LIMIT) {
    throw new Error(
      `${label} must be ${SHIPPING_FIELD_LIMIT} characters or less`,
    );
  }
  return text;
}

function limitedText(
  value: unknown,
  label: string,
  limit = PRODUCT_TEXT_LIMIT,
) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > limit) throw new Error(`${label} is too long`);
  return text;
}

function normalizeProductInput(data: ProductInput) {
  const imageUrl = limitedText(data.imageUrl, "Image URL");
  try {
    new URL(imageUrl);
  } catch {
    throw new Error("Image URL must be valid");
  }

  return {
    name: limitedText(data.name, "Name", 120),
    description: limitedText(data.description, "Description", 1000),
    imageUrl,
    price: requirePositiveInt(data.price, "Price"),
    stock:
      data.stock === null || data.stock === undefined
        ? null
        : normalizeNonNegativeInt(data.stock, "Stock"),
    ...(data.active !== undefined ? { active: Boolean(data.active) } : {}),
  };
}

function normalizeOrderStatus(status: unknown): OrderStatus {
  if (ORDER_STATUSES.includes(status as OrderStatus))
    return status as OrderStatus;
  throw new Error("Invalid order status");
}

function normalizeTrackingInfo(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return "";
  if (text.length > 2048) throw new Error("Tracking URL is too long");
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return text;
  } catch {
    // Fall through to the generic validation error.
  }
  throw new Error("Tracking URL must start with http:// or https://");
}

function normalizeAddress(address: ShippingAddress): ShippingAddress {
  return {
    name: requiredText(address.name, "Name"),
    line1: requiredText(address.line1, "Address line 1"),
    line2: address.line2?.trim().slice(0, SHIPPING_FIELD_LIMIT) ?? "",
    city: requiredText(address.city, "City"),
    region: requiredText(address.region, "Region"),
    postalCode: requiredText(address.postalCode, "Postal code"),
    country: requiredText(address.country, "Country"),
  };
}

async function getOrCreateCart(userId: string) {
  const existing = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  const [cart] = await db.insert(carts).values({ userId }).returning();
  return cart;
}

export async function addToCart(productId: number) {
  const session = await requireSession();
  const cart = await getOrCreateCart(session.user.id);
  const id = requirePositiveInt(productId, "Product ID");

  const product = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.active, true)))
    .limit(1);
  if (!product[0]) throw new Error("Product not found");

  const existingItem = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, id)))
    .limit(1);

  if (existingItem[0]) {
    await db
      .update(cartItems)
      .set({ quantity: existingItem[0].quantity + 1 })
      .where(eq(cartItems.id, existingItem[0].id));
  } else {
    await db
      .insert(cartItems)
      .values({ cartId: cart.id, productId: id, quantity: 1 });
  }

  revalidatePath("/platform/shop");
}

export async function removeFromCart(cartItemId: number) {
  const session = await requireSession();
  const cart = await getOrCreateCart(session.user.id);
  const id = requirePositiveInt(cartItemId, "Cart item ID");
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, id), eq(cartItems.cartId, cart.id)));
  revalidatePath("/platform/shop");
}

export async function placeOrder(
  checkoutItems: CheckoutItem[],
  address: ShippingAddress,
) {
  const session = await requireSession();
  if (!(await shopOpen())) {
    throw new Error("The shop is closed right now. Project kits still work.");
  }
  const shippingAddress = normalizeAddress(address);

  const normalizedItems = checkoutItems
    .map((item) => ({
      productId: Number(item.productId),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 0)),
    }))
    .filter((item) => item.productId > 0 && item.quantity > 0);

  if (normalizedItems.length === 0) throw new Error("Cart is empty");

  const productRows = await db
    .select({
      productId: products.id,
      productName: products.name,
      unitPrice: products.price,
      stock: products.stock,
    })
    .from(products)
    .where(eq(products.active, true));

  const quantityByProduct = new Map<number, number>();
  for (const item of normalizedItems) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const items = productRows
    .filter((product) => quantityByProduct.has(product.productId))
    .map((product) => ({
      ...product,
      quantity: quantityByProduct.get(product.productId) ?? 0,
    }));

  if (items.length !== quantityByProduct.size) {
    throw new Error("One or more items are unavailable");
  }

  const unavailableItem = items.find(
    (item) => item.stock !== null && item.quantity > item.stock,
  );
  if (unavailableItem) {
    throw new Error(
      `${unavailableItem.productName} only has ${unavailableItem.stock} left.`,
    );
  }

  const totalCost = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  const result = await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.stock === null) continue;
      const [updatedProduct] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.active, true),
            sql`${products.stock} IS NOT NULL`,
            sql`${products.stock} >= ${item.quantity}`,
          ),
        )
        .returning({ id: products.id });
      if (!updatedProduct)
        throw new Error(`${item.productName} is no longer in stock.`);
    }

    const [updatedBalance] = await tx
      .update(userBread)
      .set({
        balance: sql`${userBread.balance} - ${totalCost}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userBread.userId, session.user.id),
          sql`${userBread.balance} >= ${totalCost}`,
        ),
      )
      .returning({ balance: userBread.balance });

    if (!updatedBalance) {
      throw new Error(`Insufficient balance. You need ${totalCost} bread.`);
    }

    const existingOrder = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.userId, session.user.id), eq(orders.status, "pending")),
      )
      .orderBy(sql`${orders.createdAt} DESC`)
      .limit(1);

    const pendingOrder = existingOrder[0];

    if (!pendingOrder) {
      const [createdOrder] = await tx
        .insert(orders)
        .values({
          userId: session.user.id,
          totalCost,
          shippingName: shippingAddress.name,
          shippingLine1: shippingAddress.line1,
          shippingLine2: shippingAddress.line2,
          shippingCity: shippingAddress.city,
          shippingRegion: shippingAddress.region,
          shippingPostalCode: shippingAddress.postalCode,
          shippingCountry: shippingAddress.country,
        })
        .returning();

      for (const item of items) {
        await tx.insert(orderItems).values({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      }

      return { orderId: createdOrder.id, totalCost, merged: false };
    }

    await tx
      .update(orders)
      .set({
        totalCost: sql`${orders.totalCost} + ${totalCost}`,
        shippingName: shippingAddress.name,
        shippingLine1: shippingAddress.line1,
        shippingLine2: shippingAddress.line2,
        shippingCity: shippingAddress.city,
        shippingRegion: shippingAddress.region,
        shippingPostalCode: shippingAddress.postalCode,
        shippingCountry: shippingAddress.country,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, pendingOrder.id));

    for (const item of items) {
      const existingOrderItem = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, pendingOrder.id),
            eq(orderItems.productId, item.productId),
          ),
        )
        .limit(1);

      if (existingOrderItem[0]) {
        await tx
          .update(orderItems)
          .set({ quantity: sql`${orderItems.quantity} + ${item.quantity}` })
          .where(eq(orderItems.id, existingOrderItem[0].id));
      } else {
        await tx.insert(orderItems).values({
          orderId: pendingOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });
      }
    }
    return { orderId: pendingOrder.id, totalCost, merged: true };
  });

  revalidatePath("/platform/shop/orders");
  revalidatePath("/platform/shop");
  return result;
}

export async function updateOrderStatus(
  orderId: number,
  status: "pending" | "being_fulfilled" | "sent" | "cancelled",
  trackingInfo?: string,
  adminNotes?: string,
) {
  await requireAdminSession();
  const id = requirePositiveInt(orderId, "Order ID");
  const nextStatus = normalizeOrderStatus(status);

  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  const order = existing[0];
  if (!order) throw new Error("Order not found");
  if (
    order.source === "project_kit" &&
    order.acceptedAt &&
    nextStatus === "pending"
  ) {
    throw new Error("Accepted kit orders are final");
  }

  await db.transaction(async (tx) => {
    let latestAddress = {};
    if (
      order.source === "project_kit" &&
      order.projectId &&
      nextStatus === "being_fulfilled"
    ) {
      const projectRows = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, order.projectId))
        .limit(1);
      const project = projectRows[0];
      if (project) {
        latestAddress = {
          shippingName: `${project.firstName} ${project.lastName}`.trim(),
          shippingLine1: project.addressLine1,
          shippingLine2: project.addressLine2,
          shippingCity: project.city,
          shippingRegion: project.region,
          shippingPostalCode: project.postalCode,
          shippingCountry: project.country,
        };
      }
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        ...latestAddress,
        status: nextStatus,
        ...(nextStatus === "being_fulfilled" && !order.acceptedAt
          ? { acceptedAt: new Date() }
          : {}),
        ...(trackingInfo !== undefined
          ? { trackingInfo: normalizeTrackingInfo(trackingInfo) }
          : {}),
        ...(adminNotes !== undefined ? { adminNotes: adminNotes.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning({ id: orders.id });
    if (!updatedOrder) throw new Error("Order not found");

    if (order.source === "project_kit" && order.projectId) {
      if (nextStatus === "being_fulfilled") {
        await tx
          .update(projects)
          .set({ status: "kit_fulfillment", updatedAt: new Date() })
          .where(eq(projects.id, order.projectId));
      }
      if (nextStatus === "sent") {
        await tx
          .update(projects)
          .set({
            status: "kit_sent",
            shippedAt: new Date(),
            kitSentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, order.projectId));
      }
    }
  });

  revalidatePath("/platform/admin/orders");
  revalidatePath("/platform/admin/fulfillment");
  revalidatePath("/platform/shop/orders");
}

export async function updateOrderStatusFromForm(
  _previousState: OrderStatusFormState,
  formData: FormData,
): Promise<OrderStatusFormState> {
  try {
    const orderId = Number(formData.get("orderId"));
    const status = normalizeOrderStatus(formData.get("status"));
    const trackingInfo = formData.get("trackingInfo");
    const adminNotes = formData.get("adminNotes");

    await updateOrderStatus(
      orderId,
      status,
      typeof trackingInfo === "string" ? trackingInfo : undefined,
      typeof adminNotes === "string" ? adminNotes : undefined,
    );

    return { success: true, status };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to update order.",
    };
  }
}

export async function cancelOrder(orderId: number) {
  const session = await requireSession();
  const id = requirePositiveInt(orderId, "Order ID");

  const existingOrder = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.userId, session.user.id)))
    .limit(1);

  const order = existingOrder[0];
  if (!order) throw new Error("Order not found");
  if (order.source === "project_kit") {
    throw new Error("Project kit orders cannot be cancelled.");
  }
  if (order.status !== "pending")
    throw new Error("Only pending orders can be cancelled");

  await db.transaction(async (tx) => {
    const [cancelledOrder] = await tx
      .update(orders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(orders.id, id),
          eq(orders.userId, session.user.id),
          eq(orders.status, "pending"),
        ),
      )
      .returning({ id: orders.id, totalCost: orders.totalCost });
    if (!cancelledOrder)
      throw new Error("Only pending orders can be cancelled");

    const items = await tx
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    for (const item of items) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            sql`${products.stock} IS NOT NULL`,
          ),
        );
    }

    await tx
      .insert(userBread)
      .values({
        userId: session.user.id,
        balance: cancelledOrder.totalCost,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userBread.userId,
        set: {
          balance: sql`${userBread.balance} + ${cancelledOrder.totalCost}`,
          updatedAt: new Date(),
        },
      });
  });

  revalidatePath("/platform/shop/orders");
  revalidatePath("/platform/admin/orders");
}

export async function seedProducts() {
  await requireAdminSession();
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed products is disabled in production");
  }

  const existing = await db.select().from(products).limit(1);
  if (existing.length > 0) return;

  const shopItems = [
    {
      name: "Perfboard",
      description: "Prototype your circuits on a solderable perfboard.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-1e6d-76fa-a1e7-4dfc97646ede/image.png",
      price: 3,
    },
    {
      name: "Soldering Iron",
      description: "A reliable soldering iron for joining components.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-2275-77e8-8ac7-6b4cbab4cc7c/s-l1200.jpg",
      price: 5,
    },
    {
      name: "Multimeter",
      description: "Measure voltage, current, and resistance with confidence.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-2486-7422-8cc5-ac68e256bf65/image.png",
      price: 4,
    },
    {
      name: "$10 PCB Grant",
      description:
        "Get $10 toward a custom PCB order. Stack with other Hack Club grants.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-269f-7f0a-8274-ab4e8638f64f/pcb_10.webp",
      price: 8,
    },
    {
      name: "Stickers",
      description: "A pile of Hack Club stickers shipped to your door.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-28f0-71a2-8ba8-366a94dacb4e/pile_of_stickers.webp",
      price: 1,
    },
    {
      name: "Raspberry Pi Pico",
      description:
        "The RP2040-powered microcontroller. Perfect for Breadboard projects.",
      imageUrl:
        "https://cdn.hackclub.com/019d17df-ab61-7115-8c67-618edce19967/image.png",
      price: 6,
    },
  ];

  await Promise.all(shopItems.map((item) => db.insert(products).values(item)));
}

export async function addProduct(data: {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  stock?: number | null;
}) {
  await requireAdminSession();
  await db.insert(products).values(normalizeProductInput(data));
  revalidatePath("/platform/shop");
  revalidatePath("/platform/admin/products");
}

export async function updateProduct(
  productId: number,
  data: {
    name: string;
    description: string;
    imageUrl: string;
    price: number;
    stock: number | null;
    active: boolean;
  },
) {
  await requireAdminSession();
  const id = requirePositiveInt(productId, "Product ID");
  const [updatedProduct] = await db
    .update(products)
    .set(normalizeProductInput(data))
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (!updatedProduct) throw new Error("Product not found");
  revalidatePath("/platform/shop");
  revalidatePath("/platform/admin/products");
}

export async function deleteProduct(productId: number) {
  await requireAdminSession();
  const id = requirePositiveInt(productId, "Product ID");
  const existingOrderItems = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);

  if (existingOrderItems[0]) {
    const [updatedProduct] = await db
      .update(products)
      .set({ active: false })
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (!updatedProduct) throw new Error("Product not found");
  } else {
    const [deletedProduct] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (!deletedProduct) throw new Error("Product not found");
  }
  revalidatePath("/platform/shop");
  revalidatePath("/platform/admin/products");
}

export async function toggleProduct(productId: number, active: boolean) {
  await requireAdminSession();
  const id = requirePositiveInt(productId, "Product ID");
  const [updatedProduct] = await db
    .update(products)
    .set({ active: Boolean(active) })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (!updatedProduct) throw new Error("Product not found");
  revalidatePath("/platform/shop");
  revalidatePath("/platform/admin/products");
}
