let WHEEL_ENABLED = false;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxa_QOlRE-lpIqmNYqoiSjVZ9zJ2Bx0GmPFwZeTmMn2ga67EUPteMgBaDKfWUMzIBkw/exec';

function heroWA() {
  const number = (data && data.business && data.business.whatsapp) || '541158098137';
  window.open(`https://wa.me/${number}?text=${encodeURIComponent('Hola TUPAN! 😀')}`, '_blank');
}

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

let data = null;
let selectedZone = null;
let cart = {};
let paymentMethod = null;
let clientType = 'habitual';
let activeDiscount = null;
let wheelSpinning = false;
let currentWheelRotation = 0;

const WHEEL_SEGMENTS = [
  { wheelLabel: 'Lactal\nGRATIS', label: 'Pan Lactal GRATIS', type: 'product', value: 0,  color: '#8B5E2A', textColor: '#ffffff', weight: 8,  productId: 'lactal-integral' },
  { wheelLabel: '5%\nOFF',        label: '5% OFF',            type: 'percent', value: 5,  color: '#F5E6CC', textColor: '#3D2B1F', weight: 35 },
  { wheelLabel: '10%\nOFF',       label: '10% OFF',           type: 'percent', value: 10, color: '#C17F3D', textColor: '#ffffff', weight: 30 },
  { wheelLabel: 'Lactal\nGRATIS', label: 'Pan Lactal GRATIS', type: 'product', value: 0,  color: '#8B5E2A', textColor: '#ffffff', weight: 8,  productId: 'lactal-integral' },
  { wheelLabel: '15%\nOFF',       label: '15% OFF',           type: 'percent', value: 15, color: '#C17F3D', textColor: '#ffffff', weight: 14 },
  { wheelLabel: '20%\nOFF',       label: '20% OFF',           type: 'percent', value: 20, color: '#F5E6CC', textColor: '#3D2B1F', weight: 5  },
];

async function init() {
  // Intentar cargar desde el dashboard (Apps Script); si falla, usar products.json local
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=productos&t=' + Date.now());
    const j = await res.json();
    if (j.ok && j.data) {
      data = j.data;
    } else {
      throw new Error('sin datos');
    }
  } catch (e) {
    try {
      const res = await fetch('products.json');
      data = await res.json();
    } catch (e2) {
      console.error('Error cargando productos:', e2);
      return;
    }
  }

  WHEEL_ENABLED = data.business && data.business.wheelEnabled === true;

  renderLanding();
  renderZoneButtons();
  bindEvents();
  checkExistingDiscount();

  const heroBtn = document.getElementById('hero-wheel-btn');
  if (WHEEL_ENABLED) {
    if (heroBtn) {
      heroBtn.innerHTML = '✦ <span>Descuentos</span>';
      heroBtn.className = heroBtn.className.replace('action-btn--whatsapp', 'action-btn--wheel');
      heroBtn.onclick = () => openWheelModal();
    }
  } else {
    activeDiscount = null;
    localStorage.removeItem('tupan_disc_v3');
    document.getElementById('wheel-overlay')?.classList.add('hidden');
    document.getElementById('header-discount-btn')?.classList.add('hidden');
  }

  await checkCouponParam();
}

// ══════════════════════════════
// CUPÓN — helpers compartidos
// ══════════════════════════════

function getCouponDesc(c) {
  return c.type === 'percent'  ? c.value + '% OFF'
       : c.type === 'fixed'    ? '-$' + c.value
       : 'Envío gratis';
}

async function fetchCoupon(code) {
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=cupones');
    const j = await res.json();
    if (!j.ok) return null;
    return j.coupons.find(c => c.code === code.toUpperCase() && c.active) || null;
  } catch(e) { return null; }
}

// ══════════════════════════════
// CUPÓN POR URL
// ══════════════════════════════

async function checkCouponParam() {
  const cuponCode = new URLSearchParams(window.location.search).get('cupon');
  if (!cuponCode) return;
  showZoneOverlay(); // ir a zona de inmediato, sin esperar la API
  const c = await fetchCoupon(cuponCode); // validar en segundo plano
  if (!c) return; // inválido o vencido → activeDiscount queda null, sin error
  const desc = getCouponDesc(c);
  activeDiscount = { type: c.type, value: c.value, label: c.code + ' · ' + desc, source: 'cupon' };
  showCouponBanner(c.code, desc);
}

