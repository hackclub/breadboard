import { relations } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  admin: boolean("admin").notNull().default(false),
  image: text("image"),
  slackId: text("slack_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const emailSignups = pgTable("email_signups", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    birthday: text("birthday").notNull().default(""),
    phone: text("phone").notNull().default(""),
    country: text("country").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_profiles_user_id_idx").on(table.userId)],
);

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("default"),
    name: text("name").notNull().default(""),
    line1: text("line1").notNull().default(""),
    line2: text("line2").notNull().default(""),
    city: text("city").notNull().default(""),
    region: text("region").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    country: text("country").notNull().default(""),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_addresses_user_id_idx").on(table.userId)],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("product_categories_active_idx").on(table.active)],
);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => productCategories.id, {
    onDelete: "set null",
  }),
  sku: text("sku").notNull().default(""),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull(),
  price: integer("price").notNull().default(1),
  stock: integer("stock"),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("product_images_product_id_idx").on(table.productId)],
);

export const kits = pgTable(
  "kits",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("kits_active_idx").on(table.active)],
);

export const kitItems = pgTable(
  "kit_items",
  {
    id: serial("id").primaryKey(),
    kitId: integer("kit_id")
      .notNull()
      .references(() => kits.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kit_items_kit_id_idx").on(table.kitId),
    check("kit_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const userBread = pgTable("user_bread", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const currencyTransactionTypeEnum = pgEnum("currency_transaction_type", [
  "project_payout",
  "shop_purchase",
  "order_refund",
  "admin_adjustment",
]);

export const currencyTransactions = pgTable(
  "currency_transactions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: currencyTransactionTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after"),
    sourceEntityType: text("source_entity_type").notNull().default(""),
    sourceEntityId: text("source_entity_id").notNull().default(""),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("currency_transactions_user_id_idx").on(table.userId),
    index("currency_transactions_source_idx").on(
      table.sourceEntityType,
      table.sourceEntityId,
    ),
  ],
);

export const carts = pgTable("carts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_idx").on(
      table.cartId,
      table.productId,
    ),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "being_fulfilled",
  "sent",
  "cancelled",
]);

export const orderSourceEnum = pgEnum("order_source", ["shop", "project_kit"]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending",
  "label_created",
  "in_transit",
  "delivered",
  "failed",
  "returned",
  "cancelled",
]);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("pending"),
    totalCost: integer("total_cost").notNull().default(0),
    shippingName: text("shipping_name").notNull().default(""),
    shippingLine1: text("shipping_line1").notNull().default(""),
    shippingLine2: text("shipping_line2").notNull().default(""),
    shippingCity: text("shipping_city").notNull().default(""),
    shippingRegion: text("shipping_region").notNull().default(""),
    shippingPostalCode: text("shipping_postal_code").notNull().default(""),
    shippingCountry: text("shipping_country").notNull().default(""),
    trackingInfo: text("tracking_info"),
    adminNotes: text("admin_notes"),
    source: orderSourceEnum("source").notNull().default("shop"),
    projectId: integer("project_id"),
    mergeGroupId: text("merge_group_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orders_user_id_idx").on(table.userId),
    index("orders_source_project_idx").on(table.source, table.projectId),
    check("orders_total_cost_non_negative", sql`${table.totalCost} >= 0`),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    projectId: integer("project_id"),
    status: shipmentStatusEnum("status").notNull().default("pending"),
    carrier: text("carrier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    trackingUrl: text("tracking_url").notNull().default(""),
    labelUrl: text("label_url").notNull().default(""),
    rawCarrierPayload: jsonb("raw_carrier_payload").$type<
      Record<string, unknown>
    >(),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shipments_order_id_idx").on(table.orderId),
    index("shipments_project_id_idx").on(table.projectId),
    index("shipments_status_idx").on(table.status),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: serial("id").primaryKey(),
    shipmentId: integer("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: shipmentStatusEnum("status").notNull(),
    message: text("message").notNull().default(""),
    location: text("location").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("shipment_events_shipment_id_idx").on(table.shipmentId),
    index("shipment_events_occurred_at_idx").on(table.occurredAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("order_items_order_product_idx").on(
      table.orderId,
      table.productId,
    ),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
  ],
);

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "materials_review",
  "kit_approved",
  "kit_fulfillment",
  "kit_sent",
  "building",
  "demo_review",
  "done",
  "shipped",
  "reviewed",
  "paid_out",
  "fulfilled",
  "needs_changes",
  "approved",
  "rejected",
]);

