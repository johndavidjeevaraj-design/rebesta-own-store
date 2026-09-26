(() => {
  const state = { product: null, related: [], variants: [], qty: 1, reviews: [] };
  const main = document.querySelector('[data-product-page]');
  const related = document.querySelector('[data-related-grid]');
  const handle = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

  function cartQty() {
    return RFS.readCart().find(item => item.handle === state.product?.handle)?.qty || 0;
  }

  async function addCurrent() {
    const available = Math.max(0, Number(state.product?.stock || 0) - cartQty());
    if (state.qty > available) return RFS.toast(`Only ${available} more available today`, 'error');
    RFS.flyToBasket(document.querySelector('.product-detail-media'));
    RFS.addItem(state.product.handle, state.qty, true);
    RFS.toast(`${state.product.title} added to basket`);
    render();
    RFS.syncCartUI([state.product]);
  }

  function relatedCard(product) {
    const a = document.createElement('a');
    a.className = 'product-card related-card';
    a.href = `/products/${encodeURIComponent(product.handle)}`;
    a.innerHTML = `<div class="product-image"><img alt="" loading="lazy" decoding="async"></div><div class="product-body"><div class="product-category"></div><h3 class="product-title"></h3><div class="price-row"><span class="price"></span><span class="unit"></span></div></div>`;
    a.querySelector('img').src = product.image;
    a.querySelector('img').alt = product.title;
    a.querySelector('.product-category').textContent = product.category;
    a.querySelector('.product-title').textContent = product.title;
    a.querySelector('.price').textContent = RFS.money(product.priceInr);
    a.querySelector('.unit').textContent = `/ ${product.unitLabel}`;
    return a;
  }

  function openLightbox(src, alt) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Product image preview');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'lightbox-close';
    close.setAttribute('aria-label', 'Close preview');
    close.textContent = '✕';
    const img = document.createElement('img');
    img.src = src; img.alt = alt;
    box.append(close, img);
    const shut = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = ev => { if (ev.key === 'Escape') shut(); };
    box.addEventListener('click', event => { if (event.target === box || event.target === close) shut(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  }

  let stickyObserver = null;
  function setupStickyAdd(product) {
    let bar = document.querySelector('.sticky-add');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'sticky-add';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <img alt="">
      <div class="sticky-info"><strong class="sticky-title"></strong><span class="sticky-price"></span></div>
      <button class="button orange small" type="button" data-sticky-add ${product.stock <= 0 ? 'disabled' : ''}>${product.stock <= 0 ? 'Sold out' : `Add · ${RFS.money(product.priceInr * state.qty)}`}</button>`;
    bar.querySelector('img').src = product.image;
    bar.querySelector('img').alt = product.title;
    bar.querySelector('.sticky-title').textContent = product.title;
    bar.querySelector('.sticky-price').textContent = `${RFS.money(product.priceInr)} / ${product.unitLabel}${state.qty > 1 ? ` · qty ${state.qty}` : ''}`;
    bar.querySelector('[data-sticky-add]').addEventListener('click', addCurrent);
    const panel = main.querySelector('.purchase-panel');
    if (!panel) return;
    stickyObserver?.disconnect();
    stickyObserver = new IntersectionObserver(entries => {
      bar.classList.toggle('show', !entries[0].isIntersecting);
    }, { threshold: 0 });
    stickyObserver.observe(panel);
  }

  function applyProductSeo(p) {
    document.title = `${p.title} — Rebesta Fresh`;
    const setMeta = (selector, attr, value) => { const el = document.head.querySelector(selector); if (el) el.setAttribute(attr, value); };
    setMeta('meta[name="description"]', 'content', `${p.title} — ₹${p.priceInr} / ${p.unitLabel}. ${p.description}`.slice(0, 300));
    setMeta('meta[property="og:title"]', 'content', `${p.title} — Rebesta Fresh`);
    setMeta('meta[property="og:description"]', 'content', `${p.title} at ₹${p.priceInr}/${p.unitLabel} — fresh from farms, delivered in Hosur.`);
    setMeta('meta[property="og:type"]', 'content', 'product');
    const canonical = document.head.querySelector('link[rel="canonical"]') || (() => { const link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); return link; })();
    canonical.href = `${location.origin}/products/${encodeURIComponent(p.handle)}`;
    const existing = document.getElementById('rfs-jsonld');
    existing?.remove();
    const script = document.createElement('script');
    script.id = 'rfs-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      description: p.description,
      image: [p.image],
      sku: p.sku,
      brand: { '@type': 'Brand', name: 'Rebesta Fresh' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: p.priceInr,
        availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical.href
      }
    });
    document.head.appendChild(script);
  }

  function render() {
    const p = state.product;
    document.title = `${p.title} – Rebesta Fresh`;
    const discount = p.compareAtInr && p.compareAtInr > p.priceInr ? Math.round((1 - p.priceInr / p.compareAtInr) * 100) : 0;
    const stockText = p.stock > 10 ? 'In stock today' : p.stock > 0 ? `Only ${p.stock} left` : 'Sold out today';
    const shareText = `${p.title} — ${RFS.money(p.priceInr)} / ${p.unitLabel} at Rebesta Fresh, Hosur\n${location.href}`;
    const shareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const waIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z"/></svg>';
    main.innerHTML = `
      <div class="product-detail-layout">
        <div class="product-detail-media">${discount ? `<span class="badge orange product-badge">${discount}% off</span>` : ''}<img src="${p.image}" alt="${p.title}" decoding="async" data-zoom title="Click to enlarge"></div>
        <div class="product-detail-copy">
          <span class="eyebrow">${p.category}</span>
          <h1>${p.title}</h1>
          <p class="product-detail-description"></p>
          <div class="detail-price-row"><strong>${RFS.money(p.priceInr)}</strong>${discount ? `<span class="compare">${RFS.money(p.compareAtInr)}</span>` : ''}<span>/ ${p.unitLabel}</span></div>
          ${state.variants.length > 1 ? `<div class="variant-row"><span class="variant-label">Size</span><div class="variant-pills">${state.variants.map(v => `<a class="variant-pill ${v.handle === p.handle ? 'active' : ''}" href="/products/${encodeURIComponent(v.handle)}">${v.variantTitle || v.unitLabel}</a>`).join('')}</div></div>` : ''}
          <div class="route-facts"><span class="badge ${p.stock > 10 ? 'green' : p.stock > 0 ? 'orange' : 'gray'}">${stockText}</span><span class="badge gray">Tomorrow morning</span><span class="badge gray">${p.sku}</span></div>
          ${p.stock > 0 && p.stock <= 5 ? `<div class="stock-urgency">🔥 Only ${p.stock} left — selling fast today, order now!</div>` : ''}
          <div class="purchase-panel"><label>Quantity</label><div class="purchase-controls"><span class="qty-stepper"><button type="button" data-qty-minus ${state.qty <= 1 ? 'disabled' : ''}>−</button><span>${state.qty}</span><button type="button" data-qty-plus ${state.qty >= Math.min(50, p.stock) ? 'disabled' : ''}>+</button></span><button class="button primary" type="button" data-add-detail ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to basket'}</button></div></div>
          <div class="share-row"><a class="button whatsapp" href="${shareHref}" target="_blank" rel="noopener">${waIcon}Share on WhatsApp</a><button class="button ghost" type="button" data-copy-link>Copy link</button></div>
          <div class="delivery-proof"><h3>Delivery checked by your exact pin</h3><p>Choose current GPS, a manual map pin or coordinates at checkout. We use the actual rider route within 9 road km.</p></div>
        </div>
      </div>`;
    main.querySelector('.product-detail-description').textContent = p.description;
    main.querySelector('[data-qty-minus]').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); render(); });
    main.querySelector('[data-qty-plus]').addEventListener('click', () => { state.qty = Math.min(50, p.stock, state.qty + 1); render(); });
    main.querySelector('[data-add-detail]').addEventListener('click', addCurrent);
    main.querySelector('[data-zoom]')?.addEventListener('click', () => openLightbox(p.image, p.title));
    setupStickyAdd(p);
    applyProductSeo(p);
    main.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); RFS.toast('Link copied — share it anywhere'); }
      catch { RFS.toast('Could not copy link on this browser', 'error'); }
    });
    related.innerHTML = '';
    state.related.forEach(product => related.appendChild(relatedCard(product)));
    renderReviews(p);
  }

  function renderReviews(p) {
    let box = document.querySelector('[data-product-reviews]');
    if (!box) {
      box = document.createElement('section');
      box.className = 'product-reviews';
      box.setAttribute('data-product-reviews', '');
      related.parentElement.insertBefore(box, related);
    }
    const rv = state.reviews;
    if (!rv.length) { box.hidden = true; box.innerHTML = ''; return; }
    const avg = Math.round((rv.reduce((s, r) => s + Number(r.rating || 0), 0) / rv.length) * 10) / 10;
    const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
    box.hidden = false;
    box.innerHTML = `
      <span class="eyebrow">Customer reviews</span>
      <h2 class="section-title" style="font-size:1.25rem">⭐ ${avg} / 5 <span class="review-count">· ${rv.length} review${rv.length > 1 ? 's' : ''} for ${p.title}</span></h2>
      <div class="review-list">${rv.map(r => `
        <div class="review-card">
          <div class="review-head"><strong>${r.name}</strong><span class="review-stars">${stars(r.rating)}</span></div>
          ${r.text ? `<p>${r.text.replace(/</g, '&lt;')}</p>` : ''}
        </div>`).join('')}
      </div>`;
  }

  async function init() {
    try {
      const data = await RFS.api(`/api/products/${encodeURIComponent(handle)}`);
      state.product = data.product;
      const all = await RFS.api('/api/products');
      const base = data.product.baseHandle || data.product.handle;
      state.variants = all.products
        .filter(product => (product.baseHandle || product.handle) === base)
        .sort((a, b) => Number(a.weightGrams || 0) - Number(b.weightGrams || 0));
      const others = all.products.filter(product => product.handle !== handle);
      const sameCategory = others.filter(product => product.category === data.product.category);
      const featured = others.filter(product => product.featured && product.category !== data.product.category);
      state.related = [...sameCategory, ...featured].slice(0, 10);
      try {
        const rv = await RFS.api(`/api/reviews?product=${encodeURIComponent(handle)}`);
        state.reviews = rv.reviews || [];
      } catch { state.reviews = []; }
      render();
    } catch (error) {
      main.innerHTML = `<div class="empty-state"><h2>Product not found</h2><p>${error.message}</p><a class="button primary" href="/#shop">Back to shop</a></div>`;
    }
  }
  window.addEventListener('rebesta:cart-changed', () => RFS.syncCartUI([state.product].filter(Boolean)));
  init();
})();
