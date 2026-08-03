// @ts-nocheck — no @types/bun in the tree, so tsc can't resolve "bun:test".
import { describe, expect, test } from "bun:test";
import { checkUnifiedName, worstNameIssue } from "@/lib/ysws/nameCheck";

const level = (first: string, last: string) =>
  worstNameIssue(checkUnifiedName(first, last));

describe("checkUnifiedName", () => {
  test("passes ordinary names, including non-Latin scripts and particles", () => {
    for (const [first, last] of [
      ["Tanishq", "Goyal"],
      ["José", "Núñez"],
      ["Anna-Lena", "van der Berg"],
      ["Zoë", "O'Brien"],
      ["李", "明"],
      ["Bob", "Ross"],
    ]) {
      expect(checkUnifiedName(first, last)).toEqual([]);
    }
  });

  test("flags a missing name", () => {
    expect(level("", "Goyal")).toBe("error");
    expect(level("Tanishq", "   ")).toBe("error");
  });

  test("flags names carrying no information", () => {
    expect(level(".", ".")).toBe("error");
    expect(level("asdf", "asdf")).toBe("error");
    expect(level("Test", "User")).toBe("error");
    expect(level("Aaa", "Bbbb")).toBe("error");
  });

  test("treats a last initial as an error and a one-letter first name as a nudge", () => {
    expect(level("Tanishq", "G.")).toBe("error");
    expect(level("Tanishq", "G")).toBe("error");
    expect(level("T", "Goyal")).toBe("warn");
  });

  test("rejects an abbreviated last name, not only a bare initial", () => {
    // The clarification: "John F." is out, and so is any shortened form.
    expect(level("John", "F.")).toBe("error");
    expect(level("John", "Fr.")).toBe("error");
    expect(level("John", "Fraud.")).toBe("error");
    // A bare initial reports once, as the initial, not twice.
    expect(checkUnifiedName("John", "F.")).toHaveLength(1);
    // Suffixes and prefixes keep their period without being abbreviations.
    expect(checkUnifiedName("John", "Fraud Jr.")).toEqual([]);
    expect(checkUnifiedName("John", "St. James")).toEqual([]);
  });

  test("calls out initials in both fields", () => {
    expect(level("J", "F")).toBe("error");
    expect(level("J.", "F.")).toBe("error");
    expect(
      checkUnifiedName("J.", "F.").some((issue) =>
        issue.message.includes("is initials, not a name"),
      ),
    ).toBe(true);
  });

  test("flags borrowed and joke names", () => {
    expect(level("Sponge", "Bob")).toBe("error");
    expect(level("John", "Doe")).toBe("error");
    expect(level("Spongebob", "Patel")).toBe("warn");
    // A real Harry with a different last name is fine.
    expect(checkUnifiedName("Harry", "Patel")).toEqual([]);
  });

  test("warns on identical fields, digits and stray characters", () => {
    expect(level("Goyal", "Goyal")).toBe("warn");
    expect(level("Tanishq", "Goyal2")).toBe("warn");
    expect(level("@tanishq", "Goyal")).toBe("warn");
  });
});