export const projectLifecycleStateEnum = pgEnum("project_lifecycle_state", [
  "draft",
  "materials_submitted",
  "materials_changes_requested",
  "kit_approved",
  "kit_fulfilling",
  "kit_sent",
  "package_received",
  "building",
  "demo_submitted",
  "demo_changes_requested",
  "done",
  "rejected",
  "archived",
]);

export const projectSubmissionTypeEnum = pgEnum("project_submission_type", [
  "materials",
  "demo",
]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "pending",
  "approved",
  "changes_requested",
  "rejected",
]);

export const projectMaterialTypeEnum = pgEnum("project_material_type", [
  "schematic",
  "code",
  "readme",
  "screenshot",
  "demo_video",
  "extra_requirement",
]);

export const projectRequirementPhaseEnum = pgEnum("project_requirement_phase", [
  "materials_submission",
  "demo_submission",
]);

export const projectEventTypeEnum = pgEnum("project_event_type", [
  "project_created",
  "materials_submitted",
  "materials_approved",
  "materials_changes_requested",
  "kit_order_created",
  "kit_order_accepted",
  "kit_sent",
  "package_received",
  "demo_submitted",
  "demo_approved",
  "demo_changes_requested",
  "project_done",
  "project_rejected",
  "currency_awarded",
  "admin_updated",
]);

export const projectSubmissionStatusEnum = pgEnum("project_submission_status", [
  "pending_review",
  "pending_demo_review",
  "approved",
  "needs_changes",
  "rejected",
  "fulfilled",
]);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: projectStatusEnum("status").notNull().default("draft"),
    lifecycleState: projectLifecycleStateEnum("lifecycle_state")
      .notNull()
      .default("draft"),
    title: text("title").notNull().default("Untitled project"),
    email: text("email").notNull().default(""),
    playableUrl: text("playable_url").notNull().default(""),
    demoVideoUrl: text("demo_video_url").notNull().default(""),
    codeUrl: text("code_url").notNull().default(""),
    screenshotUrl: text("screenshot_url").notNull().default(""),
    description: text("description").notNull().default(""),
    howToUse: text("how_to_use").notNull().default(""),
    addressLine1: text("address_line1").notNull().default(""),
    addressLine2: text("address_line2").notNull().default(""),
    city: text("city").notNull().default(""),
    region: text("region").notNull().default(""),
    country: text("country").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    birthday: text("birthday").notNull().default(""),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    kitType: text("kit_type").notNull().default("arduino"),
    kitId: integer("kit_id").references(() => kits.id, {
      onDelete: "set null",
    }),
    hoursSpent: integer("hours_spent").notNull().default(0),
    overrideHoursSpent: integer("override_hours_spent"),
    overrideHoursSpentJustification: text("override_hours_spent_justification")
      .notNull()
      .default(""),
    reviewNote: text("review_note").notNull().default(""),
    breadAmount: integer("bread_amount").notNull().default(0),
    editorData: text("editor_data").notNull().default(""),
    editorLastSavedAt: timestamp("editor_last_saved_at", {
      withTimezone: true,
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    kitApprovedAt: timestamp("kit_approved_at", { withTimezone: true }),
    kitOrderId: integer("kit_order_id"),
    shipmentId: integer("shipment_id"),
    kitSentAt: timestamp("kit_sent_at", { withTimezone: true }),
    packageReceivedAt: timestamp("package_received_at", { withTimezone: true }),
    demoSubmittedAt: timestamp("demo_submitted_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    submissionSource: text("submission_source").notNull().default("editor"),
    hackatimeUsername: text("hackatime_username").notNull().default(""),
    hackatimeProjectName: text("hackatime_project_name").notNull().default(""),
    hackatimeSeconds: integer("hackatime_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_lifecycle_state_idx").on(table.lifecycleState),
  ],
);

export const projectEvents = pgTable(
  "project_events",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: projectEventTypeEnum("type").notNull(),
    fromState: projectLifecycleStateEnum("from_state"),
    toState: projectLifecycleStateEnum("to_state"),
    sourceEntityType: text("source_entity_type").notNull().default(""),
    sourceEntityId: text("source_entity_id").notNull().default(""),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_events_project_id_idx").on(table.projectId),
    index("project_events_type_idx").on(table.type),
    index("project_events_created_at_idx").on(table.createdAt),
  ],
);

