import { VoyageSession } from "../game/session";
import type { SaveState } from "../game/types";

// Reactive shell over the pure VoyageSession core. The session stays the
// single source of truth for save semantics; this store mirrors its
// snapshot for Svelte reactivity without duplicating rules.
export const voyage = $state({
  snap: null as SaveState | null,
  departed: false,
});

export function syncVoyage(): void {
  voyage.snap = VoyageSession.getSnapshot();
  voyage.departed = VoyageSession.hasObserverDeparted();
}

export function resetVoyageStore(): void {
  VoyageSession.resetState();
  syncVoyage();
}
