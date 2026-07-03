export type ProjectStatus =
  | "draft"
  | "materials_review"
  | "kit_approved"
  | "kit_fulfillment"
  | "kit_sent"
  | "building"
  | "demo_review"
  | "done"
  | "shipped"
  | "reviewed"
  | "paid_out"
  | "fulfilled"
  | "needs_changes"
  | "approved"
  | "rejected";

export type OrderStatus = "pending" | "being_fulfilled" | "sent" | "cancelled";

export type OrderStatusFormState = {
  success: boolean;
  message?: string;
  status?: OrderStatus;
};

export type SidebarUser = {
  name?: string | null;
  email?: string | null;
};

export type SidebarLink = {
  name: string;
  href: string;
  icon: string;
};

export type SidebarSection = {
  name: string;
  links: SidebarLink[];
};

export type ShipInput = {
  email: string;
  codeUrl: string;
  screenshotUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  birthday: string;
  firstName: string;
  lastName: string;
};

export type DemoInput = {
  playableUrl: string;
  demoVideoUrl: string;
};

export type CustomShipInput = {
  gitUrl: string;
  screenshotUrl: string;
  hoursSpent: number;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  birthday: string;
  firstName: string;
  lastName: string;
};

export type ProjectFormState = {
  success: boolean;
  message?: string;
  project?: Partial<PlatformProject> & { id: number };
};

export type PlatformProject = ShipInput & {
  id: number;
  title: string;
  description: string;
  howToUse: string;
  playableUrl: string;
  status: ProjectStatus;
  reviewNote: string;
  demoVideoUrl: string;
  hoursSpent: number;
  kitType: "arduino" | "esp32" | "own";
  journalCount: number;
  trackedSeconds: number;
  submissionSource: string;
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type CheckoutItem = {
  productId: number;
  quantity: number;
};

export type ReviewNote = {
  id: number;
  projectId: number | null;
  targetUserId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SignupState = {
  success?: boolean;
  message?: string;
  email?: string;
  existingUser?: boolean;
};