export const projectParticipantProfiles = pgTable(
  "project_participant_profiles",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull().default(""),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    birthday: text("birthday").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("project_profiles_project_user_idx").on(
      table.projectId,
      table.userId,
    ),
  ],
);

export const projectShippingAddresses = pgTable(
  "project_shipping_addresses",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    line1: text("line1").notNull().default(""),
    line2: text("line2").notNull().default(""),
    city: text("city").notNull().default(""),
    region: text("region").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    country: text("country").notNull().default(""),
    active: boolean("active").notNull().default(true),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_addresses_project_id_idx").on(table.projectId),
    index("project_addresses_active_idx").on(table.projectId, table.active),
  ],
);

export const projectMaterials = pgTable(
  "project_materials",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: projectMaterialTypeEnum("type").notNull(),
    url: text("url").notNull().default(""),
    textValue: text("text_value").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_materials_project_id_idx").on(table.projectId),
    index("project_materials_type_idx").on(table.projectId, table.type),
  ],
);

export const projectSubmissions = pgTable(
  "project_submissions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: projectSubmissionStatusEnum("status")
      .notNull()
      .default("pending_review"),
    type: projectSubmissionTypeEnum("type").notNull().default("materials"),
    submissionNumber: integer("submission_number").notNull(),
    email: text("email").notNull().default(""),
    playableUrl: text("playable_url").notNull().default(""),
    demoVideoUrl: text("demo_video_url").notNull().default(""),
    codeUrl: text("code_url").notNull().default(""),
    screenshotUrl: text("screenshot_url").notNull().default(""),
    addressLine1: text("address_line1").notNull().default(""),
    addressLine2: text("address_line2").notNull().default(""),
    city: text("city").notNull().default(""),
    region: text("region").notNull().default(""),
    country: text("country").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    birthday: text("birthday").notNull().default(""),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    hoursSpent: integer("hours_spent").notNull().default(0),
    editorVersionNumber: integer("editor_version_number"),
    approvedHours: integer("approved_hours"),
    internalNote: text("internal_note").notNull().default(""),
    userComment: text("user_comment").notNull().default(""),
    breadAmount: integer("bread_amount").notNull().default(0),
    submissionSource: text("submission_source").notNull().default("editor"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_submissions_project_id_idx").on(table.projectId),
    index("project_submissions_user_id_idx").on(table.userId),
    index("project_submissions_status_idx").on(table.status),
    uniqueIndex("project_submissions_project_number_idx").on(
      table.projectId,
      table.submissionNumber,
    ),
  ],
);

export const projectSubmissionMaterials = pgTable(
  "project_submission_materials",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => projectSubmissions.id, { onDelete: "cascade" }),
    materialId: integer("material_id").references(() => projectMaterials.id, {
      onDelete: "set null",
    }),
    type: projectMaterialTypeEnum("type").notNull(),
    url: text("url").notNull().default(""),
    textValue: text("text_value").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("submission_materials_submission_id_idx").on(table.submissionId),
    index("submission_materials_type_idx").on(table.submissionId, table.type),
  ],
);

export const projectReviews = pgTable(
  "project_reviews",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => projectSubmissions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decision: reviewDecisionEnum("decision").notNull().default("pending"),
    approvedSeconds: integer("approved_seconds"),
    breadAmount: integer("bread_amount").notNull().default(0),
    publicComment: text("public_comment").notNull().default(""),
    internalComment: text("internal_comment").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_reviews_project_id_idx").on(table.projectId),
    index("project_reviews_submission_id_idx").on(table.submissionId),
    index("project_reviews_decision_idx").on(table.decision),
    check("project_reviews_bread_non_negative", sql`${table.breadAmount} >= 0`),
  ],
);

