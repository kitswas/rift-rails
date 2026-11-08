// Open plugin ids: baseline strings remain usable, plugins can add more.
export type DimId = string;
export type NodeId = string;
export type ActionId = string;
export type YardKey = string;
export type CutsceneId = string;
export type ThemeId = string;
export type Phase = string;
export type NumericResource = string;
export type StringResource = string;
export type ResourceKey = string;
export type TierKey = "engineTier" | "weaponTier";

export interface Trajectory {
  id: DimId;
  name: string;
  returnId: string | null;
}

export interface SaveState {
  phase: Phase;
  jumpCount: number;
  sectorBag: string[];
  hull: number;
  fuel: number;
  flux: number;
  rep: number;
  energy: number;
  engineTier: number;
  weaponTier: number;
  module: string;
  carriage: string;
  crew: string;
  dimId: DimId;
  dimName: string;
  targetDimId: string | null;
  targetDimName: string | null;
  navChoices: Trajectory[];
  yardCat: string | null;
  seenCutscenes: string[];
  isSurveyed: boolean;
  pluginState: Record<string, unknown>;
}

export interface SerializedVoyage {
  jumpCount: number;
  sectorBag: string[];
  hull: number;
  fuel: number;
  flux: number;
  rep: number;
  energy: number;
  engineTier: number;
  weaponTier: number;
  module: string;
  carriage: string;
  crew: string;
  dimId: DimId;
  dimName: string;
  isSurveyed: boolean;
  seenCutscenes: string[];
  pluginState: Record<string, unknown>;
}

export interface CutsceneBeat {
  text: string;
  choiceA: string;
  choiceB: string;
}

export interface Cutscene {
  id: CutsceneId;
  beats: CutsceneBeat[];
  logSummary?: string;
}

export interface NavChoice {
  id: DimId;
  name: string;
}

export type GameConfig = {
  MAX_HULL: number;
  START_FUEL: number;
  START_ENERGY: number;
  MAX_TIER: number;
  DEATH_HULL_THRESHOLD: number;
  CRITICAL_HULL_THRESHOLD: number;
  STRANDED_HULL_THRESHOLD: number;
  MIN_FLUX_TO_BUY_FUEL: number;
  NAV_CHOICES_COUNT: number;
  TRAVEL_BASE_FUEL_COST: number;
  TRAVEL_TIER_MULT: number;
  FORGE_BASE_FLUX_COST: number;
  DESPERATE_HULL_COST: number;
  DESPERATE_FUEL_YIELD: number;
  EXO_DMG_MULT: number;
  GREENHOUSE_FUEL_YIELD: number;
  GOBLIN_HULL_YIELD: number;
  ORC_WPN_BONUS: number;
  HUNT_WPN_MULT: number;
  HUNT_SOLITARY_ENERGY: number;
  HUNT_SOLITARY_WIN_RATE: number;
  HUNT_SOLITARY_FLUX: number;
  HUNT_SOLITARY_FUEL: number;
  HUNT_SOLITARY_HULL_DMG: number;
  HUNT_PACK_ENERGY: number;
  HUNT_PACK_WIN_RATE: number;
  HUNT_PACK_FLUX: number;
  HUNT_DEEP_ENERGY: number;
  HUNT_DEEP_WIN_RATE: number;
  HUNT_DEEP_FLUX: number;
  HUNT_DEEP_FUEL: number;
  HUNT_DEEP_HULL_DMG: number;
  HUNT_DEEP_WPN_REQ: number;
  RES_SIPHON_ENERGY: number;
  RES_SIPHON_FUEL: number;
  RES_HARVEST_ENERGY: number;
  RES_HARVEST_FLUX: number;
  RES_DRILL_ENERGY: number;
  RES_DRILL_HULL_DMG: number;
  RES_DRILL_FLUX: number;
  MAZE_BLAST_ENERGY: number;
  MAZE_BLAST_BASE_DMG: number;
  MAZE_BLAST_TIER_REDUC: number;
  MAZE_BLAST_FLUX: number;
  MAZE_MAP_ENERGY: number;
  MAZE_MAP_FUEL_YIELD: number;
  MAZE_MAP_FLUX_YIELD: number;
  HUB_REST_FLUX_COST: number;
  HUB_REST_HULL_YIELD: number;
  HUB_FUEL_BASE_COST: number;
  HUB_FUEL_TIER_COST: number;
  HUB_FUEL_JUMPS_RESTORED: number;
  HUB_EASY_FUEL_COST: number;
  HUB_EASY_FLUX_YIELD: number;
  HUB_EASY_REP_YIELD: number;
  HUB_HARD_REP_REQ: number;
  HUB_HARD_FUEL_COST: number;
  HUB_HARD_FLUX_YIELD: number;
  WAYPOINT_HUB_INTERVAL: number;
  JUMP_CHARGE_MS: number;
  JUMP_TOTAL_MS: number;
  CORVUS_FINAL_CUTSCENE: string;
  FX_STAR_COUNT: number;
  FX_VIBRATE_PATTERN: number[];
};

