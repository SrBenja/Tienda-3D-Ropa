/* Inicio de app.js */
(function(){
  'use strict';

  /* CONFIG: cambiar a true si quiero que vuelva a persistir en localStorage */
  const CART_PERSIST = false;

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

    // Si no quiero persistencia: limpiar cualquier rastro previo en localStorage/sessionStorage
    if (!CART_PERSIST) {
      try {
        localStorage.removeItem('carrito');
        localStorage.removeItem('carrito_ts');
        localStorage.removeItem('carrito_for_checkout');
        sessionStorage.removeItem('checkout_cart');
      } catch (e) { /* silenciar */ }
    }

    // Limpiar claves temporales de checkout al cargar la página principal
    try {
      sessionStorage.removeItem('checkout_cart');
      // no eliminamos carrito_for_checkout aquí si CART_PERSIST true; si false ya lo borramos arriba
    } catch(e) {}

    // Restaurar carrito desde storage solo si CART_PERSIST = true
    restaurarCarritoDesdeStorage();

    // Inicializar visibilidad del carrito:
    // si el carrito no tiene clases definidas, ocultarlo por defecto
    if (carritoNode && !carritoNode.classList.contains('carrito--hidden') && !carritoNode.classList.contains('carrito--visible')) {
      carritoNode.classList.add('carrito--hidden');
      carritoNode.setAttribute('aria-hidden', 'true');
    }

    // Si no hay items en el DOM (ni en storage), asegurarse total = 0 y ocultar carrito
    if (!carritoItemsNode || carritoItemsNode.childElementCount === 0) {
      if (totalDisplayNode) totalDisplayNode.textContent = formatWithSpaces(0) + ' $';
      if (carritoNode) {
        carritoNode.classList.remove('carrito--visible');
        carritoNode.classList.add('carrito--hidden');
        carritoNode.setAttribute('aria-hidden', 'true');
      }
    } else {
      // si hay items, recalcular total y mostrar carrito
      actualizarTotalCarrito();
      if (carritoNode) {
        carritoNode.classList.remove('carrito--hidden');
        carritoNode.classList.add('carrito--visible');
        carritoNode.setAttribute('aria-hidden', 'false');
      }
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

    // Inicializar total si hay valor en DOM (si no lo sobreescribió la restauración)
    if (totalDisplayNode) {
      const t = parsePriceToInt(totalDisplayNode.textContent || totalDisplayNode.innerText || '');
      totalDisplayNode.textContent = formatWithSpaces(t) + ' $';
    }

    // asegurar persistencia si se cierra la pestaña (si CART_PERSIST=true)
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

    // Registrar navegación interna para la lógica del hint (si el usuario navega a otra página,
    // marcamos sessionStorage 'wa_navigated' para que no se vuelva a mostrar el hint)
    document.addEventListener('click', function(e){
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      // ignorar enlaces con target="_blank" y anchors (#)
      if (a.target === '_blank') return;
      if (!href) return;
      if (href.startsWith('#')) return;
      // considerar interno si comienza con '/' o con origin
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === location.origin) {
          // marcar que navegó a otra página del sitio (no se mostrará hint a partir de ahora)
          sessionStorage.setItem('wa_navigated', '1');
        }
      } catch(e){}
    }, true);
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

    // Normalizar precio visual a formato "12 000 $"
    const precioInt = parsePriceToInt(precioTexto);
    const precioVisual = formatWithSpaces(precioInt) + ' $';

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
        <span class="carrito-item-precio">${escapeHtml(precioVisual)}</span>
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
      // asegurar total en 0 visualmente
      if (totalDisplayNode) totalDisplayNode.textContent = formatWithSpaces(0) + ' $';
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

  /* Persistencia: serializa carrito en localStorage (key 'carrito')
     Si CART_PERSIST === false la función no hará nada (no persiste). */
  function persistirCarrito() {
    if (!CART_PERSIST) return; // NO persistir si la config lo desactiva
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
     Si CART_PERSIST === false, aún así guardamos estos datos local/session para la página de checkout.
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

  /* Restaurar carrito desde localStorage (si hay data)
     SOLO se ejecuta si CART_PERSIST === true. */
  function restaurarCarritoDesdeStorage() {
    if (!CART_PERSIST) return;
    try {
      const raw = localStorage.getItem('carrito');
      if (!raw) return;
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) return;
      if (!carritoItemsNode) return;

      // limpiar nodo actual y reconstruir
      carritoItemsNode.innerHTML = '';
      items.forEach(it => {
        const titulo = it.name || 'Producto';
        const qty = Number.isFinite(it.qty) ? it.qty : (it.quantity || 1);
        const price = Number.isFinite(it.price) ? it.price : parsePriceToInt(it.price || 0);
        const img = it.img || it.image || '';

        const precioVisual = formatWithSpaces(price) + ' $';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'carrito-item';
        itemDiv.innerHTML = `
          <img src="${escapeHtml(img || '')}" width="80" height="80" alt="${escapeHtml(titulo)}">
          <div class="carrito-item-detalles">
            <span class="carrito-item-titulo">${escapeHtml(titulo)}</span>
            <div class="selector-cantidad">
              <i class="fa-solid fa-minus restar-cantidad" style="cursor:pointer" role="button" tabindex="0" aria-label="Disminuir cantidad" aria-hidden="false"></i>
              <input type="text" value="${escapeHtml(String(qty))}" class="carrito-item-cantidad" readonly>
              <i class="fa-solid fa-plus sumar-cantidad" style="cursor:pointer" role="button" tabindex="0" aria-label="Aumentar cantidad" aria-hidden="false"></i>
            </div>
            <span class="carrito-item-precio">${escapeHtml(precioVisual)}</span>
          </div>
          <span class="btn-eliminar" role="button" aria-label="Eliminar item" tabindex="0">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
          </span>
        `;
        carritoItemsNode.appendChild(itemDiv);
      });

      // actualizar total y mostrar carrito
      actualizarTotalCarrito();
      if (carritoNode) {
        carritoNode.classList.remove('carrito--hidden');
        carritoNode.classList.add('carrito--visible');
        carritoNode.setAttribute('aria-hidden', 'false');
      }
    } catch(e) {
      // si falla la restauración, silenciar
    }
  }

  // FIN del IIFE (no se expone nada a window)
})();