export const projectReviewChecks = pgTable(
  "project_review_checks",
  {
    id: serial("id").primaryKey(),
    reviewId: integer("review_id")
      .notNull()
      .references(() => projectReviews.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    passed: boolean("passed").notNull().default(false),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("project_review_checks_review_key_idx").on(
      table.reviewId,
      table.key,
    ),
  ],
);

export const projectRequirementDefinitions = pgTable(
  "project_requirement_definitions",
  {
    id: serial("id").primaryKey(),
    phase: projectRequirementPhaseEnum("phase").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    materialType: projectMaterialTypeEnum("material_type").notNull(),
    required: boolean("required").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("requirement_definitions_phase_key_idx").on(
      table.phase,
      table.key,
    ),
  ],
);

export const projectJournals = pgTable(
  "project_journals",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    activeSecondsCovered: integer("active_seconds_covered")
      .notNull()
      .default(0),
    coversFrom: timestamp("covers_from", { withTimezone: true }),
    coversTo: timestamp("covers_to", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_journals_project_id_idx").on(table.projectId),
    index("project_journals_user_id_idx").on(table.userId),
    check(
      "project_journals_active_seconds_non_negative",
      sql`${table.activeSecondsCovered} >= 0`,
    ),
  ],
);

export const projectEditorVersions = pgTable(
  "project_editor_versions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    editorData: text("editor_data").notNull(),
    reason: text("reason").notNull().default("autosave"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_editor_versions_project_id_idx").on(table.projectId),
    uniqueIndex("project_editor_versions_project_version_idx").on(
      table.projectId,
      table.versionNumber,
    ),
  ],
);

export const editorActivitySessions = pgTable(
  "editor_activity_sessions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    activeSeconds: integer("active_seconds").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_sessions_project_id_idx").on(table.projectId),
    index("activity_sessions_user_id_idx").on(table.userId),
    check(
      "activity_sessions_seconds_non_negative",
      sql`${table.activeSeconds} >= 0`,
    ),
  ],
);

export const projectTimeEntries = pgTable(
  "project_time_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceSessionId: integer("source_session_id").references(
      () => editorActivitySessions.id,
      { onDelete: "set null" },
    ),
    journalId: integer("journal_id").references(() => projectJournals.id, {
      onDelete: "set null",
    }),
    activeSeconds: integer("active_seconds").notNull(),
    counted: boolean("counted").notNull().default(true),
    countedUntilState: projectLifecycleStateEnum("counted_until_state"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_time_entries_project_id_idx").on(table.projectId),
    index("project_time_entries_user_id_idx").on(table.userId),
    index("project_time_entries_journal_id_idx").on(table.journalId),
    check(
      "project_time_entries_seconds_positive",
      sql`${table.activeSeconds} > 0`,
    ),
  ],
);

export const editorTimelapseSnapshots = pgTable(
  "editor_timelapse_snapshots",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => editorActivitySessions.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stateData: text("state_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("timelapse_snapshots_session_id_idx").on(table.sessionId)],
);

export const editorScreenEvidenceFrames = pgTable(
  "editor_screen_evidence_frames",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => editorActivitySessions.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    imageKey: text("image_key").notNull().default(""),
    pixelChanged: boolean("pixel_changed").notNull(),
    diffScore: integer("diff_score").notNull().default(0),
    screenWidth: integer("screen_width").notNull().default(0),
    screenHeight: integer("screen_height").notNull().default(0),
    paused: boolean("paused").notNull().default(false),
  },
  (table) => [
    index("screen_evidence_project_idx").on(table.projectId),
    index("screen_evidence_session_idx").on(table.sessionId),
    check("screen_evidence_diff_non_negative", sql`${table.diffScore} >= 0`),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  profiles: many(userProfiles),
  addresses: many(userAddresses),
  currencyTransactions: many(currencyTransactions),
}));

export const userProfileRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
}));

export const userAddressRelations = relations(userAddresses, ({ one }) => ({
  user: one(user, { fields: [userAddresses.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const cartRelations = relations(carts, ({ one, many }) => ({
  user: one(user, { fields: [carts.userId], references: [user.id] }),
  items: many(cartItems),
}));

export const cartItemRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  items: many(orderItems),
  shipments: many(shipments),
}));

export const shipmentRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  events: many(shipmentEvents),
}));

export const shipmentEventRelations = relations(shipmentEvents, ({ one }) => ({
  shipment: one(shipments, {
    fields: [shipmentEvents.shipmentId],
    references: [shipments.id],
  }),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  user: one(user, { fields: [projects.userId], references: [user.id] }),
  kit: one(kits, { fields: [projects.kitId], references: [kits.id] }),
  submissions: many(projectSubmissions),
  journals: many(projectJournals),
  materials: many(projectMaterials),
  reviews: many(projectReviews),
  events: many(projectEvents),
  timeEntries: many(projectTimeEntries),
  participantProfiles: many(projectParticipantProfiles),
  shippingAddresses: many(projectShippingAddresses),
}));

export const projectEventRelations = relations(projectEvents, ({ one }) => ({
  project: one(projects, {
    fields: [projectEvents.projectId],
    references: [projects.id],
  }),
  actor: one(user, { fields: [projectEvents.actorId], references: [user.id] }),
}));

