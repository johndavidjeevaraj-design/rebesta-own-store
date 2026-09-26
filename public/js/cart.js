(() => {
  const state = { products: [], byHandle: new Map(), settings: null };
  const itemsNode = document.querySelector('[data-cart-items]');
  const emptyNode = document.querySelector('[data-cart-empty]');
  const layoutNode = document.querySelector('[data-cart-layout]');
  const summaryNode = document.querySelector('[data-cart-summary]');
  const recommendedNode = document.querySelector('[data-recommended-grid]');

  function lines() {
    return RFS.readCart()
      .map(item => ({ ...item, product: state.byHandle.get(item.handle) }))
      .filter(item => item.product);
  }

  function renderItem(item) {
    const { product, qty } = item;
    const row = document.createElement('article');
    row.className = 'cart-item';

    const image = document.createElement('div');
    image.className = 'cart-item-image';
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.title; img.decoding = 'async';
    image.appendChild(img);

    const main = document.createElement('div');
    main.className = 'cart-item-main';
    const title = document.createElement('h3');
    title.textContent = product.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${product.category} · ${product.unitLabel} · ${RFS.money(product.priceInr)}`;
    const actions = document.createElement('div');
    actions.className = 'cart-item-actions';
    const stepper = document.createElement('span');
    stepper.className = 'qty-stepper';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.addEventListener('click', () => { RFS.setQty(product.handle, qty - 1); render(); RFS.syncCartUI(state.products); });
    const count = document.createElement('span'); count.textContent = qty;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+'; plus.disabled = qty >= product.stock || qty >= 50;
    plus.addEventListener('click', () => { RFS.setQty(product.handle, Math.min(50, qty + 1)); render(); RFS.syncCartUI(state.products); });
    stepper.append(minus, count, plus);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-link'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => { RFS.removeItem(product.handle); render(); RFS.syncCartUI(state.products); });
    const mobileTotal = document.createElement('span');
    mobileTotal.className = 'cart-line-total mobile-line-total';
    mobileTotal.textContent = RFS.money(product.priceInr * qty);
    actions.append(stepper, remove, mobileTotal);
    main.append(title, meta, actions);

    const total = document.createElement('div');
    total.className = 'cart-line-total';
    total.textContent = RFS.money(product.priceInr * qty);

    row.append(image, main, total);
    return row;
  }

  function renderSummary(subtotal, count) {
    const remaining = Math.max(0, 500 - subtotal);
    summaryNode.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Basket summary';
    const rows = [
      ['Products', `${count} item${count === 1 ? '' : 's'}`],
      ['Subtotal', RFS.money(subtotal)],
      ['Delivery', 'By road distance at checkout']
    ];
    const frag = document.createDocumentFragment();
    frag.appendChild(title);
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      row.innerHTML = `<span></span><strong></strong>`;
      row.querySelector('span').textContent = label;
      row.querySelector('strong').textContent = value;
      frag.appendChild(row);
    });
    const meter = document.createElement('div');
    const progress = Math.min(100, Math.max(4, (subtotal / 500) * 100));
    meter.className = `delivery-meter ${subtotal >= 500 ? 'complete' : ''}`;
    meter.innerHTML = `
      <div class="delivery-meter-copy"><span>Free delivery progress</span><strong>${subtotal >= 500 ? 'Unlocked' : `${RFS.money(500)} target`}</strong></div>
      <div class="delivery-meter-track"><span class="delivery-meter-fill" style="--progress:${progress}%"></span></div>`;
    const notice = document.createElement('div');
    notice.className = `alert ${subtotal >= 500 ? 'success' : 'info'}`;
    notice.textContent = subtotal >= 500
      ? 'Free delivery unlocked. Final road-distance check happens safely at checkout.'
      : `Add ${RFS.money(remaining)} more to unlock free delivery above ₹500.`;
    const total = document.createElement('div');
    total.className = 'summary-total';
    total.innerHTML = `<span>Items total</span><strong></strong>`;
    total.querySelector('strong').textContent = RFS.money(subtotal);
    const waNumber = String(state.settings?.business?.whatsapp || '918438765119').replace(/\D/g, '');
    const waText = `Hi Rebesta Fresh! \u{1F966} I'd like to order:\n\n${lines().map(item => `\u2022 ${item.product.title} (${item.product.unitLabel}) \u00D7 ${item.qty} \u2014 ${RFS.money(item.product.priceInr * item.qty)}`).join('\n')}\n\nItems total: ${RFS.money(subtotal)}\n\n(I will confirm the delivery pin and slot with you.)`;
    const whatsapp = document.createElement('a');
    whatsapp.className = 'button whatsapp full';
    whatsapp.style.marginTop = '9px';
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.href = `https://api.whatsapp.com/send/?phone=${waNumber}&text=${encodeURIComponent(waText)}`;
    whatsapp.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.3-3 .8.8-2.9-.3-.4A8 8 0 0 1 12 4Zm-2.9 4c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.8 2.7.7 3.2.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.6.1a6.7 6.7 0 0 1-3.3-2.8c-.2-.4 0-.6.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.3 0-.4 0-.6L9.4 8.6c-.2-.4-.2-.6-.3-.6Z"/></svg> Order on WhatsApp';
    const checkout = document.createElement('a');
    checkout.href = '/checkout';
    checkout.className = 'button orange full';
    checkout.style.marginTop = '18px';
    checkout.textContent = 'Select pin and continue';
    const note = document.createElement('p');
    note.className = 'summary-note';
    note.textContent = 'Delivery charges: ₹20–₹100 for 0–9 road km. Locations beyond 9 road km do not receive the standard local delivery rate.';
    frag.append(meter, notice, total, checkout, whatsapp, note);
    summaryNode.appendChild(frag);
  }

  function renderRecommendations() {
    if (!recommendedNode) return;
    const inCart = new Set(RFS.readCart().map(item => item.handle));
    const picks = state.products.filter(p => !inCart.has(p.handle) && p.stock > 0).slice(0, 4);
    recommendedNode.innerHTML = '';
    for (const product of picks) {
      const card = document.createElement('article');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-image"><img alt=""></div>
        <div class="product-body">
          <div class="product-category"></div>
          <h3 class="product-title"></h3>
          <div class="price-row"><span class="price"></span><span class="unit"></span></div>
          <button class="button primary small full" type="button">Add to basket</button>
        </div>`;
      card.querySelector('img').src = product.image;
      card.querySelector('img').alt = product.title;
      card.querySelector('.product-category').textContent = product.unitLabel;
      card.querySelector('.product-title').textContent = product.title;
      card.querySelector('.price').textContent = RFS.money(product.priceInr);
      card.querySelector('.unit').textContent = `/ ${product.unitLabel}`;
      card.querySelector('button').addEventListener('click', () => { RFS.flyToBasket(card.querySelector('.product-image')); RFS.addItem(product.handle); render(); RFS.syncCartUI(state.products); });
      recommendedNode.appendChild(card);
    }
  }

  function render() {
    const cartLines = lines();
    const count = cartLines.reduce((s, item) => s + item.qty, 0);
    const subtotal = cartLines.reduce((s, item) => s + item.product.priceInr * item.qty, 0);
    layoutNode.hidden = !cartLines.length;
    emptyNode.hidden = cartLines.length > 0;
    itemsNode.innerHTML = '';
    cartLines.forEach(item => itemsNode.appendChild(renderItem(item)));
    if (cartLines.length) {
      renderSummary(subtotal, count);
      renderRecommendations();
    }
    RFS.syncCartUI(state.products);
  }

  async function init() {
    try {
      const [data, settingsData] = await Promise.all([RFS.api('/api/products'), RFS.api('/api/settings')]);
      state.products = data.products;
      state.settings = settingsData;
      state.byHandle = new Map(data.products.map(p => [p.handle, p]));
      render();
    } catch (error) {
      itemsNode.innerHTML = `<div class="alert error">${error.message}</div>`;
    }
  }
  window.addEventListener('rebesta:cart-changed', () => { render(); RFS.syncCartUI(state.products); });
  init();
})();
