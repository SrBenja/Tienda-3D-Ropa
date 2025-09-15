// Inicio
(function () {
  'use strict';

  const OVERLAY_ID = 'creditos-play-overlay';
  const STYLE_ID = 'creditos-play-overlay-styles';
  const AUDIO_ID = 'bg-audio';
  const VIDEO_ID = 'bg-video';
  const VIDEO_SOURCE_ID = 'bg-source';
  const CHAT_BUBBLE_ID = 'chat-bubble';
  const CHAT_TOOLTIP_ID = 'chat-tooltip';
  const CREDITS_SECTION_ID = 'credits-section';
  const PAGE_TITLE_ID = 'page-title';
  const PAGE_LEAD_ID = 'page-lead';

  const PROMPT_TEXT = '¡Haz clic para comenzar a reproducir la canción!';
  const RETRY_TEXT = 'La reproducción fue bloqueada. Pulsa de nuevo para reintentar.';
  const NO_AUDIO_TEXT = 'No se encontró el archivo de audio en la página.';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(initAll);

  function initAll() {
    initOverlay();
    initAudioControl();
    initChatBubble();
  }

  /* Overlay (botón solo icono) */
  function initOverlay() {
    const existingAudio = document.getElementById(AUDIO_ID) || document.querySelector('audio');
    if (existingAudio && !existingAudio.paused && !existingAudio.ended) {
      document.documentElement.classList.add('video-active');
      showVideoIfPresent();
      ensureVideoLooping();
      return;
    }
    if (document.getElementById(OVERLAY_ID)) return;

    if (!document.getElementById(STYLE_ID)) {
      const css = `
        #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 999999; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.88); color:#fff; -webkit-tap-highlight-color: transparent; pointer-events:auto; }
        #${OVERLAY_ID} .creditos-dialog { max-width:420px; width:calc(100% - 48px); padding:20px; background:rgba(0,0,0,0.55); border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,0.6); text-align:center; backdrop-filter: blur(4px); }
        #${OVERLAY_ID} .creditos-title { font-size:1.05rem; margin:0 0 12px 0; font-weight:700; }
        #${OVERLAY_ID} .creditos-hint { font-size:0.9rem; color: rgba(255,255,255,0.9); margin-bottom:14px; }
        #${OVERLAY_ID} .creditos-play { width:86px; height:34px; padding:0; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background: linear-gradient(180deg,#ffd86b,#f0a500); color:#000; border:none; box-shadow:none; cursor:pointer; -webkit-appearance:none; appearance:none; }
        #${OVERLAY_ID} .creditos-play:focus { outline: none; box-shadow: 0 0 0 3px rgba(0,0,0,0.25); }
        #${OVERLAY_ID} .creditos-small { margin-top:10px; font-size:0.82rem; color: rgba(255,255,255,0.78); }
      `;
      const styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Reproducción obligatoria de audio');
    overlay.innerHTML = `
      <div class="creditos-dialog" role="document">
        <h2 class="creditos-title">${PROMPT_TEXT}</h2>
        <div class="creditos-hint">Pulsa el icono para comenzar. Esto permite escuchar la canción mientras ves la página.</div>
        <div>
          <button class="creditos-play" type="button" aria-label="Reproducir música y ver la página" tabindex="0">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>
          </button>
        </div>
        <div class="creditos-small" aria-live="polite" id="${OVERLAY_ID}-msg"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    // marcar resto del DOM como aria-hidden
    const otherNodes = Array.from(document.body.children).filter(n => n !== overlay);
    otherNodes.forEach(n => { if (n.setAttribute) n.setAttribute('aria-hidden', 'true'); });

    const playBtn = overlay.querySelector('.creditos-play');
    const msgNode = overlay.querySelector(`#${OVERLAY_ID}-msg`);
    setTimeout(() => playBtn.focus({ preventScroll: true }), 0);

    function onKeyDown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        playBtn.focus();
      }
    }
    overlay.addEventListener('keydown', onKeyDown, true);

    function findAudio() {
      const byId = document.getElementById(AUDIO_ID);
      if (byId && byId.tagName && byId.tagName.toLowerCase() === 'audio') return byId;
      return document.querySelector('audio') || null;
    }

    async function onAudioConfirmedPlay() {
      document.documentElement.classList.add('video-active');
      showVideoIfPresent();
      ensureVideoLooping();
      removeOverlay();
      dispatchPlayConfirmed();
    }

    async function triggerPlay() {
      const audio = findAudio();
      if (!audio) {
        msgNode.textContent = NO_AUDIO_TEXT;
        return;
      }

      const controlBtn = document.getElementById('audio-toggle');
      if (controlBtn) { try { controlBtn.click(); } catch(e) {} }

      try { audio.loop = true; } catch(e) {}
      try { if (typeof audio.volume === 'number') audio.volume = audio.volume || 0.75; } catch(e) {}

      audio.addEventListener('playing', onAudioConfirmedPlay, { once: true });

      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) await playPromise;
      } catch (err) {
        msgNode.textContent = RETRY_TEXT;
        try { audio.removeEventListener('playing', onAudioConfirmedPlay); } catch(e) {}
        playBtn.focus();
        return;
      }

      setTimeout(() => {
        if (audio.paused || audio.ended) {
          try { audio.removeEventListener('playing', onAudioConfirmedPlay); } catch(e){}
          msgNode.textContent = RETRY_TEXT;
          playBtn.focus();
        }
      }, 900);
    }

    playBtn.addEventListener('click', triggerPlay);
    playBtn.addEventListener('pointerdown', function(e){ e.preventDefault(); triggerPlay(); }, { passive: false });
    playBtn.addEventListener('touchstart', function(e){ e.preventDefault(); triggerPlay(); }, { passive: false });

    function removeOverlay() {
      document.documentElement.style.overflow = prevOverflow || '';
      otherNodes.forEach(n => { if (n.removeAttribute) n.removeAttribute('aria-hidden'); });
      overlay.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    (function checkAlreadyPlaying() {
      const audio = document.getElementById(AUDIO_ID) || document.querySelector('audio');
      if (!audio) return;
      try { if (!audio.paused && !audio.ended) {
        document.documentElement.classList.add('video-active');
        showVideoIfPresent();
        ensureVideoLooping();
        removeOverlay();
      } } catch(e) {}
    })();
  }

  /* Control de audio */
  function initAudioControl() {
    const audio = document.getElementById(AUDIO_ID) || document.querySelector('audio');
    const ctrl = document.getElementById('audio-toggle') || document.querySelector('.audio-btn, button.audio-btn, .audio-control button');
    if (!audio || !ctrl) return;

    const iconSpan = ctrl.querySelector('.audio-icon');
    const labelSpan = ctrl.querySelector('.audio-label');

    function setCtrlPlaying(isPlaying) {
      if (iconSpan && labelSpan) {
        iconSpan.textContent = isPlaying ? '⏸' : '▶︎';
        labelSpan.textContent = isPlaying ? 'Pausar' : 'Reproducir';
        ctrl.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      } else {
        ctrl.textContent = isPlaying ? '⏸ Pausar' : '▶︎ Reproducir';
        ctrl.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      }
      const wrap = ctrl.closest('.audio-control');
      if (wrap) wrap.setAttribute('aria-hidden', 'false');
    }

    setCtrlPlaying(!audio.paused && !audio.ended);

    audio.addEventListener('playing', () => {
      setCtrlPlaying(true);
      document.documentElement.classList.add('video-active');
      showVideoIfPresent();
      ensureVideoLooping();
    });
    audio.addEventListener('pause', () => setCtrlPlaying(false));
    audio.addEventListener('ended', () => setCtrlPlaying(false));

    ctrl.addEventListener('click', async function () {
      try {
        if (audio.paused || audio.ended) {
          await audio.play();
          setCtrlPlaying(true);
          document.documentElement.classList.add('video-active');
          showVideoIfPresent();
          ensureVideoLooping();
        } else {
          audio.pause();
          setCtrlPlaying(false);
        }
      } catch (e) {
        setCtrlPlaying(!audio.paused && !audio.ended);
      }
    });
  }

  /* Burbuja de chat: controla todo el texto (titulo+lead+créditos) */
  function initChatBubble() {
    const bubble = document.getElementById(CHAT_BUBBLE_ID);
    const tooltip = document.getElementById(CHAT_TOOLTIP_ID);
    const credits = document.getElementById(CREDITS_SECTION_ID);
    const title = document.getElementById(PAGE_TITLE_ID);
    const lead = document.getElementById(PAGE_LEAD_ID);

    if (!bubble || !tooltip || !credits || !title || !lead) return;

    let tooltipTimer = null;

    function toggleAllText() {
      const isHidden = title.classList.contains('hidden');
      if (isHidden) {
        title.classList.remove('hidden'); title.classList.add('visible');
        lead.classList.remove('hidden'); lead.classList.add('visible');
        credits.classList.remove('hidden'); credits.classList.add('visible');
        credits.setAttribute('aria-hidden', 'false');
        credits.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        title.classList.remove('visible'); title.classList.add('hidden');
        lead.classList.remove('visible'); lead.classList.add('hidden');
        credits.classList.remove('visible'); credits.classList.add('hidden');
        credits.setAttribute('aria-hidden', 'true');
      }
    }

    bubble.addEventListener('click', function () { toggleAllText(); });
    bubble.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAllText(); } });

    function showTooltipTemporary() {
      tooltip.classList.add('show');
      tooltip.setAttribute('aria-hidden', 'false');
      if (tooltipTimer) clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => {
        tooltip.classList.remove('show');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltipTimer = null;
      }, 5000);
    }

    document.addEventListener('creditos:playConfirmed', function () { showTooltipTemporary(); }, { once: true });
    window.__creditos_showTooltipOnce = function () { document.dispatchEvent(new Event('creditos:playConfirmed')); };
  }

  function dispatchPlayConfirmed() { document.dispatchEvent(new Event('creditos:playConfirmed')); }

  /* Video en bucle */
  function ensureVideoLooping() {
    const v = document.getElementById(VIDEO_ID) || document.querySelector('video');
    if (!v) return;

    try {
      v.loop = true;

      if (!v.dataset.loopHandlerAttached) {
        v.addEventListener('ended', function () {
          try {
            v.currentTime = 0;
            const p = v.play();
            if (p && p.catch) p.catch(()=>{});
          } catch (e) {  }
        });
        v.dataset.loopHandlerAttached = '1';
      }
    } catch (e) {
    }
  }

  /* Ayudante: muestra el video si está presente (se usa cuando ya se está reproduciendo el audio) */
  function showVideoIfPresent() {
    const v = document.getElementById(VIDEO_ID) || document.querySelector('video');
    if (!v) return;
    try {
      v.muted = true;
      v.style.display = 'block';
      v.style.visibility = 'visible';
      v.style.opacity = '1';
      try { v.currentTime = v.currentTime || 0; } catch (e) {}
      const p = v.play();
      if (p && p.catch) p.catch(()=>{});
    } catch(e){}
  }

})();
