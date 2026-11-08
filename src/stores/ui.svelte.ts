import { VoyageSession } from "../game/session";
import { GAME_DATA } from "../game/data";
import { voyage, syncVoyage } from "./voyage.svelte";

// Derived view model for Engine.updateUI sections (vitals, interactive
// controls, forge). Engine.updateUI() now just calls syncUI(); Svelte
// components own the DOM. IDs are preserved in the components.
export const ui = $state({
  hull: "",
  fuel: "",
  energy: "",
  flux: "",
  rep: "",
  sector: "",
  engineTier: "",
  weaponTier: "",
  module: "",
  carriage: "",
  crew: "",
  locationName: "",
  locationType: "",
  dimTypeCodex: "",
  hullColor: "var(--success)",
  fuelColor: "var(--action)",
  energyColor: "var(--energy)",
  exploreLabel: "",
  exploreDisabled: true,
  travelLabel: "",
  travelDisabled: true,
  desperateLabel: "",
  desperateVisible: false,
  forgeEngineLabel: "",
  forgeEngineDisabled: true,
  forgeWeaponLabel: "",
  forgeWeaponDisabled: true,
});

export function syncUI(): void {
  syncVoyage();
  const snap = voyage.snap ?? VoyageSession.getSnapshot();
  const travelCost = VoyageSession.getTravelCost();
  const node = GAME_DATA.nodes[snap.dimId];
  const perms = GAME_DATA.permissions[snap.phase]!;

  ui.hull = GAME_DATA.text.formatPct(Math.floor(snap.hull));
  ui.fuel = String(Math.floor(snap.fuel));
  ui.energy = GAME_DATA.text.formatStatPair(snap.energy, VoyageSession.getMaxEnergy());
  ui.flux = String(Math.floor(snap.flux));
  ui.rep = String(snap.rep);
  ui.sector = GAME_DATA.text.formatSectorWaypoint(snap.jumpCount);
  ui.engineTier = GAME_DATA.text.formatTier(snap.engineTier);
  ui.weaponTier = GAME_DATA.text.formatTier(snap.weaponTier);
  ui.module = snap.module;
  ui.carriage = snap.carriage;
  ui.crew = snap.crew;
  ui.locationName = GAME_DATA.text.formatDimName(snap.dimName);
  ui.locationType = GAME_DATA.text.formatDimType(GAME_DATA.nodes[snap.dimId].label);
  ui.dimTypeCodex = GAME_DATA.nodes[snap.dimId].label;
  ui.hullColor =
    snap.hull <= GAME_DATA.config.CRITICAL_HULL_THRESHOLD ? "var(--danger)" : "var(--success)";
  ui.fuelColor = snap.fuel < travelCost ? "var(--danger)" : "var(--action)";
  ui.energyColor = snap.energy === 0 ? "var(--warning)" : "var(--energy)";

  ui.exploreLabel = node.isHub
    ? GAME_DATA.text.btnExploreHub(node.exploreCost)
    : GAME_DATA.text.btnExploreClosed(node.exploreCost);
  ui.exploreDisabled = !perms.explore || snap.energy < node.exploreCost;
  ui.travelLabel = GAME_DATA.text.btnJump(travelCost);
  ui.travelDisabled = !perms.travel || snap.fuel < travelCost;
  ui.desperateLabel = GAME_DATA.text.btnDesperate(
    GAME_DATA.config.DESPERATE_HULL_COST,
    GAME_DATA.config.DESPERATE_FUEL_YIELD,
  );
  ui.desperateVisible =
    snap.fuel < travelCost && snap.hull > GAME_DATA.config.DESPERATE_HULL_COST && !!perms.travel;

  const fEngCost = VoyageSession.getForgeCost(snap.engineTier);
  const fWpnCost = VoyageSession.getForgeCost(snap.weaponTier);
  const nextJumpCost = VoyageSession.getNextTierTravelCost();
  ui.forgeEngineLabel =
    snap.engineTier >= GAME_DATA.config.MAX_TIER
      ? GAME_DATA.text.btnApexEngine
      : GAME_DATA.text.btnForgeEngine(
          fEngCost,
          GAME_DATA.config.TRAVEL_TIER_MULT,
          nextJumpCost,
          snap.fuel,
        );
  ui.forgeEngineDisabled =
    !perms.forge || snap.flux < fEngCost || snap.engineTier >= GAME_DATA.config.MAX_TIER;
  ui.forgeWeaponLabel =
    snap.weaponTier >= GAME_DATA.config.MAX_TIER
      ? GAME_DATA.text.btnApexWeapon
      : GAME_DATA.text.btnForgeWeapon(fWpnCost);
  ui.forgeWeaponDisabled =
    !perms.forge || snap.flux < fWpnCost || snap.weaponTier >= GAME_DATA.config.MAX_TIER;
}
