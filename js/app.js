/* библ — публичная часть сайта */
(function () {
  'use strict';

  var state = { data: null, works: [], sold: [], current: [], idx: 0 };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(v) {
    if (v == null || v === '') return '';
    var raw = String(v).replace(/\s/g, '');
    if (/^\d+$/.test(raw)) {
      return Number(raw).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
    }
    return String(v);
  }

  function roman(n) {
    var map = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    var out = '';
    map.forEach(function (p) { while (n >= p[0]) { out += p[1]; n -= p[0]; } });
    return out;
  }

  function meta(w) {
    return [w.year, w.technique, w.size].filter(Boolean).join(' · ');
  }

  /* работа публикуется, только если есть фото, название и цена */
  function isComplete(w) {
    return !!(w && w.img && w.title && w.price);
  }

  /* ---------- загрузка ---------- */
  function load() {
    return fetch('data/works.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function () {
        return { bio: {}, contacts: {}, legal: {}, works: [] };
      });
  }

  /* ---------- рендер галереи ---------- */
  function cardHTML(w, i) {
    return '' +
      '<button class="card' + (w.sold ? ' card--sold' : '') + '" data-i="' + i + '" ' +
        'style="animation-delay:' + Math.min(i * 55, 550) + 'ms" ' +
        'aria-label="Открыть работу: ' + esc(w.title) + '">' +
        '<span class="card__frame">' +
          (w.sold ? '<span class="card__sold">продано</span>' : '') +
          '<img class="card__img" src="' + esc(w.img) + '" alt="' + esc(w.title) + '" loading="lazy" decoding="async">' +
        '</span>' +
        '<span class="card__cap">' +
          '<span class="card__num">' + roman(i + 1) + '</span>' +
          '<span class="card__title">' + esc(w.title) + '</span>' +
          '<span class="card__meta">' + esc(meta(w)) + '</span>' +
          '<span class="card__price">' + esc(money(w.price)) + '</span>' +
        '</span>' +
      '</button>';
  }

  function paint(grid, list, voidEl, featuredEl) {
    var offset = 0;

    if (featuredEl) {
      if (list.length > 1) {
        var f = list[0];
        featuredEl.innerHTML = '' +
          '<button class="featured" data-i="0" aria-label="Открыть работу: ' + esc(f.title) + '">' +
            '<img src="' + esc(f.img) + '" alt="' + esc(f.title) + '">' +
            '<span class="featured__cap">' +
              '<span class="card__num">' + roman(1) + '</span>' +
              '<span class="featured__title">' + esc(f.title) + '</span>' +
              '<span class="card__meta" style="display:block;margin-top:10px">' + esc(meta(f)) + '</span>' +
              '<span class="featured__price">' + esc(money(f.price)) + '</span>' +
            '</span>' +
          '</button>';
        featuredEl.hidden = false;
        featuredEl.querySelector('.featured').addEventListener('click', function () {
          openLightbox(list, 0);
        });
        offset = 1;
      } else {
        featuredEl.innerHTML = '';
        featuredEl.hidden = true;
      }
    }

    grid.innerHTML = list.slice(offset).map(function (w, k) { return cardHTML(w, offset + k); }).join('');
    if (voidEl) voidEl.hidden = list.length > 0;
    $$('.card', grid).forEach(function (btn) {
      btn.addEventListener('click', function () { openLightbox(list, Number(btn.dataset.i)); });
    });
  }

  /* ---------- био и контакты ---------- */
  function renderProfile() {
    var b = state.data.bio || {};
    var c = state.data.contacts || {};
    var l = state.data.legal || {};

    if (b.name) {
      $('#bio-title').textContent = b.name;
      $('#about-name').textContent = b.name;
      document.title = b.name + ' — работы';
    }
    if (b.lede) $('#bio-lede').textContent = b.lede;
    if (b.text) $('#about-text').textContent = b.text;

    var about = document.querySelector('.about');
    if (b.photo) {
      $('#about-photo').innerHTML = '<img src="' + esc(b.photo) + '" alt="' + esc(b.name || '') + '" loading="lazy">';
      about.classList.remove('about--nophoto');
    } else {
      $('#about-photo').innerHTML = '';
      about.classList.add('about--nophoto');
    }

    var facts = (b.facts || []).filter(function (f) { return f && f.v; });
    $('#about-facts').innerHTML = facts.map(function (f) {
      return '<div class="facts__row"><dt class="facts__k">' + esc(f.k) + '</dt>' +
             '<dd class="facts__v">' + esc(f.v) + '</dd></div>';
    }).join('');
    $('#about-facts').hidden = facts.length === 0;

    var links = [];
    if (c.telegram) links.push({ href: 'https://t.me/' + c.telegram, label: 'Telegram', sub: '@' + c.telegram });
    if (c.channel) links.push({ href: 'https://t.me/' + c.channel, label: 'Канал', sub: '@' + c.channel });
    $('#contact-links').innerHTML = links.map(function (x) {
      return '<a class="contacts__link" href="' + esc(x.href) + '" target="_blank" rel="noopener">' +
             esc(x.label) + ' <span style="color:var(--ink-faint)">' + esc(x.sub) + '</span></a>';
    }).join('');

    var introText = $('#intro-text'), introFact = $('#intro-facts'), introPhoto = $('#intro-photo');
    if (introText) introText.textContent = b.text || b.lede || '';
    if (introPhoto) {
      introPhoto.innerHTML = b.photo
        ? '<img src="' + esc(b.photo) + '" alt="' + esc(b.name || '') + '">'
        : '';
      introPhoto.hidden = !b.photo;
    }
    if (introFact) {
      introFact.innerHTML = facts.map(function (f) {
        return '<div><dt>' + esc(f.k) + '</dt><dd>' + esc(f.v) + '</dd></div>';
      }).join('');
      introFact.hidden = facts.length === 0;
    }

    var links = [];
    if (c.telegram) links.push({ href: 'https://t.me/' + c.telegram, label: 'Telegram' });
    if (c.channel) links.push({ href: 'https://t.me/' + c.channel, label: 'Канал' });
    var footLinks = $('#foot-links');
    if (footLinks) {
      footLinks.innerHTML = links.map(function (x) {
        return '<a href="' + esc(x.href) + '" target="_blank" rel="noopener">' + esc(x.label) + '</a>';
      }).join('');
    }

    var legal = [];
    if (l.name) legal.push(esc(l.name));
    if (l.status) legal.push(esc(l.status));
    if (l.inn) legal.push('ИНН ' + esc(l.inn));
    $('#legal-line').innerHTML = legal.join(' · ');
    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------- счётчик и диапазон лет ---------- */
  function renderMeta() {
    var el = $('#lede-meta');
    if (!el) return;
    var years = state.works.map(function (w) { return parseInt(w.year, 10); })
      .filter(function (y) { return y > 1900; });
    var n = state.works.length;
    var parts = [];
    if (n) parts.push(n + ' ' + (n === 1 ? 'работа' : n < 5 ? 'работы' : 'работ'));
    if (years.length) {
      var a = Math.min.apply(null, years), b = Math.max.apply(null, years);
      parts.push(a === b ? String(a) : a + ' — ' + b);
    }
    el.textContent = parts.join(' · ');
  }

  /* ---------- маршрутизация ---------- */
  var VIEWS = ['works', 'sold', 'contacts'];

  function route() {
    var name = (location.hash || '#works').replace('#', '');
    if (VIEWS.indexOf(name) === -1) name = 'works';

    VIEWS.forEach(function (v) {
      $('#view-' + v).hidden = (v !== name);
    });
    $$('[data-nav]').forEach(function (a) {
      a.classList.toggle('is-active', a.dataset.nav === name);
    });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------- лайтбокс ---------- */
  function openLightbox(list, i) {
    if (!list.length) return;
    state.current = list;
    state.idx = i;
    showSlide();
    var lb = $('#lb');
    lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }

  function showSlide() {
    var w = state.current[state.idx];
    if (!w) return;
    $('#lb-img').src = w.img;
    $('#lb-img').alt = w.title || '';
    $('#lb-title').textContent = w.title || '';
    $('#lb-meta').textContent = meta(w);
    $('#lb-price').textContent = money(w.price) + (w.sold ? ' · продано' : '');
    $('#lb-desc').textContent = w.desc || '';
    $('#lb-desc').hidden = !w.desc;
    var many = state.current.length > 1;
    $('#lb-prev').hidden = !many;
    $('#lb-next').hidden = !many;
  }

  function step(d) {
    var n = state.current.length;
    if (n < 2) return;
    state.idx = (state.idx + d + n) % n;
    showSlide();
  }

  function closeLightbox() {
    var lb = $('#lb');
    lb.classList.remove('is-open');
    setTimeout(function () { lb.hidden = true; }, 240);
    document.body.style.overflow = '';
  }

  /* ---------- запуск ---------- */
  load().then(function (data) {
    state.data = data;
    var all = (data.works || []).filter(isComplete);
    state.works = all.filter(function (w) { return !w.sold; });
    state.sold = all.filter(function (w) { return w.sold; });

    renderProfile();
    renderMeta();
    paint($('#grid-works'), state.works, $('#void-works'), $('#featured'));
    paint($('#grid-sold'), state.sold, $('#void-sold'));
    route();
  });

  window.addEventListener('hashchange', route);

  window.addEventListener('scroll', function () {
    $('#head').classList.toggle('is-scrolled', window.scrollY > 8);
  }, { passive: true });

  var burger = $('#burger'), nav = $('#nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', function () { step(-1); });
  $('#lb-next').addEventListener('click', function () { step(1); });
  $('#lb').addEventListener('click', function (e) {
    if (e.target === $('#lb')) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if ($('#lb').hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();
