import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPanes, getTabs, onScrollToPane, onSyncTabs, paneIds, tabIds } from "../src/ui/tabs";

function seed(full = true): void {
  const panes = paneIds.map((id) => `<div id="${id}"></div>`).join("");
  const tabs = tabIds.map((id) => `<button id="${id}"></button>`).join("");
  document.body.innerHTML = `<div id="snap-slider">${panes}</div>${tabs}`;
  if (!full) {
    document.getElementById("pane-forge")?.remove();
    document.getElementById("tab-forge")?.remove();
  }
}

describe("tabs", () => {
  beforeEach(() => seed());

  it("finds all five panes and tabs", () => {
    expect(getPanes()).toHaveLength(5);
    expect(getTabs()).toHaveLength(5);
  });

  it("filters out missing elements", () => {
    seed(false);
    expect(getPanes()).toHaveLength(4);
    expect(getTabs()).toHaveLength(4);
  });

  it("activates the first tab when all panes sit at zero offset", () => {
    onSyncTabs();
    const tabs = getTabs();
    expect(tabs[0]!.classList.contains("active")).toBe(true);
    expect(tabs[0]!.getAttribute("aria-current")).toBe("true");
    for (const tab of tabs.slice(1)) {
      expect(tab.classList.contains("active")).toBe(false);
      expect(tab.getAttribute("aria-current")).toBeNull();
    }
  });

  it("scrolls the target pane into view on narrow screens", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    const pane = document.getElementById("pane-sensors")!;
    const scrollIntoView = vi.fn();
    pane.scrollIntoView = scrollIntoView as unknown as HTMLElement["scrollIntoView"];
    onScrollToPane(1);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    Object.defineProperty(window, "innerWidth", { value: original, configurable: true });
  });
});
