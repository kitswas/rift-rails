import { DioramaPipeline } from "../game/art";
import { VoyageSession } from "../game/session";
import { syncVoyage, voyage } from "./voyage.svelte";

// Art-bridge store: DioramaPipeline markup for the current dimension,
// gated by survey state. Engine.renderSensors() now delegates to syncSensors;
// Sensors component renders bridgeScene + artDisplay via @html.
export const sensors = $state({
  bridgeArtwork: "",
  artDisplay: "",
  isSurveyed: false,
  dimName: "",
});

export function syncSensors(): void {
  syncVoyage();
  const snap = voyage.snap ?? VoyageSession.getSnapshot();
  const dimName = snap.dimName;
  const isSurveyed = !!snap.isSurveyed;
  if (dimName !== sensors.dimName) {
    sensors.bridgeArtwork = "";
    sensors.dimName = dimName;
  }
  sensors.isSurveyed = isSurveyed;
  const markup = DioramaPipeline.render(dimName, (asyncArtwork) => {
    const current = VoyageSession.getSnapshot();
    if (asyncArtwork && current.dimName === dimName) {
      sensors.bridgeArtwork = asyncArtwork;
      if (current.isSurveyed) sensors.artDisplay = asyncArtwork;
    }
  });
  if (markup) sensors.bridgeArtwork = markup;
  if (isSurveyed) {
    if (markup) sensors.artDisplay = markup;
  }
}
