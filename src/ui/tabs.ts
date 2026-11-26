// Tabs module: snap-slider pane scrolling and tab activation.
import { el } from "./dom";

export const paneIds = [
  "pane-settings",
  "pane-sensors",
  "pane-bridge",
  "pane-forge",
  "pane-manual",
];
export const tabIds = ["tab-settings", "tab-sensors", "tab-bridge", "tab-forge", "tab-manual"];

export function getPanes(): HTMLElement[] {
  return paneIds
    .map((id) => document.getElementById(id))
    .filter((e): e is HTMLElement => e !== null);
}
export function getTabs(): HTMLElement[] {
  return tabIds
    .map((id) => document.getElementById(id))
    .filter((e): e is HTMLElement => e !== null);
}
export const onScrollToPane = (index: number): void => {
  const container = el("snap-slider");
  const panes = getPanes();
  const target = panes[index];
  if (!container || !target) return;
  if (window.innerWidth >= 900) {
    const targetLeft = target.offsetLeft - container.offsetLeft;
    const targetCenter = targetLeft + target.offsetWidth / 2;
    const scrollPos = targetCenter - container.clientWidth / 2;
    container.scrollTo({ left: scrollPos, behavior: "smooth" });
  } else {
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
};
export const onSyncTabs = (): void => {
  const container = el("snap-slider");
  const panes = getPanes();
  const tabs = getTabs();
  if (!container || panes.length === 0) return;
  const containerCenter = container.scrollLeft + container.clientWidth / 2;
  let closestIdx = 0;
  let minDiff = Infinity;
  panes.forEach((pane, idx) => {
    const paneCenter = pane.offsetLeft - container.offsetLeft + pane.offsetWidth / 2;
    const diff = Math.abs(containerCenter - paneCenter);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  tabs.forEach((tab, i) => {
    const active = i === closestIdx;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  });
};