// ==== WhatsApp: improved long-press draggable + hint + fixes ====
(function(){
  'use strict';

  // helpers
  function safeBlur(el){
    try{ el && el.blur(); }catch(e){}
  }

  // evitar cuadro azul persistente al tocar
  document.addEventListener('pointerdown', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('#whatsapp a') : null;
    if(a){
      setTimeout(function(){ safeBlur(a); }, 0);
    }
  }, true);

  window.addEventListener('pageshow', function(){ safeBlur(document.querySelector('#whatsapp a')); });
  window.addEventListener('load', function(){ safeBlur(document.querySelector('#whatsapp a')); });

  // ---------- CONFIG / constantes ----------
  const WA_KEY = 'wa_pos_v3'; // sessionStorage key
  // detectar mejor dispositivos táctiles; mantenemos fallback si no soporta pointer media feature
  const WA_MQ = '(pointer: coarse) and (max-width: 850px)'; // límite móvil táctil
  const LONG_PRESS_MS = 350; // mantener para activar el arrastre
  const MOVE_CANCEL_THRESHOLD = 10; // px de movimiento que cancela el long-press
  const wa = document.querySelector('#whatsapp');
  if (!wa) return;

  // opciones (reutilizables) para add/removeEventListener — evita problemas de compatibilidad
  const LISTEN_OPTIONS_MOVE = { passive: false }; // pointermove (necesitamos preventDefault cuando dragging)
  const LISTEN_OPTIONS_UP   = { passive: true };  // pointerup/cancel (no es necesario prevenir)
  const LISTEN_OPTIONS_DOWN = false;               // pointerdown (¿captura? usamos false)

  let enabled = false;
  let longPressTimer = null;
  let pointerId = null;
  let startClientX = 0, startClientY = 0;
  let elemStartLeft = 0, elemStartTop = 0;
  let dragging = false;
  let suppressClick = false;
  let contextMenuHandler = null;
  let dragstartHandler = null;
  let savedBubbleWidthDuringDrag = null;

  // clamp a la ventana para que no desaparezca
  function clampPosition(left, top) {
    const w = wa.offsetWidth;
    const h = wa.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth - w);
    const maxTop = Math.max(0, window.innerHeight - h);
    const clampedLeft = Math.min(Math.max(0, Math.round(left)), maxLeft);
    const clampedTop = Math.min(Math.max(0, Math.round(top)), maxTop);
    return { left: clampedLeft, top: clampedTop };
  }

  // aplicar posición en px (usa left/top; limpia right/bottom)
  function applyPosition(left, top) {
    wa.style.position = wa.style.position || 'fixed';
    wa.style.left = left + 'px';
    wa.style.top = top + 'px';
    wa.style.right = 'auto';
    wa.style.bottom = 'auto';
  }

  // guardar en sessionStorage (persistencia por sesión)
  function savePosition(left, top) {
    try {
      const w = wa.offsetWidth;
      const h = wa.offsetHeight;
      const availW = Math.max(1, window.innerWidth - w);
      const availH = Math.max(1, window.innerHeight - h);
      const percentLeft = availW > 0 ? left / availW : 0;
      const percentTop = availH > 0 ? top / availH : 0;
      const payload = {
        left: left,
        top: top,
        percentLeft: Math.min(Math.max(0, percentLeft), 1),
        percentTop: Math.min(Math.max(0, percentTop), 1),
        vw: window.innerWidth,
        vh: window.innerHeight,
        ts: Date.now()
      };
      sessionStorage.setItem(WA_KEY, JSON.stringify(payload));
    } catch(e){}
  }

  // restaurar: preferir el recálculo basado en porcentajes para las rotaciones
  function restorePositionIfAny() {
    try {
      const raw = sessionStorage.getItem(WA_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj) return false;

      const w = wa.offsetWidth;
      const h = wa.offsetHeight;
      // si el elemento está oculto o no tiene tamaño, no intentamos restaurar ahora
      if (!w || !h) return false;

      const availW = Math.max(0, window.innerWidth - w);
      const availH = Math.max(0, window.innerHeight - h);

      let left = typeof obj.percentLeft === 'number' ? Math.round((availW) * obj.percentLeft) : (typeof obj.left === 'number' ? obj.left : null);
      let top  = typeof obj.percentTop === 'number'  ? Math.round((availH) * obj.percentTop)  : (typeof obj.top === 'number'  ? obj.top  : null);

      if (left === null || top === null) return false;

      const clamped = clampPosition(left, top);
      applyPosition(clamped.left, clamped.top);
      return true;
    } catch(e){
      return false;
    }
  }

  function resetToCorner() {
    // restablecer esquina inferior derecha con offset 12px (comportamiento por defecto)
    wa.style.left = 'auto';
    wa.style.top = 'auto';
    wa.style.right = '12px';
    wa.style.bottom = '12px';
    try { sessionStorage.removeItem(WA_KEY); } catch(e){}
  }

  function startDrag() {
    if (dragging) return;
    dragging = true;
    suppressClick = true;
    wa.classList.add('dragging');
    // evitar gestos de scroll mientras arrastramos
    wa.style.touchAction = 'none';
    // evitar selección accidental mientras arrastramos
    wa.style.userSelect = 'none';
    wa.style.webkitUserSelect = 'none';
    try {
      if (pointerId != null && wa.setPointerCapture) wa.setPointerCapture(pointerId);
    } catch(e){}

    // fijar ancho de la burbuja para que no cambie mientras movemos
    const bubble = wa.querySelector('.whatsapp-bubble');
    if (bubble) {
      savedBubbleWidthDuringDrag = bubble.offsetWidth;
      bubble.style.width = savedBubbleWidthDuringDrag + 'px';
      bubble.style.boxSizing = 'border-box';
    }
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    wa.classList.remove('dragging');
    wa.style.touchAction = '';
    // restaurar selección
    wa.style.userSelect = '';
    wa.style.webkitUserSelect = '';
    try {
      if (pointerId != null && wa.releasePointerCapture) wa.releasePointerCapture(pointerId);
    } catch(e){}
    // guardar posición actual (clamped)
    const rect = wa.getBoundingClientRect();
    const clamped = clampPosition(rect.left, rect.top);
    applyPosition(clamped.left, clamped.top);
    savePosition(clamped.left, clamped.top);
    // quitar listener contextmenu agregado en pointerdown (si existe)
    if (contextMenuHandler) {
      wa.removeEventListener('contextmenu', contextMenuHandler, true);
      contextMenuHandler = null;
    }
    // quitar dragstart preventer
    if (dragstartHandler) {
      const anchor = wa.querySelector('a');
      anchor && anchor.removeEventListener('dragstart', dragstartHandler, true);
      dragstartHandler = null;
    }
    // restaurar estilo burbuja
    const bubble = wa.querySelector('.whatsapp-bubble');
    if (bubble) {
      bubble.style.width = '';
    }
    // evitar que el click inmediato que sigue (por pointerup) abra el enlace
    setTimeout(()=>{ suppressClick = false; }, 350);
  }

  // pointer handlers
  function onPointerDown(e) {
    // solo en mobile por matchMedia y evitar mouse en desktop
    try {
      if (!window.matchMedia || !window.matchMedia(WA_MQ).matches) return;
    } catch(err) {
      // si matchMedia falla por sintaxis, fallback a ancho
      if (window.innerWidth > 850) return;
    }
    if (e.pointerType === 'mouse') return; // evitar activar con mouse (desktop)
    // solo iniciar si el pointer se originó sobre el whatsapp (o su hijo)
    if (!e.target || !wa.contains(e.target)) return;

    // store baseline
    pointerId = e.pointerId;
    startClientX = e.clientX;
    startClientY = e.clientY;
    const rect = wa.getBoundingClientRect();
    elemStartLeft = rect.left;
    elemStartTop = rect.top;

    // agregar handler contextmenu para bloquear el menú nativo (se quita en pointerup/endDrag)
    contextMenuHandler = function(ev) {
      ev.preventDefault();
      ev.stopPropagation && ev.stopPropagation();
      return false;
    };
    wa.addEventListener('contextmenu', contextMenuHandler, true);

    // prevenir dragstart nativo sobre el anchor/svg (esto soluciona "arrastrar enlace")
    dragstartHandler = function(ev) {
      ev.preventDefault();
      return false;
    };
    const anchor = wa.querySelector('a');
    anchor && anchor.addEventListener('dragstart', dragstartHandler, true);
    // además forzamos draggable=false
    if (anchor) anchor.setAttribute('draggable', 'false');

    // preparar long-press
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTimer = setTimeout(function(){
      longPressTimer = null;
      // iniciar arrastre
      startDrag();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    // si el puntero se movió significativamente antes de la pulsación larga -> cancelar la pulsación larga
    if (!dragging && longPressTimer && e.pointerId === pointerId) {
      const dx = Math.abs(e.clientX - startClientX);
      const dy = Math.abs(e.clientY - startClientY);
      if (dx > MOVE_CANCEL_THRESHOLD || dy > MOVE_CANCEL_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    // dragging: actualizar posición
    if (dragging && e.pointerId === pointerId) {
      // evitar comportamiento por defecto (texto/imagen arrastrada)
      try { e.preventDefault(); } catch(err){}
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      const newLeft = elemStartLeft + dx;
      const newTop = elemStartTop + dy;
      const clamped = clampPosition(newLeft, newTop);
      applyPosition(clamped.left, clamped.top);
    }
  }

  function onPointerUp(e) {
    // cancelar pulsación larga si está pendiente
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // si estuviéramos arrastrando, finalizar
    if (dragging && e.pointerId === pointerId) {
      endDrag();
    } else {
      // no arrastrar: aún elimina el controlador del menú contextual temporal si lo hay
      if (contextMenuHandler) {
        wa.removeEventListener('contextmenu', contextMenuHandler, true);
        contextMenuHandler = null;
      }
      if (dragstartHandler) {
        const anchor = wa.querySelector('a');
        anchor && anchor.removeEventListener('dragstart', dragstartHandler, true);
        dragstartHandler = null;
      }
    }

    pointerId = null;
  }

  // evitar que el click posterior al drag abra el enlace
  function onClickAnchor(e) {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
      return false;
    }
    return true;
  }

  // Mostrar hint (solo en móvil) — se muestra 3s a menos que se haya navegado a otra página
  function showDragHintOnceIfNeeded() {
    try {
      // preferimos primero matchMedia, con fallback
      if (window.matchMedia) {
        try {
          if (!window.matchMedia(WA_MQ).matches) return;
        } catch(err) {
          if (window.innerWidth > 850) return;
        }
      } else {
        if (window.innerWidth > 850) return;
      }
      // no mostrar si ya navegó a otra página
      if (sessionStorage.getItem('wa_navigated') === '1') return;

      // crear hint si no existe
      if (document.querySelector('.wa-drag-hint')) {
        // resetear visibilidad
        const existing = document.querySelector('.wa-drag-hint');
        existing.classList.add('show');
        setTimeout(()=> existing.classList.remove('show'), 3000);
        return;
      }

      const div = document.createElement('div');
      div.className = 'wa-drag-hint';
      div.textContent = 'Mantenga presionado el icono de WhatsApp para moverlo';
      document.body.appendChild(div);
      // mostrar
      requestAnimationFrame(()=> div.classList.add('show'));
      setTimeout(()=> {
        div.classList.remove('show');
        setTimeout(()=> { try{ div.remove(); }catch(e){} }, 200);
      }, 3000);
    } catch(e){}
  }

  // activar/desactivar según matchMedia
  function enableBehaviour() {
    if (enabled) return;
    // restaurar pos si hay alguno (basado en porcentaje)
    const restored = restorePositionIfAny();
    if (!restored) {
      // dejar comportamiento por defecto (esquina) — no tocar
      if (!wa.style.left && !wa.style.top) {
        wa.style.right = wa.style.right || '12px';
        wa.style.bottom = wa.style.bottom || '12px';
      }
    }
    // listeners
    wa.addEventListener('pointerdown', onPointerDown, LISTEN_OPTIONS_DOWN);
    // pointermove no-passive para permitir e.preventDefault() cuando dragging
    document.addEventListener('pointermove', onPointerMove, LISTEN_OPTIONS_MOVE);
    document.addEventListener('pointerup', onPointerUp, LISTEN_OPTIONS_UP);
    document.addEventListener('pointercancel', onPointerUp, LISTEN_OPTIONS_UP);
    // Supresión de clics en el ancla dentro
    const anchor = wa.querySelector('a');
    if (anchor) {
      anchor.addEventListener('click', onClickAnchor, true);
      // asegurar no draggable
      anchor.setAttribute('draggable', 'false');
      // prevenir dragstart globalmente (redundante pero útil)
      anchor.addEventListener('dragstart', function(ev){ ev.preventDefault(); }, true);
    }
    // también evita el arranque lento en imágenes internas
    const imgs = wa.querySelectorAll('img, svg');
    imgs.forEach(i => {
      try { i.addEventListener('dragstart', function(ev){ ev.preventDefault(); }, true); } catch(e){}
      try { i.setAttribute && i.setAttribute('draggable', 'false'); } catch(e){}
    });

    setTimeout(showDragHintOnceIfNeeded, 300);

    enabled = true;
  }

  function disableBehaviour() {
    if (!enabled) return;
    try {
      wa.removeEventListener('pointerdown', onPointerDown, LISTEN_OPTIONS_DOWN);
      document.removeEventListener('pointermove', onPointerMove, LISTEN_OPTIONS_MOVE);
      document.removeEventListener('pointerup', onPointerUp, LISTEN_OPTIONS_UP);
      document.removeEventListener('pointercancel', onPointerUp, LISTEN_OPTIONS_UP);
      const anchor = wa.querySelector('a');
      if (anchor) anchor.removeEventListener('click', onClickAnchor, true);
    } catch(e){}
    const raw = sessionStorage.getItem(WA_KEY);
    if (!raw) {
      resetToCorner();
    } else {
    
      restorePositionIfAny();
    }
    enabled = false;
  }

  function handleMqChange(mq) {
    if (mq.matches) enableBehaviour(); else disableBehaviour();
  }

  // init
  try {
    if (window.matchMedia) {
      const mql = window.matchMedia(WA_MQ);
    
      if (mql.matches) enableBehaviour();
      else disableBehaviour();
   
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', e => handleMqChange(e));
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(handleMqChange);
      }
    } else {
     
      if (window.innerWidth <= 850) enableBehaviour();
      window.addEventListener('resize', function(){
        if (window.innerWidth <= 850) enableBehaviour(); else disableBehaviour();
      });
    }
  } catch(e){
    
  }

  // Asegurar que al cambiar tamaño/orientación la posición se re-clamp y no desaparezca
  window.addEventListener('orientationchange', function(){
    restorePositionIfAny();
  });

  window.addEventListener('resize', function(){
    restorePositionIfAny();
  });

})();
