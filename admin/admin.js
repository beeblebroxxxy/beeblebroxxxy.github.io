/* библ — админка. Работает напрямую с GitHub Contents API. */
(function () {
  'use strict';

  var OWNER = 'beeblebroxxxy';
  var REPO = 'beeblebroxxxy.github.io';
  var BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/';
  var TK = 'beeble_gh_token';

  var token = localStorage.getItem(TK) || '';
  var data = null;          // { bio, contacts, legal, works:[...] }
  var dataSha = null;
  var editIndex = null;     // null = новая работа
  var pendingImage = null;  // Blob для загружаемой работы
  var pendingBio = null;    // Blob для фото профиля

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- утилиты ---------- */
  function b64encode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function utf8ToB64(str) {
    return b64encode(new TextEncoder().encode(str));
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function msg(el, text, isErr) {
    el.textContent = text || '';
    el.classList.toggle('msg--err', !!isErr);
  }
  function money(v) {
    var raw = String(v == null ? '' : v).replace(/\s/g, '');
    if (/^\d+$/.test(raw)) return Number(raw).toLocaleString('ru-RU') + ' ₽';
    return v || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- GitHub API ---------- */
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) {
        return r.text().then(function (t) {
          var e = new Error('GitHub: ' + r.status + ' ' + t.slice(0, 160));
          e.status = r.status;
          throw e;
        });
      }
      return r.json();
    });
  }

  function getFile(path) {
    return gh(path + '?ref=' + BRANCH + '&t=' + Date.now()).then(function (res) {
      if (!res) return null;
      return { sha: res.sha, b64: res.content };
    });
  }

  function putFile(path, b64, message, sha) {
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    return gh(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function loadData() {
    return getFile('data/works.json').then(function (f) {
      if (!f) throw new Error('Не найден data/works.json');
      data = JSON.parse(b64ToUtf8(f.b64));
      data.works = data.works || [];
      data.bio = data.bio || {};
      data.contacts = data.contacts || {};
      data.legal = data.legal || {};
      dataSha = f.sha;
    });
  }

  function saveData(message) {
    return putFile('data/works.json', utf8ToB64(JSON.stringify(data, null, 2)), message, dataSha)
      .then(function (res) {
        if (!res) throw new Error('Не удалось сохранить');
        dataSha = res.content.sha;
      });
  }

  /* ---------- картинки ---------- */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать файл')); };
      img.src = url;
    });
  }

  function compress(file, maxSide, quality) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var k = Math.min(1, maxSide / Math.max(w, h));
      var cw = Math.round(w * k), ch = Math.round(h * k);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cw, ch);

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('Сжатие не удалось'));
          if (blob.type !== 'image/webp') {
            canvas.toBlob(function (j) { resolve(j); }, 'image/jpeg', quality);
          } else {
            resolve(blob);
          }
        }, 'image/webp', quality);
      });
    });
  }

  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function uploadImage(blob) {
    var ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    var name = 'images/' + Date.now().toString(36) + '-' +
               Math.random().toString(36).slice(2, 7) + '.' + ext;
    return blobToB64(blob).then(function (b64) {
      return putFile(name, b64, 'фото: ' + name).then(function () { return name; });
    });
  }

  /* ---------- вкладки ---------- */
  var PANELS = { works: '#panel-works', form: '#panel-form', profile: '#panel-profile', token: '#panel-token' };

  function showPanel(name) {
    Object.keys(PANELS).forEach(function (k) {
      $(PANELS[k]).hidden = (k !== name);
    });
    document.querySelectorAll('[data-tab]').forEach(function (a) {
      a.classList.toggle('is-active', a.dataset.tab === name);
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }

  /* ---------- список работ ---------- */
  function renderWorks() {
    var el = $('#works-list');
    var works = data.works || [];
    if (!works.length) {
      el.innerHTML = '<div class="item"><div></div><div class="item__title" style="color:var(--ink-faint)">Пока ни одной работы</div><div></div></div>';
      return;
    }
    el.innerHTML = works.map(function (w, i) {
      return '<div class="item">' +
        '<img class="item__thumb" src="../' + esc(w.img) + '" alt="">' +
        '<div><div class="item__title">' + esc(w.title || 'Без названия') +
          (w.sold ? '<span class="badge">продана</span>' : '') + '</div>' +
          '<div class="item__meta">' + esc([w.year, w.technique, money(w.price)].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="item__acts">' +
          '<button class="btn" data-edit="' + i + '">Изменить</button>' +
        '</div></div>';
    }).join('');
    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(Number(b.dataset.edit)); });
    });
  }

  /* ---------- форма работы ---------- */
  function openForm(index) {
    editIndex = (typeof index === 'number') ? index : null;
    pendingImage = null;
    var w = editIndex === null ? {} : data.works[editIndex];

    $('#form-title').textContent = editIndex === null ? 'Новая работа' : 'Работа';
    $('#f-title').value = w.title || '';
    $('#f-year').value = w.year || (editIndex === null ? new Date().getFullYear() : '');
    $('#f-price').value = w.price || '';
    $('#f-tech').value = w.technique || '';
    $('#f-size').value = w.size || '';
    $('#f-desc').value = w.desc || '';
    $('#f-sold').checked = !!w.sold;
    $('#form-delete').hidden = editIndex === null;
    msg($('#form-msg'), '');

    var pv = $('#preview');
    if (w.img) { pv.src = '../' + w.img; pv.hidden = false; $('#drop-hint').hidden = true; }
    else { pv.removeAttribute('src'); pv.hidden = true; $('#drop-hint').hidden = false; }

    showPanel('form');
  }

  function bindDrop(dropSel, inputSel, hintSel, previewSel, onFile) {
    var drop = $(dropSel), input = $(inputSel), hint = $(hintSel), pv = $(previewSel);
    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      onFile(f);
      pv.src = URL.createObjectURL(f);
      pv.hidden = false;
      if (hint) hint.hidden = true;
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      onFile(f);
      pv.src = URL.createObjectURL(f);
      pv.hidden = false;
      if (hint) hint.hidden = true;
    });
  }

  function saveWork() {
    var btn = $('#form-save');
    var title = $('#f-title').value.trim();
    var price = $('#f-price').value.trim();
    var hasImage = pendingImage || (editIndex !== null && data.works[editIndex].img);

    if (!title) return msg($('#form-msg'), 'Введите название', true);
    if (!price) return msg($('#form-msg'), 'Введите цену', true);
    if (!hasImage) return msg($('#form-msg'), 'Выберите фото', true);

    btn.disabled = true;
    msg($('#form-msg'), 'Сохраняю…');

    var imgPath = editIndex !== null ? data.works[editIndex].img : null;

    (pendingImage ? compress(pendingImage, 1600, 0.82).then(uploadImage) : Promise.resolve(imgPath))
      .then(function (path) {
        var w = {
          id: (editIndex !== null && data.works[editIndex].id) || ('w' + Date.now()),
          title: title,
          year: $('#f-year').value.trim(),
          price: price,
          technique: $('#f-tech').value.trim(),
          size: $('#f-size').value.trim(),
          desc: $('#f-desc').value.trim(),
          sold: $('#f-sold').checked,
          img: path
        };
        if (editIndex === null) data.works.unshift(w);
        else data.works[editIndex] = w;
        return saveData('работа: ' + title);
      })
      .then(function () {
        renderWorks();
        showPanel('works');
        msg($('#works-msg'), 'Сохранено. Сайт обновится в течение минуты.');
      })
      .catch(function (e) {
        msg($('#form-msg'), e.message, true);
      })
      .then(function () { btn.disabled = false; });
  }

  function deleteWork() {
    if (editIndex === null) return;
    var w = data.works[editIndex];
    if (!confirm('Удалить «' + (w.title || 'без названия') + '» с сайта?')) return;
    var btn = $('#form-delete');
    btn.disabled = true;
    data.works.splice(editIndex, 1);
    saveData('удалена работа: ' + (w.title || ''))
      .then(function () {
        renderWorks();
        showPanel('works');
        msg($('#works-msg'), 'Удалено.');
      })
      .catch(function (e) {
        msg($('#form-msg'), e.message, true);
        return loadData().then(renderWorks);
      })
      .then(function () { btn.disabled = false; });
  }

  /* ---------- профиль ---------- */
  function renderFacts() {
    var box = $('#facts-list');
    var facts = (data.bio.facts || []).slice();
    box.innerHTML = facts.map(function (f, i) {
      return '<div class="fact-row" data-i="' + i + '">' +
        '<input class="fld__i" data-k placeholder="Образование" value="' + esc(f.k || '') + '">' +
        '<input class="fld__i" data-v placeholder="СПбГАИЖСА им. Репина" value="' + esc(f.v || '') + '">' +
        '<button class="btn" type="button" data-del="' + i + '">×</button></div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        collectFacts();
        data.bio.facts.splice(Number(b.dataset.del), 1);
        renderFacts();
      });
    });
  }

  function collectFacts() {
    var rows = document.querySelectorAll('#facts-list .fact-row');
    data.bio.facts = Array.prototype.map.call(rows, function (r) {
      return { k: r.querySelector('[data-k]').value.trim(), v: r.querySelector('[data-v]').value.trim() };
    }).filter(function (f) { return f.k || f.v; });
  }

  function fillProfile() {
    $('#b-name').value = data.bio.name || '';
    $('#b-lede').value = data.bio.lede || '';
    $('#b-text').value = data.bio.text || '';
    $('#c-tg').value = data.contacts.telegram || '';
    $('#c-channel').value = data.contacts.channel || '';
    $('#l-name').value = data.legal.name || '';
    $('#l-inn').value = data.legal.inn || '';
    $('#l-status').value = data.legal.status || '';

    var pv = $('#preview-bio');
    if (data.bio.photo) { pv.src = '../' + data.bio.photo; pv.hidden = false; $('#drop-bio-hint').hidden = true; }
    else { pv.removeAttribute('src'); pv.hidden = true; $('#drop-bio-hint').hidden = false; }

    renderFacts();
  }

  function saveProfile() {
    var btn = $('#profile-save');
    btn.disabled = true;
    msg($('#profile-msg'), 'Сохраняю…');
    collectFacts();

    (pendingBio ? compress(pendingBio, 1200, 0.85).then(uploadImage) : Promise.resolve(data.bio.photo))
      .then(function (photoPath) {
        data.bio.name = $('#b-name').value.trim();
        data.bio.lede = $('#b-lede').value.trim();
        data.bio.text = $('#b-text').value.trim();
        data.bio.photo = photoPath || '';
        data.contacts.telegram = $('#c-tg').value.trim().replace(/^@/, '');
        data.contacts.channel = $('#c-channel').value.trim().replace(/^@/, '');
        data.legal.name = $('#l-name').value.trim();
        data.legal.inn = $('#l-inn').value.trim();
        data.legal.status = $('#l-status').value.trim();
        pendingBio = null;
        return saveData('профиль');
      })
      .then(function () { msg($('#profile-msg'), 'Сохранено.'); })
      .catch(function (e) { msg($('#profile-msg'), e.message, true); })
      .then(function () { btn.disabled = false; });
  }

  /* ---------- токен ---------- */
  function checkToken() {
    if (!token) { showPanel('token'); return; }
    msg($('#works-msg'), 'Загружаю…');
    loadData().then(function () {
      renderWorks();
      fillProfile();
      showPanel('works');
      msg($('#works-msg'), '');
      $('#token-clear').hidden = false;
    }).catch(function (e) {
      msg($('#token-msg'), e.status === 401 ? 'Токен не подошёл. Создайте новый.' : e.message, true);
      showPanel('token');
    });
  }

  /* ---------- события ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-tab]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = a.dataset.tab;
        if (t === 'token') { $('#token-clear').hidden = !token; showPanel('token'); return; }
        if (!data) return;
        if (t === 'works') renderWorks();
        showPanel(t);
      });
    });

    $('#token-save').addEventListener('click', function () {
      token = $('#token-input').value.trim();
      if (!token) return msg($('#token-msg'), 'Вставьте токен', true);
      localStorage.setItem(TK, token);
      msg($('#token-msg'), 'Проверяю…');
      checkToken();
    });

    $('#token-clear').addEventListener('click', function () {
      localStorage.removeItem(TK);
      token = '';
      $('#token-input').value = '';
      $('#token-clear').hidden = true;
      showPanel('token');
      msg($('#token-msg'), 'Токен удалён из этого браузера.');
    });

    $('#new-work').addEventListener('click', function () { openForm(null); });
    $('#form-save').addEventListener('click', saveWork);
    $('#form-delete').addEventListener('click', deleteWork);
    $('#form-cancel').addEventListener('click', function () { showPanel('works'); renderWorks(); });
    $('#profile-save').addEventListener('click', saveProfile);
    $('#fact-add').addEventListener('click', function () { collectFacts(); data.bio.facts.push({ k: '', v: '' }); renderFacts(); });

    bindDrop('#drop', '#photo', '#drop-hint', '#preview', function (f) { pendingImage = f; });
    bindDrop('#drop-bio', '#photo-bio', '#drop-bio-hint', '#preview-bio', function (f) { pendingBio = f; });

    var initial = (location.hash || '#works').replace('#', '');
    checkToken();
    if (initial === 'profile') setTimeout(function () { if (data) showPanel('profile'); }, 300);
  });
})();
