(() => {
  const state = { products: [], categories: [], settings: null, activeCategory: 'All', search: '', sort: 'featured', offersOnly: false, showAll: false, reveal: null };
  const grid = document.querySelector('[data-product-grid]');
  const categoryRow = document.querySelector('[data-category-row]');
  const searchInput = document.querySelector('[data-product-search]');
  const resultCount = document.querySelector('[data-result-count]');
  const heroHost = document.querySelector('[data-hero-showcase]');

  const inCart = handle => RFS.readCart().find(row => row.handle === handle)?.qty || 0;

    function renderTestimonials(items) {
    if (!items.length) return;
    const main = document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.className = 'section';
    section.setAttribute('data-testimonials-section', '');
    section.innerHTML = `
      <div class="container">
        <div class="section-head" style="margin-bottom:22px"><span class="eyebrow">Loved in Hosur</span><h2 class="section-title">What our customers say</h2><p class="section-subtitle">Real reviews from real kitchens around town.</p></div>
        <div class="testimonial-grid" data-testimonial-grid>
          ${items.slice(0, 3).map(t => `
            <figure class="testimonial-card">
              <div class="testimonial-stars">${'★'.repeat(Math.max(1, Math.min(5, t.rating || 5)))}<span class="dim">${'★'.repeat(5 - Math.max(1, Math.min(5, t.rating || 5)))}</span></div>
              <blockquote>${t.text}</blockquote>
              <figcaption><strong>${t.name}</strong>${t.area ? `<span> · ${t.area}</span>` : ''}</figcaption>
            </figure>`).join('')}
        </div>
      </div>`;
    main.appendChild(section);
    if (state.reveal) [...section.querySelectorAll('.testimonial-card')].forEach(reveal);
  }

    async function loadCustomerReviews() {
    try {
      const data = await RFS.api('/api/reviews?latest=1');
      renderTestimonials((data.reviews || []).slice(0, 3));
    } catch (error) { /* reviews are optional — stay quiet */ }
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
    if (q) rows = rows.filter(p => matchesQuery(p, q));
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

  /* ---- Tamil / Tanglish search aliases — customers search the way they speak ---- */
  const TAMIL_ALIASES = {
    'tomato': ['thakkali', 'takkali', 'தக்காளி'], 'cherry-tomatoes': ['thakkali'], 'heirloom-tomatoes': ['thakkali'],
    'vine-tomatoes-1-kg': ['thakkali'], 'vine-tomatoes-2-kg': ['thakkali'], 'vine-tomatoes-500-g': ['thakkali'],
    'green-chilli': ['pachai milagai', 'milagai', 'பச்சை மிளகாய்'], 'red-chilli-fresh': ['semmilagai', 'sigappu milagai'],
    'birds-eye-chilli': ['kanthari', 'kanthari milagai'],
    'brinjal-eggplant': ['kathirikkai', 'kathrikai', 'kattrikkai', 'கத்தரிக்காய்'], 'brinjal-japanese': ['kathirikkai'], 'brinjal-thai': ['kathirikkai'],
    'capsicum-green': ['koda milagai', 'கோதா மிளகாய்'], 'capsicum-red': ['koda milagai'], 'capsicum-yellow': ['koda milagai'],
    'tri-colour-bell-peppers-1-kg': ['koda milagai'], 'tri-colour-bell-peppers-500-g': ['koda milagai'], 'tri-colour-bell-peppers-250-g': ['koda milagai'],
    'onion-big': ['vengayam', 'periya vengayam', 'வெங்காயம்'],
    'small-onion-shallot': ['chinna vengayam', 'chinna ulli', 'small onion', 'சின்ன வெங்காயம்'],
    'garlic': ['poondu', 'vellapoondu', 'பூண்டு'],
    'spring-onion-scallion': ['vengaya thal', 'spring onion'], 'chives': ['vengaya thal'],
    'potato': ['urulai kilangu', 'urulaikilangu', 'உருளைக்கிழங்கு'],
    'carrot-ooty': ['carrot', 'கேரட்'], 'orange-carrots-1-kg': ['carrot'], 'orange-carrots-500-g': ['carrot'], 'purple-carrot': ['carrot'],
    'radish-red': ['mullangi', 'mullangai', 'முள்ளங்கி'], 'radish-white': ['mullangi'],
    'sweet-potato': ['sakkarai valli kilangu', 'sarkarai valli', 'சக்கரைவள்ளிக்கிழங்கு'],
    'tapioca-cassava': ['maravalli kilangu', 'kappa', 'மரவள்ளிக்கிழங்கு'],
    'elephant-foot-yam-suran': ['karunai kilangu', 'suran', 'சுரைக்கிழங்கு'], 'yam': ['karunai kilangu', 'senai kilangu'],
    'amaranth-leaves': ['keerai', 'mulai keerai', 'thandu keerai', 'கீரை'],
    'baby-spinach-palak': ['keerai', 'palak', 'pasalai keerai', 'பசலைக்கீரை'], 'spinach-palak': ['keerai', 'palak', 'pasalai keerai'],
    'fenugreek-leaves-methi': ['vendhaya keerai', 'methi', 'வெந்தயக்கீரை'],
    'mint-pudina': ['pudina', 'புதினா'],
    'coriander-leaves': ['kothamalli', 'கொத்தமல்லி'], 'fresh-coriander-100-g': ['kothamalli'], 'fresh-coriander-250-g': ['kothamalli'],
    'curry-leaves': ['karuveppilai', 'கறிவேப்பிலை'],
    'mustard-greens': ['kadugu keerai', 'keerai'], 'sorrel': ['pulicha keerai'],
    'arugula-rocket': ['keerai'], 'collard-greens': ['keerai'], 'bok-choy-pak-choi': ['keerai'], 'swiss-chard': ['keerai'],
    'watercress': ['keerai'], 'kale': ['keerai'], 'lettuce-iceberg': ['salad keerai'], 'lettuce-romaine': ['salad keerai'], 'lettuce-lollo-rosso': ['salad keerai'],
    'mixed-greens-box-1-kg': ['keerai'], 'mixed-greens-box-500-g': ['keerai'], 'microgreens-mixed': ['keerai'],
    'bottle-gourd-lauki': ['suraikkai', 'சுரைக்காய்'], 'ridge-gourd-turai': ['peerkangai', 'பீர்க்கங்காய்'], 'sponge-gourd': ['peerkangai'],
    'snake-gourd': ['pudalangai', 'புடலங்காய்'], 'bitter-gourd-karela': ['pavakkai', 'pagarkai', 'பாகற்காய்'],
    'ash-gourd-winter-melon': ['poosanikkai', 'பூசணிக்காய்'], 'chow-chow-chayote': ['chow chow'],
    'ivy-gourd-tindora': ['kovakkai', 'கோவக்காய்'], 'pumpkin': ['parangikkai', 'பரங்கிக்காய்'],
    'broad-beans-avarakkai': ['avarakkai', 'அவரைக்காய்'], 'cluster-beans-gawar': ['kothavarangai', 'கொத்தவரங்காய்'],
    'green-peas': ['pattani', 'பட்டாணி'], 'drumstick-moringa': ['murungakkai', 'முருங்கைக்காய்'],
    'cabbage': ['kosu', 'muttai kosu', 'முட்டைக்கோஸு'], 'red-cabbage': ['kosu'], 'cauliflower': ['poo kosu', 'பூக்கோஸு'],
    'mushroom-button': ['kaalan', 'mushroom', 'காளான்'], 'mushroom-oyster': ['kaalan'], 'mushroom-milky': ['kaalan'], 'mushroom-portobello': ['kaalan'], 'mushroom-shiitake': ['kaalan'],
    'banana-stem': ['vazhai thandu', 'வாழைத்தண்டு'], 'banana-flower': ['vazhai poo', 'வாழைப்பூ'],
    'sweet-corn': ['makka cholam'], 'turnip': ['turnip']
  };
  function searchHaystack(p) {
    const extra = TAMIL_ALIASES[p.handle] || [];
    return [p.title, p.description, p.category, ...(p.tags || []), ...extra].join(' ').toLowerCase();
  }
  function matchesQuery(p, q) {
    if (!q) return true;
    const hay = searchHaystack(p);
    return q.split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
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
    /* Cap the wall: first 24 render, the rest wait behind one "Show all" tap. */
    const cap = state.showAll ? products.length : Math.min(24, products.length);
    products.slice(0, cap).forEach((product, index) => grid.appendChild(card(product, index)));
    const revealBar = document.querySelector('[data-grid-reveal]');
    if (revealBar) {
      revealBar.hidden = !(products.length > cap);
      const label = revealBar.querySelector('[data-show-all-count]');
      if (label && products.length > cap) label.textContent = String(products.length);
    }
  }

  /* ============ Curated shelves (guided shopping) ============ */
  const ESSENTIALS = ['tomato', 'onion-big', 'potato', 'carrot-ooty', 'green-chilli', 'coriander-leaves', 'garlic', 'small-onion-shallot'];

  function renderShelves() {
    const discount = p => Number(p.compareAtInr) > 0 ? 1 - Number(p.priceInr) / Number(p.compareAtInr) : 0;
    const put = (key, list, total) => {
      const shelf = document.querySelector(`[data-shelf="${key}"]`);
      if (!shelf) return;
      const rail = shelf.querySelector('[data-shelf-rail]');
      if (!rail || !list.length) { shelf.hidden = true; return; }
      shelf.hidden = false;
      rail.innerHTML = '';
      list.forEach((product, index) => rail.appendChild(card(product, index)));
      const count = shelf.querySelector('[data-shelf-count]');
      if (count) count.textContent = String(total || list.length);
    };
    const greens = state.products.filter(p => p.category === 'Leafy Greens');
    const boxes = state.products.filter(p => ['Veg boxes', 'Combos & Kits'].includes(p.category));
    const offers = state.products.filter(p => discount(p) > 0).sort((a, b) => discount(b) - discount(a));
    put('greens', greens.slice(0, 10), greens.length);
    put('essentials', ESSENTIALS.map(handle => state.products.find(p => p.handle === handle)).filter(Boolean).slice(0, 8));
    put('boxes', boxes.slice(0, 5), boxes.length);
    put('offers', offers.slice(0, 8), offers.length);
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
      document.title = `${business.name || 'Rebesta Fresh'} — Farm-Fresh Vegetables Delivered in Hosur Every Morning`;
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
    const comboText = combos.length
      ? `Family combos from ₹${Math.min(...combos.map(p => Number(p.priceInr)))}`
      : 'Fresh deals updated daily';
    const parts = [`${offers.length} fresh deals in stock today`, `up to ${maxOff}% off`, comboText, 'Free delivery over ₹500', 'Cash on delivery'];
    const msg = parts.join('&nbsp;&nbsp;✦&nbsp;&nbsp;');
    const track = banner.querySelector('[data-offers-track]');
    if (track) track.innerHTML = `<p class="offers-copy">${msg}</p><p class="offers-copy" aria-hidden="true">${msg}</p>`;
  }

  async function init() {
    try {
      setupReveal();
      const [data, settings] = await Promise.all([RFS.api('/api/products'), RFS.api('/api/settings')]);
      state.settings = settings; applySettings(settings);
      const curated = settings.testimonials || [];
      if (curated.length) renderTestimonials(curated);
      else loadCustomerReviews();
      state.products = data.products.slice().sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(a.title).localeCompare(String(b.title)));
      state.categories = data.categories;
      fillOffersBanner();
      const stockFact = document.querySelector('[data-fact-stock]');
      if (stockFact) stockFact.textContent = String(data.products.length);
      const searchInput = document.querySelector('[data-product-search]');
      if (searchInput) searchInput.placeholder = `Search ${data.products.length}+ fresh products…`;
      renderCategories(); renderHeroShowcase(); renderShelves(); renderGrid(); RFS.syncCartUI(state.products);
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
      const matches = state.products.filter(p => matchesQuery(p, q)).slice(0, 7);
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
      document.body.appendChild(searchDrop);
      positionSearchDrop();
    }, 130);
  }
  function positionSearchDrop() {
    if (!searchDrop || !searchInput) return;
    const r = searchInput.getBoundingClientRect();
    const width = Math.max(280, Math.round(r.width));
    const left = Math.min(Math.max(8, Math.round(r.left)), Math.max(8, window.innerWidth - width - 8));
    const header = document.querySelector('.site-header');
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    searchDrop.style.left = left + 'px';
    searchDrop.style.top = Math.round(Math.max(r.bottom, headerBottom) + 8) + 'px';
    searchDrop.style.width = width + 'px';
  }
  window.addEventListener('resize', () => positionSearchDrop(), { passive: true });
  window.addEventListener('scroll', () => positionSearchDrop(), { passive: true });
  searchInput?.addEventListener('input', () => { state.search = searchInput.value; renderGrid(); renderSearchDrop(); });

  /* ---- Voice search — speak Tamil or English, works on Chrome/Android ---- */
  (function setupVoice() {
    const btn = document.querySelector('[data-voice-search]');
    if (!btn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // mic stays hidden — typing still works everywhere
    btn.hidden = false;
    let rec = null, listening = false;
    btn.addEventListener('click', () => {
      if (listening) { rec?.stop(); return; }
      rec = new SR();
      rec.lang = 'en-IN';
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      const base = searchInput.placeholder;
      rec.onstart = () => { listening = true; btn.classList.add('listening'); searchInput.placeholder = 'Listening… speak now'; };
      rec.onend = () => { listening = false; btn.classList.remove('listening'); searchInput.placeholder = base; };
      rec.onerror = () => { listening = false; btn.classList.remove('listening'); searchInput.placeholder = base; };
      rec.onresult = event => {
        const alts = [...event.results[0]].map(r => r.transcript.trim()).filter(Boolean);
        if (!alts.length) return;
        searchInput.value = alts[0];
        state.search = alts[0];
        renderGrid(); renderSearchDrop();
        // fallback: if the first transcript finds nothing, quietly try the other interpretations
        if (alts.length > 1 && !state.products.some(p => matchesQuery(p, alts[0].toLowerCase()))) {
          for (const alt of alts.slice(1)) {
            if (state.products.some(p => matchesQuery(p, alt.toLowerCase()))) { searchInput.value = alt; state.search = alt; renderGrid(); renderSearchDrop(); break; }
          }
        }
      };
      rec.start();
    });
  })();
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hideSearchDrop(); searchInput.blur(); }
    if (event.key === 'Enter' && searchDrop) { event.preventDefault(); searchDrop.querySelector('a')?.click(); }
  });
  document.addEventListener('click', event => { if (searchHost && !searchHost.contains(event.target) && !(searchDrop && searchDrop.contains(event.target))) hideSearchDrop(); });

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
  /* Greens & offers shelves now link straight to /greens and /offers pages. */
  document.querySelectorAll('[data-shelf-goto]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelector(btn.getAttribute('data-shelf-goto') || '#browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  /* Show-all is now a link to /shop — every product lives on its own page. */
  /* ---- Order-by countdown: last call for tomorrow morning's mandi run (cutoff 9 PM) ---- */
  function updateOrderByChip() {
    const chip = document.querySelector('[data-order-by]');
    if (!chip) return;
    chip.hidden = false;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(21, 0, 0, 0);
    let target = cutoff, when = 'tomorrow 7\u20139 AM';
    if (now >= cutoff) { target = new Date(cutoff.getTime() + 864e5); when = 'day after, 7\u20139 AM'; }
    const ms = Math.max(0, target - now);
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    const t = chip.querySelector('[data-order-by-time]');
    const w = chip.querySelector('[data-order-by-when]');
    if (t) t.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (w) w.textContent = when;
  }
  updateOrderByChip();
  setInterval(updateOrderByChip, 30000);

  window.addEventListener('rebesta:cart-changed', () => { RFS.syncCartUI(state.products); renderGrid(); });
  init();
})();
