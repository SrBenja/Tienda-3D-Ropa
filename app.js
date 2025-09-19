/* Inicio de app.js */
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

  /* Nodos (referencias globales dentro del IIFE) */
  let carritoNode = null;
  let carritoItemsNode = null;
  let totalDisplayNode = null;

  /* Inicialización */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  function ready() {
    carritoNode = document.querySelector('.carrito');
    carritoItemsNode = document.querySelector('.carrito-items');
    totalDisplayNode = document.querySelector('.carrito-precio-total');

    // Limpiar claves temporales de checkout al cargar la página principal
    try {
      sessionStorage.removeItem('checkout_cart');
      localStorage.removeItem('carrito_for_checkout');
    } catch(e) {}

    // Inicializar visibilidad del carrito (aseguramos clases base)
    if (carritoNode && !carritoNode.classList.contains('carrito--hidden') && !carritoNode.classList.contains('carrito--visible')) {
      carritoNode.classList.add('carrito--hidden');
      carritoNode.setAttribute('aria-hidden', 'true');
    }

    // Event delegation para botones "Agregar al carrito"
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

    // Delegación en carrito (eventos específicos)
    if (carritoItemsNode) {
      carritoItemsNode.addEventListener('click', carritoClickHandler);
      carritoItemsNode.addEventListener('input', carritoInputHandler);
    }

    // Botones/enlaces que llevan a checkout/compra -> interceptar si es navegación normal
    document.querySelectorAll('a[href*="compra/compra.html"], a[href*="checkout"], button[data-to="comunicacion"], button.go-checkout, .btn-pagar').forEach(el => {
      el.addEventListener('click', function(e){
        // Respetar clics con modifier keys (abrir en nueva pestaña/ventana)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button !== 0)) {
          return;
        }

        const href = el.getAttribute('href') || el.dataset.href || 'compra/compra.html';
        e.preventDefault();
        try { prepareCheckout(); } catch(ex) {}
        // Navegación inmediata; storage es síncrono
        window.location.href = href;
      });
    });

    // Fallback: botón .btn-pagar si existe por separado
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

    // Inicializar total — si el carrito está vacío forzamos 0 y lo mantenemos oculto
    if (totalDisplayNode) {
      const hasItems = (carritoItemsNode && carritoItemsNode.childElementCount > 0);
      if (!hasItems) {
        totalDisplayNode.textContent = '0 $';
      } else {
        const t = parsePriceToInt(totalDisplayNode.textContent || totalDisplayNode.innerText || '');
        totalDisplayNode.textContent = formatWithSpaces(t) + ' $';
      }
    }

    // asegurar persistencia si se cierra la pestaña
    window.addEventListener('beforeunload', function(){ try{ persistirCarrito(); }catch(e){} });

    // Soporte teclado: Enter / Space para elementos con role="button"
    // Delegación global: convierte Enter/Space en clic() y evita scroll por Space.
    document.addEventListener('keydown', function(e){
      // considerar teclas: "Enter" y " " (espacio). También cubrimos key === 'Spacebar' por compat.
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
      const btn = e.target && e.target.closest ? e.target.closest('[role="button"]') : null;
      if (!btn) return;
      // Si el elemento es un control nativo (button, a) y ya maneja keydown naturalmente, dejarlo.
      const tag = (btn.tagName || '').toLowerCase();
      // Para elementos no nativos (i, span) con role="button" simulamos clic.
      if (tag === 'button' || tag === 'a' || btn.onclick) {
        // Si es un <a> y el usuario presiona Space, evitar scroll y activar clic.
        e.preventDefault();
        try { btn.click(); } catch(err){}
      } else {
        // Elementos genéricos con role="button"
        e.preventDefault(); // evita scroll en Space
        try { btn.click(); } catch(err){}
      }
    }, true);

    // aseguramos estado inicial del carrito (si está vacío lo ocultamos)
    ocultarCarritoSiVacio();
  }

  /* Handlers */
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

  /* Añadir item */
  function agregarItemAlCarrito(titulo, precioTexto, imagenSrc) {
    if (!carritoItemsNode) return;

    // comprobar duplicados por título (normalizo a trim + minusculas)
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

  /* Mostrar/ocultar (solo clases) */
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
      // asegurar que el total muestre 0 cuando está vacío
      if (totalDisplayNode) totalDisplayNode.textContent = '0 $';
    }
  }

  /* Pagar (vaciar visualmente, pero el checkout temporal se crea en prepareCheckout()) */
  function pagarClicked() {
    if (!carritoItemsNode) return;
    while (carritoItemsNode.firstChild) carritoItemsNode.removeChild(carritoItemsNode.firstChild);
    actualizarTotalCarrito();
    persistirCarrito();
    ocultarCarritoSiVacio();
    try { sessionStorage.removeItem('checkout_cart'); localStorage.removeItem('carrito_for_checkout'); } catch(e){}
  }

  /* Persistencia: serializa carrito en localStorage (key 'carrito') */
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
      // silenciar errores de storage (p. ej. bloqueado)
    }
  }

  /* Actualizar total */
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

  /* PREPARAR CHECKOUT (temporal)
     - escribe sessionStorage['checkout_cart'] y localStorage['carrito_for_checkout']
     - usado justo antes de navegar a compra.html
  */
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

  // FIN del IIFE (no se expone nada a window)
})();