function showCouponBanner(code, desc) {
  const banner = document.createElement('div');
  banner.id = 'coupon-banner';
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#2B7A4B', 'color:#fff', 'text-align:center',
    'padding:12px 16px', 'font-size:14px', 'font-weight:600',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)', 'cursor:pointer'
  ].join(';');
  banner.innerHTML = '✅ Cupón <strong>' + code + '</strong> aplicado: ' + desc + ' &nbsp;<span style="opacity:.7;font-size:12px">(toca para cerrar)</span>';
  banner.onclick = () => banner.remove();
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// ══════════════════════════════
// CUPÓN MANUAL DESDE EL CARRITO
// ══════════════════════════════

async function applyCouponFromInput() {
  const input = document.getElementById('coupon-code');
  const code = (input?.value || '').trim().toUpperCase();
  const errorEl = document.getElementById('coupon-error');
  const btn = document.querySelector('.coupon-apply-btn');

  if (!code) return;
  if (errorEl) errorEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }

  const c = await fetchCoupon(code);

  if (btn) { btn.disabled = false; btn.textContent = 'Aplicar'; }

  if (c) {
    const desc = getCouponDesc(c);
    activeDiscount = { type: c.type, value: c.value, label: c.code + ' · ' + desc, source: 'cupon' };
    renderCartItems();
  } else {
    if (errorEl) {
      errorEl.textContent = 'Cupón inválido o vencido.';
      errorEl.style.display = 'block';
    }
  }
}

function removeCoupon() {
  activeDiscount = null;
  const input = document.getElementById('coupon-code');
  if (input) input.value = '';
  renderCartItems();
}

function updateCouponUI() {
  const section   = document.getElementById('coupon-section');
  const inputRow  = document.getElementById('coupon-input-row');
  const applied   = document.getElementById('coupon-applied');
  const badgeLbl  = document.getElementById('coupon-badge-label');
  const errorEl   = document.getElementById('coupon-error');
  if (!section) return;

  const isCoupon = activeDiscount?.source === 'cupon';
  section.style.display = 'block';
  if (isCoupon) {
    if (inputRow) inputRow.style.display = 'none';
    if (applied)  applied.style.display  = 'flex';
    if (badgeLbl) badgeLbl.textContent   = activeDiscount.label;
  } else {
    if (inputRow) inputRow.style.display = 'flex';
    if (applied)  applied.style.display  = 'none';
  }
  if (errorEl) errorEl.style.display = 'none';
}

// ══════════════════════════════
// LANDING
// ══════════════════════════════

