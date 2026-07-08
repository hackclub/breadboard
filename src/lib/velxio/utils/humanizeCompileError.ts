/**
 * humanizeCompileError — translate cryptic avr-gcc / arduino-cli / ESP-IDF
 * compiler + linker output into plain-English guidance a beginner can act on.
 *
 * This is best-effort pattern matching, NOT a real diagnostic parser. Each
 * rule turns a known error signature into a {title, detail, fix, location}.
 * The raw toolchain output is always still shown below these hints, so a
 * missed or wrong guess never hides the real information.
 */

export interface FriendlyDiagnostic {
  /** Short headline, e.g. "Missing a semicolon". */
  title: string;
  /** Plain-English explanation of what the compiler is complaining about. */
  detail: string;
  /** Concrete next step. */
  fix: string;
  /** "sketch.ino line 12", when a location can be recovered. */
  location?: string;
}

/** Pull a friendly "file line N" out of a `path/to/file.ino:12:3:` prefix. */
function locationOf(line: string): string | undefined {
  const m = line.match(/([\w .+-]+\.(?:ino|cpp|cc|c|hpp|h)):(\d+)(?::\d+)?:/i);
  if (!m) return undefined;
  // Strip any directory — beginners recognise "sketch.ino", not a /tmp path.
  const file = m[1].split(/[\\/]/).pop() ?? m[1];
  return `${file} line ${m[2]}`;
}

/** Grab the identifier from quotes like `'foo'` or ``foo``. */
function quoted(line: string): string | undefined {
  const m = line.match(/['`]([^'`]+)['`]/);
  return m?.[1];
}

type Rule = {
  test: RegExp;
  build: (line: string, raw: string) => FriendlyDiagnostic;
};

