let data = null;
let selectedZone = null;
let cart = {};

async function init() {
  try {
    const res = await fetch('products.json');
    data = await res.json();
  } catch (e) {
    console.error('Error cargando productos:', e);
    return;
  }

  renderLanding();
  renderZoneButtons();
  bindEvents();
}

// ══════════════════════════════
// LANDING
// ══════════════════════════════

function renderLanding() {
  const b = data.business;

  document.getElementById('hero-location').textContent = b.location;
  document.getElementById('landing-about-p1').textContent = b.about;
  document.getElementById('landing-about-p2').textContent = b.about2;
  document.getElementById('footer-text').textContent = `© ${new Date().getFullYear()} ${b.name} · Todos los derechos reservados`;

  document.getElementById('hero-instagram').href = `https://instagram.com/${b.instagram}`;
  document.getElementById('hero-whatsapp').href = `https://wa.me/${b.whatsapp}`;

  document.getElementById('landing-contact-list').innerHTML = `
    <div class="contact-item">
      <span class="contact-icon">📍</span>
      <span>${b.location}</span>
    </div>
    <a href="https://wa.me/${b.whatsapp}" class="contact-item" target="_blank" rel="noopener">
      <span class="contact-icon">💬</span>
      <span>+${b.whatsapp}</span>
    </a>
    <a href="https://instagram.com/${b.instagram}" class="contact-item" target="_blank" rel="noopener">
      <span class="contact-icon">📸</span>
      <span>@${b.instagram}</span>
    </a>
  `;
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
        <span class="zone-desc">${zone.description}</span>
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

  document.getElementById('zone-overlay').classList.add('hidden');
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderProducts();
  renderZoneBanner();
  renderAbout();
  updateCartBtn();
  switchTab('products');
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
  updateCartBtn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════
// PRODUCTS
// ══════════════════════════════

function renderZoneBanner() {
  document.getElementById('zone-banner').textContent =
    `📍 ${selectedZone.name} — ${selectedZone.description}  ·  ${selectedZone.shipping.message}`;
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = data.products.map(product => {
    const price = product.prices[selectedZone.id];
    if (price === undefined) return '';
    const salePrice = product.promoPrice ? product.promoPrice[selectedZone.id] : null;
    return productCardHTML(product, price, salePrice);
  }).join('');
}

function productCardHTML(product, price, salePrice) {
  const qty = cart[product.id] || 0;
  const imgContent = product.image
    ? `<img src="${product.image}" alt="${product.name}" onerror="this.parentElement.innerHTML='🍞'">`
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
    <div class="product-card" id="card-${product.id}" data-price="${displayPrice}">
      ${hasPromo ? '<span class="promo-badge">PROMO</span>' : ''}
      <div class="product-img">${imgContent}</div>
      <div class="product-info">
        <div class="product-top">
          <div class="product-name">${product.name}</div>
          ${product.description ? `<div class="product-desc">${product.description}</div>` : ''}
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

function openCart() {
  renderCartItems();
  document.getElementById('cart-panel').classList.add('open');
  document.getElementById('cart-overlay-bg').classList.add('open');
  document.getElementById('floating-cart')?.classList.add('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-panel').classList.remove('open');
  document.getElementById('cart-overlay-bg').classList.remove('open');
  document.body.style.overflow = '';
  updateCartBtn();
}

function renderCartItems() {
  const itemsEl = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  const whatsappBtn = document.getElementById('whatsapp-btn');

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
    whatsappBtn.disabled = true;
    return;
  }

  whatsappBtn.disabled = false;

  itemsEl.innerHTML = cartItems.map(({ product, qty }) => {
    const price = getEffectivePrice(product);
    return `
      <div class="cart-item">
        <div class="cart-item-name">${product.name}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${product.id}', -1)">−</button>
          <span class="qty-display">${qty}</span>
          <button class="qty-btn" onclick="changeQty('${product.id}', 1)">+</button>
        </div>
        <div class="cart-item-price">${fmt(price * qty)}</div>
      </div>`;
  }).join('');

  const subtotal = cartItems.reduce((s, { product, qty }) => s + getEffectivePrice(product) * qty, 0);
  const freeThreshold = selectedZone.shipping.freeThreshold;
  const shippingCost = selectedZone.shipping.cost;
  const shipping = subtotal >= freeThreshold ? 0 : shippingCost;
  const total = subtotal + shipping;
  const missing = freeThreshold - subtotal;

  // Shipping notice: how far until free shipping (only if not already free and there's a cost)
  let noticeHTML = '';
  if (shippingCost > 0 && shipping > 0 && missing > 0) {
    noticeHTML = `<div class="shipping-notice">
      🚚 Agregá ${fmt(missing)} más para obtener envío gratis
    </div>`;
  }

  summaryEl.innerHTML = `
    ${noticeHTML}
    <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    <div class="summary-row">
      <span>Envío</span>
      <span>${shipping === 0 ? '¡Gratis! 🎉' : fmt(shipping)}</span>
    </div>
    <div class="summary-row total"><span>Total</span><span>${fmt(total)}</span></div>`;
}

function sendWhatsApp() {
  const cartItems = Object.keys(cart)
    .map(id => ({ product: data.products.find(p => p.id === id), qty: cart[id] }))
    .filter(item => item.product);

  const subtotal = cartItems.reduce((s, { product, qty }) => s + getEffectivePrice(product) * qty, 0);
  const shipping = subtotal >= selectedZone.shipping.freeThreshold ? 0 : selectedZone.shipping.cost;
  const total = subtotal + shipping;

  const lines = cartItems.map(({ product, qty }) => {
    const price = getEffectivePrice(product);
    return `• ${product.name} x${qty}: ${fmt(price * qty)}`;
  }).join('\n');

  const msg = [
    `¡Hola! Quiero hacer un pedido 😊`,
    ``,
    lines,
    ``,
    `Subtotal: ${fmt(subtotal)}`,
    `Envío: ${shipping === 0 ? 'Gratis 🎉' : fmt(shipping)}`,
    `*Total: ${fmt(total)}*`,
    ``,
    `Zona: ${selectedZone.name} — ${selectedZone.description}`
  ].join('\n');

  window.open(`https://wa.me/${data.business.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ══════════════════════════════
// ABOUT (in-app tab)
// ══════════════════════════════

function renderAbout() {
  const b = data.business;
  document.getElementById('about-text-1').textContent = b.about;
  document.getElementById('about-text-2').textContent = b.about2;
  document.getElementById('about-location').textContent = b.location;
  document.getElementById('about-whatsapp-link').href = `https://wa.me/${b.whatsapp}`;
  document.getElementById('about-whatsapp-text').textContent = `+${b.whatsapp}`;
  document.getElementById('about-instagram-link').href = `https://instagram.com/${b.instagram}`;
  document.getElementById('about-instagram-text').textContent = `@${b.instagram}`;
}

// ══════════════════════════════
// TABS
// ══════════════════════════════

function switchTab(section) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.section === section));
  document.getElementById('products-section').classList.toggle('hidden', section !== 'products');
  document.getElementById('about-section').classList.toggle('hidden', section !== 'about');
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
  document.getElementById('change-zone-btn').addEventListener('click', showZoneOverlay);
  document.getElementById('cart-btn').addEventListener('click', openCart);
  document.getElementById('close-cart-btn').addEventListener('click', closeCart);
  document.getElementById('cart-overlay-bg').addEventListener('click', closeCart);
  document.getElementById('whatsapp-btn').addEventListener('click', sendWhatsApp);

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.section));
  });
}

// ══════════════════════════════
// HELPERS
// ══════════════════════════════

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

document.addEventListener('DOMContentLoaded', init);
