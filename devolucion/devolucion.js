// devolucion.js - versión sin dependencia externa
// Añadido: focus trap en modales, ARIA por campo, formato teléfono básico, form.reset() antes de redirigir

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const form = document.getElementById('devolucionForm');
  const btnEnviar = document.getElementById('btnEnviar');
  const btnCancelar = document.getElementById('btnCancelar');
  const popupSuccess = document.getElementById('popupSuccess');
  const popupCancel = document.getElementById('popupCancel');
  const acceptSuccess = document.getElementById('acceptSuccess');
  const acceptCancel = document.getElementById('acceptCancel');
  const formStatus = document.getElementById('formStatus');

  const fields = {
    nombre: document.getElementById('nombre'),
    apellido: document.getElementById('apellido'),
    dni: document.getElementById('dni'),
    movil: document.getElementById('movil'),
    mail: document.getElementById('mail'),
    motivo: document.getElementById('motivo')
  };

  const errors = {
    nombre: document.getElementById('error-nombre'),
    apellido: document.getElementById('error-apellido'),
    dni: document.getElementById('error-dni'),
    movil: document.getElementById('error-movil'),
    mail: document.getElementById('error-mail'),
    motivo: document.getElementById('error-motivo')
  };

  // Poblar provincias si necesario
  (function ensureProvinces(){
    const sel = document.getElementById('provincia');
    if (!sel) return;
    if (sel.options && sel.options.length > 1) return;
    const provinces = ['Ciudad Autónoma de Buenos Aires','Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego'];
    sel.innerHTML = '<option value="">Seleccione...</option>';
    provinces.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
  })();

  // Helpers UI/ARIA
  function showFieldError(key, msg) {
    const el = fields[key], err = errors[key];
    if (!el || !err) return;
    el.classList.add('input-error');
    el.setAttribute('aria-invalid', 'true');
    err.textContent = msg;
    err.hidden = false;
    const described = el.getAttribute('aria-describedby') || '';
    if (!described.includes(err.id)) el.setAttribute('aria-describedby', (described + ' ' + err.id).trim());
  }
  function clearFieldError(key) {
    const el = fields[key], err = errors[key];
    if (!el || !err) return;
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
    err.textContent = '';
    err.hidden = true;
  }

  function showStatus(msg) {
    if (!formStatus) return;
    formStatus.style.display = 'block';
    formStatus.textContent = msg;
  }
  function hideStatus() {
    if (!formStatus) return;
    formStatus.style.display = 'none';
    formStatus.textContent = '';
  }

  function isValidEmail(v) { return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }

  // Format phone: 2-4-4 (allow variable lengths)
  function formatPhoneLive(rawValue) {
    const d = (rawValue || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 2) return d;
    if (d.length <= 6) return d.slice(0,2) + ' ' + d.slice(2);
    if (d.length <= 10) return d.slice(0,2) + ' ' + d.slice(2,6) + ' ' + d.slice(6);
    return d.slice(0,2) + ' ' + d.slice(2,6) + ' ' + d.slice(6,10) + ' ' + d.slice(10);
  }

  // Validate form -> return {ok, errors[]}
  function validateForm() {
    // limpiar
    Object.keys(errors).forEach(k => clearFieldError(k));
    hideStatus();

    const found = [];

    if (!fields.nombre.value.trim()) { showFieldError('nombre','El nombre es obligatorio.'); found.push('nombre'); }
    if (!fields.apellido.value.trim()) { showFieldError('apellido','El apellido es obligatorio.'); found.push('apellido'); }

    // DNI: extraer dígitos
    const dniRaw = (fields.dni.value || '').replace(/\D/g,'');
    if (!/^\d{7,8}$/.test(dniRaw)) { showFieldError('dni','DNI inválido. Ingrese 7 u 8 dígitos.'); found.push('dni'); } 
    else fields.dni.value = dniRaw;

    // movil: numeric only
    const movilRaw = (fields.movil.value || '').replace(/\D/g,'');
    if (!/^\d{7,15}$/.test(movilRaw)) { showFieldError('movil','Teléfono inválido (ej.: 11 1111 1111).'); found.push('movil'); }

    if (!isValidEmail(fields.mail.value)) { showFieldError('mail','Introduzca un e-mail válido.'); found.push('mail'); }

    if (!fields.motivo.value.trim() || fields.motivo.value.trim().length < 6) { showFieldError('motivo','Describa el motivo (mín. 6 caracteres).'); found.push('motivo'); }

    if (found.length === 0) { hideStatus(); return { ok: true, errors: [] }; }

    if (found.length > 1) {
      showStatus('Complete/corrija los campos marcados.');
    } else {
      const k = found[0];
      const m = errors[k] && errors[k].textContent ? errors[k].textContent : 'Corrija el campo.';
      showStatus(m);
    }

    const firstInvalid = form.querySelector('.input-error');
    if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();

    return { ok: false, errors: found };
  }

  // Save submission
  function saveSubmission(data) {
    try {
      const key = 'devoluciones';
      const raw = localStorage.getItem(key);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.push(data);
      if (arr.length > 500) arr = arr.slice(-500);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) { /* silent */ }
  }

  // Redirect home: reset form first
  function redirectHome() {
    try {
      if (form && typeof form.reset === 'function') form.reset();
      if (fields.movil) fields.movil.value = '';
      if (fields.dni) fields.dni.value = '';
      const p = location.pathname || '';
      if (p.includes('/devolucion/')) {
        location.href = '../index.html';
        return;
      }
      location.href = 'index.html';
    } catch (e) {
      location.href = 'index.html';
    }
  }

  // Popups: open/close + Esc + focus restore + focus-trap
  let lastFocus = null;

  function getFocusableElements(container) {
    if (!container) return [];
    const selectors = [
      'a[href]:not([tabindex="-1"])',
      'area[href]',
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'iframe',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ];
    const nodes = Array.from(container.querySelectorAll(selectors.join(',')));
    // Filter visible
    return nodes.filter(n => n.offsetParent !== null || n.getAttribute('aria-hidden') === 'false');
  }

  function openPopup(popupEl) {
    if (!popupEl) return;
    // store last focused element
    lastFocus = document.activeElement;
    // show popup
    popupEl.classList.add('open');
    popupEl.setAttribute('aria-hidden', 'false');

    // setup focusable elements list
    const focusable = getFocusableElements(popupEl);
    popupEl._focusableEls = focusable.length ? focusable : [popupEl.querySelector('button') || popupEl];

    // focus first focusable
    const first = popupEl._focusableEls[0];
    if (first && typeof first.focus === 'function') {
      setTimeout(() => first.focus(), 0);
    }

    // Escape handler
    function onEscape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup(popupEl);
      }
    }
    popupEl._onEscape = onEscape;
    document.addEventListener('keydown', onEscape);

    // Focus trap handler (Tab/Shift+Tab)
    function trap(e) {
      if (e.key !== 'Tab') return;
      const focusables = popupEl._focusableEls || [];
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === firstEl || active === popupEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
    popupEl._trapHandler = trap;
    document.addEventListener('keydown', trap);
  }

  function closePopup(popupEl) {
    if (!popupEl) return;
    popupEl.classList.remove('open');
    popupEl.setAttribute('aria-hidden', 'true');

    // remove handlers
    if (popupEl._onEscape) {
      document.removeEventListener('keydown', popupEl._onEscape);
      popupEl._onEscape = null;
    }
    if (popupEl._trapHandler) {
      document.removeEventListener('keydown', popupEl._trapHandler);
      popupEl._trapHandler = null;
    }
    popupEl._focusableEls = null;

    // restore focus
    if (lastFocus && typeof lastFocus.focus === 'function') {
      setTimeout(() => lastFocus.focus(), 0);
    }
  }

  // Live formatting for phone field (and basic paste handling)
  if (fields.movil) {
    fields.movil.addEventListener('input', (e) => {
      const rawBefore = e.target.value;
      const formatted = formatPhoneLive(rawBefore);
      e.target.value = formatted;
      try { e.target.setSelectionRange(formatted.length, formatted.length); } catch (err) {}
    });
    fields.movil.addEventListener('paste', (ev) => {
      setTimeout(() => { fields.movil.value = formatPhoneLive(fields.movil.value); }, 0);
    });
  }

  // DNI: allow only digits during input (best-effort)
  if (fields.dni) {
    fields.dni.addEventListener('input', (e) => {
      const cleaned = (e.target.value || '').replace(/\D/g,'');
      e.target.value = cleaned;
    });
    fields.dni.addEventListener('paste', (ev) => {
      setTimeout(()=>{ fields.dni.value = (fields.dni.value||'').replace(/\D/g,''); },0);
    });
  }

  // Handlers
  btnEnviar.addEventListener('click', (ev) => {
    ev.preventDefault();
    const res = validateForm();
    if (!res.ok) return;

    btnEnviar.disabled = true;
    const orig = btnEnviar.textContent;
    btnEnviar.textContent = 'Enviando…';

    const payload = {
      nombre: fields.nombre.value.trim(),
      apellido: fields.apellido.value.trim(),
      dni: (fields.dni.value || '').replace(/\D/g,''),
      movil_numeric: (fields.movil.value || '').replace(/\D/g,''),
      movil_formatted: fields.movil.value || '',
      mail: fields.mail.value.trim(),
      localidad: document.getElementById('localidad')?.value || '',
      codigoPostal: document.getElementById('codigoPostal')?.value || '',
      provincia: document.getElementById('provincia')?.value || '',
      fechaCompra: document.getElementById('fechaCompra')?.value || '',
      motivo: fields.motivo.value.trim(),
      ts: new Date().toISOString()
    };

    setTimeout(() => {
      saveSubmission(payload);
      openPopup(popupSuccess);
      btnEnviar.disabled = false;
      btnEnviar.textContent = orig;
    }, 500);
  });

  btnCancelar.addEventListener('click', (ev) => {
    ev.preventDefault();
    openPopup(popupCancel);
  });

  if (acceptSuccess) {
    acceptSuccess.addEventListener('click', () => {
      closePopup(popupSuccess);
      redirectHome();
    });
  }
  if (acceptCancel) {
    acceptCancel.addEventListener('click', () => {
      closePopup(popupCancel);
      redirectHome();
    });
  }

  // Clear field-specific errors on input, hide status if none left
  Object.keys(fields).forEach(k => {
    const f = fields[k];
    if (!f) return;
    f.addEventListener('input', () => {
      clearFieldError(k);
      const any = form.querySelectorAll('.input-error').length > 0;
      if (!any) hideStatus();
    });
  });

  // Nota: no hay focus automático en 'nombre'
});
