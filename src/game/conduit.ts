import { GAME_DATA } from "./data";
import type { DimId, Trajectory } from "./types";

export const ConduitDeck = {
  sectorBag: [] as string[],

  init(savedBag: string[] | null = null): void {
    if (savedBag && Array.isArray(savedBag) && savedBag.length > 0) {
      ConduitDeck.sectorBag = [...savedBag];
    } else {
      ConduitDeck.sectorBag = ConduitDeck.createShuffledSectorBag();
    }
  },

  shuffleArray<T>(arr: T[]): T[] {
    return arr.sort(() => Math.random() - 0.5);
  },

  createShuffledSectorBag(): string[] {
    const bag: string[] = [];
    for (const [nodeType, count] of Object.entries(GAME_DATA.sectorPoolCounts)) {
      for (let i = 0; i < (count ?? 0); i++) bag.push(nodeType);
    }
    return ConduitDeck.shuffleArray(bag);
  },

  resolveNextNodeId(jumpCount: number, pop: boolean = false): DimId {
    const nextJump = jumpCount + 1;
    if (nextJump <= GAME_DATA.runway.length) {
      const fixed = GAME_DATA.runway[nextJump - 1];
      if (fixed !== undefined) return fixed;
    }
    if (nextJump % GAME_DATA.config.WAYPOINT_HUB_INTERVAL === 0) {
      return "hub";
    }
    if (!ConduitDeck.sectorBag || ConduitDeck.sectorBag.length === 0) {
      ConduitDeck.sectorBag = ConduitDeck.createShuffledSectorBag();
    }
    const next = pop
      ? ConduitDeck.sectorBag.pop()
      : ConduitDeck.sectorBag[ConduitDeck.sectorBag.length - 1];
    return (next ?? "hub") as DimId;
  },

  generateDimensionForId(chosenId: DimId): { id: DimId; name: string } {
    const adj =
      GAME_DATA.procedural.adjectives[
        Math.floor(Math.random() * GAME_DATA.procedural.adjectives.length)
      ];
    const nouns = GAME_DATA.procedural.nouns[chosenId];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return { id: chosenId, name: `${adj} ${noun}` };
  },

  getTrajectories(jumpCount: number, hasAstrolabe: boolean): Trajectory[] {
    const nextJump = jumpCount + 1;
    const isFixedPoint =
      nextJump <= GAME_DATA.runway.length ||
      nextJump % GAME_DATA.config.WAYPOINT_HUB_INTERVAL === 0;

    if (!hasAstrolabe) {
      const chosenId = ConduitDeck.resolveNextNodeId(jumpCount, true);
      const dest = ConduitDeck.generateDimensionForId(chosenId);
      return [{ ...dest, returnId: null }];
    }

    let id1: DimId;
    let id2: DimId;
    if (isFixedPoint) {
      id1 = ConduitDeck.resolveNextNodeId(jumpCount, true);
      id2 = id1;
    } else {
      id1 = ConduitDeck.resolveNextNodeId(jumpCount, true);
      id2 = ConduitDeck.resolveNextNodeId(jumpCount, true);
    }

    const dest1 = ConduitDeck.generateDimensionForId(id1);
    const dest2 = ConduitDeck.generateDimensionForId(id2);

    return [
      { ...dest1, returnId: isFixedPoint ? null : id2 },
      { ...dest2, returnId: isFixedPoint ? null : id1 },
    ];
  },

  commitTrajectory(choice: Trajectory): { dimId: string; dimName: string } {
    if (choice.returnId && ConduitDeck.sectorBag) {
      ConduitDeck.sectorBag.push(choice.returnId);
      ConduitDeck.shuffleArray(ConduitDeck.sectorBag);
    }
    return { dimId: choice.id, dimName: choice.name };
  },

  serialize(): string[] {
    return ConduitDeck.sectorBag || [];
  },
};
