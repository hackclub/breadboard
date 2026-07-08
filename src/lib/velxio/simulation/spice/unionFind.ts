// @ts-nocheck
/**
 * Minimal Union-Find (disjoint set) with a `setCanonical()` extension:
 *
 *   uf.add(key)
 *   uf.union(a, b)
 *   uf.find(key) → representative string
 *   uf.setCanonical(key, name)  — pin the representative of key's component
 *                                  to an explicit name (e.g. "0" for ground)
 *
 * Used by the NetlistBuilder to collapse wired pins into named nets.
 */
export class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();
  private canonical = new Map<string, string>(); // key → forced name
  // Supply rails that got merged with ground ("0"). Physically that's a hard
  // short of the rail to GND: canonicalization silently resolves it (ground
  // wins) so no current ever flows in the solve — the ONLY place the short is
  // still observable is right here at merge time. NetlistBuilder surfaces
  // this so the verifier / canvas can shout instead of showing a dead circuit.
  private railGroundConflicts = new Set<string>();
  // Two *different* supply rails that got merged into one net — a supply-vs-
  // supply short (e.g. a wire from a board's 5 V pin to its 3.3 V pin). Unlike
  // a rail-to-ground short the solve still produces voltages (one source wins),
  // so this is the only evidence the two supplies were tied together. Each
  // entry is the pair of rail net names, sorted, joined by "↔".
  private railRailConflicts = new Set<string>();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  has(key: string): boolean {
    return this.parent.has(key);
  }

  find(key: string): string {
    this.add(key);
    while (this.parent.get(key) !== key) {
      const p = this.parent.get(key)!;
      this.parent.set(key, this.parent.get(p)!);
      key = this.parent.get(key)!;
    }
    // If this representative has a forced canonical name, return that instead.
    const canon = this.canonical.get(key);
    return canon ?? key;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.findRoot(a);
    const rb = this.findRoot(b);
    if (ra === rb) return;

    // If either root has a canonical name, the other adopts it.
    const canonA = this.canonical.get(ra);
    const canonB = this.canonical.get(rb);

    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    let newRoot: string;
    let oldRoot: string;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
      newRoot = rb;
      oldRoot = ra;
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
      newRoot = ra;
      oldRoot = rb;
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
      newRoot = ra;
      oldRoot = rb;
    }

    // Propagate canonical name: whichever side had one wins. If both had
    // different canonical names, the numerically-smaller / ground wins to
    // guarantee determinism (gnd = "0").
    this.recordRailConflict(canonA, canonB);
    const merged = pickCanonical(canonA, canonB);
    if (merged !== undefined) this.canonical.set(newRoot, merged);
    this.canonical.delete(oldRoot);
  }

  // Record any short revealed by merging two canonical names: a supply rail
  // fused with ground, or two distinct supply rails fused together. The
  // generic "vcc_rail" absorbing a specific per-voltage rail is NOT a short —
  // that's the intended reassignment when a VCC pin lands on a real board pin
  // (see pickCanonical) — so it's deliberately excluded from the rail-rail case.
  private recordRailConflict(a?: string, b?: string): void {
    if (a === undefined || b === undefined || a === b) return;
    const aRail = a.startsWith("vcc");
    const bRail = b.startsWith("vcc");
    if (a === "0" && bRail) {
      this.railGroundConflicts.add(b);
      return;
    }
    if (b === "0" && aRail) {
      this.railGroundConflicts.add(a);
      return;
    }
    // Two different *specific* supply rails tied together.
    if (aRail && bRail && a !== "vcc_rail" && b !== "vcc_rail") {
      this.railRailConflicts.add([a, b].sort().join(" ↔ "));
    }
  }

  /** Supply-rail names that ended up merged with ground (hard shorts). */
  railShorts(): string[] {
    return [...this.railGroundConflicts];
  }

  /** Pairs of distinct supply rails merged together (supply-vs-supply shorts). */
  railRailShorts(): string[] {
    return [...this.railRailConflicts];
  }

  /**
   * Force the set containing `key` to report `name` as its representative.
   * Called e.g. with "0" for ground, "vcc_rail" for supply rails.
   */
  setCanonical(key: string, name: string): void {
    this.add(key);
    const root = this.findRoot(key);
    const prev = this.canonical.get(root);
    this.recordRailConflict(prev, name);
    this.canonical.set(
      root,
      prev !== undefined ? pickCanonical(prev, name)! : name,
    );
  }

  /** Iterate every (key, representative) pair. */
  *entries(): IterableIterator<[string, string]> {
    for (const key of this.parent.keys()) {
      yield [key, this.find(key)];
    }
  }

  /** All distinct representatives (nets). */
  nets(): Set<string> {
    const s = new Set<string>();
    for (const key of this.parent.keys()) s.add(this.find(key));
    return s;
  }

  private findRoot(key: string): string {
    while (this.parent.get(key) !== key) {
      const p = this.parent.get(key)!;
      this.parent.set(key, this.parent.get(p)!);
      key = this.parent.get(key)!;
    }
    return key;
  }
}

/** Ground ("0") always wins over vcc; vcc over auto-named. Deterministic pick. */
function pickCanonical(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (a === b) return a;
  if (a === "0") return a;
  if (b === "0") return b;
  // Supply rails. A specific per-voltage rail ("vcc_rail_5v0") always beats
  // the generic "vcc_rail" — a component VCC pin force-canonicalized to the
  // generic rail but actually wired to a board's 5 V pin must adopt 5 V, not
  // the board's nominal rail voltage. Two *different* specific rails means the
  // circuit shorts two supplies together; pick deterministically.
  const aRail = a.startsWith("vcc_rail");
  const bRail = b.startsWith("vcc_rail");
  if (aRail && bRail) {
    if (a === "vcc_rail") return b;
    if (b === "vcc_rail") return a;
    return a < b ? a : b;
  }
  if (a.startsWith("vcc")) return a;
  if (b.startsWith("vcc")) return b;
  // Lexicographically smaller wins (stable)
  return a < b ? a : b;
}