function renderLanding() {
  const b = data.business;

  document.getElementById('landing-about-p1').textContent = b.about;
  document.getElementById('landing-about-p2').textContent = b.about2;
  document.getElementById('landing-about-p3').textContent = b.about3 || '';
  document.getElementById('landing-about-p4').textContent = b.about4 || '';
  const footerText = `© ${new Date().getFullYear()} ${b.name} · Todos los derechos reservados`;
  document.getElementById('footer-text').textContent = footerText;
  document.getElementById('app-footer-text').textContent = footerText;

  document.getElementById('hero-instagram').href = `https://instagram.com/${b.instagram}`;
  document.getElementById('hero-whatsapp').href = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent('Hola TUPAN! 😀')}`;

  document.getElementById('landing-contact-list').innerHTML = `
    <div class="contact-item">
      <span class="contact-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
      <span>${b.location}</span>
    </div>
    <a href="https://wa.me/${b.whatsapp}?text=${encodeURIComponent('Hola TUPAN! 😀')}" class="contact-item" target="_blank" rel="noopener">
      <span class="contact-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span>
      <span>+${b.whatsapp}</span>
    </a>
    <a href="https://instagram.com/${b.instagram}" class="contact-item" target="_blank" rel="noopener">
      <span class="contact-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></span>
      <span>@${b.instagram}</span>
    </a>
  `;
}

function scrollToHow() {
  document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' });
}

function scrollToAbout() {
  document.getElementById('landing-about').scrollIntoView({ behavior: 'smooth' });
}

// ══════════════════════════════
// ZONE SELECTION
// ══════════════════════════════

function renderZoneButtons() {
  const container = document.getElementById('zone-buttons');
  container.innerHTML = data.zones.map(zone => `
    <button class="zone-btn" data-zone="${zone.id}">
      <span class="zone-icon">📍</span>
      <span class="zone-text">
        <span class="zone-name">${zone.name}</span>
        ${zone.subtitle ? `<span class="zone-sub">${zone.subtitle}</span>` : ''}
      </span>
    </button>
  `).join('');

  container.querySelectorAll('.zone-btn').forEach(btn => {
    btn.addEventListener('click', () => selectZone(btn.dataset.zone));
  });
}

function selectZone(zoneId) {
  selectedZone = data.zones.find(z => z.id === zoneId);
  cart = {};
  paymentMethod = null;
  clientType = 'habitual';

  document.getElementById('zone-overlay').classList.add('hidden');
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderProducts();
  renderZoneBanner();
  updateCartBtn();
}

function showZoneOverlay() {
  document.getElementById('zone-overlay').classList.remove('hidden');
}

function goToLanding() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('zone-overlay').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
  cart = {};
  selectedZone = null;
  paymentMethod = null;
  clientType = 'habitual';
  updateCartBtn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════
// PRODUCTS
// ══════════════════════════════

function renderZoneBanner() {
  document.getElementById('zone-banner').textContent =
    `${selectedZone.name}  ·  ${selectedZone.shipping.message}`;
}

function renderProducts() {
  const grid = document.getElementById('products-grid');

  // Agrupar por categoría: "Combos de la semana" siempre primero, luego orden de aparición
  const categories = [];
  const byCategory = {};
  data.products.forEach(product => {
    if (product.hidden === true) return;
    if (product.activeZones && product.activeZones.length > 0 && !product.activeZones.includes(selectedZone.id)) return;
    const price = product.prices[selectedZone.id];
    if (price === undefined || price === 0) return;
    const cat = product.categoria || 'Productos';
    if (!byCategory[cat]) { byCategory[cat] = []; categories.push(cat); }
    byCategory[cat].push(product);
  });

  // Combos de la semana siempre primero
  const comboKey = 'Combos de la semana';
  const sortedCats = [
    ...categories.filter(c => c === comboKey),
    ...categories.filter(c => c !== comboKey)
  ];

  if (!sortedCats.length) { grid.innerHTML = ''; return; }

  const showHeaders = sortedCats.length > 1 || (sortedCats.length === 1 && sortedCats[0] !== 'Productos');

  grid.innerHTML = sortedCats.map(cat => {
    const products = byCategory[cat];
    const catId = 'cat-' + cat.replace(/\s+/g, '-').toLowerCase();
    const isCombo = cat === comboKey;
    const cardsHTML = products.map(product => {
      const price = product.prices[selectedZone.id];
      const salePrice = product.promoPrice ? product.promoPrice[selectedZone.id] : null;
      return productCardHTML(product, price, salePrice, isCombo);
    }).join('');

    if (!showHeaders) return `<div class="cat-grid">${cardsHTML}</div>`;

    return `
      <div class="category-section" id="${catId}">
        <button class="category-header" onclick="toggleCategory('${catId}')" aria-expanded="true">
          <span class="category-title">${cat}</span>
          <span class="category-count">${products.length} ${products.length === 1 ? 'producto' : 'productos'}</span>
          <span class="category-chevron">▾</span>
        </button>
        <div class="cat-grid cat-open">${cardsHTML}</div>
      </div>`;
  }).join('');
}

function toggleCategory(catId) {
  const section = document.getElementById(catId);
  if (!section) return;
  const grid = section.querySelector('.cat-grid');
  const btn = section.querySelector('.category-header');
  const chevron = section.querySelector('.category-chevron');
  const isOpen = grid.classList.contains('cat-open');
  grid.classList.toggle('cat-open', !isOpen);
  btn.setAttribute('aria-expanded', String(!isOpen));
  chevron.textContent = isOpen ? '▸' : '▾';
}

function productCardHTML(product, price, salePrice, featured = false) {
  const qty = cart[product.id] || 0;
  const imgContent = product.image
    ? `<img src="${product.image}" alt="${product.name}" loading="lazy" onload="this.classList.add('img-loaded')" onerror="this.parentElement.innerHTML='🍞'">`
    : '🍞';

  const hasPromo = salePrice != null && salePrice < price;
  const displayPrice = hasPromo ? salePrice : price;

  const priceHTML = hasPromo
    ? `<div class="product-price-promo">
         <span class="price-original">${fmt(price)}</span>
         <span class="price-sale">${fmt(salePrice)}</span>
       </div>`
    : `<div class="product-price">${fmt(price)}</div>`;

  return `
    <div class="product-card${featured ? ' product-card--featured' : ''}" id="card-${product.id}" data-price="${displayPrice}">
      ${hasPromo ? '<span class="promo-badge">PROMO</span>' : ''}
      <div class="product-img">${imgContent}</div>
      <div class="product-info">
        <div class="product-top">
          <div class="product-name">${product.name}</div>
          ${product.description ? `<div class="product-desc">${featured ? product.description.split('\n').filter(Boolean).map(l => `<span style="display:block">· ${l}</span>`).join('') : product.description}</div>` : ''}
        </div>
        <div class="product-footer">
          ${priceHTML}
          <div class="product-actions" id="actions-${product.id}">
            ${actionsHTML(product.id, qty)}
          </div>
        </div>
      </div>
    </div>`;
}

function actionsHTML(productId, qty) {
  if (qty === 0) {
    return `<button class="add-btn" onclick="addToCart('${productId}')">Agregar</button>`;
  }
  return `
    <div class="qty-controls">
      <button class="qty-btn" onclick="changeQty('${productId}', -1)">−</button>
      <span class="qty-display">${qty}</span>
      <button class="qty-btn" onclick="changeQty('${productId}', 1)">+</button>
    </div>`;
}

// ══════════════════════════════
// CART
// ══════════════════════════════

function addToCart(productId) {
  cart[productId] = 1;
  refreshActions(productId);
  updateCartBtn();
}

function changeQty(productId, delta) {
  cart[productId] = (cart[productId] || 0) + delta;
  if (cart[productId] <= 0) delete cart[productId];
  refreshActions(productId);
  updateCartBtn();
  if (document.getElementById('cart-panel').classList.contains('open')) {
    renderCartItems();
  }
}

function refreshActions(productId) {
  const el = document.getElementById(`actions-${productId}`);
  if (el) el.innerHTML = actionsHTML(productId, cart[productId] || 0);
}

function updateCartBtn() {
  const totalItems = Object.values(cart).reduce((s, q) => s + q, 0);
  const badge = document.getElementById('cart-count');
  badge.textContent = totalItems;
  badge.style.display = totalItems > 0 ? 'inline-flex' : 'none';
  document.getElementById('cart-btn').classList.toggle('cart-btn--active', totalItems > 0);
  updateFloatingCart(totalItems);
}

function updateFloatingCart(totalItems) {
  const bar = document.getElementById('floating-cart');
  if (!bar) return;
  if (totalItems === 0) {
    bar.classList.add('hidden');
    return;
  }
  const cartItems = Object.keys(cart)
    .map(id => ({ product: data.products.find(p => p.id === id), qty: cart[id] }))
    .filter(i => i.product);
  const subtotal = cartItems.reduce((s, { product, qty }) => s + getEffectivePrice(product) * qty, 0);
  document.getElementById('floating-cart-label').textContent =
    `Ver pedido · ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'} · ${fmt(subtotal)}`;
  bar.classList.remove('hidden');
}

