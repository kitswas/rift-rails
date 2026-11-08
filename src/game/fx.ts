// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { DOM } from "../ui/dom";
import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
export const TransitionFX: any = {
  canvas: null,
  ctx: null,
  animId: null,
  stars: [],
  running: false,

  init: () => {
    TransitionFX.canvas = DOM.fxCanvas;
    TransitionFX.ctx = TransitionFX.canvas.getContext("2d");
    TransitionFX.resize();
    window.addEventListener("resize", TransitionFX.resize);
    TransitionFX.initStars();
  },

  resize: () => {
    if (!TransitionFX.canvas) return;
    TransitionFX.canvas.width = window.innerWidth;
    TransitionFX.canvas.height = window.innerHeight;
  },

  initStars: () => {
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

  applyThemeStyles: (adj) => {
    const theme = GAME_DATA.procedural.themes[adj] || GAME_DATA.procedural.defaultTheme;
    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-secondary", theme.secondary);
    document.documentElement.style.setProperty("--theme-glow", `${theme.primary}55`);
    document.documentElement.style.setProperty("--bg", theme.bg);
    if (DOM.artGlyph) {
      DOM.artGlyph.innerText = theme.glyph;
      DOM.artGlyph.style.color = theme.primary;
    }

    SoundFX.updateAmbientTheme(adj);
  },

  playJumpEffect: (targetDimId, targetDimName, onBreach, onComplete) => {
    SoundFX.init();
    SoundFX.playJumpCharge(GAME_DATA.config.JUMP_CHARGE_MS / 1000);

    if (navigator.vibrate) {
      navigator.vibrate(GAME_DATA.config.FX_VIBRATE_PATTERN);
    }

    DOM.gameContainer.classList.add(GAME_DATA.dom.classes.screenShake);
    DOM.bridgeScene.classList.add(GAME_DATA.dom.classes.screenShake);
    DOM.fxCanvas.classList.add(GAME_DATA.dom.classes.fxActive);
    TransitionFX.running = true;

    const adjective = targetDimName.split(" ")[0];
    const theme = GAME_DATA.procedural.themes[adjective] || GAME_DATA.procedural.defaultTheme;
    const startTime = performance.now();

    const renderFrame = (now) => {
      if (!TransitionFX.running) return;
      const elapsed = now - startTime;

      const w = TransitionFX.canvas.width;
      const h = TransitionFX.canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      TransitionFX.ctx.fillStyle = "rgba(7, 9, 14, 0.22)";
      TransitionFX.ctx.fillRect(0, 0, w, h);

      if (elapsed < GAME_DATA.config.JUMP_CHARGE_MS) {
        const chargeRatio = elapsed / GAME_DATA.config.JUMP_CHARGE_MS;
        const speed = 10 + Math.pow(chargeRatio, 3) * 85;
        const warpRotation = elapsed * 0.003;

        for (let i = 0; i < TransitionFX.stars.length; i++) {
          const s = TransitionFX.stars[i];
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
          TransitionFX.ctx.beginPath();
          TransitionFX.ctx.moveTo(px, py);
          TransitionFX.ctx.lineTo(sx, sy);
          TransitionFX.ctx.strokeStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          TransitionFX.ctx.globalAlpha = alpha;
          TransitionFX.ctx.lineWidth = Math.max(1, (1 - s.z / w) * 4);
          TransitionFX.ctx.stroke();
        }

        TransitionFX.ctx.save();
        TransitionFX.ctx.translate(cx, cy);
        TransitionFX.ctx.rotate(warpRotation);
        const radius = (Math.sin(elapsed * 0.01) + 1.2) * 50 + chargeRatio * 130;
        TransitionFX.ctx.beginPath();
        TransitionFX.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        TransitionFX.ctx.strokeStyle = theme.primary;
        TransitionFX.ctx.lineWidth = 3 + Math.sin(elapsed * 0.02) * 2;
        TransitionFX.ctx.shadowColor = theme.secondary;
        TransitionFX.ctx.shadowBlur = 18;
        TransitionFX.ctx.stroke();
        TransitionFX.ctx.restore();
      } else {
        const postProgress =
          (elapsed - GAME_DATA.config.JUMP_CHARGE_MS) /
          (GAME_DATA.config.JUMP_TOTAL_MS - GAME_DATA.config.JUMP_CHARGE_MS);
        const fadeAlpha = Math.max(0, 1 - postProgress * 2.5);

        for (let i = 0; i < TransitionFX.stars.length; i++) {
          const s = TransitionFX.stars[i];
          s.pz = s.z;
          s.z -= 10;
          if (s.z <= 0) s.z = w;

          const k = 280 / s.z;
          const sx = s.x * k + cx;
          const sy = s.y * k + cy;

          TransitionFX.ctx.beginPath();
          TransitionFX.ctx.arc(sx, sy, Math.max(0.8, (1 - s.z / w) * 2), 0, Math.PI * 2);
          TransitionFX.ctx.fillStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          TransitionFX.ctx.globalAlpha = fadeAlpha;
          TransitionFX.ctx.fill();
        }
      }

      if (elapsed < GAME_DATA.config.JUMP_TOTAL_MS) {
        TransitionFX.animId = requestAnimationFrame(renderFrame);
      }
    };

    TransitionFX.animId = requestAnimationFrame(renderFrame);

    setTimeout(() => {
      if (onBreach) onBreach();
      TransitionFX.applyThemeStyles(adjective);
      DOM.gameContainer.classList.remove(GAME_DATA.dom.classes.screenShake);
      DOM.bridgeScene.classList.remove(GAME_DATA.dom.classes.screenShake);
      DOM.gameContainer.classList.add(GAME_DATA.dom.classes.chromaticFlash);
      DOM.bridgeScene.classList.add(GAME_DATA.dom.classes.chromaticFlash);
      SoundFX.playArrivalChime();
    }, GAME_DATA.config.JUMP_CHARGE_MS);

    setTimeout(() => {
      TransitionFX.running = false;
      cancelAnimationFrame(TransitionFX.animId);
      DOM.fxCanvas.classList.remove(GAME_DATA.dom.classes.fxActive);
      DOM.gameContainer.classList.remove(GAME_DATA.dom.classes.chromaticFlash);
      DOM.bridgeScene.classList.remove(GAME_DATA.dom.classes.chromaticFlash);
      if (onComplete) onComplete();
    }, GAME_DATA.config.JUMP_TOTAL_MS);
  },
};

/* ========================================================
         CUTSCENE LOG CONTROLLER
         ======================================================== */
