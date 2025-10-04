// contacto.js — actualizado: honeypot anti-spam + lock SVG visible + popup confirmation + localStorage saving

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const form = document.getElementById('contactForm');
  const nombre = document.getElementById('nombre');
  const apellido = document.getElementById('apellido');
  const email = document.getElementById('email');
  const mensaje = document.getElementById('mensaje');
  const btnEnviar = document.getElementById('enviar');
  const statusEl = document.getElementById('contactStatus');
  const honeypot = document.getElementById('website'); // honeypot input

  const popup = document.getElementById('contactPopup');
  const popupAccept = document.getElementById('contactPopupAccept');

  function isValidEmail(v) { return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
  function areFieldsFilled() {
    return nombre.value.trim().length > 0 &&
           apellido.value.trim().length > 0 &&
           isValidEmail(email.value) &&
           mensaje.value.trim().length > 0;
  }

  function showFieldError(fieldEl, errorId, msg) {
    const err = document.getElementById(errorId);
    if (err) { err.textContent = msg; err.hidden = false; }
    fieldEl.classList.add('input-error');
    fieldEl.setAttribute('aria-invalid', 'true');
  }
  function clearFieldError(fieldEl, errorId) {
    const err = document.getElementById(errorId);
    if (err) { err.textContent = ''; err.hidden = true; }
    fieldEl.classList.remove('input-error');
    fieldEl.removeAttribute('aria-invalid');
  }

  function clearAllErrors() {
    clearFieldError(nombre, 'error-nombre');
    clearFieldError(apellido, 'error-apellido');
    clearFieldError(email, 'error-email');
    clearFieldError(mensaje, 'error-mensaje');
    statusEl.textContent = '';
  }

  function updateButtonState() {
    if (areFieldsFilled()) {
      btnEnviar.classList.remove('btn-locked');
      btnEnviar.setAttribute('aria-disabled', 'false');
      // ensure lock SVG hidden when unlocked (CSS handles it)
    } else {
      btnEnviar.classList.add('btn-locked');
      btnEnviar.setAttribute('aria-disabled', 'true');
    }
  }

  function saveMessageToLocalStorage(obj) {
    try {
      const key = 'contact_messages';
      const raw = localStorage.getItem(key);
      let arr = raw ? JSON.parse(raw) || [] : [];
      arr.push(obj);
      if (arr.length > 200) arr = arr.slice(-200);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) { /* fail silently */ }
  }

  function openPopup() {
    if (!popup) return;
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    const btn = popup.querySelector('button');
    if (btn) setTimeout(() => btn.focus(), 0);
  }
  function closePopup() {
    if (!popup) return;
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
  }

  function validateAllAndMark() {
    clearAllErrors();
    let ok = true;

    // if honeypot filled -> assume bot, silently ignore
    if (honeypot && honeypot.value.trim().length > 0) {
      // silently ignore: do not save nor show popup
      return false;
    }

    if (nombre.value.trim().length === 0) { showFieldError(nombre,'error-nombre','El nombre es obligatorio.'); ok = false; }
    if (apellido.value.trim().length === 0) { showFieldError(apellido,'error-apellido','El apellido es obligatorio.'); ok = false; }
    if (!isValidEmail(email.value)) { showFieldError(email,'error-email','Introduce un e-mail válido.'); ok = false; }
    if (mensaje.value.trim().length === 0) { showFieldError(mensaje,'error-mensaje','El mensaje no puede estar vacío.'); ok = false; }

    if (!ok) {
      const first = form.querySelector('.input-error');
      if (first) first.focus();
      statusEl.className = '';
      statusEl.textContent = 'Corrija los campos en rojo antes de enviar.';
    } else {
      statusEl.textContent = '';
    }
    return ok;
  }

  [nombre, apellido, email, mensaje].forEach(el => {
    if (!el) return;
    el.addEventListener('input', function () {
      const idMap = { nombre: 'error-nombre', apellido: 'error-apellido', email: 'error-email', mensaje: 'error-mensaje' };
      clearFieldError(el, idMap[el.id]);
      updateButtonState();
    });
  });

  btnEnviar.addEventListener('click', function (ev) {
    ev.preventDefault();

    // honeypot check early
    if (honeypot && honeypot.value.trim().length > 0) {
      // bot detected, ignore silently
      return;
    }

    const ok = validateAllAndMark();
    if (!ok) return;

    // UX: show "Enviando…" then save + show popup
    btnEnviar.setAttribute('aria-disabled','true');
    btnEnviar.classList.add('btn-locked');
    const originalText = btnEnviar.querySelector('.btn-text') ? btnEnviar.querySelector('.btn-text').textContent : 'Enviar';
    btnEnviar.querySelector('.btn-text').textContent = 'Enviando…';

    const msgObj = {
      nombre: nombre.value.trim(),
      apellido: apellido.value.trim(),
      email: email.value.trim(),
      mensaje: mensaje.value.trim(),
      ts: new Date().toISOString()
    };

    setTimeout(function () {
      saveMessageToLocalStorage(msgObj);
      openPopup();
      form.reset();
      clearAllErrors();
      updateButtonState();
      if (btnEnviar.querySelector('.btn-text')) btnEnviar.querySelector('.btn-text').textContent = originalText;
    }, 650);
  });

  if (popupAccept) {
    popupAccept.addEventListener('click', function () {
      closePopup();
      if (nombre) nombre.focus();
    });
  }

  // init
  updateButtonState();
});