export interface AudioConfig {
  chargeRumbleStartFreq: number;
  chargeRumbleEndFreq: number;
  chargeBandpassStartFreq: number;
  chargeBandpassEndFreq: number;
  chargeBandpassQ: number;
  chargeWhistleStartFreq: number;
  chargeWhistleEndFreq: number;
  chimeNoteStart: number;
  chimeNoteEnd: number;
  dialogueChimeFreq: number;
  LOG_AUDIO_EXPONENT: number;
}

export interface ProceduralTheme {
  key?: string;
  primary: string;
  secondary: string;
  glyph: string;
  bg: string;
}

export interface NodeDefinition {
  id: NodeId;
  label: string;
  desc: string;
  exploreCost: number;
  isHub: boolean;
  actions: ActionId[];
}

export interface YardItem {
  name: string;
  type: StringResource;
  cost: number;
  desc: string;
}

export interface ActionRule {
  res: NumericResource;
  amount: (s: SaveState, c: GameConfig) => number;
}

export interface GameAction {
  label: string;
  uiClass?: string;
  isMenu?: boolean;
  menuTarget?: Phase;
  requires: Partial<Record<ResourceKey, number | string>>;
  consumes: ActionRule[];
  produces?: ActionRule[];
  failConsumes?: ActionRule[];
  probability?: (s: SaveState, c: GameConfig) => number;
  logSuccess?: string;
  logFail?: string;
}

export interface TextStrings {
  initLog: string;
  lblForge: string;
  lblNavTitle: string;
  btnIgnite: string;
  btnNewGame: string;
  noneState: string;
  formatTier: (val: number) => string;
  formatPct: (val: number) => string;
  formatStatPair: (val: number, max: number) => string;
  formatDimName: (name: string) => string;
  formatDimType: (type: string) => string;
  formatSectorWaypoint: (jump: number) => string;
  exploreName: (isHub: boolean) => string;
  btnExploreClosed: (cost: number) => string;
  btnExploreHub: (cost: number) => string;
  tutorialExplore: (isHub: boolean, cost: number) => string;
  formatCutsceneProgress: (beat: number, total: number) => string;
  btnJump: (cost: number) => string;
  btnDesperate: (cost: number, yieldAmount: number) => string;
  btnForgeEngine: (cost: number, tierMult: number, nextJumpCost: number, curFuel: number) => string;
  btnForgeWeapon: (cost: number) => string;
  btnApexEngine: string;
  btnApexWeapon: string;
  btnYardModules: string;
  btnYardCarriages: string;
  btnYardCrew: string;
  btnYardLeave: string;
  btnYardBack: string;
  yardItemLabelMenu: (name: string, desc: string, cost: number) => string;
  yardReplaceWarning: (currentEq: string) => string;
  yardOwned: string;
  logYardPurchase: (name: string) => string;
  logLocEnter: (name: string, label: string, jump: number) => string;
  logEncounterTitle: (label: string, desc: string) => string;
  logGreenhouse: (yieldAmount: number) => string;
  logGoblin: (yieldAmount: number) => string;
  logDesperate: string;
  logDead: string;
  logStranded: string;
  logInsuffEnergy: string;
  formatActionBtn: (
    label: string,
    costStrs: string[],
    prodStrs: string[],
    reqStrs?: string[],
  ) => string;
  formatResVal: (val: number, resName: string) => string;
  formatChance: (pct: number) => string;
}

export interface GameData {
  config: GameConfig;
  audio: AudioConfig;
  runway: DimId[];
  sectorPoolCounts: Partial<Record<DimId, number>>;
  resources: Record<ResourceKey, string>;
  phases: Record<string, Phase>;
  transitions: Record<string, Phase[]>;
  permissions: Record<string, { explore: boolean; travel: boolean; forge: boolean }>;
  dom: {
    classes: Record<string, string>;
    ids: Record<string, string>;
  };
  cutscenes: Record<CutsceneId, Cutscene>;
  text: TextStrings;
  glossary: Record<string, string>;
  procedural: {
    adjectives: string[];
    nouns: Record<DimId, string[]>;
    themes: Record<string, ProceduralTheme>;
    defaultTheme: ProceduralTheme;
  };
  nodes: Record<NodeId, NodeDefinition>;
  yard: Record<YardKey, YardItem>;
  actions: Record<ActionId, GameAction>;
}

export interface MotionEntry {
  value: number;
  target: number;
  velocity: number;
  stiffness?: number;
  damping?: number;
  update?: (value: number, done?: number) => void;
  active?: boolean;
  last?: number;
}

export type AmbientMode = "rails" | "telemetry" | "none";

export interface AudioPrefs {
  mode?: AmbientMode;
  ambientSlider?: number;
  sfxSlider?: number;
  muted?: boolean;
}

export interface StateHook {
  onEnter?: () => void;
  onExit?: () => void;
}
