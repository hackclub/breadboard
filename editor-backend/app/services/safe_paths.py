"""Path-safety helpers for user-supplied file names.

Compile requests carry file names and library names straight from the browser.
Those names must never be able to escape the directory they're meant to be
written to (or deleted from). `safe_join` rejects absolute paths, drive
letters, and any `..` traversal, and verifies the fully-resolved path stays
inside the intended base directory.
"""

from pathlib import Path, PurePosixPath, PureWindowsPath


class UnsafePathError(ValueError):
    """Raised when a user-supplied name would escape its base directory."""


def _looks_absolute_or_drive(name: str) -> bool:
    # Reject POSIX-absolute ("/x"), Windows-absolute ("\\x"), drive-qualified
    # ("C:\\x", "C:/x"), and UNC ("\\\\host") names outright.
    if PurePosixPath(name).is_absolute() or PureWindowsPath(name).is_absolute():
        return True
    if len(name) >= 2 and name[1] == ":":
        return True
    return False


def safe_join(base: Path, name: str) -> Path:
    """Join ``name`` under ``base``, rejecting anything that escapes ``base``.

    Raises ``UnsafePathError`` for empty names, absolute/drive paths, or names
    whose resolved location falls outside ``base``.
    """
    if not name or not name.strip():
        raise UnsafePathError("empty file name")

    # Normalise separators so a Windows-style "..\\.." is caught on POSIX too.
    normalized = name.replace("\\", "/")

    if _looks_absolute_or_drive(name) or normalized.startswith("/"):
        raise UnsafePathError(f"absolute path not allowed: {name!r}")

    parts = [p for p in normalized.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise UnsafePathError(f"path traversal not allowed: {name!r}")
    if not parts:
        raise UnsafePathError(f"invalid file name: {name!r}")

    base_resolved = base.resolve()
    candidate = (base_resolved / "/".join(parts)).resolve()
    # Final belt-and-braces check against symlink / normalization surprises.
    if base_resolved != candidate and base_resolved not in candidate.parents:
        raise UnsafePathError(f"path escapes base directory: {name!r}")
    return candidate