export const projectParticipantProfileRelations = relations(
  projectParticipantProfiles,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectParticipantProfiles.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectParticipantProfiles.userId],
      references: [user.id],
    }),
  }),
);

export const projectShippingAddressRelations = relations(
  projectShippingAddresses,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectShippingAddresses.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectShippingAddresses.userId],
      references: [user.id],
    }),
  }),
);

export const projectMaterialRelations = relations(
  projectMaterials,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectMaterials.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectMaterials.userId],
      references: [user.id],
    }),
  }),
);

export const projectJournalRelations = relations(
  projectJournals,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectJournals.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectJournals.userId],
      references: [user.id],
    }),
    timeEntries: many(projectTimeEntries),
  }),
);

export const projectSubmissionRelations = relations(
  projectSubmissions,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectSubmissions.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectSubmissions.userId],
      references: [user.id],
    }),
    materials: many(projectSubmissionMaterials),
    reviews: many(projectReviews),
  }),
);

export const projectSubmissionMaterialRelations = relations(
  projectSubmissionMaterials,
  ({ one }) => ({
    submission: one(projectSubmissions, {
      fields: [projectSubmissionMaterials.submissionId],
      references: [projectSubmissions.id],
    }),
    material: one(projectMaterials, {
      fields: [projectSubmissionMaterials.materialId],
      references: [projectMaterials.id],
    }),
  }),
);

export const projectReviewRelations = relations(
  projectReviews,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectReviews.projectId],
      references: [projects.id],
    }),
    submission: one(projectSubmissions, {
      fields: [projectReviews.submissionId],
      references: [projectSubmissions.id],
    }),
    reviewer: one(user, {
      fields: [projectReviews.reviewerId],
      references: [user.id],
    }),
    checks: many(projectReviewChecks),
  }),
);

export const projectReviewCheckRelations = relations(
  projectReviewChecks,
  ({ one }) => ({
    review: one(projectReviews, {
      fields: [projectReviewChecks.reviewId],
      references: [projectReviews.id],
    }),
  }),
);

export const projectTimeEntryRelations = relations(
  projectTimeEntries,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectTimeEntries.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [projectTimeEntries.userId],
      references: [user.id],
    }),
    journal: one(projectJournals, {
      fields: [projectTimeEntries.journalId],
      references: [projectJournals.id],
    }),
    sourceSession: one(editorActivitySessions, {
      fields: [projectTimeEntries.sourceSessionId],
      references: [editorActivitySessions.id],
    }),
  }),
);

export const reviewNotes = pgTable("review_notes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  targetUserId: text("target_user_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reviewNoteRelations = relations(reviewNotes, ({ one }) => ({
  project: one(projects, {
    fields: [reviewNotes.projectId],
    references: [projects.id],
  }),
  targetUser: one(user, {
    fields: [reviewNotes.targetUserId],
    references: [user.id],
  }),
  author: one(user, {
    fields: [reviewNotes.authorId],
    references: [user.id],
  }),
}));

export const productRelations = relations(products, ({ many }) => ({
  cartItems: many(cartItems),
  orderItems: many(orderItems),
  images: many(productImages),
  kitItems: many(kitItems),
}));

export const productCategoryRelations = relations(
  productCategories,
  ({ many }) => ({
    products: many(products),
  }),
);

export const productImageRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const kitRelations = relations(kits, ({ many }) => ({
  items: many(kitItems),
  projects: many(projects),
}));

export const kitItemRelations = relations(kitItems, ({ one }) => ({
  kit: one(kits, { fields: [kitItems.kitId], references: [kits.id] }),
  product: one(products, {
    fields: [kitItems.productId],
    references: [products.id],
  }),
}));

export const currencyTransactionRelations = relations(
  currencyTransactions,
  ({ one }) => ({
    user: one(user, {
      fields: [currencyTransactions.userId],
      references: [user.id],
    }),
    actor: one(user, {
      fields: [currencyTransactions.actorId],
      references: [user.id],
    }),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_actor_idx").on(table.actorId),
    index("audit_action_idx").on(table.action),
    index("audit_entity_idx").on(table.entityType, table.entityId),
    index("audit_created_idx").on(table.createdAt),
  ],
);

export type EmailSignup = typeof emailSignups.$inferSelect;
export type NewEmailSignup = typeof emailSignups.$inferInsert;
