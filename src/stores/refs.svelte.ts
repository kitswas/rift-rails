// Injected component refs: Svelte components own the DOM; services read
// bound elements from here instead of querying the document directly.
// Keys are actual DOM ids (GAME_DATA.dom.ids values).
export const domRefs = $state({
  byId: {} as Record<string, HTMLElement | null>,
});

export function bindRefs(map: Record<string, HTMLElement | null>): void {
  for (const [key, el] of Object.entries(map)) {
    domRefs.byId[key] = el;
  }
}

export function ref(id: string): HTMLElement | null {
  return domRefs.byId[id] ?? null;
}
