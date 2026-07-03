export const BRAND_COLOR = "#BD0F32";
export const BRAND_COLOR_HEX = 0xbd0f32;
export const TEXT_MAIN = "#191a23";
export const BG_BASE = "#fefffe";

export const SITE_NAME = "Breadboard";
export const SITE_DESCRIPTION =
  "Design a complete breadboard project. We send you the kit to build it.";

export const ROUTES = {
  home: "/",
  marketing: {
    faq: "/faq",
    getStarted: "/get-started",
    guides: "/guides",
    workshop: "/workshop",
    gallery: "/gallery",
    requirements: "/requirements",
    firmware: "/guides/firmware",
    shippedProject: "/project-resources/what-is-a-shipped-project",
    goodJournaling: "/project-resources/good-journaling",
  },
  platform: {
    dashboard: "/platform",
    projects: "/platform/projects",
    shop: "/platform/shop",
    orders: "/platform/shop/orders",
    editor: (id: number) => `/editor/${id}`,
  },
  admin: {
    dashboard: "/platform/admin",
    review: "/platform/admin/review",
    reviewProject: (id: number) => `/platform/admin/review/${id}`,
    orders: "/platform/admin/orders",
    products: "/platform/admin/products",
    fulfillment: "/platform/admin/fulfillment",
    users: "/platform/admin/users",
  },
} as const;

export const BREAD_PER_HOUR = 5;

// Build ships (off-platform builds) earn gold bread instead of regular bread.
// Same hourly rate, different currency: gold bread discounts shop items.
export const GOLD_BREAD_PER_HOUR = 5;

// 5 bread per hour works out to one bread every 12 minutes of tracked time.
export const SECONDS_PER_BREAD = 3600 / BREAD_PER_HOUR;

// Pre-review estimate shown to users. The real amount is decided at review
// time from approved hours, so this always rounds down.
export function estimateBreadFromSeconds(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / SECONDS_PER_BREAD);
}