function getEffectivePrice(product) {
  const base = product.prices[selectedZone.id];
  const sale = product.promoPrice ? product.promoPrice[selectedZone.id] : null;
  return (sale != null && sale < base) ? sale : base;
}

function lockBodyScroll() {
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, scrollY);
}

function openCart() {
  renderCartItems();
  document.getElementById('cart-panel').classList.add('open');
  document.getElementById('cart-overlay-bg').classList.add('open');
  document.getElementById('floating-cart')?.classList.add('hidden');
  lockBodyScroll();

  const scrollArea = document.querySelector('.cart-scroll-area');
  const paymentSection = document.getElementById('payment-section');
  if (scrollArea && paymentSection && paymentSection.style.display !== 'none') {
    setTimeout(() => {
      scrollArea.scrollTo({ top: paymentSection.offsetTop, behavior: 'smooth' });
    }, 1000);
  }
}

function closeCart() {
  document.getElementById('cart-panel').classList.remove('open');
  document.getElementById('cart-overlay-bg').classList.remove('open');
  unlockBodyScroll();
  updateCartBtn();
}

function renderCartItems() {
  const itemsEl = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  const whatsappBtn = document.getElementById('whatsapp-btn');
  const couponSection = document.getElementById('coupon-section');

  const cartItems = Object.keys(cart)
    .map(id => ({ product: data.products.find(p => p.id === id), qty: cart[id] }))
    .filter(item => item.product);

  if (cartItems.length === 0) {
    itemsEl.innerHTML = `
      <div class="empty-cart">
        <span class="empty-cart-icon">🛒</span>
        Tu carrito está vacío
      </div>`;
    summaryEl.innerHTML = '';
    document.getElementById('payment-section').style.display = 'none';
    if (couponSection) couponSection.style.display = 'none';
    whatsappBtn.disabled = true;
    return;
  }

  itemsEl.innerHTML = cartItems.map(({ product, qty }) => {
    const price = getEffectivePrice(product);
    const isCombo = product.categoria === 'Combos de la semana';
    const basePrice = product.prices[selectedZone.id];
    const savings = isCombo && basePrice > price ? (basePrice - price) * qty : 0;
    return `
      <div class="cart-item">
        <div class="cart-item-name">${product.name}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${product.id}', -1)">−</button>
          <span class="qty-display">${qty}</span>
          <button class="qty-btn" onclick="changeQty('${product.id}', 1)">+</button>
        </div>
        <div class="cart-item-price">${fmt(price * qty)}</div>
      </div>
      ${savings > 0 ? `<div class="combo-savings-row">🎉 Ahorrás <strong>${fmt(savings)}</strong> vs precio individual</div>` : ''}`;
  }).join('');

  updateCouponUI();

  // Subtotal display: usa precio base para combos (para mostrar el descuento)
  const comboSavings = cartItems.reduce((s, { product, qty }) => {
    if (product.categoria !== 'Combos de la semana') return s;
    const base = product.prices[selectedZone.id];
    const eff = getEffectivePrice(product);
    return base > eff ? s + (base - eff) * qty : s;
  }, 0);
  const displaySubtotal = cartItems.reduce((s, { product, qty }) => {
    const isCombo = product.categoria === 'Combos de la semana';
    return s + (isCombo ? product.prices[selectedZone.id] : getEffectivePrice(product)) * qty;
  }, 0);
  const subtotal = cartItems.reduce((s, { product, qty }) => s + getEffectivePrice(product) * qty, 0);
  const freeThreshold = selectedZone.shipping.freeThreshold;
  const shippingCost = selectedZone.shipping.cost;

  let discountAmount = 0;
  let shippingFree = false;
  if (activeDiscount?.type === 'percent') {
    discountAmount = Math.round(subtotal * activeDiscount.value / 100);
  } else if (activeDiscount?.type === 'shipping') {
    shippingFree = true;
  }

  const originallyFreeShipping = subtotal >= freeThreshold;
  const subtotalAfterDiscount = subtotal - discountAmount;
  const shipping = (shippingFree || originallyFreeShipping || subtotalAfterDiscount >= freeThreshold) ? 0 : shippingCost;
  const total = subtotalAfterDiscount + shipping;
  const missing = freeThreshold - subtotal;

  let noticeHTML = '';
  if (shippingCost > 0 && shipping > 0 && missing > 0 && !shippingFree) {
    noticeHTML = `<div class="shipping-notice">
      Agregá ${fmt(missing)} más para envío gratis
    </div>`;
  }

  const discountSource = activeDiscount?.source === 'cupon' ? 'cupón' : 'ruleta';
  let discountRowHTML = '';
  if (activeDiscount?.type === 'percent' && discountAmount > 0) {
    discountRowHTML = `<div class="summary-row discount">
      <span>${activeDiscount.value}% OFF (${discountSource})</span>
      <span>-${fmt(discountAmount)}</span>
    </div>`;
  } else if (activeDiscount?.type === 'shipping') {
    discountRowHTML = `<div class="summary-row discount">
      <span>Envio gratis (${discountSource})</span>
      <span>Gratis</span>
    </div>`;
  } else if (activeDiscount?.type === 'product') {
    discountRowHTML = `<div class="summary-row discount">
      <span>Premio: ${activeDiscount.label} 🎁</span>
      <span>Incluido</span>
    </div>`;
  }

  document.getElementById('payment-section').style.display = 'block';
  document.getElementById('client-section').style.display = paymentMethod ? 'block' : 'none';
  whatsappBtn.disabled = paymentMethod === null;

  const comboDiscountRowHTML = comboSavings > 0 ? `
    <div class="summary-row discount">
      <span>💰 Descuento combo semanal</span>
      <span>-${fmt(comboSavings)}</span>
    </div>` : '';

  summaryEl.innerHTML = `
    ${noticeHTML}
    <div class="summary-row"><span>Subtotal</span><span>${fmt(displaySubtotal)}</span></div>
    ${comboDiscountRowHTML}
    ${discountRowHTML}
    <div class="summary-row">
      <span>Envio</span>
      <span>${shipping === 0 ? 'Gratis' : fmt(shipping)}</span>
    </div>
    <div class="summary-row total"><span>Total</span><span>${fmt(total)}</span></div>`;
}

