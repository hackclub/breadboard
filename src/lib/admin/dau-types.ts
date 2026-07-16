// Shared shapes and labels for the admin DAU chart. Kept free of server-only
// imports so both the server loader (dau.ts) and the client chart can use them.

// How many days of daily-active-user history the chart shows.
export const DAU_WINDOW_DAYS = 30;

// The two ways to count a "daily active user":
//  - "onsite": logged in / present on the site, from better-auth sessions.
//  - "editor": opened the editor and worked on a project, from editor
//    activity sessions (the same signal the in-progress table uses).
export type DauDefinition = "onsite" | "editor";

export const DAU_DEFINITIONS: {
  key: DauDefinition;
  label: string;
  blurb: string;
}[] = [
  {
    key: "editor",
    label: "Worked in the editor",
    blurb: "Opened the editor and worked on a project that day.",
  },
  {
    key: "onsite",
    label: "Logged in / on site",
    blurb: "Had a login session that day.",
  },
];

export interface DauPoint {
  day: string; // YYYY-MM-DD (US Eastern)
  first2d: number;
  days2to7: number;
  week1to2: number;
  week2to3: number;
  week3plus: number;
  total: number;
}

// Distinct users active within a rolling window ending now.
export interface DauReach {
  last24h: number;
  last3d: number;
  last7d: number;
  last30d: number;
}

export interface DauMetrics {
  series: DauPoint[];
  reach: DauReach;
}
