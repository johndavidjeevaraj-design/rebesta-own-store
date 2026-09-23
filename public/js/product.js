(() => {
  const state = { product: null, related: [], qty: 1 };
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

  function render() {
    const p = state.product;
    document.title = `${p.title} – Rebesta Fresh`;
    const discount = p.compareAtInr && p.compareAtInr > p.priceInr ? Math.round((1 - p.priceInr / p.compareAtInr) * 100) : 0;
    const stockText = p.stock > 10 ? 'In stock today' : p.stock > 0 ? `Only ${p.stock} left` : 'Sold out today';
    main.innerHTML = `
      <div class="product-detail-layout">
        <div class="product-detail-media">${discount ? `<span class="badge orange product-badge">${discount}% off</span>` : ''}<img src="${p.image}" alt="${p.title}" decoding="async"></div>
        <div class="product-detail-copy">
          <span class="eyebrow">${p.category}</span>
          <h1>${p.title}</h1>
          <p class="product-detail-description"></p>
          <div class="detail-price-row"><strong>${RFS.money(p.priceInr)}</strong>${discount ? `<span class="compare">${RFS.money(p.compareAtInr)}</span>` : ''}<span>/ ${p.unitLabel}</span></div>
          <div class="route-facts"><span class="badge ${p.stock > 10 ? 'green' : p.stock > 0 ? 'orange' : 'gray'}">${stockText}</span><span class="badge gray">Tomorrow morning</span><span class="badge gray">${p.sku}</span></div>
          <div class="purchase-panel"><label>Quantity</label><div class="purchase-controls"><span class="qty-stepper"><button type="button" data-qty-minus ${state.qty <= 1 ? 'disabled' : ''}>−</button><span>${state.qty}</span><button type="button" data-qty-plus ${state.qty >= Math.min(50, p.stock) ? 'disabled' : ''}>+</button></span><button class="button primary" type="button" data-add-detail ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to basket'}</button></div></div>
          <div class="delivery-proof"><h3>Delivery checked by your exact pin</h3><p>Choose current GPS, a manual map pin or coordinates at checkout. We use the actual rider route within 9 road km.</p></div>
        </div>
      </div>`;
    main.querySelector('.product-detail-description').textContent = p.description;
    main.querySelector('[data-qty-minus]').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); render(); });
    main.querySelector('[data-qty-plus]').addEventListener('click', () => { state.qty = Math.min(50, p.stock, state.qty + 1); render(); });
    main.querySelector('[data-add-detail]').addEventListener('click', addCurrent);
    related.innerHTML = '';
    state.related.forEach(product => related.appendChild(relatedCard(product)));
  }

  async function init() {
    try {
      const data = await RFS.api(`/api/products/${encodeURIComponent(handle)}`);
      state.product = data.product;
      const all = await RFS.api(`/api/products?category=${encodeURIComponent(data.product.category)}`);
      state.related = all.products.filter(product => product.handle !== handle).slice(0, 5);
      render();
    } catch (error) {
      main.innerHTML = `<div class="empty-state"><h2>Product not found</h2><p>${error.message}</p><a class="button primary" href="/#shop">Back to shop</a></div>`;
    }
  }
  window.addEventListener('rebesta:cart-changed', () => RFS.syncCartUI([state.product].filter(Boolean)));
  init();
})();