function sendWhatsApp() {
  const cartItems = Object.keys(cart)
    .map(id => ({ product: data.products.find(p => p.id === id), qty: cart[id] }))
    .filter(item => item.product);

  const subtotal = cartItems.reduce((s, { product, qty }) => s + getEffectivePrice(product) * qty, 0);
  const waComboSavings = cartItems.reduce((s, { product, qty }) => {
    if (product.categoria !== 'Combos de la semana') return s;
    const base = product.prices[selectedZone.id];
    const eff = getEffectivePrice(product);
    return base > eff ? s + (base - eff) * qty : s;
  }, 0);
  const waDisplaySubtotal = subtotal + waComboSavings;

  let discountAmount = 0;
  let shippingFree = false;
  if (activeDiscount?.type === 'percent') {
    discountAmount = Math.round(subtotal * activeDiscount.value / 100);
  } else if (activeDiscount?.type === 'shipping') {
    shippingFree = true;
  }
  const originallyFreeShipping = subtotal >= selectedZone.shipping.freeThreshold;
  const subtotalAfterDiscount = subtotal - discountAmount;
  const shipping = (shippingFree || originallyFreeShipping || subtotalAfterDiscount >= selectedZone.shipping.freeThreshold) ? 0 : selectedZone.shipping.cost;
  const total = subtotalAfterDiscount + shipping;

  const lines = cartItems.map(({ product, qty }) => {
    const price = getEffectivePrice(product);
    return `• [${qty}x] ${product.name}   ${fmt(price * qty)}`;
  }).join('\n');

  const pagoLabel = paymentMethod === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo';

  const parts = [
    `*Hola! Quiero hacer un pedido de TUPAN Precocido:*`,
    ``,
    `*Productos:*`,
    lines,
    ``,
    `*Resumen:*`,
    `Subtotal: ${fmt(waDisplaySubtotal)}`,
    ...(waComboSavings > 0 ? [`💰 Descuento combo semanal: -${fmt(waComboSavings)}`] : []),
    ...(activeDiscount?.type === 'percent' && discountAmount > 0
      ? [`${activeDiscount.value}% OFF: -${fmt(discountAmount)}`]
      : []),
    ...(activeDiscount?.type === 'shipping'
      ? [`Descuento: Envio gratis`]
      : []),
    ...(activeDiscount?.type === 'product'
      ? [`Premio: ${activeDiscount.label}`]
      : []),
    `Envio: ${shipping === 0 ? 'Gratis' : fmt(shipping)}`,
    `*Total: ${fmt(total)}*`,
    ``,
    `Pago: ${pagoLabel}`,
    `Zona: ${selectedZone.name}`,
  ];

  if (clientType === 'nuevo') {
    const nombre      = document.getElementById('field-nombre').value.trim();
    const apellido    = document.getElementById('field-apellido').value.trim();
    const direccion   = document.getElementById('field-direccion').value.trim();
    const barrio      = document.getElementById('field-barrio').value.trim();
    const entrecalles = document.getElementById('field-entrecalles').value.trim();
    parts.push(
      ``,
      `*Datos del cliente:*`,
      `Nombre: ${nombre} ${apellido}`,
      `Direccion: ${direccion}`,
      `Barrio/Lote: ${barrio}`,
      `Entre calles: ${entrecalles}`
    );
  }

  window.open(`https://wa.me/${data.business.whatsapp}?text=${encodeURIComponent(parts.join('\n'))}`, '_blank');
}

