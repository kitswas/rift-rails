// Pure state→DOM render functions. No voyage/game logic here; main.ts owns state.
import { GAME_DATA } from "../game/data";
import type { Cutscene, GameAction, SaveState, Trajectory } from "../game/types";

const ids = GAME_DATA.dom.ids;
const cls = GAME_DATA.dom.classes;

export type DomRefs = Record<string, HTMLElement | null>;

export function cacheDom(root: ParentNode = document): DomRefs {
  const refs: DomRefs = {};
  for (const [key, id] of Object.entries(ids)) {
    refs[key] = root.querySelector<HTMLElement>(`#${id}`);
  }
  refs["panes"] = null;
  return refs;
}

export function getRefs(): DomRefs {
  return cacheDom(document);
}

function el(key: string): HTMLElement | null {
  const id = ids[key];
  return id ? document.getElementById(id) : null;
}

export function renderVitals(s: SaveState): void {
  const loc = el("locationName");
  if (loc) loc.textContent = GAME_DATA.text.formatDimName(s.dimName);
  const set = (key: string, v: string | number) => {
    const e = el(key);
    if (e) e.textContent = String(v);
  };
  set("statHull", GAME_DATA.text.formatPct(Math.floor(s.hull)));
  set("statFuel", Math.floor(s.fuel));
  set("statEnergy", GAME_DATA.text.formatStatPair(s.energy, GAME_DATA.config.START_ENERGY + s.engineTier));
  set("statFlux", Math.floor(s.flux));
  set("statRep", s.rep);
  set("statSector", GAME_DATA.text.formatSectorWaypoint(s.jumpCount));
  set("eqEngine", GAME_DATA.text.formatTier(s.engineTier));
  set("eqWeapon", GAME_DATA.text.formatTier(s.weaponTier));
  set("eqModule", s.module);
  set("eqCarriage", s.carriage);
  set("eqCrew", s.crew);
  const lt = el("locationType");
  if (lt) lt.textContent = GAME_DATA.text.formatDimType(s.dimId);
  const codex = el("dimTypeCodex");
  if (codex) codex.textContent = s.dimId;
}

export function renderActionButtons(s: SaveState, perms: { explore: boolean; travel: boolean }): void {
  const ex = el("btnExplore");
  if (ex) {
    ex.textContent = GAME_DATA.text.exploreName(s.dimId === "hub");
    (ex as HTMLButtonElement).disabled = !(perms.explore && s.energy > 0);
  }
  const cost = GAME_DATA.config.TRAVEL_BASE_FUEL_COST + s.engineTier * GAME_DATA.config.TRAVEL_TIER_MULT;
  const tr = el("btnTravel");
  if (tr) {
    tr.textContent = GAME_DATA.text.btnJump(cost);
    (tr as HTMLButtonElement).disabled = !(perms.travel && s.fuel >= cost);
  }
  const dp = el("btnDesperate");
  if (dp) {
    dp.style.display = s.fuel < cost && s.hull > GAME_DATA.config.DESPERATE_HULL_COST ? "block" : "none";
    dp.textContent = GAME_DATA.text.btnDesperate(GAME_DATA.config.DESPERATE_HULL_COST, GAME_DATA.config.DESPERATE_FUEL_YIELD);
  }
}

