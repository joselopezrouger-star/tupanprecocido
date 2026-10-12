let WHEEL_ENABLED = false;
// Apps Script queda solo como red de contención mientras no esté migrado
// el catálogo (ver fetchProductosFrescos_) — la fuente real ahora es
// Supabase, mismo proyecto que usa el dashboard para todo lo demás.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxa_QOlRE-lpIqmNYqoiSjVZ9zJ2Bx0GmPFwZeTmMn2ga67EUPteMgBaDKfWUMzIBkw/exec';
const DATA_CACHE_KEY = 'tupan_data_cache_v1';
// Mismo proyecto de Supabase que usa el dashboard — la clave "anon" es
// segura de tener acá: no da ningún permiso de escritura, la protección
// la dan las políticas RLS del lado del servidor (lectura pública de
// tienda_productos/tienda_zonas/tienda_negocio, escritura solo con login).
const SUPABASE_URL = 'https://kicclaaxuldkzouctmog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpY2NsYWF4dWxka3pvdWN0bW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTM0MTEsImV4cCI6MjA5OTE4OTQxMX0.ZOMP_kouT89OPw9SesL-NJ0TlvzNc7jpGj9HJRs7EF4';
const SB = (typeof window !== 'undefined' && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Trae {business, zones, products} directo de Supabase (tienda_productos/
// tienda_zonas/tienda_negocio) — reemplaza el fetch a Apps Script, que
// además de más lento (arranque en frío) tenía un límite de tamaño y podía
// devolver una página de error de Google en vez de datos.
async function fetchProductosDeSupabase_() {
  if (!SB) throw new Error('cliente de Supabase no disponible');
  const [prodRes, zonaRes, negocioRes] = await Promise.all([
    SB.from('tienda_productos').select('*').order('orden', { ascending: true }),
    SB.from('tienda_zonas').select('*').order('orden', { ascending: true }),
    SB.from('tienda_negocio').select('*').eq('id', 'main').maybeSingle()
  ]);
  if (prodRes.error) throw new Error(prodRes.error.message);
  if (zonaRes.error) throw new Error(zonaRes.error.message);
  if (negocioRes.error) throw new Error(negocioRes.error.message);
  const products = (prodRes.data || []).map(p => {
    const out = { id: p.id, name: p.name, description: p.description || '', image: p.image || '', prices: p.prices || {} };
    if (p.categoria) out.categoria = p.categoria;
    if (p.hidden) out.hidden = true;
    if (p.nuevo) out.nuevo = true;
    if (p.promo_price && Object.keys(p.promo_price).length) out.promoPrice = p.promo_price;
    if (p.active_zones && p.active_zones.length) out.activeZones = p.active_zones;
    return out;
  });
  const zones = (zonaRes.data || []).map(z => {
    const out = {
      id: z.id, name: z.name, description: z.description || '',
      shipping: { cost: z.shipping_cost || 0, freeThreshold: z.shipping_free_threshold || 0, message: z.shipping_message || '' }
    };
    if (z.subtitle) out.subtitle = z.subtitle;
    return out;
  });
  const n = negocioRes.data;
  const business = n ? {
    name: n.name || '', whatsapp: n.whatsapp || '', instagram: n.instagram || '', location: n.location || '',
    about: n.about || '', about2: n.about2 || '', about3: n.about3 || '', about4: n.about4 || '',
    bank: {
      banco: n.bank_banco || '', alias: n.bank_alias || '', cbu: n.bank_cbu || '',
      titular: n.bank_titular || '', cuit: n.bank_cuit || '', cuenta: n.bank_cuenta || ''
    },
    wheelEnabled: !!n.wheel_enabled,
    wheelResetAt: n.wheel_reset_at || null,
    categorias: n.categorias || [],
    incentivos: n.incentivos && Object.keys(n.incentivos).length ? n.incentivos : null
  } : { bank: {}, categorias: [] };
  return { business, zones, products };
}

function heroWA() {
  const number = (data && data.business && data.business.whatsapp) || '541158098137';
  window.open(`https://wa.me/${number}?text=${encodeURIComponent('Hola TUPAN! 😀')}`, '_blank');
}

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

let data = null;
// true recién cuando "data" vino confirmado del dashboard (Fase 2 de init(),
// o el fetch puntual de selectZone si el cliente elige zona antes de que esa
// fase termine) — mientras sea false, lo que hay en "data" puede ser el
// cache de localStorage o el products.json de resguardo, y puede estar
// desactualizado.
let dataFreshFromServer = false;
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

// Estado original del botón (WhatsApp) tal como está en el HTML, capturado
// una sola vez antes de que applyHeroBtn() lo empiece a mutar — así se puede
// restaurar tal cual cuando la ruleta se desactiva, en vez de dejarlo
// pegado en modo "Descuentos" sin acción.
const heroBtnEl = document.getElementById('hero-wheel-btn');
const HERO_BTN_DEFAULT_HTML = heroBtnEl ? heroBtnEl.innerHTML : '';
const HERO_BTN_DEFAULT_CLASS = heroBtnEl ? heroBtnEl.className : '';

// authoritative = true solo cuando WHEEL_ENABLED viene confirmado por el
// dashboard (Fase 2 de init()). La Fase 1 usa el wheelEnabled del
// products.json local, que puede estar desactualizado, así que con
// authoritative=false esta función nunca borra premios ni cupones — solo
// ajusta la UI. Así se evitan dos bugs opuestos: perder un premio recién
// ganado por una falsa alarma de la Fase 1, y que un premio de ruleta siga
// aplicándose en el carrito después de que el dashboard confirmó que la
// ruleta está apagada.
function applyHeroBtn(authoritative = false) {
  const heroBtn = document.getElementById('hero-wheel-btn');
  if (!heroBtn) return;
  if (WHEEL_ENABLED) {
    heroBtn.innerHTML = '✦ <span>Descuentos</span>';
    heroBtn.className = HERO_BTN_DEFAULT_CLASS.replace('action-btn--whatsapp', 'action-btn--wheel');
    heroBtn.onclick = () => openWheelModal();
  } else {
    heroBtn.innerHTML = HERO_BTN_DEFAULT_HTML;
    heroBtn.className = HERO_BTN_DEFAULT_CLASS;
    heroBtn.onclick = () => heroWA();

    if (authoritative && activeDiscount?.source !== 'cupon') {
      activeDiscount = null;
      localStorage.removeItem('tupan_disc_v3');
    }
    document.getElementById('wheel-overlay')?.classList.add('hidden');
    document.getElementById('header-discount-btn')?.classList.add('hidden');
  }
}

async function init() {
  // Fase 1: pintar lo más rápido posible.
  // Preferimos el último dato que trajimos con éxito del dashboard (guardado
  // en localStorage en la Fase 2 de una visita anterior) para el primer
  // render, porque el products.json commiteado en el repo puede tener
  // precios de hace días o semanas — es solo la red de contención para la
  // primera visita desde ese navegador, o si el cache está corrupto.
  let cachedData = null;
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.business && Array.isArray(parsed.products) && parsed.products.length) {
        cachedData = parsed;
      }
    }
  } catch (e) {
    localStorage.removeItem(DATA_CACHE_KEY);
  }

  try {
    const r = await fetch('products.json');
    data = await r.json();
  } catch (e) {
    console.error('Error cargando products.json:', e);
    if (!cachedData) return;
    data = null;
  }

  // localProducts (pool para completar imágenes en la Fase 2) siempre sale
  // del products.json crudo, no del cache — así los productos nuevos que
  // el cache todavía no vio también encuentran su imagen.
  const localProducts = (data && data.products) || [];
  if (cachedData) data = cachedData;
  if (!data) return;

  WHEEL_ENABLED = data.business && data.business.wheelEnabled === true;
  renderLanding();
  renderZoneButtons();
  bindEvents();
  checkExistingDiscount();
  applyHeroBtn();
  await checkCouponParam();

  // Fase 2: actualizar con datos del dashboard en segundo plano.
  // El Apps Script puede fallar de forma transitoria (cold start, red), así
  // que reintentamos antes de resignarnos a dejar el products.json viejo.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      data = await fetchProductosFrescos_(localProducts);
      dataFreshFromServer = true;
      try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      WHEEL_ENABLED = data.business && data.business.wheelEnabled === true;
      checkWheelReset_(data.business);
      renderLanding();
      renderZoneButtons();
      applyHeroBtn(true);
      if (selectedZone) {
        selectedZone = data.zones.find(z => z.id === selectedZone.id) || selectedZone;
        renderProducts();
      }
      break;
    } catch (e) {
      if (attempt === 3) {
        console.error('No se pudo actualizar desde el dashboard tras 3 intentos, se queda con products.json local:', e);
      } else {
        await new Promise(r => setTimeout(r, 700 * attempt));
      }
    }
  }
}

