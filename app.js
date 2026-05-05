let data = null;
let selectedZone = null;
let cart = {};
let paymentMethod = null;
let clientType = 'habitual';
let activeDiscount = null;
let wheelSpinning = false;
let currentWheelRotation = 0;

const WHEEL_SEGMENTS = [
  { wheelLabel: '5%\nOFF',         label: '5% de descuento',              type: 'percent', value: 5,  color: '#F5E6CC', textColor: '#3D2B1F' },
  { wheelLabel: '10%\nOFF',        label: '10% de descuento',             type: 'percent', value: 10, color: '#C17F3D', textColor: '#ffffff' },
  { wheelLabel: 'Lactal\nGRATIS',  label: 'Pan Lactal Integral gratis',   type: 'product', value: 0,  color: '#8B5E2A', textColor: '#ffffff', productId: 'lactal-integral' },
  { wheelLabel: '20%\nOFF',        label: '20% de descuento',             type: 'percent', value: 20, color: '#F5E6CC', textColor: '#3D2B1F' },
  { wheelLabel: '15%\nOFF',        label: '15% de descuento',             type: 'percent', value: 15, color: '#C17F3D', textColor: '#ffffff' },
  { wheelLabel: 'Flauton\nGRATIS', label: 'Flauton 2kg gratis',           type: 'product', value: 0,  color: '#8B5E2A', textColor: '#ffffff', productId: 'flauton-2kg' },
];

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
  checkExistingDiscount();
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
    whatsappBtn.disabled = true;
    return;
  }

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
  const missing = freeThreshold - subtotalAfterDiscount;

  let noticeHTML = '';
  if (shippingCost > 0 && shipping > 0 && missing > 0 && !shippingFree) {
    noticeHTML = `<div class="shipping-notice">
      Agregá ${fmt(missing)} más para envío gratis
    </div>`;
  }

  let discountRowHTML = '';
  if (activeDiscount?.type === 'percent' && discountAmount > 0) {
    discountRowHTML = `<div class="summary-row discount">
      <span>Descuento ${activeDiscount.value}% (ruleta)</span>
      <span>-${fmt(discountAmount)}</span>
    </div>`;
  } else if (activeDiscount?.type === 'shipping') {
    discountRowHTML = `<div class="summary-row discount">
      <span>Envio gratis (ruleta)</span>
      <span>Gratis</span>
    </div>`;
  } else if (activeDiscount?.type === 'product') {
    discountRowHTML = `<div class="summary-row discount">
      <span>Premio ruleta: ${activeDiscount.label} 🎁</span>
      <span>Incluido</span>
    </div>`;
  }

  document.getElementById('payment-section').style.display = 'block';
  document.getElementById('client-section').style.display = paymentMethod ? 'block' : 'none';
  whatsappBtn.disabled = paymentMethod === null;

  summaryEl.innerHTML = `
    ${noticeHTML}
    <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
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
    return `— [ ${qty} ] ${product.name} > ${fmt(price * qty)}`;
  }).join('\n');

  const pagoLabel = paymentMethod === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo';

  const parts = [
    `Hola! Quiero hacer un pedido:`,
    ``,
    lines,
    ``,
    `Subtotal: ${fmt(subtotal)}`,
    ...(activeDiscount?.type === 'percent' && discountAmount > 0
      ? [`Descuento (${activeDiscount.label}): -${fmt(discountAmount)}`]
      : []),
    ...(activeDiscount?.type === 'shipping'
      ? [`Descuento: Envio gratis (ruleta)`]
      : []),
    ...(activeDiscount?.type === 'product'
      ? [`Premio ruleta: ${activeDiscount.label} (gratis)`]
      : []),
    `Envio: ${shipping === 0 ? 'Gratis' : fmt(shipping)}`,
    `*Total: ${fmt(total)}*`,
    ``,
    `Medio de pago: ${pagoLabel}`,
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
      `--- Datos del cliente ---`,
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
  const saved = sessionStorage.getItem('tupan_discount');
  if (!saved) return;
  try {
    activeDiscount = JSON.parse(saved);
    updateWheelFloatBtn();
  } catch(e) {
    sessionStorage.removeItem('tupan_discount');
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

    // Translate to center of segment (radially)
    ctx.translate(cx + textR * Math.cos(midAngle), cy + textR * Math.sin(midAngle));
    // Rotate so character tops face the outer rim
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

function spinWheel() {
  if (wheelSpinning) return;
  wheelSpinning = true;

  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;

  const winIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
  const segDeg = 360 / WHEEL_SEGMENTS.length;
  const winCenterDeg = winIndex * segDeg + segDeg / 2;
  const extraSpins = 1800;
  const targetRotation = currentWheelRotation + extraSpins + (360 - (currentWheelRotation % 360) - winCenterDeg + 360) % 360;

  currentWheelRotation = targetRotation;

  const canvas = document.getElementById('wheel-canvas');
  canvas.style.transform = `rotate(${targetRotation}deg)`;

  setTimeout(() => {
    wheelSpinning = false;
    showWheelResult(winIndex);
  }, 4100);
}

function showWheelResult(winIndex) {
  const seg = WHEEL_SEGMENTS[winIndex];

  activeDiscount = {
    type:      seg.type,
    value:     seg.value,
    label:     seg.label,
    productId: seg.productId || null,
  };

  sessionStorage.setItem('tupan_discount', JSON.stringify(activeDiscount));

  // Ocultar la ruleta para que el resultado y el botón queden visibles
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