export function renderForge(s: SaveState, canForge: boolean): void {
  const fe = el("btnForgeEng") as HTMLButtonElement | null;
  if (fe) {
    fe.textContent = s.engineTier >= GAME_DATA.config.MAX_TIER
      ? GAME_DATA.text.btnApexEngine
      : GAME_DATA.text.btnForgeEngine((s.engineTier + 1) * 75, GAME_DATA.config.TRAVEL_TIER_MULT, GAME_DATA.config.TRAVEL_BASE_FUEL_COST + (s.engineTier + 1) * GAME_DATA.config.TRAVEL_TIER_MULT, s.fuel);
    fe.disabled = !canForge || s.flux < (s.engineTier + 1) * 75 || s.engineTier >= GAME_DATA.config.MAX_TIER;
  }
  const fw = el("btnForgeWpn") as HTMLButtonElement | null;
  if (fw) {
    fw.textContent = s.weaponTier >= GAME_DATA.config.MAX_TIER
      ? GAME_DATA.text.btnApexWeapon
      : GAME_DATA.text.btnForgeWeapon((s.weaponTier + 1) * 75);
    fw.disabled = !canForge || s.flux < (s.weaponTier + 1) * 75 || s.weaponTier >= GAME_DATA.config.MAX_TIER;
  }
  const lbl = el("lblForge");
  if (lbl) lbl.textContent = GAME_DATA.text.lblForge;
}

export function appendLog(text: string, styleClass = cls.logSystem): void {
  const log = el("storyLog");
  if (!log) return;
  const div = document.createElement("div");
  div.className = `${cls.logEntry} ${styleClass}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

export interface NodeLookup {
  getNode: (id: string) => { actions?: string[] } | undefined;
}

export function renderEncounterChoices(
  nodeId: string,
  actions: Record<string, GameAction>,
  onPick: (actId: string) => void,
  registry?: NodeLookup,
): void {
  const host = el("encounterChoices");
  if (!host) return;
  host.innerHTML = "";
  const nodeActions = registry?.getNode(nodeId)?.actions ?? GAME_DATA.nodes[nodeId]?.actions ?? [];
  for (const actId of nodeActions) {
    const act = actions[actId];
    if (!act) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = act.label;
    if (act.uiClass) b.className = act.uiClass;
    b.dataset.actId = actId;
    b.addEventListener("click", () => onPick(actId));
    host.appendChild(b);
  }
}

export function renderNavScreen(choices: Trajectory[], onPick: (t: Trajectory) => void): void {
  const screen = el("navScreen");
  if (screen) screen.style.display = "flex";
  const title = el("lblNavTitle");
  if (title) title.textContent = GAME_DATA.text.lblNavTitle;
  const host = el("navChoices");
  if (!host) return;
  host.innerHTML = "";
  for (const t of choices) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls.navBtn ?? "nav-btn";
    b.textContent = GAME_DATA.text.formatDimName(t.name);
    b.dataset.dimId = t.id;
    b.addEventListener("click", () => onPick(t));
    host.appendChild(b);
  }
}

export function hideNavScreen(): void {
  const screen = el("navScreen");
  if (screen) screen.style.display = "none";
}

export function renderCutscene(cut: Cutscene, beatIdx: number): void {
  const overlay = el("cutsceneOverlay");
  if (overlay) overlay.style.display = "flex";
  const beat = cut.beats[beatIdx];
  if (!beat) return;
  const body = el("cutsceneBody");
  if (body) body.textContent = beat.text;
  const prog = el("cutsceneProgress");
  if (prog) prog.textContent = GAME_DATA.text.formatCutsceneProgress(beatIdx + 1, cut.beats.length);
  const a = el("cutsceneBtnA") as HTMLButtonElement | null;
  if (a) a.textContent = beat.choiceA;
  const b = el("cutsceneBtnB") as HTMLButtonElement | null;
  if (b) b.textContent = beat.choiceB;
  const choices = el("cutsceneChoices");
  if (choices) choices.innerHTML = "";
}

export function hideCutscene(): void {
  const overlay = el("cutsceneOverlay");
  if (overlay) overlay.style.display = "none";
}

export function renderPanels(phase: string): void {
  const map: Record<string, string> = {
    SETTINGS: "paneSettings",
    SENSORS: "paneSensors",
    BRIDGE: "paneBridge",
    FORGE: "paneForge",
    MANUAL: "paneManual",
  };
  const target = map[phase ?? "BRIDGE"] ?? "paneBridge";
  for (const id of Object.values(map)) {
    const p = document.getElementById(id);
    if (p) p.style.display = id === target ? "block" : "none";
  }
}
