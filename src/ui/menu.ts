// Menu module: encounter/yard action menu rendering and sync.
import { GAME_DATA } from "../game/data";
import type { Registry } from "../game/registry";
import type { Voyage } from "../game/voyage";
import { el } from "./dom";

export interface MenuDeps {
  voyage: Pick<Voyage, "getSnapshot" | "getActualCost" | "canAffordAction">;
  registry: Pick<Registry, "getAction" | "getYardItem">;
}

export interface MenuModule {
  addMenuItem(
    label: string,
    onClick: () => void,
    uiClass?: string,
    actId?: string,
    yardId?: string,
  ): string;
  clearMenu(): void;
  syncActiveMenu(): void;
}

export function createMenu(deps: MenuDeps): MenuModule {
  const { voyage, registry } = deps;
  let menuSeq = 0;

  const addMenuItem = (
    label: string,
    onClick: () => void,
    uiClass?: string,
    actId?: string,
    yardId?: string,
  ): string => {
    const hostEl = el("encounter-choices");
    const id = actId ?? yardId ?? `menu-${menuSeq++}`;
    if (!hostEl) return id;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (uiClass) b.className = uiClass;
    if (actId) b.dataset.actId = actId;
    if (yardId) b.dataset.yardId = yardId;
    b.addEventListener("click", onClick);
    hostEl.appendChild(b);
    return id;
  };

  const clearMenu = (): void => {
    const h = el("encounter-choices");
    if (h) h.innerHTML = "";
  };

  const syncActiveMenu = (): void => {
    const hostEl = el("encounter-choices");
    if (!hostEl) return;
    const snap = voyage.getSnapshot();
    const encounter = GAME_DATA.phases.encounter ?? "ENCOUNTER";
    const yardCategory = GAME_DATA.phases.yard_category ?? "YARD_CATEGORY";
    if (snap.phase === encounter) {
      for (const node of Array.from(hostEl.children)) {
        const b = node as HTMLButtonElement;
        const actId = b.dataset.actId;
        if (!actId) continue;
        const act = registry.getAction(actId);
        if (!act) continue;
        const reqStrs: string[] = [];
        for (const [rKey, rVal] of Object.entries(act.requires ?? {})) {
          reqStrs.push(
            typeof rVal === "number"
              ? `Req: ${rVal} ${GAME_DATA.resources[rKey] ?? rKey}`
              : `Req: ${String(rVal)}`,
          );
        }
        const costStrs = act.consumes.map((rule) =>
          GAME_DATA.text.formatResVal(
            voyage.getActualCost(rule),
            GAME_DATA.resources[rule.res] ?? rule.res,
          ),
        );
        if (act.probability) {
          costStrs.push(
            GAME_DATA.text.formatChance(Math.floor(act.probability(snap, GAME_DATA.config) * 100)),
          );
        }
        const prodStrs = (act.produces ?? []).map((rule) =>
          GAME_DATA.text.formatResVal(
            rule.amount(snap, GAME_DATA.config),
            GAME_DATA.resources[rule.res] ?? rule.res,
          ),
        );
        b.textContent = GAME_DATA.text.formatActionBtn(act.label, costStrs, prodStrs, reqStrs);
        b.disabled = !voyage.canAffordAction(act);
      }
    } else if (snap.phase === yardCategory) {
      for (const node of Array.from(hostEl.children)) {
        const b = node as HTMLButtonElement;
        const yardId = b.dataset.yardId;
        if (!yardId) continue;
        const item = registry.getYardItem(yardId);
        if (!item) continue;
        let label = GAME_DATA.text.yardItemLabelMenu(item.name, item.desc, item.cost);
        const currentEq =
          (snap as unknown as Record<string, string>)[item.type] ?? GAME_DATA.text.noneState;
        if (currentEq === item.name) {
          label += `\n${GAME_DATA.text.yardOwned}`;
          b.disabled = true;
        } else {
          if (currentEq !== GAME_DATA.text.noneState)
            label += `\n${GAME_DATA.text.yardReplaceWarning(currentEq)}`;
          b.disabled = snap.flux < item.cost;
        }
        b.textContent = label;
      }
    }
  };

  return { addMenuItem, clearMenu, syncActiveMenu };
}
