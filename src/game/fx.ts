import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import type { ProceduralTheme } from "./types";

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
  angle: number;
  colorShift: number;
}

export const TransitionFX = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  animId: 0,
  stars: [] as Star[],
  running: false,

  init(): void {
    TransitionFX.canvas = document.getElementById(GAME_DATA.dom.ids.fxCanvas!) as HTMLCanvasElement;
    TransitionFX.ctx = TransitionFX.canvas.getContext("2d");
    TransitionFX.resize();
    window.addEventListener("resize", TransitionFX.resize);
    TransitionFX.initStars();
  },

  resize(this: void): void {
    if (!TransitionFX.canvas) return;
    TransitionFX.canvas.width = window.innerWidth;
    TransitionFX.canvas.height = window.innerHeight;
  },

  initStars(): void {
    TransitionFX.stars = [];
    for (let i = 0; i < GAME_DATA.config.FX_STAR_COUNT; i++) {
      TransitionFX.stars.push({
        x: (Math.random() - 0.5) * window.innerWidth * 2,
        y: (Math.random() - 0.5) * window.innerHeight * 2,
        z: Math.random() * window.innerWidth,
        pz: Math.random() * window.innerWidth,
        angle: Math.random() * Math.PI * 2,
        colorShift: Math.random(),
      });
    }
  },

  applyThemeStyles(adj: string): void {
    const theme: ProceduralTheme =
      GAME_DATA.procedural.themes[adj] || GAME_DATA.procedural.defaultTheme;
    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-secondary", theme.secondary);
    document.documentElement.style.setProperty("--theme-glow", `${theme.primary}55`);
    document.documentElement.style.setProperty("--bg", theme.bg);
    const artGlyph = document.getElementById(GAME_DATA.dom.ids.artGlyph!) as HTMLElement | null;
    if (artGlyph) {
      artGlyph.innerText = theme.glyph;
      artGlyph.style.color = theme.primary;
    }

    SoundFX.updateAmbientTheme(adj);
  },

  playJumpEffect(
    _targetDimId: string,
    targetDimName: string,
    onBreach: () => void,
    onComplete: () => void,
  ): void {
    SoundFX.init();
    SoundFX.playJumpCharge(GAME_DATA.config.JUMP_CHARGE_MS / 1000);

    if (navigator.vibrate) {
      navigator.vibrate(GAME_DATA.config.FX_VIBRATE_PATTERN);
    }

    const gameEl = document.getElementById(GAME_DATA.dom.ids.gameContainer!)!;
    const bridgeEl = document.getElementById(GAME_DATA.dom.ids.bridgeScene!)!;
    const fxEl = document.getElementById(GAME_DATA.dom.ids.fxCanvas!)!;
    gameEl.classList.add(GAME_DATA.dom.classes.screenShake!);
    bridgeEl.classList.add(GAME_DATA.dom.classes.screenShake!);
    fxEl.classList.add(GAME_DATA.dom.classes.fxActive!);
    TransitionFX.running = true;

    const adjective = targetDimName.split(" ")[0] ?? "";
    const theme: ProceduralTheme =
      GAME_DATA.procedural.themes[adjective] || GAME_DATA.procedural.defaultTheme;
    const startTime = performance.now();

    const renderFrame = (now: number): void => {
      if (!TransitionFX.running) return;
      const elapsed = now - startTime;

      const w = TransitionFX.canvas!.width;
      const h = TransitionFX.canvas!.height;
      const cx = w / 2;
      const cy = h / 2;
      const ctx = TransitionFX.ctx!;

      ctx.fillStyle = "rgba(7, 9, 14, 0.22)";
      ctx.fillRect(0, 0, w, h);

      if (elapsed < GAME_DATA.config.JUMP_CHARGE_MS) {
        const chargeRatio = elapsed / GAME_DATA.config.JUMP_CHARGE_MS;
        const speed = 10 + Math.pow(chargeRatio, 3) * 85;
        const warpRotation = elapsed * 0.003;

        for (let i = 0; i < TransitionFX.stars.length; i++) {
          const s = TransitionFX.stars[i];
          if (!s) continue;
          s.pz = s.z;
          s.z -= speed;

          if (s.z <= 0) {
            s.z = w;
            s.pz = s.z;
            s.x = (Math.random() - 0.5) * w * 2;
            s.y = (Math.random() - 0.5) * h * 2;
          }

          const k = 280 / s.z;
          const pk = 280 / s.pz;
          const px = s.x * pk + cx;
          const py = s.y * pk + cy;
          const sx = s.x * k + cx;
          const sy = s.y * k + cy;

          const alpha = Math.min(1, (1 - s.z / w) * 1.5);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(1, (1 - s.z / w) * 4);
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(warpRotation);
        const radius = (Math.sin(elapsed * 0.01) + 1.2) * 50 + chargeRatio * 130;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 3 + Math.sin(elapsed * 0.02) * 2;
        ctx.shadowColor = theme.secondary;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();
      } else {
        const postProgress =
          (elapsed - GAME_DATA.config.JUMP_CHARGE_MS) /
          (GAME_DATA.config.JUMP_TOTAL_MS - GAME_DATA.config.JUMP_CHARGE_MS);
        const fadeAlpha = Math.max(0, 1 - postProgress * 2.5);

        for (let i = 0; i < TransitionFX.stars.length; i++) {
          const s = TransitionFX.stars[i];
          if (!s) continue;
          s.pz = s.z;
          s.z -= 10;
          if (s.z <= 0) s.z = w;

          const k = 280 / s.z;
          const sx = s.x * k + cx;
          const sy = s.y * k + cy;

          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.8, (1 - s.z / w) * 2), 0, Math.PI * 2);
          ctx.fillStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          ctx.globalAlpha = fadeAlpha;
          ctx.fill();
        }
      }

      if (elapsed < GAME_DATA.config.JUMP_TOTAL_MS) {
        TransitionFX.animId = requestAnimationFrame(renderFrame);
      }
    };

    TransitionFX.animId = requestAnimationFrame(renderFrame);

    setTimeout(() => {
      onBreach();
      TransitionFX.applyThemeStyles(adjective);
      gameEl.classList.remove(GAME_DATA.dom.classes.screenShake!);
      bridgeEl.classList.remove(GAME_DATA.dom.classes.screenShake!);
      gameEl.classList.add(GAME_DATA.dom.classes.chromaticFlash!);
      bridgeEl.classList.add(GAME_DATA.dom.classes.chromaticFlash!);
      SoundFX.playArrivalChime();
    }, GAME_DATA.config.JUMP_CHARGE_MS);

    setTimeout(() => {
      TransitionFX.running = false;
      cancelAnimationFrame(TransitionFX.animId);
      fxEl.classList.remove(GAME_DATA.dom.classes.fxActive!);
      gameEl.classList.remove(GAME_DATA.dom.classes.chromaticFlash!);
      bridgeEl.classList.remove(GAME_DATA.dom.classes.chromaticFlash!);
      onComplete();
    }, GAME_DATA.config.JUMP_TOTAL_MS);
  },
};
