// Inicio modonocturno.js
(function () {
  'use strict';

  const STORAGE_KEY = 'site-theme'; // 'dark' | 'light' | 'system'
  const SWITCH_ID = 'switch';
  const CLASS_DARK = 'dark';
  const TRANSITION_CLASS = 'theme-transition';

  // util: obtener elemento de forma segura
  function $(sel) { return document.querySelector(sel); }

  const btnSwitch = $(`#${SWITCH_ID}`);
  if (!btnSwitch) {
    return;
  }

  // asegurar que el elemento es accesible
  if (btnSwitch.tagName.toLowerCase() !== 'button') {
    btnSwitch.setAttribute('role', 'button');
    if (!btnSwitch.hasAttribute('tabindex')) btnSwitch.setAttribute('tabindex', '0');
  }

  // Asegurar de que haya una etiqueta legible
  if (!btnSwitch.getAttribute('aria-label')) {
    btnSwitch.setAttribute('aria-label', 'Alternar modo oscuro');
  }

  // lee preferencia guardada o 'system' si no existe
  function readStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  }

  function storeTheme(value) {
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (e) { /* fallar silenciosamente */ }
  }

  // aplica transición suave temporal para evitar flash brusco
  function enableTransitionOnce() {
    document.documentElement.classList.add(TRANSITION_CLASS);
    // quitar después de la transición (300ms)
    window.setTimeout(() => {
      document.documentElement.classList.remove(TRANSITION_CLASS);
    }, 350);
  }

  // aplica tema real (value: 'dark'|'light'|'system')
  function applyTheme(value) {
    enableTransitionOnce();

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let useDark = false;

    if (value === 'dark') useDark = true;
    else if (value === 'light') useDark = false;
    else useDark = prefersDark; // system

    if (useDark) document.body.classList.add(CLASS_DARK);
    else document.body.classList.remove(CLASS_DARK);

    // actualizar estado del switch visual y aria
    const isPressed = useDark ? 'true' : 'false';
    btnSwitch.setAttribute('aria-pressed', isPressed);
    btnSwitch.classList.toggle('active', useDark);

    // actualizar label descriptivo
    btnSwitch.setAttribute('aria-label', useDark ? 'Desactivar modo oscuro' : 'Activar modo oscuro');
  }

  // alterna entre dark/light y guarda (si es system se guarda como 'dark' o 'light')
  function toggleTheme() {
    const current = readStoredTheme();
    let next;

    if (current === 'dark') next = 'light';
    else if (current === 'light') next = 'dark';
    else {
      // system -> invertir la preferencia actual real
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      next = prefersDark ? 'light' : 'dark';
    }

    storeTheme(next);
    applyTheme(next);
  }

  // responder cambios del sistema si preferencia es 'system' (no sobreescribir si usuario eligió explícitamente)
  function handleSystemChange(e) {
    const stored = readStoredTheme();
    if (stored === 'system') {
      // reaplicar para respetar nuevo valor
      applyTheme('system');
    }
  }

  // inicialización: aplicar tema según storage o sistema
  (function init() {
    const stored = readStoredTheme();
    applyTheme(stored);

    // listeners
    btnSwitch.addEventListener('click', (ev) => {
      ev.preventDefault();
      toggleTheme();
    });

    // soporte teclado si no es botón (Enter/Space)
    btnSwitch.addEventListener('keydown', (ev) => {
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        toggleTheme();
      }
    });

    // escuchar cambios del sistema
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      // moderno:
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handleSystemChange);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(handleSystemChange);
      }
    }
  })();
})();