const RULES: Rule[] = [
  {
    // Linker can't find setup()/loop() — usually an empty sketch.
    test: /undefined reference to [`']?(setup|loop)[`']?/i,
    build: () => ({
      title: "Your sketch has no setup() or loop()",
      detail:
        "Every Arduino sketch must define both a setup() function (runs once) and a loop() function (runs over and over). The compiler couldn't find them.",
      fix: "Add both functions to your sketch:\n    void setup() {\n      // runs once\n    }\n    void loop() {\n      // runs forever\n    }\nIf you have more than one board, make sure the one you're compiling actually has your code. Each board has its own sketch.",
    }),
  },
  {
    // #include of a missing library / header.
    test: /(fatal error:\s*)?([\w./-]+\.h):?\s*(No such file or directory|not found)/i,
    build: (line) => {
      const hdr = line.match(/([\w./-]+\.h)/i)?.[1] ?? "a library";
      return {
        title: `Can't find "${hdr}"`,
        detail: `Your code has #include <${hdr}>, but that library isn't installed (or the name is misspelled).`,
        fix: `Open Library Manager and install the library that provides ${hdr}, or double-check the spelling in your #include line.`,
        location: locationOf(line),
      };
    },
  },
  {
    // Undeclared identifier.
    test: /['`]([^'`]+)['`] was not declared in this scope/i,
    build: (line) => {
      const id = quoted(line) ?? "something";
      return {
        title: `"${id}" isn't defined`,
        detail: `The compiler reached "${id}" but was never told what it is.`,
        fix: `Usually one of: a typo (check the spelling and capitalization), a missing #include for the library that defines it, or you used it before declaring the variable. Define or declare "${id}" before you use it.`,
        location: locationOf(line),
      };
    },
  },
  {
    test: /expected ['`];['`] before/i,
    build: (line) => ({
      title: "Missing a semicolon",
      detail:
        "A statement isn't finished with a semicolon (;). In C++ almost every line ends with one.",
      fix: "Add a ; at the end of the line just before the one the error points at.",
      location: locationOf(line),
    }),
  },
  {
    test: /expected ['`]}['`]|expected declaration or statement at end of input/i,
    build: (line) => ({
      title: "A curly brace isn't closed",
      detail:
        "The compiler hit the end of a block (or the file) still expecting a closing } . Your { and } aren't balanced.",
      fix: "Make sure every { has a matching } . Auto-formatting the code (or counting braces) helps spot the missing one.",
      location: locationOf(line),
    }),
  },
  {
    test: /expected ['`]\)['`]|expected ['`]\(['`]/i,
    build: (line) => ({
      title: "A parenthesis isn't matched",
      detail: "A ( or ) is missing, often in an if, for, or function call.",
      fix: "Check the parentheses on the flagged line so every ( has a matching ).",
      location: locationOf(line),
    }),
  },
  {
    test: /['`]([^'`]+)['`] does not name a type/i,
    build: (line) => {
      const id = quoted(line) ?? "that";
      return {
        title: `"${id}" isn't a known type`,
        detail: `The compiler expected a type (like int or String) but "${id}" isn't one it knows here.`,
        fix: `Likely a missing #include for the library that defines ${id}, or a typo. Add the right #include at the top of your sketch.`,
        location: locationOf(line),
      };
    },
  },
  {
    test: /(redefinition of|multiple definition of|redeclared)/i,
    build: (line) => {
      const id = quoted(line);
      return {
        title: id ? `"${id}" is defined more than once` : "Something is defined twice",
        detail:
          "The same variable or function is defined in more than one place, so the compiler doesn't know which to use.",
        fix: "Remove the duplicate definition. If it's in a header, make sure the header is only included once.",
        location: locationOf(line),
      };
    },
  },
  {
    test: /too (few|many) arguments to function/i,
    build: (line) => {
      const few = /too few/i.test(line);
      return {
        title: `Wrong number of arguments`,
        detail: few
          ? "You called a function with too few values in the ( )."
          : "You called a function with too many values in the ( ).",
        fix: "Check the function's definition and pass exactly the arguments it expects.",
        location: locationOf(line),
      };
    },
  },
  {
    test: /invalid conversion from ['`]([^'`]+)['`] to ['`]([^'`]+)['`]/i,
    build: (line) => {
      const m = line.match(
        /invalid conversion from ['`]([^'`]+)['`] to ['`]([^'`]+)['`]/i,
      );
      return {
        title: "A value is the wrong type",
        detail: m
          ? `Something of type ${m[1]} is being used where ${m[2]} is expected.`
          : "A value's type doesn't match what's expected (e.g. text where a number is needed).",
        fix: "Convert the value to the expected type, or fix the variable's type.",
        location: locationOf(line),
      };
    },
  },
  {
    test: /stray ['`][^'`]+['`] in program/i,
    build: (line) => ({
      title: "There's an invalid character in the code",
      detail:
        "The code contains a character the compiler can't read, often a smart quote or a symbol pasted from a document.",
      fix: "Retype the flagged line by hand, using plain straight quotes (\" and ').",
      location: locationOf(line),
    }),
  },
];

/**
 * Scan raw compiler output and return beginner-friendly diagnostics, most
 * useful first. De-duplicates by title so one root cause isn't reported many
 * times. Returns [] when nothing recognisable is found (caller falls back to
 * the raw output).
 */
export function humanizeCompileErrors(raw: string): FriendlyDiagnostic[] {
  if (!raw) return [];
  const out: FriendlyDiagnostic[] = [];
  const seen = new Set<string>();
  const lines = raw.split("\n");

  for (const line of lines) {
    for (const rule of RULES) {
      if (!rule.test.test(line)) continue;
      const diag = rule.build(line, raw);
      if (seen.has(diag.title)) continue;
      seen.add(diag.title);
      out.push(diag);
      break; // one rule per line
    }
  }

  // Last resort: if nothing matched but there IS a compiler `error:` line,
  // surface it cleaned up (drop the temp path) rather than leaving the user
  // with only the raw dump.
  if (out.length === 0) {
    const errLine = lines.find((l) => /:\s*(fatal )?error:/i.test(l));
    if (errLine) {
      const msg = errLine.split(/error:\s*/i).slice(1).join("error: ").trim();
      out.push({
        title: "The code didn't compile",
        detail: msg || "The compiler reported an error.",
        fix: "Read the highlighted line below, then check that line in your sketch.",
        location: locationOf(errLine),
      });
    }
  }

  return out;
}

/** One-line summary for a toast / status bar (first diagnostic's title). */
export function summarizeCompileErrors(raw: string): string | null {
  const diags = humanizeCompileErrors(raw);
  return diags.length ? diags[0].title : null;
}

/** Format one diagnostic into a multi-line string for the console. */
export function formatDiagnostic(d: FriendlyDiagnostic): string {
  const loc = d.location ? `  (${d.location})` : "";
  return `💡 ${d.title}${loc}\n   ${d.detail}\n   ↳ Fix: ${d.fix}`;
}
