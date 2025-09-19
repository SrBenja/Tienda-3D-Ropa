/* app.js — versión final (merge: tu código + correcciones WhatsApp draggable/clamp) */
(function(){
  'use strict';

  /* Helpers */
  function parsePriceToInt(text) {
    if (!text) return 0;
    const digits = String(text).replace(/[^\d]/g, '');
    return parseInt(digits, 10) || 0;
  }
  function formatWithSpaces(num) {
    const n = Math.round(Number(num) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  let carritoNode = null;
  let carritoItemsNode = null;
  let totalDisplayNode = null;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  function ready() {
    carritoNode = document.querySelector('.carrito');
    carritoItemsNode = document.querySelector('.carrito-items');
    totalDisplayNode = document.querySelector('.carrito-precio-total');

    try {
      sessionStorage.removeItem('checkout_cart');
      localStorage.removeItem('carrito_for_checkout');
    } catch(e) {}

    // Inicial: si no tiene clases definidas, añadimos hidden
    if (carritoNode && !carritoNode.classList.contains('carrito--hidden') && !carritoNode.classList.contains('carrito--visible')) {
      carritoNode.classList.add('carrito--hidden');
      carritoNode.setAttribute('aria-hidden', 'true');
    }

    document.addEventListener('click', function(e){
      const btn = e.target && e.target.closest ? e.target.closest('.boton-item') : null;
      if (btn) {
        const itemNode = btn.closest('.item');
        if (!itemNode) return;
        const titulo = itemNode.querySelector('.titulo-item')?.innerText?.trim() || 'Producto';
        const precio = itemNode.querySelector('.precio-item')?.innerText?.trim() || '0';
        const imagenSrc = itemNode.querySelector('.img-item')?.src || '';
        agregarItemAlCarrito(titulo, precio, imagenSrc);
        hacerVisibleCarrito();
      }
    });

    if (carritoItemsNode) {
      carritoItemsNode.addEventListener('click', carritoClickHandler);
      carritoItemsNode.addEventListener('input', carritoInputHandler);
    }

    document.querySelectorAll('a[href*="compra/compra.html"], a[href*="checkout"], button[data-to="comunicacion"], button.go-checkout, .btn-pagar').forEach(el => {
      el.addEventListener('click', function(e){
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button !== 0)) {
          return;
        }
        const href = el.getAttribute('href') || el.dataset.href || 'compra/compra.html';
        e.preventDefault();
        try { prepareCheckout(); } catch(ex) {}
        window.location.href = href;
      });
    });

    const btnPagar = document.querySelector('.btn-pagar');
    if (btnPagar) {
      btnPagar.addEventListener('click', function(e){
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button !== 0)) {
          return;
        }
        e.preventDefault();
        try { prepareCheckout(); } catch(ex){}
        window.location.href = 'compra/compra.html';
      });
    }

    // Inicializar total
    if (totalDisplayNode) {
      const hasItems = (carritoItemsNode && carritoItemsNode.childElementCount > 0);
      if (!hasItems) {
        totalDisplayNode.textContent = '0 $';
      } else {
        const t = parsePriceToInt(totalDisplayNode.textContent || totalDisplayNode.innerText || '');
        totalDisplayNode.textContent = formatWithSpaces(t) + ' $';
      }
    }

    window.addEventListener('beforeunload', function(){ try{ persistirCarrito(); }catch(e){} });

    document.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
      const btn = e.target && e.target.closest ? e.target.closest('[role="button"]') : null;
      if (!btn) return;
      const tag = (btn.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a' || btn.onclick) {
        e.preventDefault();
        try { btn.click(); } catch(err){}
      } else {
        e.preventDefault();
        try { btn.click(); } catch(err){}
      }
    }, true);

    ocultarCarritoSiVacio();

    // Inicializar WhatsApp draggable + restauración (solo si el nodo existe)
    initWhatsAppPosition();
  }

  function carritoClickHandler(e) {
    const target = e.target;

    const eliminar = target.closest('.btn-eliminar');
    if (eliminar) {
      const item = eliminar.closest('.carrito-item');
      if (item) {
        item.remove();
        actualizarTotalCarrito();
        persistirCarrito();
        ocultarCarritoSiVacio();
      }
      return;
    }

    const sumar = target.closest('.sumar-cantidad');
    if (sumar) {
      const item = sumar.closest('.carrito-item');
      if (!item) return;
      const input = item.querySelector('.carrito-item-cantidad');
      const current = parseInt(String(input.value || '0').replace(/[^\d-]/g, ''), 10) || 0;
      input.value = current + 1;
      actualizarTotalCarrito();
      persistirCarrito();
      return;
    }

    const restar = target.closest('.restar-cantidad');
    if (restar) {
      const item = restar.closest('.carrito-item');
      if (!item) return;
      const input = item.querySelector('.carrito-item-cantidad');
      let v = parseInt(String(input.value || '0').replace(/[^\d-]/g, ''), 10) || 0;
      v = Math.max(1, v - 1);
      input.value = v;
      actualizarTotalCarrito();
      persistirCarrito();
      return;
    }
  }

  function carritoInputHandler(e) {
    if (e.target && e.target.classList.contains('carrito-item-cantidad')) {
      let v = parseInt(String(e.target.value || '0').replace(/[^\d-]/g, ''), 10) || 1;
      e.target.value = Math.max(1, v);
      actualizarTotalCarrito();
      persistirCarrito();
    }
  }

  function agregarItemAlCarrito(titulo, precioTexto, imagenSrc) {
    if (!carritoItemsNode) return;

    const existentes = carritoItemsNode.querySelectorAll('.carrito-item-titulo');
    for (const n of existentes) {
      if (n.innerText.trim().toLowerCase() === titulo.trim().toLowerCase()) {
        const item = n.closest('.carrito-item');
        if (item) {
          const input = item.querySelector('.carrito-item-cantidad');
          if (input) {
            const current = parseInt(String(input.value || '0').replace(/[^\d-]/g, ''), 10) || 0;
            input.value = current + 1;
            actualizarTotalCarrito();
            persistirCarrito();
          }
        }
        return;
      }
    }

    const itemDiv = document.createElement('div');
    itemDiv.className = 'carrito-item';

    itemDiv.innerHTML = `
      <img src="${escapeHtml(imagenSrc)}" width="80" height="80" alt="${escapeHtml(titulo)}">
      <div class="carrito-item-detalles">
        <span class="carrito-item-titulo">${escapeHtml(titulo)}</span>
        <div class="selector-cantidad">
          <i class="fa-solid fa-minus restar-cantidad" style="cursor:pointer" role="button" tabindex="0" aria-label="Disminuir cantidad" aria-hidden="false"></i>
          <input type="text" value="1" class="carrito-item-cantidad" readonly>
          <i class="fa-solid fa-plus sumar-cantidad" style="cursor:pointer" role="button" tabindex="0" aria-label="Aumentar cantidad" aria-hidden="false"></i>
        </div>
        <span class="carrito-item-precio">${escapeHtml(precioTexto)}</span>
      </div>
      <span class="btn-eliminar" role="button" aria-label="Eliminar item" tabindex="0">
        <i class="fa-solid fa-trash" aria-hidden="true"></i>
      </span>
    `;

    carritoItemsNode.appendChild(itemDiv);
    actualizarTotalCarrito();
    persistirCarrito();
  }

  function hacerVisibleCarrito() {
    if (!carritoNode) return;
    carritoNode.classList.remove('carrito--hidden');
    carritoNode.classList.add('carrito--visible');
    carritoNode.setAttribute('aria-hidden', 'false');
  }

  function ocultarCarritoSiVacio() {
    if (!carritoItemsNode || !carritoNode) return;
    if (carritoItemsNode.childElementCount === 0) {
      carritoNode.classList.remove('carrito--visible');
      carritoNode.classList.add('carrito--hidden');
      carritoNode.setAttribute('aria-hidden', 'true');
      if (totalDisplayNode) totalDisplayNode.textContent = '0 $';
    }
  }

  function pagarClicked() {
    if (!carritoItemsNode) return;
    while (carritoItemsNode.firstChild) carritoItemsNode.removeChild(carritoItemsNode.firstChild);
    actualizarTotalCarrito();
    persistirCarrito();
    ocultarCarritoSiVacio();
    try { sessionStorage.removeItem('checkout_cart'); localStorage.removeItem('carrito_for_checkout'); } catch(e){}
  }

  function persistirCarrito() {
    try {
      const cont = carritoItemsNode || document.querySelector('.carrito-items');
      if (!cont) return;
      const items = [];
      const nodes = cont.querySelectorAll('.carrito-item');
      nodes.forEach(n => {
        const titleEl = n.querySelector('.carrito-item-titulo') || n.querySelector('img');
        const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('alt') || '').trim() : (n.getAttribute('data-name') || '').trim();

        const qtyEl = n.querySelector('.carrito-item-cantidad') || n.querySelector('input[type="number"]');
        const qtyRaw = qtyEl ? (qtyEl.value || qtyEl.getAttribute('data-qty') || '1') : '1';
        const qty = parseInt(String(qtyRaw).replace(/[^\d-]/g, ''), 10) || 1;

        const priceText = (n.querySelector('.carrito-item-precio') || {}).textContent || n.getAttribute('data-price') || '0';
        const price = parsePriceToInt(priceText);

        let img = (n.querySelector('img') || {}).src || null;

        if (img && img.indexOf('file:///') === 0) {
          const name = img.split('/').pop();
          img = 'img/' + name;
        } else if (img) {
          try {
            const url = new URL(img, window.location.href);
            if (url.protocol === 'file:') {
              const name = url.pathname.split('/').pop();
              img = 'img/' + name;
            } else if (url.origin === location.origin) {
              img = url.pathname.replace(/^\/+/, '');
            }
          } catch(e){}
        }

        items.push({ name: title || 'Producto', qty: Number.isFinite(qty) ? qty : 1, price: price, img: img });
      });
      localStorage.setItem('carrito', JSON.stringify(items));
      localStorage.setItem('carrito_ts', String(Date.now()));
    } catch (e) {
      // silenciar errores de storage
    }
  }

  function actualizarTotalCarrito() {
    if (!carritoItemsNode || !totalDisplayNode) return;
    const items = carritoItemsNode.querySelectorAll('.carrito-item');
    let total = 0;
    items.forEach(item => {
      const precioTxt = item.querySelector('.carrito-item-precio')?.innerText || '0';
      const precio = parsePriceToInt(precioTxt);
      const cantidad = parseInt(String(item.querySelector('.carrito-item-cantidad')?.value || '1').replace(/[^\d-]/g, ''), 10) || 1;
      total += precio * cantidad;
    });

    totalDisplayNode.textContent = formatWithSpaces(total) + ' $';
    persistirCarrito();
  }

  function prepareCheckout() {
    try {
      const cont = carritoItemsNode || document.querySelector('.carrito-items');
      if (!cont) {
        const raw = localStorage.getItem('carrito');
        if (raw) {
          try { sessionStorage.setItem('checkout_cart', raw); } catch(e){}
          try { localStorage.setItem('carrito_for_checkout', raw); } catch(e){}
        }
        return;
      }
      const items = [];
      const nodes = cont.querySelectorAll('.carrito-item');
      nodes.forEach(n => {
        const titleEl = n.querySelector('.carrito-item-titulo') || n.querySelector('img');
        const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('alt') || '').trim() : (n.getAttribute('data-name') || '').trim();

        const qtyEl = n.querySelector('.carrito-item-cantidad') || n.querySelector('input[type="number"]');
        const qtyRaw = qtyEl ? (qtyEl.value || qtyEl.getAttribute('data-qty') || '1') : '1';
        const qty = parseInt(String(qtyRaw).replace(/[^\d-]/g, ''), 10) || 1;

        const priceText = (n.querySelector('.carrito-item-precio') || {}).textContent || n.getAttribute('data-price') || '0';
        const price = parsePriceToInt(priceText);

        let img = (n.querySelector('img') || {}).src || null;

        if (img && img.indexOf('file:///') === 0) {
          const name = img.split('/').pop();
          img = 'img/' + name;
        } else if (img) {
          try {
            const url = new URL(img, window.location.href);
            if (url.protocol === 'file:') {
              const name = url.pathname.split('/').pop();
              img = 'img/' + name;
            } else if (url.origin === location.origin) {
              img = url.pathname.replace(/^\/+/, '');
            }
          } catch(e){}
        }

        items.push({ name: title || 'Producto', qty: Number.isFinite(qty) ? qty : 1, price: price, img: img });
      });

      const raw = JSON.stringify(items);
      try { sessionStorage.setItem('checkout_cart', raw); } catch(e){}
      try { localStorage.setItem('carrito_for_checkout', raw); } catch(e){}
    } catch(e){}
  }

  // WhatsApp helpers: restaurar posición con límites (evita quedar fuera del viewport)
  function initWhatsAppPosition() {
    // función auxiliar: si estamos en un viewport móvil (<=600px)
    function isMobileViewport() {
      try { return window.matchMedia('(max-width: 600px)').matches; } catch(e) { return false; }
    }

    var el = document.getElementById('whatsapp');
    if (!el) return;

    // restaurar posición guardada (si existe)
    try {
      var raw = localStorage.getItem('whatsappPos');
      if (raw) {
        var pos = JSON.parse(raw);
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          var margin = 6;
          var maxLeft = Math.max(margin, Math.floor(window.innerWidth - el.offsetWidth - margin));
          var maxTop = Math.max(margin, Math.floor(window.innerHeight - el.offsetHeight - margin));
          var fitX = Math.min(Math.max(margin, pos.x), maxLeft);
          var fitY = Math.min(Math.max(margin, pos.y), maxTop);

          var outOfRange = (pos.x < margin || pos.y < margin || pos.x > window.innerWidth || pos.y > window.innerHeight);
          if (outOfRange) {
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
          } else {
            el.style.left = fitX + 'px';
            el.style.top = fitY + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
          }
        }
      }
    } catch(e){
      // ignore
    }

    // activar arrastre solo en dispositivos táctiles / si viewport móvil (evita efectos no deseados en desktop)
    var supportsPointer = !!window.PointerEvent;
    var isTouchLike = (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
    if (!isTouchLike) {
      // Aún así, asegurar que la posición queda clampada si rota la pantalla
      clampWhatsAppPosition();
      return;
    }

    // pointer drag handlers (pointer events)
    var dragging = false;
    var pointerId = null;
    var startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function getPx(v) { return v ? parseFloat(String(v).replace('px','')) : 0; }

    el.addEventListener('pointerdown', function(ev){
      if (ev.button && ev.button !== 0) return;
      pointerId = ev.pointerId;
      dragging = true;
      try { el.setPointerCapture(pointerId); } catch(e){}
      startX = ev.clientX; startY = ev.clientY;
      var cs = window.getComputedStyle(el);
      origLeft = getPx(cs.left) || el.getBoundingClientRect().left;
      origTop  = getPx(cs.top)  || el.getBoundingClientRect().top;
      el.style.left = origLeft + 'px';
      el.style.top  = origTop + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      ev.preventDefault();
    }, { passive: false });

    el.addEventListener('pointermove', function(ev){
      if (!dragging || ev.pointerId !== pointerId) return;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      var newLeft = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, Math.round(origLeft + dx)));
      var newTop  = Math.max(6, Math.min(window.innerHeight - el.offsetHeight - 6, Math.round(origTop + dy)));
      el.style.left = newLeft + 'px';
      el.style.top  = newTop  + 'px';
      ev.preventDefault();
    }, { passive: false });

    function endDrag(ev) {
      if (!dragging || ev.pointerId !== pointerId) return;
      try { el.releasePointerCapture(pointerId); } catch (e) {}
      dragging = false;
      pointerId = null;
      try {
        var rect = el.getBoundingClientRect();
        var pos = { x: Math.round(rect.left), y: Math.round(rect.top) };
        localStorage.setItem('whatsappPos', JSON.stringify(pos));
      } catch(e){}
    }

    el.addEventListener('pointerup', endDrag, false);
    el.addEventListener('pointercancel', endDrag, false);
  }

  function clampWhatsAppPosition() {
    var el = document.getElementById('whatsapp');
    if (!el) return;
    try {
      var cs = window.getComputedStyle(el);
      var left = parseFloat(cs.left) || el.getBoundingClientRect().left;
      var top = parseFloat(cs.top) || el.getBoundingClientRect().top;
      var margin = 6;
      var maxLeft = Math.max(margin, Math.floor(window.innerWidth - el.offsetWidth - margin));
      var maxTop = Math.max(margin, Math.floor(window.innerHeight - el.offsetHeight - margin));
      var fitX = Math.min(Math.max(margin, Math.round(left)), maxLeft);
      var fitY = Math.min(Math.max(margin, Math.round(top)), maxTop);
      el.style.left = fitX + 'px';
      el.style.top = fitY + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      try { localStorage.setItem('whatsappPos', JSON.stringify({ x: fitX, y: fitY })); } catch(e){}
    } catch(e){}
  }

  // Función de ayuda para limpiar posición guardada (útil para pruebas)
  window.__resetWhatsAppPos = function() {
    try { localStorage.removeItem('whatsappPos'); } catch(e){}
    var el = document.getElementById('whatsapp');
    if (!el) return;
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
  };

  // FIN IIFE
})();
