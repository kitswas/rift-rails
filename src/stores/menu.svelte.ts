import { VoyageSession } from "../game/session";
import { GAME_DATA } from "../game/data";
import type { ActionId, YardKey } from "../game/types";

export interface MenuItem {
  id: string;
  label: string;
  disabled: boolean;
  uiClass?: string;
  actId?: ActionId;
  yardId?: YardKey;
  onClick: () => void;
}

export const menu = $state({
  items: [] as MenuItem[],
});

const handlers = new Map<string, () => void>();
let seq = 0;

export function clearMenu(): void {
  menu.items = [];
  handlers.clear();
}

export function addMenuItem(
  label: string,
  onClick: () => void,
  uiClass?: string,
  actId?: ActionId,
  yardId?: YardKey,
): string {
  const id = `m${++seq}`;
  handlers.set(id, onClick);
  const item: MenuItem = { id, label, disabled: false, uiClass, actId, yardId, onClick };
  menu.items = [...menu.items, item];
  return id;
}

function actionLabel(actId: ActionId): { label: string; disabled: boolean } {
  const act = GAME_DATA.actions[actId]!;
  const snap = VoyageSession.getSnapshot();
  const meets = VoyageSession.canAffordAction(act);
  const reqStrs: string[] = [];
  for (const [rKey, rVal] of Object.entries(act.requires || {})) {
    const label = GAME_DATA.resources[rKey as keyof typeof GAME_DATA.resources];
    reqStrs.push(typeof rVal === "number" ? `Req: ${rVal} ${label}` : `Req: ${String(rVal)}`);
  }
  const costStrs = act.consumes.map((rule) =>
    GAME_DATA.text.formatResVal(VoyageSession.getActualCost(rule), GAME_DATA.resources[rule.res]),
  );
  if (act.probability) {
    costStrs.push(
      GAME_DATA.text.formatChance(Math.floor(act.probability(snap, GAME_DATA.config) * 100)),
    );
  }
  const prodStrs = (act.produces || []).map((rule) =>
    GAME_DATA.text.formatResVal(rule.amount(snap, GAME_DATA.config), GAME_DATA.resources[rule.res]),
  );
  return {
    label: GAME_DATA.text.formatActionBtn(act.label, costStrs, prodStrs, reqStrs),
    disabled: !meets,
  };
}

function yardLabel(yardId: YardKey): { label: string; disabled: boolean } {
  const item = GAME_DATA.yard[yardId];
  const snap = VoyageSession.getSnapshot();
  let label = GAME_DATA.text.yardItemLabelMenu(item.name, item.desc, item.cost);
  const currentEq = String(snap[item.type] ?? "");
  let disabled = false;
  if (currentEq === item.name) {
    label += `\n${GAME_DATA.text.yardOwned}`;
    disabled = true;
  } else {
    if (currentEq !== GAME_DATA.text.noneState)
      label += `\n${GAME_DATA.text.yardReplaceWarning(currentEq)}`;
    if (snap.flux < item.cost) disabled = true;
  }
  return { label, disabled };
}

export function syncActiveMenu(): void {
  const snap = VoyageSession.getSnapshot();
  if (snap.phase === GAME_DATA.phases.encounter) {
    menu.items = menu.items.map((item) => {
      if (!item.actId) return item;
      const act = GAME_DATA.actions[item.actId];
      if (!act) return { ...item, disabled: true };
      const { label, disabled } =
        act.isMenu && item.label !== "" && item.label !== act.label
          ? { label: item.label, disabled: item.disabled }
          : actionLabel(item.actId);
      // Menu buttons (yard_root switch) keep static labels; action buttons refresh.
      if (act.isMenu) return item;
      return { ...item, label, disabled };
    });
  } else if (snap.phase === GAME_DATA.phases.yard_category) {
    menu.items = menu.items.map((item) => {
      if (!item.yardId) return item;
      const { label, disabled } = yardLabel(item.yardId);
      return { ...item, label, disabled };
    });
  }
}

export function invokeMenuItem(id: string): void {
  handlers.get(id)?.();
}
