// @ts-nocheck — no @types/bun in the tree, so tsc can't resolve "bun:test".
import { describe, expect, test } from "bun:test";
import { classifyGitHubResponse } from "@/lib/github/read-failure";

// The point of this mapping is that a reviewer can tell "nothing changed" from
// "we couldn't look". If 401 ever collapses back into the same bucket as 404,
// an expired token goes silent again.
describe("classifyGitHubResponse", () => {
  test("treats 2xx as usable", () => {
    expect(classifyGitHubResponse(200, null)).toBe("ok");
    expect(classifyGitHubResponse(204, null)).toBe("ok");
  });

  test("treats 404 as a legitimate no, not a failure", () => {
    // A force-pushed base commit. The caller falls back to its date anchor.
    expect(classifyGitHubResponse(404, null)).toBe("not_found");
  });

  test("calls an expired or missing credential out as auth", () => {
    expect(classifyGitHubResponse(401, null)).toBe("auth");
  });

  test("splits GitHub's overloaded 403 on the remaining-quota header", () => {
    expect(classifyGitHubResponse(403, "0")).toBe("rate_limit");
    expect(classifyGitHubResponse(403, "57")).toBe("auth");
    expect(classifyGitHubResponse(403, null)).toBe("auth");
  });

  test("treats 429 as rate limiting", () => {
    // What the gh-proxy returns when a key exceeds its per-second budget.
    expect(classifyGitHubResponse(429, null)).toBe("rate_limit");
  });

  test("treats server errors as transient", () => {
    expect(classifyGitHubResponse(500, null)).toBe("unreachable");
    expect(classifyGitHubResponse(502, null)).toBe("unreachable");
  });
});