// ══════════════════════════════
// ABOUT (in-app tab)
// ══════════════════════════════

function renderBankDetails() {
  const bk = data.business.bank;
  document.getElementById('bank-alias').textContent   = bk.alias;
  document.getElementById('bank-cbu').textContent     = bk.cbu;
  document.getElementById('bank-titular').textContent = bk.titular;
  document.getElementById('bank-cuit').textContent    = bk.cuit;
  document.getElementById('bank-cuenta').textContent  = bk.cuenta;
  document.getElementById('bank-banco').textContent   = bk.banco;
}

function selectPayment(method) {
  paymentMethod = method;
  document.getElementById('pay-cash').classList.toggle('selected', method === 'efectivo');
  document.getElementById('pay-transfer').classList.toggle('selected', method === 'transferencia');
  const details = document.getElementById('transfer-details');
  if (method === 'transferencia') {
    details.classList.remove('hidden');
    renderBankDetails();
    document.getElementById('transfer-data').classList.add('hidden');
    document.getElementById('transfer-toggle-btn').textContent = '📋 Ver datos para transferir';
  } else {
    details.classList.add('hidden');
  }
  document.getElementById('client-section').style.display = 'block';
  document.getElementById('whatsapp-btn').disabled = false;
  setTimeout(() => {
    document.getElementById('client-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

function toggleTransferDetails() {
  const dataEl = document.getElementById('transfer-data');
  const btn = document.getElementById('transfer-toggle-btn');
  const hidden = dataEl.classList.toggle('hidden');
  btn.textContent = hidden ? '📋 Ver datos para transferir' : '🔼 Ocultar datos';
  if (!hidden) {
    setTimeout(() => {
      dataEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

function selectClientType(type) {
  clientType = type;
  document.getElementById('btn-habitual').classList.toggle('selected', type === 'habitual');
  document.getElementById('btn-nuevo').classList.toggle('selected', type === 'nuevo');
  document.getElementById('new-client-form').classList.toggle('hidden', type !== 'nuevo');
  if (type === 'nuevo') {
    setTimeout(() => {
      document.getElementById('new-client-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

function copyAlias() {
  const alias = document.getElementById('bank-alias').textContent;
  navigator.clipboard.writeText(alias).then(() => {
    const btn = document.getElementById('copy-alias-btn');
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}

// ══════════════════════════════
// WHEEL
// ══════════════════════════════

function checkExistingDiscount() {
  const saved = localStorage.getItem('tupan_disc_v3');
  if (!saved) return;
  try {
    activeDiscount = JSON.parse(saved);
    updateWheelFloatBtn();
  } catch(e) {
    localStorage.removeItem('tupan_disc_v3');
  }
}

function updateWheelFloatBtn() {
  const heroBtn = document.getElementById('hero-wheel-btn');
  const headerBtn = document.getElementById('header-discount-btn');
  if (activeDiscount) {
    if (heroBtn) {
      heroBtn.querySelector('span:last-child').textContent = '✅ ' + activeDiscount.label;
    }
    if (headerBtn) {
      headerBtn.textContent = '🎫 ' + activeDiscount.label;
      headerBtn.classList.remove('hidden');
    }
  } else {
    if (heroBtn) {
      heroBtn.querySelector('span:last-child').textContent = 'Descuentos exclusivos';
    }
    if (headerBtn) headerBtn.classList.add('hidden');
  }
}

function openWheelModal() {
  if (!WHEEL_ENABLED) return;
  document.getElementById('wheel-overlay').classList.remove('hidden');
  lockBodyScroll();
  drawWheel();

  if (activeDiscount) {
    document.querySelector('.wheel-container').style.display = 'none';
    document.querySelector('#wheel-overlay .overlay-sub').style.display = 'none';
    document.getElementById('spin-btn').style.display = 'none';
    document.getElementById('wheel-result-label').textContent = activeDiscount.label;
    document.getElementById('wheel-result').classList.remove('hidden');
    document.getElementById('wheel-btn-group').style.display = 'none';
    document.getElementById('wheel-close-buy-btn').classList.remove('hidden');
  }
}

function closeWheelModal() {
  document.getElementById('wheel-overlay').classList.add('hidden');
  unlockBodyScroll();
  document.querySelector('.wheel-container').style.display = '';
  document.querySelector('#wheel-overlay .overlay-sub').style.display = '';
}

function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = 145;
  const segCount = WHEEL_SEGMENTS.length;
  const segAngle = (2 * Math.PI) / segCount;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  WHEEL_SEGMENTS.forEach((seg, i) => {
    const startAngle = i * segAngle - Math.PI / 2;
    const endAngle   = startAngle + segAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    const midAngle = startAngle + segAngle / 2;
    const textR = radius * 0.58;

    ctx.translate(cx + textR * Math.cos(midAngle), cy + textR * Math.sin(midAngle));
    ctx.rotate(midAngle + Math.PI / 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = seg.textColor;
    const lines = (seg.wheelLabel || seg.label).split('\n');
    if (lines.length === 2) {
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(lines[0], 0, -10);
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.globalAlpha = 0.85;
      ctx.fillText(lines[1], 0, 8);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(lines[0], 0, 5);
    }
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
  ctx.fillStyle = '#8B5E2A';
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function weightedRandom() {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

function playWheelSounds() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  let ctx;
  try { ctx = new AudioCtx(); } catch(e) { return; }

  function beep(freq, vol, dur) {
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      o.type = 'triangle';
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + dur + 0.01);
    } catch(e) {}
  }

  function chime(freq, delay) {
    setTimeout(() => {
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        g.gain.setValueAtTime(0.55, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.6);
      } catch(e) {}
    }, delay);
  }

  for (let i = 0; i < 58; i++) {
    const progress = i / 58;
    const t = 6000 * (1 - Math.pow(1 - progress, 2.5));
    setTimeout(() => beep(250, 0.5, 0.055), t);
  }

  [523, 659, 784, 1047].forEach((freq, i) => chime(freq, 6300 + i * 130));
}

function spinWheel() {
  if (wheelSpinning) return;
  wheelSpinning = true;

  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;

  playWheelSounds();

  const winIndex = weightedRandom();
  const segDeg = 360 / WHEEL_SEGMENTS.length;
  const winCenterDeg = winIndex * segDeg + segDeg / 2;
  const extraSpins = 2520;
  const targetRotation = currentWheelRotation + extraSpins + (360 - (currentWheelRotation % 360) - winCenterDeg + 360) % 360;

  currentWheelRotation = targetRotation;

  const canvas = document.getElementById('wheel-canvas');
  canvas.style.transform = `rotate(${targetRotation}deg)`;

  setTimeout(() => {
    wheelSpinning = false;
    showWheelResult(winIndex);
  }, 6200);
}

function showWheelResult(winIndex) {
  const seg = WHEEL_SEGMENTS[winIndex];

  activeDiscount = {
    type:      seg.type,
    value:     seg.value,
    label:     seg.label,
    productId: seg.productId || null,
  };

  localStorage.setItem('tupan_disc_v3', JSON.stringify(activeDiscount));

  document.querySelector('.wheel-container').style.display = 'none';
  document.querySelector('#wheel-overlay .overlay-sub').style.display = 'none';

  document.getElementById('wheel-result-label').textContent = activeDiscount.label;
  document.getElementById('wheel-result').classList.remove('hidden');
  document.getElementById('wheel-btn-group').style.display = 'none';
  document.getElementById('wheel-close-buy-btn').classList.remove('hidden');

  updateWheelFloatBtn();
}

// ══════════════════════════════
// EVENTS
// ══════════════════════════════

function bindEvents() {
  document.getElementById('hero-order-btn').addEventListener('click', showZoneOverlay);
  document.getElementById('overlay-back-btn').addEventListener('click', () => {
    document.getElementById('zone-overlay').classList.add('hidden');
  });
  document.getElementById('back-to-landing-btn').addEventListener('click', goToLanding);
  document.getElementById('cart-btn').addEventListener('click', openCart);
  document.getElementById('close-cart-btn').addEventListener('click', closeCart);
  document.getElementById('cart-overlay-bg').addEventListener('click', closeCart);
  document.getElementById('whatsapp-btn').addEventListener('click', sendWhatsApp);
  document.getElementById('wheel-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeWheelModal();
  });

  // Allow pressing Enter in coupon input to apply
  const couponInput = document.getElementById('coupon-code');
  if (couponInput) {
    couponInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') applyCouponFromInput();
    });
  }
}

// ══════════════════════════════
// HELPERS
// ══════════════════════════════

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function fmtMsg(n) {
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

document.addEventListener('DOMContentLoaded', init);
