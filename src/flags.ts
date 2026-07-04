import { growthbookAdapter } from "@flags-sdk/growthbook";
import { flag } from "flags/next";
import { after } from "next/server";
import { identify } from "@/lib/flags/identify";

growthbookAdapter.setTrackingCallback((experiment, result) => {
  after(async () => {
    console.log("Viewed Experiment", {
      experimentId: experiment.key,
      variationId: result.key,
    });
  });
});

export const launched = flag<boolean>({
  key: "launched",
  adapter: growthbookAdapter.feature<boolean>(),
  defaultValue: false,
  identify,
});

export const shopOpen = flag<boolean>({
  key: "shop-open",
  adapter: growthbookAdapter.feature<boolean>(),
  defaultValue: false,
  identify,
});

export const offPlatformBuilds = flag<boolean>({
  key: "off-platform-builds",
  // Forced on in local dev so the off-platform pages are reachable without a
  // GrowthBook override. Production always decides via GrowthBook.
  ...(process.env.NODE_ENV === "development"
    ? { decide: () => true }
    : {
        adapter: growthbookAdapter.feature<boolean>(),
        defaultValue: false,
      }),
  identify,
});
