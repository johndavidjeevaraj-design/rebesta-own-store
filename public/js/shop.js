/* Rebesta Fresh — shop page: every product on one page.
   Same cards, Tamil/Tanglish search, voice mic, category pills and sorting as the homepage —
   but no 24-item cap: the whole market renders here. */
(() => {
  const state = { products: [], categories: [], settings: null, activeCategory: 'All', search: '', sort: 'featured', offersOnly: false };

  /* One template, three shops: /shop (everything), /offers (deals only), /greens (keerai & leafy greens). */
  const PAGE_MODE = (() => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/offers') return { offersOnly: true, heading: 'Today\u2019s offers', title: 'Today\u2019s Offers \u2014 Fresh Vegetable Deals in Hosur | Rebesta Fresh', canonical: '/offers', countWord: 'offer' };
    if (path === '/greens') return { category: 'Leafy Greens', heading: 'Greens & keerai', title: 'Fresh Greens & Keerai Delivered in Hosur | Rebesta Fresh', canonical: '/greens', countWord: 'green' };
    return { heading: 'All products', title: null, canonical: '/shop', countWord: 'product' };
  })();
  const grid = document.querySelector('[data-product-grid]');
  const categoryRow = document.querySelector('[data-category-row]');
  const searchInput = document.querySelector('[data-product-search]');
  const resultCount = document.querySelector('[data-result-count]');

  const inCart = handle => RFS.readCart().find(row => row.handle === handle)?.qty || 0;

  /* ---- reveal on scroll (same feel as homepage) ---- */
  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    state.reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        (entry.target._show || (() => entry.target.classList.add('is-visible')))();
        state.reveal.unobserve(entry.target);
      });
    }, { threshold: .09, rootMargin: '0px 0px -20px 0px' });
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
      const stock = document.createElement('div');
      stock.className = 'stock-note';
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

  function renderRecent() {
    const shelf = document.querySelector('[data-recent-shelf]');
    if (!shelf) return;
    let handles = [];
    try { handles = JSON.parse(localStorage.getItem('rebesta_recent') || '[]'); } catch {}
    const list = handles.map(h => state.products.find(p => p.handle === h)).filter(p => p && p.stock > 0).slice(0, 8);
    if (list.length < 2) { shelf.hidden = true; return; }
    shelf.hidden = false;
    const rail = shelf.querySelector('[data-shelf-rail="recent"]');
    rail.innerHTML = '';
    list.forEach((product, index) => rail.appendChild(card(product, index)));
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
    'arugula-rocket': ['keerai'], 'collard-greens': ['keerai'], 'bok-choy-pak-choy': ['keerai'], 'swiss-chard': ['keerai'], 'watercress': ['keerai'], 'kale': ['keerai'], 'lettuce-iceberg': ['salad keerai'], 'lettuce-romaine': ['salad keerai'], 'lettuce-lollo-rosso': ['salad keerai'],
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
      resultCount.textContent = `${products.length} ${PAGE_MODE.countWord}${products.length === 1 ? '' : 's'}`;
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
    /* No cap on the shop page — the whole market, every product. */
    products.forEach((product, index) => grid.appendChild(card(product, index)));
  }

  function applySettings(settings) {
    const business = settings.business || {};
    const whatsapp = document.querySelector('.whatsapp-link');
    if (whatsapp && business.whatsapp) whatsapp.href = `https://wa.me/${String(business.whatsapp).replace(/\D/g, '')}`;
    if (business.name) document.title = `${business.name} — All Fresh Products, Delivered in Hosur`;
  }

  /* ---- header search filters this page's grid live ---- */
  searchInput?.addEventListener('input', () => { state.search = searchInput.value; renderGrid(); });
  searchInput?.addEventListener('keydown', event => { if (event.key === 'Escape') searchInput.blur(); });

  const offersToggle = document.querySelector('[data-offers-only]');
  offersToggle?.addEventListener('change', () => { state.offersOnly = offersToggle.checked; renderGrid(); });
  document.querySelectorAll('[data-sort]').forEach(pill => pill.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach(other => other.classList.toggle('active', other === pill));
    state.sort = pill.dataset.sort || 'featured';
    renderGrid();
  }));

  /* ---- Voice search — speak Tamil or English ---- */
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
        renderGrid();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // fallback: if the first transcript finds nothing, quietly try the other interpretations
        if (alts.length > 1 && !state.products.some(p => matchesQuery(p, alts[0].toLowerCase()))) {
          for (const alt of alts.slice(1)) {
            if (state.products.some(p => matchesQuery(p, alt.toLowerCase()))) { searchInput.value = alt; state.search = alt; renderGrid(); break; }
          }
        }
      };
      rec.start();
    });
  })();

  window.addEventListener('rebesta:cart-changed', () => { RFS.syncCartUI(state.products); renderRecent(); renderGrid(); });

  async function init() {
    try {
      setupReveal();
      const [data, settings] = await Promise.all([RFS.api('/api/products'), RFS.api('/api/settings')]);
      state.settings = settings; applySettings(settings);
      state.products = data.products.slice().sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(a.title).localeCompare(String(b.title)));
      state.categories = data.categories;
      if (PAGE_MODE.category) state.activeCategory = PAGE_MODE.category;
      if (PAGE_MODE.offersOnly) { state.offersOnly = true; const t = document.querySelector('[data-offers-only]'); if (t) t.checked = true; }
      const heading = document.querySelector('.product-heading h2');
      if (heading) heading.textContent = PAGE_MODE.heading;
      if (PAGE_MODE.title) document.title = PAGE_MODE.title;
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.href = `https://rebestafresh.in${PAGE_MODE.canonical}`;
      if (searchInput) searchInput.placeholder = `Search ${data.products.length}+ fresh products…`;
      renderRecent(); renderCategories(); renderGrid(); RFS.syncCartUI(state.products);
    } catch (error) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Could not load products</h3><p>${error.message}</p></div>`;
    }
  }
  init();
})();
