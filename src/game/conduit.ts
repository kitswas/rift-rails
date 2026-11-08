import type { DimId, Trajectory } from "./types";

export interface ConduitOptions {
  runway: DimId[];
  sectorPoolCounts: Partial<Record<DimId, number>>;
  waypointHubInterval: number;
  adjectives: string[];
  nouns: Record<DimId, string[]>;
  random?: () => number;
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

  constructor(options: ConduitOptions) {
    this.runway = [...options.runway];
    this.sectorPoolCounts = { ...options.sectorPoolCounts };
    this.waypointHubInterval = options.waypointHubInterval;
    this.adjectives = [...options.adjectives];
    this.nouns = Object.fromEntries(
      Object.entries(options.nouns).map(([k, v]) => [k, [...v]]),
    );
    this.random = options.random ?? (() => 0.5);
  }

  init(savedBag: string[] | null = null): void {
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
    }
    const next = pop
      ? this.sectorBag.pop()
      : this.sectorBag[this.sectorBag.length - 1];
    return (next ?? "hub") as DimId;
  }

  generateDimensionForId(chosenId: DimId): DimensionName {
    const adj = this.adjectives[
      Math.floor(this.random() * this.adjectives.length)
    ] ?? "";
    const nouns = this.nouns[chosenId] ?? [];
    const noun = nouns[Math.floor(this.random() * nouns.length)] ?? "";
    return { id: chosenId, name: `${adj} ${noun}`.trim() };
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
