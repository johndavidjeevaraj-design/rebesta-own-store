(() => {
  const state = { products: [], categories: [], settings: null, activeCategory: 'All', search: '', sort: 'featured', offersOnly: false, reveal: null };
  const grid = document.querySelector('[data-product-grid]');
  const categoryRow = document.querySelector('[data-category-row]');
  const searchInput = document.querySelector('[data-product-search]');
  const resultCount = document.querySelector('[data-result-count]');
  const heroHost = document.querySelector('[data-hero-showcase]');

  const inCart = handle => RFS.readCart().find(row => row.handle === handle)?.qty || 0;

    function renderTestimonials(items) {
    const section = document.querySelector('[data-testimonials-section]');
    const grid = document.querySelector('[data-testimonial-grid]');
    if (!section || !grid || !items.length) return;
    grid.innerHTML = items.map(t => `
      <figure class="testimonial-card">
        <div class="testimonial-stars">${'★'.repeat(Math.max(1, Math.min(5, t.rating || 5)))}<span class="dim">${'★'.repeat(5 - Math.max(1, Math.min(5, t.rating || 5)))}</span></div>
        <blockquote>${t.text}</blockquote>
        <figcaption><strong>${t.name}</strong>${t.area ? `<span> · ${t.area}</span>` : ''}</figcaption>
      </figure>`).join('');
    section.style.display = '';
  }

function setupReveal() {
    if ('IntersectionObserver' in window) {
      state.reveal = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          (entry.target._show || (() => entry.target.classList.add('is-visible')))();
          state.reveal.unobserve(entry.target);
        });
      }, { threshold: .09, rootMargin: '0px 0px -20px 0px' });
    }
  }

  function reveal(node, index = 0) {
    const delay = Math.min(index % 10, 7) * 34;
    node.style.transitionDelay = `${delay}ms`;
    const show = () => {
      node.classList.add('is-visible');
      setTimeout(() => { node.style.transitionDelay = '0ms'; }, delay + 520);
    };
    if (!state.reveal) return show();
    state.reveal._show = state.reveal._show || show;
    state.reveal.observe(node);
    node._show = show;
  }

  function makeInteractive(card) {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      card.style.setProperty('--tilt-x', `${(-y * 3.6).toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${(x * 3.6).toFixed(2)}deg`);
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    }, { passive: true });
  }

  function stepper(product, current) {
    const qty = document.createElement('span');
    qty.className = 'qty-stepper';
    qty.style.animation = 'controlSnap .22s var(--ease-spring)';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.addEventListener('click', () => RFS.setQty(product.handle, current - 1));
    const count = document.createElement('span'); count.textContent = current;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+'; plus.disabled = current >= product.stock || current >= 50;
    plus.addEventListener('click', () => RFS.setQty(product.handle, Math.min(50, current + 1)));
    qty.append(minus, count, plus);
    return qty;
  }

  function card(product, index = 0) {
    const article = document.createElement('article');
    article.className = 'product-card';
    article.dataset.handle = product.handle;
    makeInteractive(article);

    const imageWrap = document.createElement('a');
    imageWrap.className = 'product-image';
    imageWrap.href = `/products/${encodeURIComponent(product.handle)}`;
    imageWrap.setAttribute('aria-label', `View ${product.title}`);
    if (Number(product.compareAtInr) > Number(product.priceInr)) {
      const badge = document.createElement('span');
      badge.className = 'badge orange product-badge';
      badge.textContent = `${Math.round((1 - product.priceInr / product.compareAtInr) * 100)}% off`;
      imageWrap.appendChild(badge);
    } else if (product.featured) {
      const badge = document.createElement('span');
      badge.className = 'badge green product-badge';
      badge.textContent = 'Top pick';
      imageWrap.appendChild(badge);
    }
    const img = document.createElement('img');
    img.src = product.image; img.alt = product.title; img.loading = 'lazy'; img.decoding = 'async';
    imageWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'product-body';
    const category = document.createElement('div');
    category.className = 'product-category'; category.textContent = product.unitLabel;
    const title = document.createElement('h3');
    title.className = 'product-title';
    const titleLink = document.createElement('a');
    titleLink.href = `/products/${encodeURIComponent(product.handle)}`;
    titleLink.textContent = product.title;
    title.appendChild(titleLink);

    const priceRow = document.createElement('div');
    priceRow.className = 'price-row';
    const price = document.createElement('span'); price.className = 'price'; price.textContent = RFS.money(product.priceInr);
    priceRow.appendChild(price);
    if (Number(product.compareAtInr) > Number(product.priceInr)) {
      const compare = document.createElement('span'); compare.className = 'compare'; compare.textContent = RFS.money(product.compareAtInr);
      priceRow.appendChild(compare);
    }
    const unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = `/ ${product.unitLabel}`;
    priceRow.appendChild(unit);
    if (product.stock > 0 && product.stock <= 5) {
      const low = document.createElement('span');
      low.className = 'chip-lowstock';
      low.textContent = `🔥 Only ${product.stock} left`;
      priceRow.appendChild(low);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const current = inCart(product.handle);
    if (current > 0) actions.appendChild(stepper(product, current));
    else {
      const add = document.createElement('button');
      add.className = 'button primary full'; add.type = 'button';
      add.textContent = product.stock <= 0 ? 'Sold out' : 'Add to basket';
      add.disabled = product.stock <= 0;
      add.addEventListener('click', () => { RFS.flyToBasket(imageWrap); RFS.addItem(product.handle, 1); });
      actions.appendChild(add);
    }
    body.append(category, title, priceRow, actions);
    if (product.stock <= 10) {
      const stock = document.createElement('div'); stock.className = 'stock-note';
      stock.textContent = product.stock <= 0 ? 'Sold out today' : `Only ${product.stock} left`;
      body.appendChild(stock);
    }
    article.append(imageWrap, body);
    reveal(article, index);
    return article;
  }

  const SORTERS = {
    featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(a.title).localeCompare(String(b.title)),
    'price-asc': (a, b) => Number(a.priceInr) - Number(b.priceInr) || String(a.title).localeCompare(String(b.title)),
    'price-desc': (a, b) => Number(b.priceInr) - Number(a.priceInr) || String(a.title).localeCompare(String(b.title)),
    name: (a, b) => String(a.title).localeCompare(String(b.title))
  };

  function filteredProducts() {
    let rows = state.products;
    if (state.activeCategory !== 'All') rows = rows.filter(p => p.category === state.activeCategory);
    const q = state.search.trim().toLowerCase();
    if (q) rows = rows.filter(p => [p.title, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(q));
    if (state.offersOnly) rows = rows.filter(p => Number(p.compareAtInr) > Number(p.priceInr));
    return rows.slice().sort(SORTERS[state.sort] || SORTERS.featured);
  }

  function categoryImage(category) {
    return category === 'All'
      ? (state.products.find(p => p.featured) || state.products[0])?.image || '/assets/brand/basket.jpg'
      : state.products.find(product => product.category === category)?.image || '/assets/brand/basket.jpg';
  }

  function makeCategoryButton(category) {
    const count = category === 'All' ? state.products.length : state.products.filter(product => product.category === category).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-pill ${state.activeCategory === category ? 'active' : ''}`;
    button.innerHTML = '<img alt=""><span class="category-copy"><span></span><small class="category-count"></small></span>';
    button.querySelector('img').src = categoryImage(category);
    button.querySelector('img').loading = 'lazy';
    button.querySelector('.category-copy > span').textContent = category;
    button.querySelector('.category-count').textContent = count;
    button.addEventListener('click', () => {
      state.activeCategory = category;
      renderCategories();
      renderGrid();
      requestAnimationFrame(() => {
        categoryRow.querySelector('.category-pill.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });
    return button;
  }

  function renderCategories() {
    categoryRow.innerHTML = '';
    categoryRow.appendChild(makeCategoryButton('All'));
    for (const category of state.categories) categoryRow.appendChild(makeCategoryButton(category));
  }

  function renderGrid() {
    const products = filteredProducts();
    grid.innerHTML = '';
    if (resultCount) {
      resultCount.textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
      resultCount.classList.remove('pulse');
      void resultCount.offsetWidth;
      resultCount.classList.add('pulse');
    }
    if (!products.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.style.gridColumn = '1 / -1';
      empty.innerHTML = '<h3>No products found</h3><p>Try another vegetable, leaf, or combo.</p>';
      grid.appendChild(empty);
      return;
    }
    products.forEach((product, index) => grid.appendChild(card(product, index)));
  }

  function renderHeroShowcase() {
    if (!heroHost || !state.products.length) return;
    const featured = state.products.filter(p => p.stock > 0);
    const mainProduct = featured.find(p => p.featured) || featured[0];
    const minis = featured.filter(p => p.handle !== mainProduct.handle).slice(0, 2);
    heroHost.innerHTML = '<div class="hero-orbit"></div>';

    const main = document.createElement('a');
    main.className = 'hero-card featured';
    main.href = `/products/${encodeURIComponent(mainProduct.handle)}`;
    main.innerHTML = `
      <span class="badge orange">Fresh pick</span>
      <img src="${mainProduct.image}" alt="${mainProduct.title}">
      <div><span class="badge gray">${mainProduct.category}</span><h3></h3><span class="hero-price">${RFS.money(mainProduct.priceInr)} / ${mainProduct.unitLabel}</span></div>`;
    main.querySelector('h3').textContent = mainProduct.title;
    heroHost.appendChild(main);

    for (const product of minis) {
      const mini = document.createElement('a');
      mini.className = 'hero-card small';
      mini.href = `/products/${encodeURIComponent(product.handle)}`;
      mini.innerHTML = `<img src="${product.image}" alt="${product.title}"><h3></h3><span class="hero-price">${RFS.money(product.priceInr)}</span>`;
      mini.querySelector('h3').textContent = product.title;
      heroHost.appendChild(mini);
    }
    const caption = document.createElement('div');
    caption.className = 'hero-caption';
    caption.textContent = 'Live stock from today’s catalogue';
    heroHost.appendChild(caption);
  }

  function applySettings(settings) {
    const content = settings.content || {};
    const business = settings.business || {};
    const delivery = settings.delivery || {};
    const replacements = [
      ['[data-home-badge]', content.homeBadge || 'Fresh stock opens daily'],
      ['[data-home-title]', content.homeTitle || 'Fresh vegetables in Hosur'],
      ['[data-home-subtitle]', content.homeSubtitle || 'Fresh vegetables. Exact pin. Morning delivery.'],
      ['[data-delivery-note-title]', content.deliveryNoteTitle || 'Delivery by real road distance'],
      ['[data-delivery-note-text]', content.deliveryNoteText || 'Choose GPS or map pin at checkout. We confirm the rider route before the slot.'],
      ['[data-delivery-note-button]', content.deliveryNoteButton || 'Check my pin']
    ];
    for (const [selector, value] of replacements) {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    }
    const radius = document.querySelector('[data-fact-radius]'); if (radius && delivery.maxRoadKm) radius.textContent = `${delivery.maxRoadKm} km`;
    const free = document.querySelector('[data-fact-free]'); if (free && delivery.freeOverInr) free.textContent = `₹${Number(delivery.freeOverInr).toLocaleString('en-IN')}+`;
    const cod = document.querySelector('[data-fact-cod]'); if (cod) cod.textContent = settings.payments?.codEnabled ? 'COD' : 'Pay pending';
    const whatsapp = document.querySelector('.whatsapp-link'); if (whatsapp && business.whatsapp) whatsapp.href = `https://wa.me/${String(business.whatsapp).replace(/\D/g, '')}`;
    document.title = `${business.name || 'Rebesta Fresh'} – ${content.homeTitle || 'Fresh vegetables in Hosur'}`;
  }

  function fillOffersBanner() {
    const banner = document.querySelector('[data-offers-banner]');
    if (!banner || !state.products.length) return;
    const offers = state.products.filter(p => Number(p.compareAtInr) > Number(p.priceInr));
    if (!offers.length) return;
    banner.hidden = false;
    const set = (selector, text) => { const node = banner.querySelector(selector); if (node) node.textContent = text; };
    set('[data-offers-count]', String(offers.length));
    const maxOff = Math.max(...offers.map(p => Math.round((1 - Number(p.priceInr) / Number(p.compareAtInr)) * 100)));
    set('[data-offers-max]', `${maxOff}%`);
    const combos = state.products.filter(p => /combo/i.test(p.category || '') || /combo/i.test((p.tags || []).join(' ')));
    set('[data-offers-combo]', combos.length
      ? `Family combos from ₹${Math.min(...combos.map(p => Number(p.priceInr)))}.`
      : 'Fresh deals updated daily.');
  }

  async function init() {
    try {
      setupReveal();
      const [data, settings] = await Promise.all([RFS.api('/api/products'), RFS.api('/api/settings')]);
      state.settings = settings; applySettings(settings);
      renderTestimonials(settings.testimonials || []);
      state.products = data.products.slice().sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(a.title).localeCompare(String(b.title)));
      state.categories = data.categories;
      fillOffersBanner();
      const stockFact = document.querySelector('[data-fact-stock]');
      if (stockFact) stockFact.textContent = String(data.products.length);
      renderCategories(); renderHeroShowcase(); renderGrid(); RFS.syncCartUI(state.products);
    } catch (error) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1 / -1"><h3>Could not load products</h3><p>${error.message}</p></div>`;
      RFS.toast(error.message, 'error');
    }
  }

  const searchHost = document.querySelector('.market-search');
  let searchDrop = null, searchTimer = null;
  function hideSearchDrop() { searchDrop?.remove(); searchDrop = null; }
  function renderSearchDrop() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (!searchHost) return;
      const q = state.search.trim().toLowerCase();
      if (!q) return hideSearchDrop();
      const matches = state.products.filter(p => [p.title, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(q)).slice(0, 7);
      hideSearchDrop();
      if (!matches.length) return;
      searchDrop = document.createElement('div');
      searchDrop.className = 'search-drop';
      searchDrop.setAttribute('role', 'listbox');
      for (const product of matches) {
        const link = document.createElement('a');
        link.className = 'search-drop-item';
        link.href = `/products/${encodeURIComponent(product.handle)}`;
        link.innerHTML = '<img alt=""><div><strong></strong><span></span></div><em></em>';
        link.querySelector('img').src = product.image;
        link.querySelector('img').alt = product.title;
        link.querySelector('img').loading = 'lazy';
        link.querySelector('img').decoding = 'async';
        link.querySelector('strong').textContent = product.title;
        link.querySelector('span').textContent = `${product.category} · ${product.unitLabel}`;
        link.querySelector('em').textContent = RFS.money(product.priceInr);
        searchDrop.appendChild(link);
      }
      searchHost.appendChild(searchDrop);
    }, 130);
  }
  searchInput?.addEventListener('input', () => { state.search = searchInput.value; renderGrid(); renderSearchDrop(); });
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hideSearchDrop(); searchInput.blur(); }
    if (event.key === 'Enter' && searchDrop) { event.preventDefault(); searchDrop.querySelector('a')?.click(); }
  });
  document.addEventListener('click', event => { if (searchHost && !searchHost.contains(event.target)) hideSearchDrop(); });

  // --- PWA install banner ---
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    showInstallBanner();
  });
  function showInstallBanner() {
    if (document.querySelector('.install-banner')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const dismissedAt = Number(localStorage.getItem('rebesta_install_dismissed_at') || 0);
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = `<span>📲 Install Rebesta Fresh — opens like an app, loads instantly.</span><button class="button orange small" type="button" data-install-now>Install</button><button class="install-close" type="button" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(banner);
    banner.querySelector('[data-install-now]').addEventListener('click', async () => {
      if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; }
      banner.remove();
    });
    banner.querySelector('.install-close').addEventListener('click', () => {
      localStorage.setItem('rebesta_install_dismissed_at', String(Date.now()));
      banner.remove();
    });
  }

  const offersToggle = document.querySelector('[data-offers-only]');
  offersToggle?.addEventListener('change', () => { state.offersOnly = offersToggle.checked; renderGrid(); });
  document.querySelectorAll('[data-sort]').forEach(pill => pill.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach(other => other.classList.toggle('active', other === pill));
    state.sort = pill.dataset.sort || 'featured';
    renderGrid();
  }));
  document.querySelector('[data-offers-cta]')?.addEventListener('click', () => {
    state.offersOnly = true;
    if (offersToggle) offersToggle.checked = true;
    renderGrid();
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('rebesta:cart-changed', () => { RFS.syncCartUI(state.products); renderGrid(); });
  init();
})();
