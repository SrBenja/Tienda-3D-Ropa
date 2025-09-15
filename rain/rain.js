/* rain/rain.js — aplicadas: opción 1, 2 y ahora 5 (resize debounce + recalculo drops)
   Además se aumentó heavyCrimsonChance de 0.12 a 0.22 (22%).
   No hay logs ni debugging.
*/

(function () {
  'use strict';

  const CONFIG = {
    dropsCount: 36,
    dropMinDur: 1.0,
    dropMaxDur: 2.2,
    dropMinSize: 0.7,
    dropMaxSize: 1.25,

    lightningMinInterval: 1500,
    lightningMaxInterval: 7000,
    lightningMaxConcurrent: 2,
    mobileDropFactor: 0.35,
    mobileDisableAt: 700,

    LIGHTNING_IMAGE_FILENAME_WHITE: 'Lightning.png',
    LIGHTNING_IMAGE_FILENAME_RED_A: 'Lightning red.png',
    LIGHTNING_IMAGE_FILENAME_RED_B: 'Lightning red 2.png',

    LIGHTNING_PROBS: {
      white: 0.72,
      redA: 0.16,
      redB: 0.12
    },

    LONG_CHANCE: 0.40,
    LONG_MIN: 1.8,
    LONG_MAX: 3.8,
    DEFAULT_FLASH_MIN: 1.1,
    DEFAULT_FLASH_MAX: 1.8,

    // Ciclo heavy
    idleBeforeHeavyMs: 3 * 60 * 1000,
    heavyDurationMs: 60 * 1000,
    heavyExtraMultiplier: 3,

    // PROB: aumentada +10 puntos (12% -> 22%)
    heavyCrimsonChance: 0.22,

    heavyDropMinDurFactor: 0.55,
    heavyDropMaxDurFactor: 0.85
  };

  const CSS = `
.weather-overlay{position:fixed;left:0;top:0;width:100%;height:100%;z-index:999;pointer-events:none;overflow:visible}
.weather-overlay .rain-drops{position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none}

/* gotas (persistentes) */
.weather-overlay .drop{
  display:block;
  position:absolute;
  top:-12vh;
  width:2px;
  height:18px;
  background:
    linear-gradient(180deg,
      rgba(220,235,255,0.98) 0%,
      rgba(190,215,255,0.78) 40%,
      rgba(160,190,255,0.48) 70%,
      rgba(160,190,255,0.06) 100%);
  border-radius:50% 50% 60% 60%;
  transform:rotate(-6deg) scaleX(0.92);
  opacity:0.95;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,0.12));
  will-change:transform,opacity,left;
  animation-name:drop-fall;
  animation-timing-function:linear;
  animation-iteration-count:infinite;
}
.weather-overlay .drop::after{
  content:"";
  position:absolute;
  left:50%;
  top:60%;
  transform:translateX(-50%) rotate(-6deg);
  width:2px;height:8px;
  background:linear-gradient(180deg, rgba(220,240,255,0.9), rgba(220,240,255,0));
  border-radius:50%;
  opacity:0.95;
}
@keyframes drop-fall{
  0%{ transform: translateY(-20vh) rotate(-6deg) scaleX(0.92) scaleY(1); opacity:1; }
  80%{ opacity:1; }
  100%{ transform: translateY(110vh) rotate(-6deg) scaleX(1) scaleY(1.05); opacity:0.06; }
}

/* crimson raindrop (aplicado por clase .crimson) */
.weather-overlay .drop.crimson {
  background:
    linear-gradient(180deg,
      rgba(220,20,60,0.98) 0%,
      rgba(200,10,40,0.82) 40%,
      rgba(180,10,35,0.48) 70%,
      rgba(140,10,25,0.06) 100%);
  filter: drop-shadow(0 1px 6px rgba(220,20,60,0.45));
}

/* lightning */
.weather-overlay .weather-lightning{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none}
.weather-overlay .flash{
  position:absolute;
  top:4%;
  height:70vh;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.7) 12%, rgba(255,255,255,0.0) 30%);
  opacity:0;
  transform-origin:center top;
  filter:blur(6px) brightness(1.15) contrast(1.05);
  mix-blend-mode:screen;
  pointer-events:none;
  animation-name:flash-anim;
  animation-duration:1.4s;
  animation-timing-function:ease-out;
  animation-iteration-count:1;
  background-repeat:no-repeat;
  background-size:contain;
  background-position:center top;
}

/* glow: por defecto neutro (no rojo). Si se necesita rojo, se añade la clase .red */
.weather-overlay .flash-glow{
  position:absolute;
  top:0;
  height:100vh;
  pointer-events:none;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 20%, rgba(255,255,255,0) 60%);
  filter: blur(18px) contrast(1.05);
  mix-blend-mode: screen;
  opacity:0;
  animation-name:glow-anim;
  animation-duration:2.6s;
  animation-timing-function:ease-out;
  animation-iteration-count:1;
}
/* clase específica para glow carmesí */
.weather-overlay .flash-glow.red{
  background: radial-gradient(ellipse at center, rgba(220,20,60,0.18) 0%, rgba(220,20,60,0.06) 20%, rgba(255,255,255,0) 60%);
}

@keyframes flash-anim{0%{opacity:0;transform:scaleY(1)}8%{opacity:0.98;transform:scaleY(1.02)}14%{opacity:0.6}60%{opacity:0.12}100%{opacity:0}}
@keyframes glow-anim{0%{opacity:0}10%{opacity:0.85}50%{opacity:0.45}100%{opacity:0}}

@media (max-width:850px){
  .weather-overlay .drop{height:14px}
  .weather-overlay .flash{width:28vw;top:8%;filter:blur(8px)}
}
`;

  // ---------- util ----------
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randint(min, max) { return Math.floor(rand(min, max + 1)); }
  function isMobileWidth() { return window.innerWidth < CONFIG.mobileDisableAt; }

  function scriptBasePath() {
    try {
      const cur = document.currentScript;
      if (cur && cur.src) return cur.src.replace(/\/[^\/]*$/, '/');
      const scripts = Array.from(document.getElementsByTagName('script'));
      const found = scripts.reverse().find(s => s.src && s.src.indexOf('rain.js') !== -1);
      if (found && found.src) return found.src.replace(/\/[^\/]*$/, '/');
    } catch (e) {}
    return './';
  }

  function safeInsertStyle(css) {
    try {
      if (document.head && document.head.querySelector('style[data-rain]')) return document.head.querySelector('style[data-rain]');
      const s = document.createElement('style');
      s.setAttribute('data-rain', 'true');
      s.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(s);
      return s;
    } catch (err) { return null; }
  }

  // ---------- overlay ----------
  function createOrEnsureOverlay() {
    const container = document.body;
    if (!container) return null;
    let overlay = container.querySelector('.weather-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'weather-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      container.insertBefore(overlay, container.firstChild);
    }
    if (!overlay.querySelector('.rain-drops')) {
      const rainWrap = document.createElement('div'); rainWrap.className = 'rain-drops'; overlay.appendChild(rainWrap);
    }
    if (!overlay.querySelector('.weather-lightning')) {
      const lightWrap = document.createElement('div'); lightWrap.className = 'weather-lightning'; overlay.appendChild(lightWrap);
    }
    return overlay;
  }

  // ---------- drops ----------
  // Ahora setupDrops acepta un objeto poolObj opcional y lo muta en sitio:
  function setupDrops(rainWrap, poolObj) {
    if (!rainWrap) return { stop() {}, start() {}, elements: [] };

    // si nos pasaron poolObj, lo usamos; sino creamos uno nuevo
    const target = poolObj || { elements: [] };

    // eliminar drops previos del DOM
    Array.from(rainWrap.querySelectorAll('.drop')).forEach(e => e.remove());

    const pool = [];
    const desired = isMobileWidth() ? Math.max(6, Math.floor(CONFIG.dropsCount * CONFIG.mobileDropFactor)) : CONFIG.dropsCount;
    for (let i = 0; i < desired; i++) {
      const el = document.createElement('span');
      el.className = 'drop';
      pool.push(el);
      rainWrap.appendChild(el);

      const size = rand(CONFIG.dropMinSize, CONFIG.dropMaxSize);
      el.style.width = (2 * size) + 'px';
      el.style.height = (18 * size) + 'px';
      el.style.opacity = String(0.6 + Math.random() * 0.35);
      const dur = rand(CONFIG.dropMinDur, CONFIG.dropMaxDur);
      el.style.animationDuration = dur + 's';
      el.style.animationDelay = (-Math.random() * dur) + 's';
      el.style.left = (Math.random() * 100) + '%';
      el.style.display = 'block';
    }

    // actualizar la referencia en sitio para que quien la tenga (heavyCtrl) la vea actualizada
    target.elements = pool;

    target.stop = function () { target.elements.forEach(el => el.style.display = 'none'); };
    target.start = function () { target.elements.forEach(el => el.style.display = 'block'); };

    return target;
  }

  // ---------- heavy rain ----------
  function createHeavyRainController(rainWrap, basePool) {
    let heavyPool = [];
    let heavyActive = false;
    let heavyTimeoutId = null;

    // IDs para limpiar correctamente
    let heavyScheduleTimeoutId = null; // timeout que inicia el ciclo
    let heavyCycleIntervalId = null;   // interval que repite startHeavy

    function createHeavyDrops(count, crimsonMode) {
      const created = [];
      for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = 'drop heavy';
        if (crimsonMode) el.classList.add('crimson');

        const size = rand(CONFIG.dropMinSize * 0.9, CONFIG.dropMaxSize * 0.95);
        el.style.width = (2 * size) + 'px';
        el.style.height = (18 * size) + 'px';
        el.style.opacity = String(0.65 + Math.random() * 0.35);

        const dur = rand(CONFIG.dropMinDur * CONFIG.heavyDropMinDurFactor, CONFIG.dropMaxDur * CONFIG.heavyDropMaxDurFactor);
        el.style.animationDuration = dur + 's';
        el.style.animationDelay = (-Math.random() * dur) + 's';
        el.style.left = (Math.random() * 100) + '%';
        el.style.display = 'block';

        rainWrap.appendChild(el);
        created.push(el);
      }
      return created;
    }

    function startHeavy() {
      if (heavyActive) return;
      heavyActive = true;

      const crimsonMode = Math.random() < CONFIG.heavyCrimsonChance;

      // basePool es un objeto cuyo campo elements se actualiza en resize
      if (basePool && basePool.elements) {
        basePool.elements.forEach(el => {
          if (crimsonMode) el.classList.add('crimson');
          else el.classList.remove('crimson');
        });
      }

      const baseCount = (basePool && basePool.elements) ? basePool.elements.length : CONFIG.dropsCount;
      const extra = Math.max(8, Math.floor(baseCount * CONFIG.heavyExtraMultiplier));

      heavyPool = createHeavyDrops(extra, crimsonMode);

      if (basePool && basePool.elements) {
        basePool.elements.forEach(el => {
          el._prevOpacity = el.style.opacity;
          el.style.opacity = Math.min(1, (parseFloat(el.style.opacity || 0.9) + 0.08));
        });
      }

      // limpiar timeout previo si existe
      if (heavyTimeoutId) { clearTimeout(heavyTimeoutId); heavyTimeoutId = null; }
      heavyTimeoutId = setTimeout(() => stopHeavy(), CONFIG.heavyDurationMs);
    }

    function stopHeavy() {
      if (!heavyActive) return;
      heavyActive = false;
      if (heavyTimeoutId) { clearTimeout(heavyTimeoutId); heavyTimeoutId = null; }

      heavyPool.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
      heavyPool = [];

      if (basePool && basePool.elements) {
        basePool.elements.forEach(el => {
          if (el._prevOpacity !== undefined) { el.style.opacity = el._prevOpacity; delete el._prevOpacity; }
          el.classList.remove('crimson');
        });
      }
    }

    function clearCycle() {
      if (heavyScheduleTimeoutId) { clearTimeout(heavyScheduleTimeoutId); heavyScheduleTimeoutId = null; }
      if (heavyCycleIntervalId) { clearInterval(heavyCycleIntervalId); heavyCycleIntervalId = null; }
    }

    function scheduleCycle(initialDelayMs) {
      clearCycle();
      const cycleMs = CONFIG.idleBeforeHeavyMs + CONFIG.heavyDurationMs;
      heavyScheduleTimeoutId = setTimeout(() => {
        startHeavy();
        heavyCycleIntervalId = setInterval(() => startHeavy(), cycleMs);
      }, initialDelayMs);
    }

    function stopAll() {
      clearCycle();
      if (heavyTimeoutId) { clearTimeout(heavyTimeoutId); heavyTimeoutId = null; }
      stopHeavy();
      heavyActive = false;
    }

    return { startHeavy, stopHeavy, scheduleCycle, stopAll, isActive: () => heavyActive };
  }

  // ---------- lightning controller ----------
  function setupLightning(lightningWrap) {
    if (!lightningWrap) return { stop() {} };
    let concurrent = 0, stopped = false;
    const base = scriptBasePath();
    const imgPathWhite = base + CONFIG.LIGHTNING_IMAGE_FILENAME_WHITE;
    const imgPathRedA = base + CONFIG.LIGHTNING_IMAGE_FILENAME_RED_A;
    const imgPathRedB = base + CONFIG.LIGHTNING_IMAGE_FILENAME_RED_B;

    let loadedWhite = false;
    let loadedRedA = false;
    let loadedRedB = false;

    // ID del timeout programado (scheduleNext)
    let nextTimeoutId = null;

    function tryLoadImage(path) {
      return new Promise(resolve => {
        if (!path) return resolve(false);
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = path;
      });
    }

    tryLoadImage(imgPathWhite).then(ok => { loadedWhite = ok; });
    tryLoadImage(imgPathRedA).then(ok => { loadedRedA = ok; });
    tryLoadImage(imgPathRedB).then(ok => { loadedRedB = ok; });

    function pickVariant() {
      const p = Math.random();
      const wp = CONFIG.LIGHTNING_PROBS.white;
      const ap = CONFIG.LIGHTNING_PROBS.redA + wp;
      if (p < wp) return 'white';
      if (p < ap) return 'redA';
      return 'redB';
    }

    function createFlashElement(variant) {
      const f = document.createElement('div');
      f.className = 'flash' + (variant !== 'white' ? ' red' : '');
      f.style.position = 'absolute';
      return f;
    }

    function createGlowElement(isRed) {
      const g = document.createElement('div');
      g.className = 'flash-glow' + (isRed ? ' red' : '');
      return g;
    }

    function applyFallbackFlash(f, isRed) {
      if (isRed) {
        f.style.background = 'radial-gradient(ellipse at center, rgba(220,20,60,0.95) 0%, rgba(220,20,60,0.6) 18%, rgba(220,20,60,0.1) 38%, rgba(255,255,255,0) 60%)';
      } else {
        f.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 18%, rgba(255,255,255,0.08) 38%, rgba(255,255,255,0) 60%)';
      }
    }

    function triggerFlash() {
      if (stopped) return;
      if (concurrent >= CONFIG.lightningMaxConcurrent) { scheduleNext(); return; }
      concurrent++;

      const variant = pickVariant();
      const isRed = variant !== 'white';
      const isLong = Math.random() < CONFIG.LONG_CHANCE;

      const f = createFlashElement(variant);

      if (!isMobileWidth()) {
        if (variant === 'white' && loadedWhite) {
          f.style.background = `url("${imgPathWhite}") center top / contain no-repeat`;
          f.style.filter = 'drop-shadow(0 0 12px rgba(255,255,255,0.08)) brightness(1.15)';
        } else if (variant === 'redA' && loadedRedA) {
          f.style.background = `url("${imgPathRedA}") center top / contain no-repeat`;
          f.style.filter = 'drop-shadow(0 0 12px rgba(255,0,0,0.06)) brightness(1.05)';
        } else if (variant === 'redB' && loadedRedB) {
          f.style.background = `url("${imgPathRedB}") center top / contain no-repeat`;
          f.style.filter = 'drop-shadow(0 0 12px rgba(255,0,0,0.06)) brightness(1.05)';
        } else {
          applyFallbackFlash(f, isRed);
        }
      } else {
        if (variant === 'white' && loadedWhite) f.style.background = `url("${imgPathWhite}") center top / contain no-repeat`;
        else if (variant === 'redA' && loadedRedA) f.style.background = `url("${imgPathRedA}") center top / contain no-repeat`;
        else if (variant === 'redB' && loadedRedB) f.style.background = `url("${imgPathRedB}") center top / contain no-repeat`;
        else applyFallbackFlash(f, isRed);
      }

      f.style.left = (rand(3, 92)) + '%';
      f.style.width = (isLong ? rand(18, 36) : rand(12, 28)) + 'vw';
      f.style.top = (rand(2, 12)) + '%';

      const dur = isLong ? rand(CONFIG.LONG_MIN, CONFIG.LONG_MAX) : rand(CONFIG.DEFAULT_FLASH_MIN, CONFIG.DEFAULT_FLASH_MAX);
      f.style.animationDuration = dur + 's';

      lightningWrap.appendChild(f);

      let glowEl = null;
      if (isLong) {
        glowEl = createGlowElement(isRed);
        glowEl.style.left = f.style.left;
        glowEl.style.width = Math.min(60, parseFloat(f.style.width)) + 'vw';
        glowEl.style.top = (Math.max(0, parseFloat(f.style.top) - 3)) + '%';
        glowEl.style.animationDuration = (dur * 1.25) + 's';
        lightningWrap.appendChild(glowEl);
      }

      const onEnd = () => {
        f.removeEventListener('animationend', onEnd);
        if (f.parentNode) f.parentNode.removeChild(f);
        if (glowEl && glowEl.parentNode) glowEl.parentNode.removeChild(glowEl);
        concurrent = Math.max(0, concurrent - 1);
      };
      f.addEventListener('animationend', onEnd);

      scheduleNext();
    }

    function scheduleNext() {
      const next = randint(CONFIG.lightningMinInterval, CONFIG.lightningMaxInterval);
      // guardar id para poder cancelarlo desde stop()
      nextTimeoutId = setTimeout(() => {
        nextTimeoutId = null;
        if (isMobileWidth() && Math.random() > 0.6) { scheduleNext(); }
        else triggerFlash();
      }, next);
    }

    // iniciar el ciclo
    scheduleNext();

    // stop más agresivo: evita futuros timeouts y limpia flashes visibles
    function stopAll() {
      stopped = true;
      if (nextTimeoutId) { clearTimeout(nextTimeoutId); nextTimeoutId = null; }
      try {
        const existing = Array.from(lightningWrap.querySelectorAll('.flash, .flash-glow'));
        existing.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
      } catch (e) {}
      concurrent = 0;
    }

    return { stop: stopAll, _internal: { getNextTimeoutId: () => nextTimeoutId } };
  }

  // ---------- debounce helper ----------
  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments;
      const ctx = this;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn.apply(ctx, args);
      }, wait);
    };
  }

  // ---------- init ----------
  function init() {
    safeInsertStyle(CSS);
    const overlay = createOrEnsureOverlay();
    if (!overlay) return;
    const rainWrap = overlay.querySelector('.rain-drops');
    const lightningWrap = overlay.querySelector('.weather-lightning');

    // creamos basePool como objeto mutado por setupDrops para que heavyCtrl lo vea actualizado
    let basePool = setupDrops(rainWrap, null);

    const heavyCtrl = createHeavyRainController(rainWrap, basePool);
    const lightCtrl = setupLightning(lightningWrap);

    heavyCtrl.scheduleCycle(CONFIG.idleBeforeHeavyMs);

    // resize handler: reconfigura drops con debounce
    const onResize = debounce(function () {
      try {
        // recrar la pool en el mismo objeto basePool (setupDrops muta en sitio si recibe el objeto)
        basePool = setupDrops(rainWrap, basePool);
        // No reiniciamos heavyCtrl ni lightningCtrl para no alterar ritmos; heavyCtrl usa basePool.elements actualizado.
      } catch (e) {}
    }, 200);

    window.addEventListener('resize', onResize);

    window.__rainControl = {
      stop: () => {
        try {
          try { if (heavyCtrl && heavyCtrl.stopAll) heavyCtrl.stopAll(); } catch (e) {}
          try { if (lightCtrl && lightCtrl.stop) lightCtrl.stop(); } catch (e) {}

          // quitar resize listener
          try { window.removeEventListener('resize', onResize); } catch (e) {}

          const ov = document.querySelector('.weather-overlay'); if (ov) ov.remove();
          const s = document.head && document.head.querySelector('style[data-rain]'); if (s) s.remove();
        } catch (e) {}
      },
      isHeavyActive: () => heavyCtrl.isActive()
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

})();