// Un único intento de traer productos/precios vigentes del dashboard, con
// timeout — lo comparten la Fase 2 de init() (que sí reintenta 3 veces) y
// selectZone() (un solo intento: si falla, mejor mostrar lo que ya había
// que dejar al cliente esperando en la pantalla de zona).
function backfillImagenesLocales_(products, localProducts) {
  (products || []).forEach(p => {
    if (!p.image && localProducts) {
      const local = localProducts.find(lp => lp.id === p.id);
      if (local && local.image) p.image = local.image;
    }
  });
}

async function fetchProductosFrescos_(localProducts, timeoutMs = 8000) {
  // Fuente principal: Supabase (mismo proyecto que usa el dashboard para
  // todo lo demás) — rápido, sin arranque en frío ni límite de tamaño.
  // Apps Script queda como puente único mientras el catálogo no se haya
  // migrado ahí todavía (ver "Migrar a Supabase" en el dashboard): apenas
  // haya productos en Supabase, este puente deja de usarse solo.
  try {
    const fresh = await Promise.race([
      fetchProductosDeSupabase_(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout consultando Supabase')), timeoutMs))
    ]);
    if (fresh.products && fresh.products.length) {
      backfillImagenesLocales_(fresh.products, localProducts);
      return fresh;
    }
  } catch (e) {
    console.error('No se pudo leer el catálogo de Supabase, se prueba Apps Script:', e);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=productos&t=' + Date.now(), { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j.ok || !j.data || !Array.isArray(j.data.products) || !j.data.products.length) {
      throw new Error('respuesta del dashboard sin productos');
    }
    const fresh = j.data;
    backfillImagenesLocales_(fresh.products, localProducts);
    return fresh;
  } finally {
    clearTimeout(timer);
  }
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
    if (!SB) return null;
    const { data: c, error } = await SB.from('cupones').select('*')
      .eq('code', code.toUpperCase()).eq('active', true).maybeSingle();
    if (error || !c) return null;
    return { code: c.code, type: c.type, value: c.value, description: c.description || '', minOrder: c.min_order || 0, expiry: c.expiry || '', active: c.active };
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
  updateWheelFloatBtn(); // refleja el cupón en el botón del header ya mismo
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

async function selectZone(zoneId) {
  selectedZone = data.zones.find(z => z.id === zoneId);
  cart = {};
  incentivoIds = {};
  paymentMethod = null;
  clientType = 'habitual';

  document.getElementById('zone-overlay').classList.add('hidden');
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderZoneBanner();
  updateCartBtn();

  // Si todavía no se confirmaron precios frescos del dashboard (el cliente
  // eligió la zona muy rápido, antes de que termine la Fase 2 de init()),
  // mostramos un cargando en vez de arriesgarnos a mostrar productos con
  // precios viejos del cache/products.json de resguardo.
  if (!dataFreshFromServer) {
    showProductsLoading_();
    try {
      const fresh = await fetchProductosFrescos_(data.products);
      data = fresh;
      dataFreshFromServer = true;
      try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      WHEEL_ENABLED = data.business && data.business.wheelEnabled === true;
      selectedZone = data.zones.find(z => z.id === zoneId) || selectedZone;
      renderZoneBanner();
      applyHeroBtn(true);
    } catch (e) {
      console.error('No se pudieron confirmar precios actualizados, se muestran los últimos disponibles:', e);
    }
  }

  renderProducts();
}

function showProductsLoading_() {
  const grid = document.getElementById('products-grid');
  if (grid) grid.innerHTML = `<div class="loading"><div class="loading-spinner"></div>Cargando productos y precios…</div>`;
}

function showZoneOverlay() {
  document.getElementById('zone-overlay').classList.remove('hidden');
}

function goToLanding() {
  if (pedidoAbierto) closeCart(true);
  incentivoIds = {};
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

// El texto guardado en shipping.message es libre (para poder personalizarlo
// desde el dashboard), pero mientras siga con el formato automático
// "Envío gratis a partir de $X" (o esté vacío) se ignora y se recalcula acá
// en vivo a partir del monto real — así el cartel nunca puede quedar
// mostrando un monto viejo aunque alguien haya cambiado el número sin
// volver a guardar la zona desde el dashboard (que es lo único que antes
// refrescaba este texto).
function shippingMessage_(zone) {
  var msg = (zone.shipping.message || '').trim();
  if (!msg || /^Env[ií]o gratis a partir de \$[\d.,]+$/.test(msg)) {
    return `Envío gratis a partir de $${Number(zone.shipping.freeThreshold).toLocaleString('es-AR')}`;
  }
  return msg;
}

function renderZoneBanner() {
  document.getElementById('zone-banner').textContent =
    `${selectedZone.name}  ·  ${shippingMessage_(selectedZone)}`;
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

  // Orden: si el dashboard configuró un orden de categorías (Tienda →
  // Productos → 🎨 Categorías), se respeta ese; si no, se mantiene el
  // comportamiento de siempre (Combos de la semana primero, resto en
  // orden de aparición).
  const catConfig = (data.business && data.business.categorias) || [];
  const comboKey = 'Combos de la semana';
  let sortedCats;
  if (catConfig.length) {
    const orderIndex = {};
    catConfig.forEach((c, i) => { orderIndex[c.nombre] = i; });
    sortedCats = [...categories].sort((a, b) => {
      const ia = orderIndex.hasOwnProperty(a) ? orderIndex[a] : catConfig.length + categories.indexOf(a);
      const ib = orderIndex.hasOwnProperty(b) ? orderIndex[b] : catConfig.length + categories.indexOf(b);
      return ia - ib;
    });
  } else {
    sortedCats = [
      ...categories.filter(c => c === comboKey),
      ...categories.filter(c => c !== comboKey)
    ];
  }

  if (!sortedCats.length) { grid.innerHTML = ''; return; }

  const showHeaders = sortedCats.length > 1 || (sortedCats.length === 1 && sortedCats[0] !== 'Productos');

  grid.innerHTML = sortedCats.map(cat => {
    const products = byCategory[cat];
    const catId = 'cat-' + cat.replace(/\s+/g, '-').toLowerCase();
    const isCombo = cat === comboKey;
    const catColor = (catConfig.find(c => c.nombre === cat) || {}).color;
    const cardsHTML = products.map(product => {
      const price = product.prices[selectedZone.id];
      const salePrice = product.promoPrice ? product.promoPrice[selectedZone.id] : null;
      return productCardHTML(product, price, salePrice, isCombo);
    }).join('');

    if (!showHeaders) return `<div class="cat-grid">${cardsHTML}</div>`;

    return `
      <div class="category-section" id="${catId}">
        <button class="category-header" ${catColor ? `style="background:${catColor}"` : ''} onclick="toggleCategory('${catId}')" aria-expanded="true">
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

  if (isOpen) {
    // Cerrar: partir de la altura real para que la animación sea proporcional
    grid.style.maxHeight = grid.scrollHeight + 'px';
    grid.offsetHeight; // forzar reflow
    grid.style.maxHeight = '0';
    grid.style.marginBottom = '0';
    grid.classList.remove('cat-open');
    chevron.textContent = '▸';
    btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { grid.style.maxHeight = ''; }, 380);
  } else {
    // Abrir: medir altura real y animar hasta ahí
    grid.classList.add('cat-open');
    const h = grid.scrollHeight;
    grid.style.maxHeight = '0';
    grid.offsetHeight; // forzar reflow
    grid.style.maxHeight = h + 'px';
    grid.style.marginBottom = '16px';
    chevron.textContent = '▾';
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      grid.style.maxHeight = '';
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 380);
  }
}

function productCardHTML(product, price, salePrice, featured = false) {
  const qty = cart[product.id] || 0;
  const imgContent = product.image
    ? `<img src="${product.image}" alt="${product.name}" loading="lazy" onload="this.classList.add('img-loaded')" onerror="if(!this._fb){this._fb=1;var s=this.src,m=s.match(/\.(png|jpg)$/i);if(m){this.src=s.replace(m[0],m[0].toLowerCase()==='.png'?'.jpg':'.png');return;}};this.parentElement.innerHTML='🍞'">`
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
      ${product.nuevo ? '<span class="new-badge">NUEVO</span>' : ''}
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
  if (cart[productId] === undefined) delete incentivoIds[productId];
  if (pedidoAbierto) renderCartItems();
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
  const T = calcPedido();
  document.getElementById('floating-cart-label').textContent =
    `Ver pedido · ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'} · ${fmt(T.neto)}`;
  bar.classList.toggle('hidden', pedidoAbierto);
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

// ══════════════════════════════
// TU PEDIDO — sección completa (antes era un panel que se deslizaba)
// ══════════════════════════════

// ── Incentivos: sugerencias para sumar productos, con o sin descuento ──
// Se configuran desde el dashboard (Tienda → Incentivos) y llegan en
// data.business.incentivos = {activo, titulo, subtitulo, productos:[{id,
// descuento}], maxSugeridos, topeTicket, minTicket, unidades, topeDescuento,
// zonas}. El descuento vale solo para lo que se suma DESDE la sugerencia
// (incentivoIds), hasta "unidades" por producto, y nunca para productos
// que el cliente ya había elegido por su cuenta.
let incentivoIds = {};
function incCfg() {
  const c = data && data.business && data.business.incentivos;
  if (!c || !c.activo || !selectedZone) return null;
  if (c.zonas && c.zonas.length && !c.zonas.includes(selectedZone.id)) return null;
  return c;
}
function incItem(c, id) { return (c.productos || []).find(p => p.id === id); }
function productoDisponible(p) {
  if (!p || p.hidden) return false;
  if (p.activeZones && p.activeZones.length && !p.activeZones.includes(selectedZone.id)) return false;
  const price = p.prices[selectedZone.id];
  return price !== undefined && price > 0;
}

// todos los números del pedido en un solo lugar (pantalla, barra y WhatsApp usan lo mismo)
function calcPedido() {
  const items = Object.keys(cart)
    .map(id => ({ product: data.products.find(p => p.id === id), qty: cart[id] }))
    .filter(i => i.product);
  const c = incCfg();
  let subtotal = 0, comboSavings = 0, baseSinIncentivo = 0, incDesc = 0;
  items.forEach(it => {
    const p = it.product, unit = getEffectivePrice(p), base = p.prices[selectedZone.id];
    it.unit = unit; it.line = unit * it.qty; it.incPct = 0; it.incOff = 0;
    subtotal += it.line;
    if (p.categoria === 'Combos de la semana' && base > unit) comboSavings += (base - unit) * it.qty;
    const ii = c && incentivoIds[p.id] ? incItem(c, p.id) : null;
    if (ii) {
      it.incPct = Number(ii.descuento) || 0;
      const uds = Math.min(it.qty, Math.max(1, Number(c.unidades) || 1));
      it.incOff = Math.round(unit * it.incPct / 100) * uds;
      incDesc += it.incOff;
    } else baseSinIncentivo += it.line;
  });
  if (c && Number(c.topeDescuento) > 0 && incDesc > Number(c.topeDescuento)) {
    // tope de descuento por pedido: se recorta proporcionalmente
    const k = Number(c.topeDescuento) / incDesc;
    items.forEach(it => { it.incOff = Math.round(it.incOff * k); });
    incDesc = items.reduce((s, it) => s + it.incOff, 0);
  }
  const neto = subtotal - incDesc;
  let discountAmount = 0, shippingFree = false;
  if (activeDiscount?.type === 'percent') discountAmount = Math.round(neto * activeDiscount.value / 100);
  else if (activeDiscount?.type === 'shipping') shippingFree = true;
  const freeThreshold = selectedZone.shipping.freeThreshold, shippingCost = selectedZone.shipping.cost;
  const afterDisc = neto - discountAmount;
  const shipping = (shippingFree || neto >= freeThreshold || afterDisc >= freeThreshold) ? 0 : shippingCost;
  return {
    items, subtotal, comboSavings, displaySubtotal: subtotal + comboSavings, incDesc, neto, discountAmount, shippingFree,
    shipping, total: afterDisc + shipping, missing: freeThreshold - neto, shippingCost, baseSinIncentivo,
    unidades: items.reduce((s, i) => s + i.qty, 0)
  };
}

let pedidoAbierto = false, scrollProductos = 0;
function openCart(desdeHistorial) {
  if (!selectedZone) return;
  scrollProductos = window.scrollY;
  pedidoAbierto = true;
  document.getElementById('products-section').classList.add('hidden');
  document.getElementById('pedido-section').classList.remove('hidden');
  document.getElementById('floating-cart')?.classList.add('hidden');
  document.getElementById('back-to-landing-btn').textContent = '← Atrás';
  document.getElementById('pedido-zona').textContent = `${selectedZone.name} · ${shippingMessage_(selectedZone)}`;
  renderCartItems();
  window.scrollTo(0, 0);
  // el botón "atrás" del celular vuelve a los productos en vez de salir de la página
  if (!desdeHistorial) { try { history.pushState({ pedido: 1 }, '', '#pedido'); } catch (e) {} }
}
function closeCart(desdeHistorial) {
  if (!pedidoAbierto) return;
  pedidoAbierto = false;
  document.getElementById('pedido-section').classList.add('hidden');
  document.getElementById('products-section').classList.remove('hidden');
  document.getElementById('back-to-landing-btn').textContent = '← Inicio';
  renderProducts();
  updateCartBtn();
  window.scrollTo(0, scrollProductos);
  if (!desdeHistorial && location.hash === '#pedido') { try { history.back(); } catch (e) {} }
}
window.addEventListener('popstate', () => {
  if (pedidoAbierto && location.hash !== '#pedido') closeCart(true);
  else if (!pedidoAbierto && location.hash === '#pedido' && selectedZone) openCart(true);
});

function imgMini(product) {
  return product.image
    ? `<img src="${product.image}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('🍞'))">`
    : '🍞';
}

function renderCartItems() {
  const itemsEl = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  const whatsappBtn = document.getElementById('whatsapp-btn');
  const couponSection = document.getElementById('coupon-section');
  const T = calcPedido();

  document.getElementById('pedido-cant').textContent = T.unidades ? `${T.unidades} ${T.unidades === 1 ? 'producto' : 'productos'}` : '';

  if (T.items.length === 0) {
    incentivoIds = {};
    itemsEl.innerHTML = `
      <div class="empty-cart">
        <span class="empty-cart-icon">🛒</span>
        Tu pedido está vacío
      </div>`;
    summaryEl.innerHTML = '';
    document.getElementById('payment-section').style.display = 'none';
    document.getElementById('client-section').style.display = 'none';
    if (couponSection) couponSection.style.display = 'none';
    document.getElementById('incentivo-card').classList.add('hidden');
    whatsappBtn.disabled = true;
    actualizarBarra(T);
    return;
  }

  itemsEl.innerHTML = T.items.map(it => {
    const p = it.product;
    const isCombo = p.categoria === 'Combos de la semana';
    const basePrice = p.prices[selectedZone.id];
    const savings = isCombo && basePrice > it.unit ? (basePrice - it.unit) * it.qty : 0;
    const etiqueta = it.incOff > 0 ? `<span class="pi-tag">${it.incPct}% OFF</span>` : (incentivoIds[p.id] ? '<span class="pi-tag pi-tag--s">Sugerido</span>' : '');
    return `
      <div class="pedido-item">
        <div class="pi-img">${imgMini(p)}</div>
        <div class="pi-info">
          <div class="pi-name">${p.name}</div>
          <div class="pi-unit">${fmt(it.unit)} c/u ${etiqueta}</div>
          ${savings > 0 ? `<div class="pi-ahorro">🎉 Ahorrás ${fmt(savings)} vs precio individual</div>` : ''}
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${p.id}', -1)" aria-label="Quitar uno">−</button>
          <span class="qty-display">${it.qty}</span>
          <button class="qty-btn" onclick="changeQty('${p.id}', 1)" aria-label="Sumar uno">+</button>
        </div>
        <div class="pi-total">
          ${it.incOff > 0 ? `<span class="pi-tachado">${fmt(it.line)}</span>` : ''}
          <span>${fmt(it.line - it.incOff)}</span>
        </div>
      </div>`;
  }).join('');

  renderIncentivos(T);
  updateCouponUI();

  const discountSource = activeDiscount?.source === 'cupon' ? 'cupón' : 'ruleta';
  let discountRowHTML = '';
  if (activeDiscount?.type === 'percent' && T.discountAmount > 0) {
    discountRowHTML = `<div class="summary-row discount"><span>${activeDiscount.value}% OFF (${discountSource})</span><span>-${fmt(T.discountAmount)}</span></div>`;
  } else if (activeDiscount?.type === 'shipping') {
    discountRowHTML = `<div class="summary-row discount"><span>Envío gratis (${discountSource})</span><span>Gratis</span></div>`;
  } else if (activeDiscount?.type === 'product') {
    discountRowHTML = `<div class="summary-row discount"><span>Premio: ${activeDiscount.label} 🎁</span><span>Incluido</span></div>`;
  }
  const noticeHTML = (T.shippingCost > 0 && T.shipping > 0 && T.missing > 0 && !T.shippingFree)
    ? `<div class="shipping-notice">Agregá ${fmt(T.missing)} más para envío gratis</div>` : '';

  document.getElementById('payment-section').style.display = 'block';
  document.getElementById('client-section').style.display = paymentMethod ? 'block' : 'none';
  whatsappBtn.disabled = paymentMethod === null;
  document.getElementById('pedido-nota').textContent = paymentMethod
    ? 'Te abrimos WhatsApp con el pedido ya escrito: solo tenés que enviarlo.'
    : 'Elegí cómo vas a pagar para completar el pedido.';

  summaryEl.innerHTML = `
    ${noticeHTML}
    <div class="summary-row"><span>Subtotal</span><span>${fmt(T.displaySubtotal)}</span></div>
    ${T.comboSavings > 0 ? `<div class="summary-row discount"><span>💰 Descuento combo semanal</span><span>-${fmt(T.comboSavings)}</span></div>` : ''}
    ${T.incDesc > 0 ? `<div class="summary-row discount"><span>🎁 Descuento por sumar productos</span><span>-${fmt(T.incDesc)}</span></div>` : ''}
    ${discountRowHTML}
    <div class="summary-row"><span>Envío</span><span>${T.shipping === 0 ? 'Gratis' : fmt(T.shipping)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${fmt(T.total)}</span></div>`;
  actualizarBarra(T);
}

function actualizarBarra(T) {
  const tot = document.getElementById('pb-total'), btn = document.getElementById('pb-btn');
  if (!tot || !btn) return;
  tot.textContent = fmt(T.items.length ? T.total : 0);
  btn.disabled = !T.items.length;
  btn.textContent = !T.items.length ? 'Pedido vacío' : paymentMethod ? 'Enviar por WhatsApp' : 'Elegí cómo pagar';
  btn.classList.toggle('pb-btn--wa', !!paymentMethod);
}
function pedidoBarraAccion() {
  if (paymentMethod) { sendWhatsApp(); return; }
  document.getElementById('payment-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// tarjetas "¿Le sumás algo más?"
function renderIncentivos(T) {
  const card = document.getElementById('incentivo-card');
  const c = incCfg();
  if (!c) { card.classList.add('hidden'); return; }
  // se ofrece según lo que el cliente eligió solo (sin contar lo sumado desde acá)
  const elegible = (!(Number(c.topeTicket) > 0) || T.baseSinIncentivo <= Number(c.topeTicket)) && T.baseSinIncentivo >= (Number(c.minTicket) || 0);
  const sumados = (c.productos || []).filter(it => incentivoIds[it.id] && cart[it.id]);
  let ofertas = elegible ? (c.productos || []).filter(it => !cart[it.id]) : [];
  ofertas = ofertas.map(it => ({ it, p: data.products.find(p => p.id === it.id) })).filter(o => productoDisponible(o.p));
  const max = Math.max(1, Number(c.maxSugeridos) || 3);
  ofertas = ofertas.slice(0, Math.max(0, max - sumados.length));
  if (!ofertas.length) { card.classList.add('hidden'); return; }
  const hayDesc = ofertas.some(o => Number(o.it.descuento) > 0);
  document.getElementById('incentivo-titulo').textContent = c.titulo || '¿Le sumás algo más?';
  document.getElementById('incentivo-sub').textContent = c.subtitulo || (hayDesc ? 'Precio especial solo para sumar a este pedido.' : 'Otros clientes también lo llevan.');
  const uds = Math.max(1, Number(c.unidades) || 1);
  document.getElementById('incentivo-lista').innerHTML = ofertas.map(({ it, p }) => {
    const unit = getEffectivePrice(p), d = Number(it.descuento) || 0, conDesc = unit - Math.round(unit * d / 100);
    return `
      <div class="inc-card">
        ${d > 0 ? `<span class="inc-off">-${d}%</span>` : ''}
        <div class="inc-img">${imgMini(p)}</div>
        <div class="inc-info">
          <div class="inc-name">${p.name}</div>
          <div class="inc-precio">${d > 0 ? `<span class="inc-tachado">${fmt(unit)}</span>` : ''}<b>${fmt(conDesc)}</b></div>
          ${d > 0 && uds > 1 ? `<div class="inc-uds">hasta ${uds} unidades</div>` : ''}
        </div>
        <button class="inc-btn" onclick="sumarIncentivo('${p.id}')">+ Sumar</button>
      </div>`;
  }).join('');
  card.classList.remove('hidden');
}
function sumarIncentivo(id) {
  incentivoIds[id] = true;
  cart[id] = (cart[id] || 0) + 1;
  updateCartBtn();
  renderCartItems();
}

// La verificación de precios vigentes pasa antes, al elegir la zona (ver
// selectZone/dataFreshFromServer) — así el pedido se arma siempre sobre
// datos ya confirmados y acá, al confirmar el pedido, no hay que esperar
// ningún fetch de más (eso se sentía trabado justo en el peor momento).
function sendWhatsApp() {
  const T = calcPedido();
  if (!T.items.length || !paymentMethod) return;
  const lines = T.items.map(it =>
    `• [${it.qty}x] ${it.product.name}   ${fmt(it.line - it.incOff)}${incentivoIds[it.product.id] ? (it.incOff > 0 ? ` (sugerido con ${it.incPct}% OFF)` : ' (sugerido)') : ''}`
  ).join('\n');
  const pagoLabel = paymentMethod === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo';
  const parts = [
    `*Hola! Quiero hacer un pedido de TUPAN Precocido:*`,
    ``,
    `*Productos:*`,
    lines,
    ``,
    `*Resumen:*`,
    `Subtotal: ${fmt(T.displaySubtotal)}`,
    ...(T.comboSavings > 0 ? [`💰 Descuento combo semanal: -${fmt(T.comboSavings)}`] : []),
    ...(T.incDesc > 0 ? [`🎁 Descuento por sumar productos: -${fmt(T.incDesc)}`] : []),
    ...(activeDiscount?.type === 'percent' && T.discountAmount > 0 ? [`${activeDiscount.value}% OFF: -${fmt(T.discountAmount)}`] : []),
    ...(activeDiscount?.type === 'shipping' ? [`Descuento: Envio gratis`] : []),
    ...(activeDiscount?.type === 'product' ? [`Premio: ${activeDiscount.label}`] : []),
    `Envio: ${T.shipping === 0 ? 'Gratis' : fmt(T.shipping)}`,
    `*Total: ${fmt(T.total)}*`,
    ``,
    `Pago: ${pagoLabel}`,
    `Zona: ${selectedZone.name}`,
  ];
  if (clientType === 'nuevo') {
    const v = id => document.getElementById(id).value.trim();
    parts.push(``, `*Datos del cliente:*`,
      `Nombre: ${v('field-nombre')} ${v('field-apellido')}`,
      `Direccion: ${v('field-direccion')}`,
      `Barrio/Lote: ${v('field-barrio')}`,
      `Entre calles: ${v('field-entrecalles')}`);
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
  renderCartItems();
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

// Si el dashboard desactivó la ruleta y la volvió a activar DESPUÉS de que
// este cliente ya había ganado un premio, ese premio queda viejo — se borra
// para que pueda volver a girar. wheelResetAt es la marca de tiempo de la
// última reactivación (se pisa sola en el dashboard, ver
// tienda_collectNegocio en index.html). Solo se llama con datos
// autoritativos (Fase 2 de init()), igual que applyHeroBtn(true) — con el
// cache viejo de la Fase 1 podría borrar un premio recién ganado por error.
function checkWheelReset_(business) {
  if (activeDiscount?.source !== 'ruleta' || !activeDiscount.wonAt) return;
  const resetAt = business && business.wheelResetAt ? new Date(business.wheelResetAt).getTime() : 0;
  if (resetAt > activeDiscount.wonAt) {
    activeDiscount = null;
    localStorage.removeItem('tupan_disc_v3');
    updateWheelFloatBtn();
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
    source:    'ruleta',
    wonAt:     Date.now(), // para poder invalidarlo si el dashboard reactiva la ruleta después (ver checkWheelReset_)
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
  // en "Tu pedido" el botón de arriba a la izquierda es "Atrás" (vuelve a los productos); en el catálogo, "Inicio"
  document.getElementById('back-to-landing-btn').addEventListener('click', () => pedidoAbierto ? closeCart() : goToLanding());
  document.getElementById('cart-btn').addEventListener('click', () => openCart());
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
