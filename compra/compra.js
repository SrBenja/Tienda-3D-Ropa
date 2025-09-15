/* compra.js — checkout / compra
   - lectura del carrito temporal
   - validaciones y máscaras
   - prevención doble envío
   - gestión de foco en popups (trap focus, restore)
   - toggle del resumen en móvil
   - sin logs ni helpers dev
   - formato de moneda: "10 000 $" (espacio como separador de miles, $ al final)
*/

(function () {
  'use strict';

  // --- helpers DOM ---
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
  function addClass(el, c){ if(el && !el.classList.contains(c)) el.classList.add(c); }
  function removeClass(el, c){ if(el && el.classList.contains(c)) el.classList.remove(c); }

  // --- util ---
  function isNotEmpty(v){ return v != null && String(v).trim().length > 0; }
  function isDigits(v){ return /^\d+$/.test(String(v)); }
  function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)); }

  // Formatea con espacios como separador de miles y añade " $"
  function formatCurrencyARS(n){
    // n puede ser número o string; aseguramos entero redondeado
    const num = Math.round(Number(n) || 0);
    const s = String(Math.abs(num));
    // insertar espacios cada tres digitos desde la derecha
    const withSpaces = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (num < 0 ? '-' : '') + withSpaces + ' $';
  }

  function tryParseJSON(str){ try { return JSON.parse(str); } catch (e) { return null; } }

  // --- obtener carrito de checkout (prioriza claves temporales) ---
  function getCheckoutCart(){
    try {
      const s = sessionStorage.getItem('checkout_cart');
      if (s) {
        const p = tryParseJSON(s);
        if (Array.isArray(p)) return p;
      }
    } catch(e){}
    try {
      const s2 = localStorage.getItem('carrito_for_checkout');
      if (s2) {
        const p2 = tryParseJSON(s2);
        if (Array.isArray(p2)) return p2;
      }
    } catch(e){}
    try {
      const preferKeys = ['carrito','cart','shoppingCart','cartItems'];
      for (let k of preferKeys){
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = tryParseJSON(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
      }
    } catch(e){}
    try {
      const container = document.querySelector('.carrito-items');
      if (container) {
        const items = [];
        const nodes = container.querySelectorAll('.carrito-item');
        nodes.forEach(n => {
          const titleEl = n.querySelector('.carrito-item-titulo') || n.querySelector('img');
          const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('alt') || '').trim() : (n.getAttribute('data-name')||'').trim();
          const qtyEl = n.querySelector('.carrito-item-cantidad') || n.querySelector('input[type="number"]');
          const qty = qtyEl ? Number(qtyEl.value || qtyEl.getAttribute('data-qty') || 1) : 1;
          const priceText = (n.querySelector('.carrito-item-precio') || {}).textContent || n.getAttribute('data-price') || '';
          const price = Number(String(priceText).replace(/[^\d]/g,'')) || 0;
          let img = (n.querySelector('img') || {}).src || null;
          if (img && img.indexOf('file:///') === 0) {
            const name = img.split('/').pop();
            img = 'img/' + name;
          } else if (img) {
            try {
              const url = new URL(img, window.location.href);
              if (url.protocol === 'file:') img = 'img/' + url.pathname.split('/').pop();
              else if (url.origin === location.origin) img = url.pathname.replace(/^\/+/, '');
            } catch(e){}
          }
          items.push({ name: title || 'Producto', qty: Number.isFinite(qty)?qty:1, price: price, img: img });
        });
        if (items.length) return items;
      }
    } catch(e){}
    return null;
  }

  // --- render resumen ---
  function renderOrderSummary(){
    const container = $('#orderItems');
    const totalEl = $('#orderTotal');
    if (!container) return;
    container.innerHTML = '';
    let items = getCheckoutCart();
    if (!items || !items.length) {
      container.innerHTML = '<p class="muted">No hay artículos en el carrito. El total se actualizará automáticamente si vienes desde la página del carrito.</p>';
      if (totalEl) totalEl.textContent = formatCurrencyARS(0);
      return;
    }
    items = items.map(it => {
      const copy = Object.assign({}, it);
      copy.qty = Number(copy.qty || 1);
      let p = copy.price;
      if (typeof p === 'string') p = Number(p.replace(/[^\d.]/g,''));
      copy.price = Number(p || 0);
      if (copy.img && typeof copy.img === 'string') {
        if (copy.img.indexOf('file:///') === 0) copy.img = 'img/' + copy.img.split('/').pop();
        try {
          const u = new URL(copy.img, window.location.href);
          if (u.protocol === 'file:') copy.img = 'img/' + u.pathname.split('/').pop();
          else if (u.origin === location.origin) copy.img = u.pathname.replace(/^\/+/, '');
        } catch(e){}
      }
      return copy;
    });

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'order-item';
      row.innerHTML = `
        <div class="name"><strong>${escapeHtml(it.name)}</strong><div class="muted small">${formatCurrencyARS(it.price)} c/u</div></div>
        <div class="qty">
          <label class="muted" for="qty_${idx}">Cant</label>
          <input id="qty_${idx}" data-idx="${idx}" class="qty-input" type="number" min="1" step="1" value="${it.qty}">
        </div>
      `;
      container.appendChild(row);
    });

    function computeTotal(){
      const qtyInputs = container.querySelectorAll('.qty-input');
      let total = 0;
      qtyInputs.forEach(inp => {
        const i = Number(inp.dataset.idx || 0);
        const q = Number(inp.value || 1);
        const price = items[i].price || 0;
        total += q * price;
      });
      if (totalEl) totalEl.textContent = formatCurrencyARS(total);
      return total;
    }

    container.querySelectorAll('.qty-input').forEach(inp => {
      inp.addEventListener('change', () => {
        if (Number(inp.value) < 1) inp.value = 1;
        computeTotal();
      });
      inp.addEventListener('input', () => {
        if (!/^\d*$/.test(inp.value)) inp.value = inp.value.replace(/[^\d]/g,'');
      });
    });

    computeTotal();
  }

  // --- helpers visual/util ---
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }
  function maskPhoneAR(v){ const d = v.replace(/\D/g,''); if (d.length <= 2) return d; if (d.length <= 6) return d.replace(/(\d{2})(\d+)/,'$1 $2'); if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/,'$1 $2 $3'); return d.replace(/(\d{2})(\d{4})(\d{4})(\d+)/,'$1 $2 $3 $4').slice(0,20); }
  function maskDNI(v){ return v.replace(/\D/g,'').slice(0,10); }
  function cardBrandFromNumber(num){ const n = num.replace(/\s/g,''); if (/^4/.test(n)) return 'Visa'; if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'MasterCard'; if (/^3[47]/.test(n)) return 'American Express'; if (/^(6011|65|64[4-9])/.test(n)) return 'Discover'; return 'Desconocida'; }
  function luhnCheck(ccNum){ const s = ccNum.replace(/\D/g,''); let sum = 0, alt = false; for (let i = s.length -1; i >= 0; i--){ let n = parseInt(s.charAt(i),10); if (alt){ n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return (sum % 10) === 0; }

  // --- populate provinces AR ---
  function populateArgProvinces(){
    const provinces = ['Ciudad Autónoma de Buenos Aires','Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego'];
    const sel = $('#provincia');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Seleccione...</option>';
    provinces.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
    if (cur) sel.value = cur;
  }

  // --- validations with ARIA feedback ---
  function clearValidationStyles(){
    $all('.textMal').forEach(el => removeClass(el,'textMal'));
    $all('.textBien').forEach(el => removeClass(el,'textBien'));
    const alertEl = document.getElementById('alertTipoDeTarjeta');
    if (alertEl) { alertEl.textContent = ''; }
    $all('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  }

  function focusFirstInvalid(){
    const first = document.querySelector('.textMal');
    if (first) {
      try { first.focus({preventScroll:false}); } catch(e){}
    }
  }

  function validaDatosPersonales(){
    let ok = true;
    clearValidationStyles();

    const nombre = $('#nombre'), apellido = $('#apellido'), dni = $('#dni');
    const movil = $('#movil'), email1 = $('#email1'), email2 = $('#email2');
    const viaNombre = $('#viaNombre'), viaNumero = $('#viaNumero');
    const localidad = $('#localidad'), codigoPostal = $('#codigoPostal'), provincia = $('#provincia');

    if (!nombre || !isNotEmpty(nombre.value) || !isNaN(nombre.value)) { addClass(nombre,'textMal'); nombre && nombre.setAttribute('aria-invalid','true'); ok=false; } else { addClass(nombre,'textBien'); }
    if (apellido) { if (!isNotEmpty(apellido.value) || !isNaN(apellido.value)) { addClass(apellido,'textMal'); apellido.setAttribute('aria-invalid','true'); ok=false; } else addClass(apellido,'textBien'); }

    if (!dni || !/^\d{7,8}[A-Za-z]?$/.test(dni.value)) { addClass(dni,'textMal'); dni && dni.setAttribute('aria-invalid','true'); ok=false; } else addClass(dni,'textBien');
    if (!movil || !/^\d{8,11}$/.test(movil.value.replace(/\D/g,''))) { addClass(movil,'textMal'); movil && movil.setAttribute('aria-invalid','true'); ok=false; } else addClass(movil,'textBien');

    if (!email1 || !isEmail(email1.value)) { addClass(email1,'textMal'); email1 && email1.setAttribute('aria-invalid','true'); ok=false; } else addClass(email1,'textBien');
    if (!email2 || !isEmail(email2.value) || email1.value !== email2.value) { addClass(email2,'textMal'); email2 && email2.setAttribute('aria-invalid','true'); ok=false; } else addClass(email2,'textBien');

    if (!viaNombre || !isNotEmpty(viaNombre.value) || !isNaN(viaNombre.value)) { addClass(viaNombre,'textMal'); viaNombre && viaNombre.setAttribute('aria-invalid','true'); ok=false; } else addClass(viaNombre,'textBien');
    if (!viaNumero || !isDigits(viaNumero.value)) { addClass(viaNumero,'textMal'); viaNumero && viaNumero.setAttribute('aria-invalid','true'); ok=false; } else addClass(viaNumero,'textBien');

    if (!localidad || !isNotEmpty(localidad.value)) { addClass(localidad,'textMal'); localidad && localidad.setAttribute('aria-invalid','true'); ok=false; } else addClass(localidad,'textBien');
    if (!codigoPostal || !/^\d{4,5}$/.test(codigoPostal.value)) { addClass(codigoPostal,'textMal'); codigoPostal && codigoPostal.setAttribute('aria-invalid','true'); ok=false; } else addClass(codigoPostal,'textBien');

    if (!provincia || provincia.value === '') { addClass(provincia,'textMal'); provincia && provincia.setAttribute('aria-invalid','true'); ok=false; } else addClass(provincia,'textBien');

    const dia = $('#fechaNacimientoDia'), mes = $('#fechaNacimientoMes'), anio = $('#fechaNacimientoAnio');
    if (!dia || !mes || !anio || dia.value==='' || mes.value==='' || anio.value==='') {
      if (dia) { addClass(dia,'textMal'); dia && dia.setAttribute('aria-invalid','true'); }
      if (mes) { addClass(mes,'textMal'); mes && mes.setAttribute('aria-invalid','true'); }
      if (anio) { addClass(anio,'textMal'); anio && anio.setAttribute('aria-invalid','true'); }
      ok = false;
    } else {
      if (dia) addClass(dia,'textBien'); if (mes) addClass(mes,'textBien'); if (anio) addClass(anio,'textBien');
    }

    if (!ok) focusFirstInvalid();
    return ok;
  }

  function validaDatosPago(){
    let ok = true;

    const titular = $('#titular'), numeroTarjeta = $('#numeroTarjeta'), cvc = $('#cvcTarjeta');
    const tarjetas = document.getElementsByName('tarjetas');
    const mesTarjeta = $('#mesTarjeta'), anioTarjeta = $('#anioTarjeta');

    if (!titular || !isNotEmpty(titular.value)) { addClass(titular,'textMal'); titular && titular.setAttribute('aria-invalid','true'); ok=false; } else addClass(titular,'textBien');

    let seleccionado = false;
    for (let i=0;i<tarjetas.length;i++){ if (tarjetas[i].checked) seleccionado = true; }
    if (!seleccionado) {
      const alertEl = document.getElementById('alertTipoDeTarjeta');
      if (alertEl) { alertEl.textContent = 'Seleccione un tipo de tarjeta.'; alertEl.setAttribute('role','alert'); }
      ok = false;
    }

    const numVal = (numeroTarjeta && numeroTarjeta.value) ? numeroTarjeta.value.replace(/\s/g,'') : '';
    if (!numeroTarjeta || !/^\d{13,19}$/.test(numVal) || !luhnCheck(numVal)) { addClass(numeroTarjeta,'textMal'); numeroTarjeta && numeroTarjeta.setAttribute('aria-invalid','true'); ok=false; } else addClass(numeroTarjeta,'textBien');

    if (!cvc || !/^\d{3,4}$/.test(cvc.value)) { addClass(cvc,'textMal'); cvc && cvc.setAttribute('aria-invalid','true'); ok=false; } else addClass(cvc,'textBien');

    if (!mesTarjeta || mesTarjeta.value === '') { addClass(mesTarjeta,'textMal'); mesTarjeta && mesTarjeta.setAttribute('aria-invalid','true'); ok=false; } else addClass(mesTarjeta,'textBien');
    if (!anioTarjeta || anioTarjeta.value === '') { addClass(anioTarjeta,'textMal'); anioTarjeta && anioTarjeta.setAttribute('aria-invalid','true'); ok=false; } else addClass(anioTarjeta,'textBien');

    if (!ok) focusFirstInvalid();
    return ok;
  }

  // --- focus trap utilities for modal/dialog ---
  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
  }

  let lastFocusedElement = null;
  let activeTrap = null;

  function trapFocus(modal) {
    if (!modal) return;
    activeTrap = function(e){
      if (e.key === 'Tab') {
        const focusable = getFocusableElements(modal);
        if (!focusable.length) { e.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      } else if (e.key === 'Escape') {
        if (modal.id === 'popup') closePopup();
        if (modal.id === 'popup2') closePopup2();
      }
    };
    document.addEventListener('keydown', activeTrap, true);
  }

  function releaseFocusTrap() {
    if (activeTrap) {
      document.removeEventListener('keydown', activeTrap, true);
      activeTrap = null;
    }
  }

  // --- popup & buttons ---
  let btnConfirm, btnCancel, popup, popup2, popupAcceptBtn, popupCancelAcceptBtn;
  function ready(){
    btnConfirm = $('.btn-confirmarpago');
    btnCancel = $('.btn-cancelarpago');
    popup = $('#popup');
    popup2 = $('#popup2');
    popupAcceptBtn = $('#popupAccept');
    popupCancelAcceptBtn = $('#popupCancelAccept');

    populateArgProvinces();
    renderOrderSummary();

    // toggle summary (mobile)
    const toggle = $('#toggleSummary');
    const summary = $('#orderSummary');
    if (toggle && summary) {
      toggle.addEventListener('click', function(){
        const expanded = this.getAttribute('aria-expanded') === 'true';
        this.setAttribute('aria-expanded', String(!expanded));
        this.textContent = expanded ? 'Mostrar resumen' : 'Ocultar resumen';
        if (!expanded) { summary.classList.remove('collapsed'); } else { summary.classList.add('collapsed'); }
      });
      if (window.matchMedia('(max-width:720px)').matches) {
        toggle.setAttribute('aria-expanded','false');
        toggle.textContent = 'Mostrar resumen';
        summary.classList.add('collapsed');
      } else {
        toggle.setAttribute('aria-expanded','true');
        toggle.textContent = 'Ocultar resumen';
        summary.classList.remove('collapsed');
      }
      window.addEventListener('resize', function(){
        if (window.matchMedia('(max-width:720px)').matches) {
          toggle.setAttribute('aria-expanded','false');
          toggle.textContent = 'Mostrar resumen';
          summary.classList.add('collapsed');
        } else {
          toggle.setAttribute('aria-expanded','true');
          toggle.textContent = 'Ocultar resumen';
          summary.classList.remove('collapsed');
        }
      });
    }

    const movil = $('#movil'); if (movil){
      movil.addEventListener('input', (e) => { e.target.value = maskPhoneAR(e.target.value); });
    }
    const dni = $('#dni'); if (dni) {
      dni.addEventListener('input', (e) => { e.target.value = maskDNI(e.target.value); });
    }

    const numeroTarjeta = $('#numeroTarjeta');
    if (numeroTarjeta){
      numeroTarjeta.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/\D/g,'').slice(0,19);
        e.target.value = raw.replace(/(.{4})/g,'$1 ').trim();
        const brand = cardBrandFromNumber(raw);
        const cardBrandLabel = $('#cardBrand');
        if (cardBrandLabel) cardBrandLabel.textContent = 'Marca: ' + brand;
        if (brand === 'Visa') { const r = $('#visa'); if (r) r.checked = true; }
        if (brand === 'MasterCard') { const r = $('#masterCard'); if (r) r.checked = true; }
        if (brand === 'American Express') { const r = $('#amex'); if (r) r.checked = true; }
        if (brand === 'Discover') { const r = $('#discover'); if (r) r.checked = true; }
      });
    }

    if (btnConfirm) btnConfirm.addEventListener('click', handleConfirmClick);
    if (btnCancel) btnCancel.addEventListener('click', handleCancelClick);

    if (popupAcceptBtn) popupAcceptBtn.addEventListener('click', () => {
      try { sessionStorage.removeItem('checkout_cart'); localStorage.removeItem('carrito_for_checkout'); localStorage.removeItem('carrito'); localStorage.removeItem('carrito_ts'); } catch(e){}
      closePopup();
      window.location.href = '../index.html';
    });

    if (popupCancelAcceptBtn) popupCancelAcceptBtn.addEventListener('click', () => {
      try { sessionStorage.removeItem('checkout_cart'); localStorage.removeItem('carrito_for_checkout'); } catch(e){}
      closePopup2();
      window.location.href = '../index.html';
    });
  }

  function handleConfirmClick(ev){
    ev.preventDefault();
    clearValidationStyles();
    const okP = validaDatosPersonales();
    if (!okP) return;
    const okPago = validaDatosPago();
    if (!okPago) return;

    if (btnConfirm) {
      btnConfirm.setAttribute('disabled','disabled');
      btnConfirm.dataset.originalText = btnConfirm.textContent;
      btnConfirm.textContent = 'Procesando…';
    }
    openPopup();
  }

  function handleCancelClick(ev){
    ev.preventDefault();
    try { sessionStorage.removeItem('checkout_cart'); localStorage.removeItem('carrito_for_checkout'); } catch(e){}
    openPopup2();
  }

  function openPopup(){ 
    if(popup){ 
      lastFocusedElement = document.activeElement;
      popup.classList.add('open'); popup.setAttribute('aria-hidden','false'); 
      const btn = popup.querySelector('button');
      if (btn) setTimeout(()=>btn.focus(),0);
      trapFocus(popup);
    } 
  }
  function closePopup(){ 
    if(popup){ 
      popup.classList.remove('open'); popup.setAttribute('aria-hidden','true'); 
      releaseFocusTrap();
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
      if (btnConfirm && btnConfirm.hasAttribute('disabled')) {
        btnConfirm.removeAttribute('disabled');
        if (btnConfirm.dataset.originalText) btnConfirm.textContent = btnConfirm.dataset.originalText;
      }
    } 
  }

  function openPopup2(){ 
    if(popup2){ 
      lastFocusedElement = document.activeElement;
      popup2.classList.add('open'); popup2.setAttribute('aria-hidden','false'); 
      const btn = popup2.querySelector('button');
      if (btn) setTimeout(()=>btn.focus(),0);
      trapFocus(popup2);
    } 
  }
  function closePopup2(){ 
    if(popup2){ 
      popup2.classList.remove('open'); popup2.setAttribute('aria-hidden','true'); 
      releaseFocusTrap();
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
      if (btnConfirm && btnConfirm.hasAttribute('disabled')) {
        btnConfirm.removeAttribute('disabled');
        if (btnConfirm.dataset.originalText) btnConfirm.textContent = btnConfirm.dataset.originalText;
      }
    } 
  }

  // --- init DOM ready ---
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

})();
