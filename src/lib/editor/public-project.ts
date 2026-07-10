/**
 * Produces the public form of an editor project for share pages and GitHub.
 *
 * Project source is private while the owner edits it, but it becomes public
 * when a demo link or repository is published. Explicitly marked string
 * literals and credential-shaped values are redacted at that boundary.
 */
const REDACTED_SECRET = "[REDACTED]";

const GITHUB_TOKEN =
  /\b(?:github_pat_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b/g;
const BEARER_TOKEN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;
const ASSIGNED_SECRET =
  /(\b[A-Za-z_][A-Za-z0-9_]*(?:token|secret|password|api[_-]?key)[A-Za-z0-9_]*\s*=\s*["'])([^"'\r\n]{8,})(["'])/gi;
const JSON_SECRET =
  /(["'][A-Za-z_][A-Za-z0-9_]*(?:token|secret|password|api[_-]?key)[A-Za-z0-9_]*["']\s*:\s*["'])([^"'\r\n]{8,})(["'])/gi;
const MARKED_SECRET =
  /"(?:\\.|[^"\\\r\n])*"\s*(?:\/\*\s*breadboard-secret\s*\*\/|#\s*breadboard-secret\b)/gi;

export function redactPublicSource(source: string) {
  return source
    .replace(MARKED_SECRET, `"${REDACTED_SECRET}"`)
    .replace(GITHUB_TOKEN, REDACTED_SECRET)
    .replace(BEARER_TOKEN, `$1${REDACTED_SECRET}`)
    .replace(ASSIGNED_SECRET, `$1${REDACTED_SECRET}$3`)
    .replace(JSON_SECRET, `$1${REDACTED_SECRET}$3`);
}

function sanitizeFileGroups(fileGroups: unknown) {
  if (
    !fileGroups ||
    typeof fileGroups !== "object" ||
    Array.isArray(fileGroups)
  ) {
    return fileGroups;
  }

  return Object.fromEntries(
    Object.entries(fileGroups as Record<string, unknown>).map(
      ([groupId, files]) => [
        groupId,
        Array.isArray(files)
          ? files
              .filter((file) => typeof file === "object" && file !== null)
              .map((file) => {
                const item = file as Record<string, unknown>;
                return {
                  ...item,
                  ...(typeof item.content === "string"
                    ? { content: redactPublicSource(item.content) }
                    : {}),
                };
              })
          : [],
      ],
    ),
  );
}

/** Return a non-mutating copy suitable for a public share or repository. */
export function toPublicProjectData(
  editorData: Record<string, unknown>,
): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(editorData)) as Record<
    string,
    unknown
  >;
  copy.fileGroups = sanitizeFileGroups(copy.fileGroups);

  // Older published links use a full capture state, where files live below
  // the editor key rather than on the portable project's top level.
  if (
    copy.editor &&
    typeof copy.editor === "object" &&
    !Array.isArray(copy.editor)
  ) {
    const editor = copy.editor as Record<string, unknown>;
    copy.editor = {
      ...editor,
      fileGroups: sanitizeFileGroups(editor.fileGroups),
    };
  }

  return copy;
}
