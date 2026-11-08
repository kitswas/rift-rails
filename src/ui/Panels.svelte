<script lang="ts">
  import { Engine } from "../game/engine";
  import { sensors } from "../stores/sensors.svelte";
  import { SoundFX } from "../game/audio";
  import { GAME_DATA } from "../game/data";
  import { settings } from "../stores/settings.svelte";

  function onAmbient(e: Event): void {
    const target = e.target as HTMLSelectElement;
    const mode = target.value as "rails" | "telemetry" | "none";
    SoundFX.setAmbientMode(mode);
    settings.ambientMode = mode;
    Engine.log(
      `[ACOUSTICS] Soundscape shifted to: ${target.options[target.selectedIndex]?.text ?? target.value}`,
      GAME_DATA.dom.classes.logSystem!,
    );
  }
  function onAmbientVol(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    settings.ambientSlider = val;
    SoundFX.setAmbientVolume(val);
  }
  function onSfxVol(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    settings.sfxSlider = val;
    SoundFX.setSfxVolume(val);
  }
  function toggleMute(): void {
    settings.isMuted = SoundFX.toggleMute();
  }
</script>

<div class="pane" id="pane-settings">
  <div class="panel-card">
    <h2>Conduit Settings</h2>
    <div class="settings-content">
      <div class="settings-section">
        <h3 style="color: var(--action); letter-spacing: 1px">[ ACOUSTIC LEY SOUNDSCAPES ]</h3>
        <div class="audio-control-row">
          <label for="select-ambient-mode">Soundscape</label>
          <select id="select-ambient-mode" class="audio-select" onchange={onAmbient}>
            <option value="rails" selected={settings.ambientMode === "rails"}>Ley-Rail Rhythm (Kinetic)</option>
            <option value="telemetry" selected={settings.ambientMode === "telemetry"}>Bridge Telemetry (Lo-Fi)</option>
            <option value="none" selected={settings.ambientMode === "none"}>Mute Ambient (Off)</option>
          </select>
        </div>
        <div class="audio-control-row">
          <label for="slider-ambient-vol">Ambient Vol</label>
          <input
            type="range"
            id="slider-ambient-vol"
            class="audio-slider"
            min="0"
            max="100"
            value={settings.ambientSlider}
            oninput={onAmbientVol}
          />
          <span id="lbl-ambient-vol">{settings.ambientSlider}%</span>
        </div>
        <div class="audio-control-row">
          <label for="slider-sfx-vol">Subsystem SFX</label>
          <input
            type="range"
            id="slider-sfx-vol"
            class="audio-slider"
            min="0"
            max="100"
            value={settings.sfxSlider}
            oninput={onSfxVol}
          />
          <span id="lbl-sfx-vol">{settings.sfxSlider}%</span>
        </div>
        <button id="btn-toggle-mute" class="btn-action" style="margin-top: 8px" onclick={toggleMute}>
          Mute Audio: {settings.isMuted ? "ON" : "OFF"}
        </button>
      </div>
      <div class="settings-section">
        <h3 style="color: var(--success); letter-spacing: 1px">[ LOCAL ARCHIVE // ONLINE ]</h3>
        <p>
          <b>Auto-Save Status:</b> Active. Voyage telemetry is automatically stored to your conduit
          after every Rift Jump.
        </p>
        <p style="font-size: 0.85em; color: var(--text-muted); margin-top: 6px">
          Catastrophic breaches or void-stranding automatically clear the archive for subsequent
          journeys.
        </p>
        <button id="btn-reset-save" class="btn-new-game" style="margin-top: 14px" onclick={() => Engine.resetGame(true)}>
          {settings.resetLabel}
        </button>
      </div>
    </div>
  </div>
</div>

<div class="pane" id="pane-sensors">
  <div class="panel-card">
    <h2>Sensors & Telemetry</h2>
    <div id="art-display">
      {#if sensors.artDisplay}
        {@html sensors.artDisplay}
      {:else}
        <div id="art-glyph">:: SCANNING ::</div>
        <span id="art-label">SIGNAL LOCKED</span>
      {/if}
    </div>
    <h2>Atmospheric Reading</h2>
    <div class="telemetry-grid">
      <div class="hud-cell" onclick={() => Engine.inspect("rep")}>
        <span>Reputation</span>
        <span id="stat-rep"></span>
      </div>
      <div class="hud-cell" onclick={() => Engine.inspect("node")}>
        <span>Sector Node</span>
        <span id="dim-type-codex"></span>
      </div>
    </div>
  </div>
</div>