// ==== WhatsApp: quitar foco tras clic/touch para evitar cuadro azul persistente ====
(function(){
  function safeBlur(el){
    try{ el && el.blur(); }catch(e){}
  }

  document.addEventListener('pointerdown', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('#whatsapp a') : null;
    if(a){
      setTimeout(function(){ safeBlur(a); }, 0);
    }
  }, true);

  window.addEventListener('pageshow', function(){ safeBlur(document.querySelector('#whatsapp a')); });
  window.addEventListener('load', function(){ safeBlur(document.querySelector('#whatsapp a')); });
})();

/* ===== WhatsApp draggable (solo para pantallas pequeñas) =====
   - permite arrastrar el icono con el dedo/mouse
   - guarda la posición en localStorage ('whatsappPos')
   - solo activa el comportamiento si viewport width <= 600px
*/
(function(){
  function isMobileViewport() {
    try { return window.matchMedia('(max-width: 600px)').matches; } catch(e) { return false; }
  }
  if (!isMobileViewport()) return;

  var root = document.documentElement;
  var el = document.getElementById('whatsapp');
  if (!el) return;

  // Restaurar posición si existe
  try {
    var raw = localStorage.getItem('whatsappPos');
    if (raw) {
      var pos = JSON.parse(raw);
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        // convertimos a valores absolutos sobre la viewport
        el.style.left = (pos.x) + 'px';
        el.style.top = (pos.y) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    }
  } catch(e){}

  var dragging = false;
  var pointerId = null;
  var startX = 0, startY = 0, origLeft = 0, origTop = 0;

  function getNumericStyle(v) {
    return v ? parseFloat(v.replace('px','')) : 0;
  }

  el.addEventListener('pointerdown', function(ev){
    // si el pointer down ocurre sobre el enlace interno, permitimos que abra, pero si mantiene pulsado se arrastra
    // solo reaccionamos con primary button
    if (ev.button && ev.button !== 0) return;
    pointerId = ev.pointerId;
    dragging = true;
    el.setPointerCapture(pointerId);
    startX = ev.clientX;
    startY = ev.clientY;
    // ensure el has explicit left/top values
    var cs = window.getComputedStyle(el);
    origLeft = getNumericStyle(cs.left) || (window.innerWidth - el.getBoundingClientRect().right);
    origTop = getNumericStyle(cs.top) || (window.innerHeight - el.getBoundingClientRect().bottom);
    // if left/top not set, compute current left from right
    if (!cs.left || cs.left === 'auto') {
      // place based on right/bottom unless left is defined
      // set left to current left computed
      var rect = el.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      el.style.left = origLeft + 'px';
      el.style.top = origTop + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    startX = ev.clientX;
    startY = ev.clientY;
    origLeft = parseFloat(el.style.left || origLeft) || 0;
    origTop = parseFloat(el.style.top || origTop) || 0;
    ev.preventDefault();
  }, { passive: false });

  el.addEventListener('pointermove', function(ev){
    if (!dragging || ev.pointerId !== pointerId) return;
    var dx = ev.clientX - startX;
    var dy = ev.clientY - startY;
    var newLeft = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, origLeft + dx));
    var newTop = Math.max(6, Math.min(window.innerHeight - el.offsetHeight - 6, origTop + dy));
    el.style.left = newLeft + 'px';
    el.style.top = newTop + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    ev.preventDefault();
  }, { passive: false });

  function endDrag(ev) {
    if (!dragging || ev.pointerId !== pointerId) return;
    try { el.releasePointerCapture(pointerId); } catch(e){}
    dragging = false;
    pointerId = null;
    // guardar posición
    try {
      var rect = el.getBoundingClientRect();
      var pos = { x: Math.round(rect.left), y: Math.round(rect.top) };
      localStorage.setItem('whatsappPos', JSON.stringify(pos));
    } catch(e){}
  }

  el.addEventListener('pointerup', endDrag, false);
  el.addEventListener('pointercancel', endDrag, false);
  window.addEventListener('resize', function(){ /* opcional: podríamos reajustar límites si cambia viewport */ }, false);
})();
