import type { DimId, Trajectory } from "./types";

export interface ConduitOptions {
  runway: DimId[];
  // Plugin node ids may be keys here too (DimId is an open string).
  sectorPoolCounts: Partial<Record<DimId, number>>;
  waypointHubInterval: number;
  adjectives: string[];
  nouns: Record<DimId, string[]>;
  random?: () => number;
  /** Extra (plugin) node ids included in the sector pool at low weight. */
  extraNodes?: string[];
  /** Dynamic callback for plugin node ids registered after construction. */
  getExtraNodeIds?: () => string[];
  /** Copies per extra node in each bag (default 1, vs baseline pool counts). */
  extraNodeWeight?: number;
}

export interface DimensionName {
  id: DimId;
  name: string;
}

/** Pure deck: runway fixed points, waypoint hub, shuffled sector bag. */
export class ConduitDeck {
  sectorBag: string[] = [];
  private readonly runway: DimId[];
  private readonly sectorPoolCounts: Partial<Record<DimId, number>>;
  private readonly waypointHubInterval: number;
  private readonly adjectives: string[];
  private readonly nouns: Record<DimId, string[]>;
  private readonly random: () => number;
  private extraNodes: string[];
  private readonly getExtraNodeIdsCb?: () => string[];
  private readonly extraNodeWeight: number;
  private injectedExtras = new Set<string>();

  constructor(options: ConduitOptions) {
    this.runway = [...options.runway];
    this.sectorPoolCounts = { ...options.sectorPoolCounts };
    this.waypointHubInterval = options.waypointHubInterval;
    this.adjectives = [...options.adjectives];
    this.nouns = Object.fromEntries(
      Object.entries(options.nouns).map(([k, v]) => [k, [...v]]),
    );
    this.random = options.random ?? (() => 0.5);
    this.extraNodes = [...(options.extraNodes ?? [])];
    this.getExtraNodeIdsCb = options.getExtraNodeIds;
    this.extraNodeWeight = Math.max(1, Math.floor(options.extraNodeWeight ?? 1));
  }

  /** Replace static extra node list (e.g. after plugin registration). */
  setExtraNodes(ids: string[]): void {
    this.extraNodes = [...ids];
  }

  private resolveExtraIds(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of [...this.extraNodes, ...(this.getExtraNodeIdsCb?.() ?? [])]) {
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  /** Inject extras registered after the current bag was shuffled (once per bag). */
  private injectMissingExtras(): void {
    for (const id of this.resolveExtraIds()) {
      if (this.injectedExtras.has(id) || this.sectorBag.includes(id)) continue;
      const pos = Math.floor(this.random() * (this.sectorBag.length + 1));
      this.sectorBag.splice(pos, 0, id);
      this.injectedExtras.add(id);
    }
  }

  init(savedBag: string[] | null = null): void {
    this.injectedExtras.clear();
    if (savedBag !== null && Array.isArray(savedBag) && savedBag.length > 0) {
      this.sectorBag = [...savedBag];
    } else {
      this.sectorBag = this.createShuffledSectorBag();
    }
  }

  shuffleArray<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const a = out[i];
      out[i] = out[j] as T;
      out[j] = a as T;
    }
    return out;
  }

  createShuffledSectorBag(): string[] {
    const bag: string[] = [];
    for (const [nodeType, count] of Object.entries(this.sectorPoolCounts)) {
      for (let i = 0; i < (count ?? 0); i++) bag.push(nodeType);
    }
    // Plugin nodes: low weight (1 per bag) unless already in sectorPoolCounts.
    this.injectedExtras.clear();
    for (const id of this.resolveExtraIds()) {
      if (bag.includes(id)) {
        this.injectedExtras.add(id);
        continue;
      }
      for (let i = 0; i < this.extraNodeWeight; i++) bag.push(id);
      this.injectedExtras.add(id);
    }
    return this.shuffleArray(bag);
  }

  resolveNextNodeId(jumpCount: number, pop = false): DimId {
    const nextJump = jumpCount + 1;
    if (nextJump <= this.runway.length) {
      const fixed = this.runway[nextJump - 1];
      if (fixed !== undefined) return fixed;
    }
    if (nextJump % this.waypointHubInterval === 0) {
      return "hub";
    }
    if (this.sectorBag.length === 0) {
      this.sectorBag = this.createShuffledSectorBag();
    } else {
      this.injectMissingExtras();
    }
    const next = pop
      ? this.sectorBag.pop()
      : this.sectorBag[this.sectorBag.length - 1];
    return (next ?? "hub") as DimId;
  }

  generateDimensionForId(chosenId: DimId): DimensionName {
    const nouns = this.nouns[chosenId] ?? [];
    // Unknown/plugin dimId: fallback name is the id itself, never a crash.
    if (nouns.length === 0) return { id: chosenId, name: chosenId };
    const adj = this.adjectives[
      Math.floor(this.random() * this.adjectives.length)
    ] ?? "";
    const noun = nouns[Math.floor(this.random() * nouns.length)] ?? "";
    const name = `${adj} ${noun}`.trim();
    return { id: chosenId, name: name || chosenId };
  }

  getTrajectories(jumpCount: number, hasAstrolabe: boolean): Trajectory[] {
    const nextJump = jumpCount + 1;
    const isFixedPoint =
      nextJump <= this.runway.length ||
      nextJump % this.waypointHubInterval === 0;

    if (!hasAstrolabe) {
      const chosenId = this.resolveNextNodeId(jumpCount, true);
      const dest = this.generateDimensionForId(chosenId);
      return [{ ...dest, returnId: null }];
    }

    let id1: DimId;
    let id2: DimId;
    if (isFixedPoint) {
      id1 = this.resolveNextNodeId(jumpCount, true);
      id2 = id1;
    } else {
      id1 = this.resolveNextNodeId(jumpCount, true);
      id2 = this.resolveNextNodeId(jumpCount, true);
    }

    const dest1 = this.generateDimensionForId(id1);
    const dest2 = this.generateDimensionForId(id2);

    return [
      { ...dest1, returnId: isFixedPoint ? null : id2 },
      { ...dest2, returnId: isFixedPoint ? null : id1 },
    ];
  }

  commitTrajectory(choice: Trajectory): { dimId: string; dimName: string } {
    if (choice.returnId !== null) {
      this.sectorBag.push(choice.returnId);
      this.sectorBag = this.shuffleArray(this.sectorBag);
    }
    return { dimId: choice.id, dimName: choice.name };
  }

  serialize(): string[] {
    return [...this.sectorBag];
  }
}
