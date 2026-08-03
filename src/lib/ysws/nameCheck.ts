/**
 * Sanity checks on the first/last name a ship carries into the Unified YSWS
 * Database.
 *
 * Unified DB policy (announced to reviewers 2026-08-03): the name fields may
 * hold a preferred name, the one a person actually goes by in Slack or real
 * life, but not an obviously fake one ("Sponge" "Bob"), not something carrying
 * no information (a period, "asdf"), and not an incomplete one, so a last
 * initial is not a last name. When a name fails, the reviewer has to reach out
 * for a usable name before the ship gets submitted.
 *
 * These checks are a reviewer aid, not a gate: they surface the name next to
 * the review with the suspicious bits called out, and the reviewer decides.
 * Nothing here blocks an approval, because "looks fake" is a judgment call and
 * plenty of real names look unusual.
 */

export type NameIssueLevel = "error" | "warn";

export type NameIssue = {
  level: NameIssueLevel;
  field: "first" | "last" | "name";
  message: string;
};

// Strip accents so "José" and "Jose" are checked the same way, then keep only
// what could be part of a name. Unicode letter classes, not A-Z, so names in
// non-Latin scripts don't read as "contains no letters".
function letters(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^\p{L}]/gu, "");
}

function normalize(value: string) {
  return letters(value).toLowerCase();
}

// Placeholders and keyboard mashing. Matched on the whole field, so a real name
// that happens to contain one of these ("Nadia" contains "na") is untouched.
const PLACEHOLDERS = new Set([
  "test",
  "testing",
  "asdf",
  "asdfg",
  "asdfgh",
  "qwerty",
  "qwer",
  "abc",
  "abcd",
  "xyz",
  "none",
  "null",
  "nil",
  "na",
  "nan",
  "unknown",
  "anonymous",
  "anon",
  "nobody",
  "noname",
  "firstname",
  "lastname",
  "surname",
  "myname",
  "yourname",
  "name",
  "user",
  "admin",
  "hackclub",
  "idk",
  "whatever",
]);

// Fictional/celebrity names, matched only on the full first+last combination so
// a real "Harry" or a real "Bob" never trips it. Deliberately short: it catches
// the joke names people actually type, and the reviewer catches the rest.
const FICTIONAL = new Set([
  "spongebob",
  "spongebobsquarepants",
  "patrickstar",
  "johndoe",
  "janedoe",
  "johnsmith",
  "mickeymouse",
  "minniemouse",
  "donaldduck",
  "bugsbunny",
  "peterparker",
  "brucewayne",
  "clarkkent",
  "tonystark",
  "harrypotter",
  "lukeskywalker",
  "darthvader",
  "rickastley",
  "elonmusk",
  "joemama",
  "johncena",
  "barackobama",
  "santaclaus",
  "loremipsum",
]);

function checkField(raw: string, field: "first" | "last"): NameIssue[] {
  const label = field === "first" ? "First name" : "Last name";
  const value = raw.trim();
  const issues: NameIssue[] = [];

  if (!value) {
    issues.push({ level: "error", field, message: `${label} is missing.` });
    return issues;
  }

  const clean = normalize(value);
  if (!clean) {
    issues.push({
      level: "error",
      field,
      message: `${label} has no letters in it (${JSON.stringify(value)}), so it carries no information.`,
    });
    return issues;
  }

  if (PLACEHOLDERS.has(clean)) {
    issues.push({
      level: "error",
      field,
      message: `${label} is a placeholder (${JSON.stringify(value)}).`,
    });
  }

  // The initial and repeated-letter rules assume an alphabet where one letter
  // can't be a whole name. That holds for Latin (accents already folded away by
  // normalize) but not for CJK, where single-character given and family names
  // are ordinary and a doubled character ("婷婷") is a real given name.
  const isLatin = /^[a-z]+$/.test(clean);

  // A single letter, with or without the period: "G", "G." — the policy calls
  // an initial out explicitly for last names. A one-letter first name is real
  // for some people, so that side is only a nudge.
  if (isLatin && clean.length === 1) {
    issues.push({
      level: field === "last" ? "error" : "warn",
      field,
      message:
        field === "last"
          ? `Last name is just the initial "${value}". The policy needs their actual last name.`
          : `First name is a single letter ("${value}"). Worth confirming it isn't an initial.`,
    });
  }

  // "aaa", "zzzz" — a run of one repeated letter is never a name.
  if (isLatin && clean.length > 1 && new Set(clean).size === 1) {
    issues.push({
      level: "error",
      field,
      message: `${label} is one letter repeated (${JSON.stringify(value)}).`,
    });
  }

  if (/\d/.test(value)) {
    issues.push({
      level: "warn",
      field,
      message: `${label} contains digits (${JSON.stringify(value)}).`,
    });
  }

  // Slack handles, emails and emoji end up pasted in here now and then.
  if (/[@/\\<>{}[\]()_*|]|https?:/i.test(value)) {
    issues.push({
      level: "warn",
      field,
      message: `${label} contains characters a name usually doesn't (${JSON.stringify(value)}).`,
    });
  }

  return issues;
}

/**
 * Everything questionable about the name this ship would submit. Empty array
 * means it looks fine. Errors are the ones the policy says to fix before
 * submitting; warnings are "give this a second look".
 */
export function checkUnifiedName(
  firstName: string,
  lastName: string,
): NameIssue[] {
  const issues = [
    ...checkField(firstName, "first"),
    ...checkField(lastName, "last"),
  ];

  const first = normalize(firstName);
  const last = normalize(lastName);

  if (first && last) {
    if (FICTIONAL.has(first + last)) {
      issues.push({
        level: "error",
        field: "name",
        message: `"${firstName.trim()} ${lastName.trim()}" is a fictional or borrowed name.`,
      });
    } else if (FICTIONAL.has(first) || FICTIONAL.has(last)) {
      // "Spongebob" alone in either field, whatever the other field says.
      issues.push({
        level: "warn",
        field: "name",
        message: `"${firstName.trim()} ${lastName.trim()}" reads like a joke name.`,
      });
    }
    if (first === last) {
      issues.push({
        level: "warn",
        field: "name",
        message: `First and last name are identical ("${firstName.trim()}").`,
      });
    }
  }

  return issues;
}

export function worstNameIssue(issues: NameIssue[]): NameIssueLevel | null {
  if (issues.some((issue) => issue.level === "error")) return "error";
  if (issues.length) return "warn";
  return null;
}
