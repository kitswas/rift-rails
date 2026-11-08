import { GAME_DATA } from "./data";
import { SaveSystem } from "./save";
import { VoyageSession } from "./session";
import type { AmbientMode } from "./types";

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export const SoundFX = {
  ctx: null as AudioContext | null,
  masterGain: null as GainNode | null,
  ambientGain: null as GainNode | null,
  sfxGain: null as GainNode | null,
  isMuted: false,
  ambientSliderVal: 100,
  sfxSliderVal: 100,
  ambientVolume: 1.0,
  sfxVolume: 1.0,
  ambientMode: "rails" as AmbientMode,
  currentThemeKey: "Fractured",

  railsTimer: null as number | null,
  railsStep: 0,
  telemetryTimer: null as number | null,

  sliderToGain(sliderVal: number): number {
    const clamped = Math.max(0, Math.min(100, sliderVal));
    if (clamped <= 0) return 0;
    return Math.pow(clamped / 100, GAME_DATA.audio.LOG_AUDIO_EXPONENT);
  },

  init(): void {
    if (!SoundFX.ctx) {
      const AudioContextCtor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (AudioContextCtor) {
        SoundFX.ctx = new AudioContextCtor();

        SoundFX.masterGain = SoundFX.ctx.createGain();
        SoundFX.masterGain.gain.setValueAtTime(SoundFX.isMuted ? 0 : 1.0, SoundFX.ctx.currentTime);
        SoundFX.masterGain.connect(SoundFX.ctx.destination);

        SoundFX.sfxGain = SoundFX.ctx.createGain();
        SoundFX.sfxGain.gain.setValueAtTime(SoundFX.sfxVolume, SoundFX.ctx.currentTime);
        SoundFX.sfxGain.connect(SoundFX.masterGain);

        SoundFX.ambientGain = SoundFX.ctx.createGain();
        SoundFX.ambientGain.gain.setValueAtTime(SoundFX.ambientVolume, SoundFX.ctx.currentTime);
        SoundFX.ambientGain.connect(SoundFX.masterGain);

        SoundFX.startActiveSoundscape();
      }
    }
    if (SoundFX.ctx && SoundFX.ctx.state === "suspended") {
      void SoundFX.ctx.resume();
    }
  },

  stopAllAmbient(): void {
    if (SoundFX.railsTimer !== null) clearInterval(SoundFX.railsTimer);
    if (SoundFX.telemetryTimer !== null) clearTimeout(SoundFX.telemetryTimer);
  },

  startActiveSoundscape(): void {
    if (!SoundFX.ctx || !SoundFX.ambientGain) return;
    SoundFX.stopAllAmbient();

    const phase = VoyageSession.getPhase();
    if (
      phase === GAME_DATA.phases.dead ||
      phase === GAME_DATA.phases.stranded ||
      SoundFX.ambientMode === "none"
    ) {
      return;
    }

    switch (SoundFX.ambientMode) {
      case "rails":
        SoundFX.startRailsEngine();
        break;
      case "telemetry":
        SoundFX.startTelemetryEngine();
        break;
    }
  },

  setAmbientMode(mode: AmbientMode): void {
    SoundFX.ambientMode = mode;
    SaveSystem.saveAudioPrefs();
    if (SoundFX.ctx) SoundFX.startActiveSoundscape();
  },

  setAmbientVolume(sliderVal: number): void {
    SoundFX.ambientSliderVal = sliderVal;
    SoundFX.ambientVolume = SoundFX.sliderToGain(sliderVal);
    SaveSystem.saveAudioPrefs();
    if (SoundFX.ambientGain && SoundFX.ctx) {
      SoundFX.ambientGain.gain.setTargetAtTime(
        SoundFX.ambientVolume,
        SoundFX.ctx.currentTime,
        0.05,
      );
    }
  },

  setSfxVolume(sliderVal: number): void {
    SoundFX.sfxSliderVal = sliderVal;
    SoundFX.sfxVolume = SoundFX.sliderToGain(sliderVal);
    SaveSystem.saveAudioPrefs();
    if (SoundFX.sfxGain && SoundFX.ctx) {
      SoundFX.sfxGain.gain.setTargetAtTime(SoundFX.sfxVolume, SoundFX.ctx.currentTime, 0.05);
    }
  },

  toggleMute(): boolean {
    SoundFX.isMuted = !SoundFX.isMuted;
    SaveSystem.saveAudioPrefs();
    if (SoundFX.masterGain && SoundFX.ctx) {
      SoundFX.masterGain.gain.setTargetAtTime(
        SoundFX.isMuted ? 0 : 1,
        SoundFX.ctx.currentTime,
        0.05,
      );
    }
    return SoundFX.isMuted;
  },

  startRailsEngine(): void {
    SoundFX.railsStep = 0;
    const interval = 195;

    SoundFX.railsTimer = window.setInterval(() => {
      if (!SoundFX.ctx) return;
      if (SoundFX.railsStep === 0) SoundFX.playRailClick(true);
      else if (SoundFX.railsStep === 1) SoundFX.playRailClick(false);
      else if (SoundFX.railsStep === 2) SoundFX.playRailClick(true);

      SoundFX.railsStep = (SoundFX.railsStep + 1) % 4;
    }, interval);
  },

  playRailClick(isAccent: boolean): void {
    if (!SoundFX.ctx || !SoundFX.ambientGain) return;
    const now = SoundFX.ctx.currentTime;

    const osc = SoundFX.ctx.createOscillator();
    const filter = SoundFX.ctx.createBiquadFilter();
    const gain = SoundFX.ctx.createGain();

    osc.type = isAccent ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isAccent ? 140 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.025);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isAccent ? 850 : 420, now);

    gain.gain.setValueAtTime(isAccent ? 0.055 : 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(SoundFX.ambientGain);

    osc.start(now);
    osc.stop(now + 0.04);
  },

  startTelemetryEngine(): void {
    const scheduleNext = (): void => {
      const delay = 140 + Math.random() * 680;
      SoundFX.telemetryTimer = window.setTimeout(() => {
        SoundFX.playTelemetryBlip();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  },

  playTelemetryBlip(): void {
    if (!SoundFX.ctx || !SoundFX.ambientGain) return;
    const now = SoundFX.ctx.currentTime;
    const isPing = Math.random() < 0.22;

    const osc = SoundFX.ctx.createOscillator();
    const gain = SoundFX.ctx.createGain();

    if (isPing) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1750 + Math.random() * 950, now);
      gain.gain.setValueAtTime(0.016, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.04);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(45, now);
      gain.gain.setValueAtTime(0.014, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.004);
      osc.start(now);
      osc.stop(now + 0.006);
    }

    osc.connect(gain);
    gain.connect(SoundFX.ambientGain);
  },

  updateAmbientTheme(adjective: string): void {
    SoundFX.currentThemeKey = adjective;
  },

  duckAmbientForJump(durationSec: number): void {
    if (!SoundFX.ctx || !SoundFX.ambientGain) return;
    const now = SoundFX.ctx.currentTime;
    SoundFX.ambientGain.gain.setValueAtTime(SoundFX.ambientGain.gain.value, now);
    SoundFX.ambientGain.gain.linearRampToValueAtTime(0.02, now + durationSec * 0.4);
    SoundFX.ambientGain.gain.linearRampToValueAtTime(SoundFX.ambientVolume, now + durationSec);
  },

  silenceOnDeath(): void {
    SoundFX.stopAllAmbient();
    if (!SoundFX.ctx || !SoundFX.ambientGain) return;
    const now = SoundFX.ctx.currentTime;
    SoundFX.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 1.5);
  },

  playJumpCharge(breachSec: number): void {
    if (!SoundFX.ctx) return;
    SoundFX.duckAmbientForJump(breachSec + 0.6);
    const now = SoundFX.ctx.currentTime;

    const osc1 = SoundFX.ctx.createOscillator();
    const gain1 = SoundFX.ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(GAME_DATA.audio.chargeRumbleStartFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeRumbleEndFreq,
      now + breachSec,
    );

    gain1.gain.setValueAtTime(0.01, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + breachSec * 0.9);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);

    const filter = SoundFX.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(GAME_DATA.audio.chargeBandpassStartFreq, now);
    filter.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeBandpassEndFreq,
      now + breachSec,
    );
    filter.Q.setValueAtTime(GAME_DATA.audio.chargeBandpassQ, now);

    osc1.connect(filter);
    filter.connect(gain1);
    gain1.connect(SoundFX.sfxGain!);

    const osc2 = SoundFX.ctx.createOscillator();
    const gain2 = SoundFX.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(GAME_DATA.audio.chargeWhistleStartFreq, now);
    osc2.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeWhistleEndFreq,
      now + breachSec,
    );

    gain2.gain.setValueAtTime(0.01, now);
    gain2.gain.linearRampToValueAtTime(0.14, now + breachSec * 0.9);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);

    osc2.connect(gain2);
    gain2.connect(SoundFX.sfxGain!);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + breachSec + 0.05);
    osc2.stop(now + breachSec + 0.05);
  },

  playArrivalChime(): void {
    if (!SoundFX.ctx) return;
    const now = SoundFX.ctx.currentTime;
    const osc = SoundFX.ctx.createOscillator();
    const gain = SoundFX.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(GAME_DATA.audio.chimeNoteStart, now);
    osc.frequency.exponentialRampToValueAtTime(GAME_DATA.audio.chimeNoteEnd, now + 0.08);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(SoundFX.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.55);
  },

  playDialogueChime(): void {
    if (!SoundFX.ctx) return;
    const now = SoundFX.ctx.currentTime;
    const osc = SoundFX.ctx.createOscillator();
    const gain = SoundFX.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(GAME_DATA.audio.dialogueChimeFreq, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(SoundFX.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.22);
  },

  playActionSuccess(): void {
    if (!SoundFX.ctx || SoundFX.isMuted) return;
    try {
      const now = SoundFX.ctx.currentTime;
      const osc = SoundFX.ctx.createOscillator();
      const gain = SoundFX.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.06);
      osc.frequency.setValueAtTime(783.99, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(SoundFX.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  },

  playActionDamage(): void {
    if (!SoundFX.ctx || SoundFX.isMuted) return;
    try {
      const now = SoundFX.ctx.currentTime;
      const osc = SoundFX.ctx.createOscillator();
      const gain = SoundFX.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(SoundFX.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  },
};
