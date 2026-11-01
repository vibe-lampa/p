(function () {
  var K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  var INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  function compress(st, W, out) {
    var i, x, y, t1, t2;
    var a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
              W[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    for (i = 0; i < 64; i++) {
      t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
            ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
            ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    out[0] = (st[0] + a) | 0; out[1] = (st[1] + b) | 0; out[2] = (st[2] + c) | 0; out[3] = (st[3] + d) | 0;
    out[4] = (st[4] + e) | 0; out[5] = (st[5] + f) | 0; out[6] = (st[6] + g) | 0; out[7] = (st[7] + h) | 0;
  }

  function fillW(W, buf, off) {
    for (var i = 0; i < 16; i++) {
      var o = off + i * 4;
      W[i] = (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
    }
  }

  function Hasher(data) {
    var bytes = [], i;
    for (i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i) & 255);
    var nb = Math.floor(bytes.length / 64);
    var mid = new Int32Array(INIT), tmp = new Int32Array(8), W = new Int32Array(64);
    var buf = new Uint8Array(192);
    for (i = 0; i < nb * 64; i++) buf[i % 64] = bytes[i], (i % 64 === 63) && (fillW(W, buf, 0), compress(mid, W, tmp), mid.set(tmp));
    var rest = bytes.slice(nb * 64), r = rest.length;
    for (i = 0; i < 192; i++) buf[i] = 0;
    for (i = 0; i < r; i++) buf[i] = rest[i];
    var total = bytes.length;
    var out2 = new Int32Array(8);

    this.hash = function (nonce) {
      var s = String(nonce), nd = s.length, k;
      for (k = 0; k < nd; k++) buf[r + k] = s.charCodeAt(k);
      var p = r + nd;
      buf[p] = 0x80;
      var end = (p + 9 <= 64) ? 64 : 128;
      for (k = p + 1; k < end - 4; k++) buf[k] = 0;
      var bits = (total + nd) * 8;
      buf[end - 4] = (bits >>> 24) & 255; buf[end - 3] = (bits >>> 16) & 255;
      buf[end - 2] = (bits >>> 8) & 255; buf[end - 1] = bits & 255;
      fillW(W, buf, 0);
      compress(mid, W, tmp);
      if (end === 64) return tmp;
      fillW(W, buf, 64);
      compress(tmp, W, out2);
      return out2;
    };
  }

  function okHash(o, diff) {
    var w = 0;
    while (diff >= 8) { if (o[w] !== 0) return false; w++; diff -= 8; }
    if (diff > 0 && (o[w] >>> (32 - diff * 4)) !== 0) return false;
    return true;
  }

  function toHex(o) {
    var s = '';
    for (var i = 0; i < 8; i++) {
      var h = (o[i] >>> 0).toString(16);
      s += '00000000'.slice(h.length) + h;
    }
    return s;
  }

  function solve(data, diff, onProgress, cb) {
    var hasher = new Hasher(data), nonce = 0, start = Date.now(), lastTick = start;
    function step() {
      var t = Date.now(), i, o;
      while (Date.now() - t < 30) {
        for (i = 0; i < 300; i++) {
          o = hasher.hash(nonce);
          if (okHash(o, diff)) { cb(nonce, toHex(o), Date.now() - start); return; }
          nonce++;
        }
      }
      if (onProgress && Date.now() - lastTick > 1000) { lastTick = Date.now(); onProgress(nonce); }
      setTimeout(step, 0);
    }
    step();
  }

  function getJson(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 30000;
    xhr.onload = function () {
      try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb('bad response ' + xhr.status); }
    };
    xhr.onerror = function () { cb('network error'); };
    xhr.ontimeout = function () { cb('timeout'); };
    xhr.send();
  }

  function q(obj) {
    var a = [];
    for (var k in obj) if (obj.hasOwnProperty(k) && obj[k] !== undefined && obj[k] !== null) {
      a.push(k + '=' + encodeURIComponent(obj[k]));
    }
    return a.join('&');
  }

  function get(workerUrl, siteUrl, cachedCookie, cb, onProgress) {
    workerUrl = workerUrl.replace(/\/+$/, '');
    getJson(workerUrl + '/anubis/challenge?' + q({ url: siteUrl, cookie: cachedCookie || '' }), function (err, info) {
      if (err) return cb(err);
      if (info.status === 'passed') return cb(null, info.cookie || cachedCookie || '');
      if (info.status !== 'challenge') return cb('unexpected: ' + info.status + ' ' + (info.httpStatus || info.error || ''));

      var ch = info.challenge || {};
      var rules = ch.rules || {};
      var chal = ch.challenge;
      var data = typeof chal === 'string' ? chal : (chal && (chal.randomData || chal.data));
      var id = chal && typeof chal === 'object' ? chal.id : undefined;
      var algo = rules.algorithm || (chal && chal.method) || 'fast';
      var diff = rules.difficulty || (chal && chal.difficulty) || 4;

      if (!data) return cb('no challenge data');
      if (algo !== 'fast' && algo !== 'slow' && algo !== 'proofofwork') {
        return cb('unsupported algorithm: ' + algo);
      }

      solve(data, diff, onProgress, function (nonce, hash, elapsed) {
        getJson(workerUrl + '/anubis/pass?' + q({
          url: siteUrl, finalUrl: info.finalUrl, base: info.basePrefix, cookie: info.cookie,
          id: id, response: hash, nonce: nonce, elapsedTime: elapsed
        }), function (err2, res) {
          if (err2) return cb(err2);
          if (res.status === 'success') return cb(null, res.cookie);
          cb('pass failed: ' + (res.httpStatus || '') + ' ' + (res.body || res.error || ''));
        });
      });
    });
  }

  window.RezkaAnubis = { get: get, _solve: solve, _Hasher: Hasher, _hex: toHex };
})();

(function () {
  ("use strict");

  var year;
  var namemovie;
  var savedHTML = null;

  function endsWithSlash(str) {
    return str.charAt(str.length - 1) === '/';
  }

  function startsWithHttp(str) {
    return str.indexOf('http') === 0;
  }

  function repeatChar(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function fetchCompat(url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(options.method || 'GET', url, true);

      var headers = options.headers || {};
      for (var h in headers) {
        if (headers.hasOwnProperty(h)) {
          try {
            xhr.setRequestHeader(h, headers[h]);
          } catch (e) {}
        }
      }

      xhr.onload = function () {
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: function () {
            return Promise.resolve(xhr.responseText);
          }
        });
      };
      xhr.onerror = function () {
        reject(new Error('Network error'));
      };
      xhr.ontimeout = function () {
        reject(new Error('Request timeout'));
      };

      xhr.send(options.body || null);
    });
  }

  var anubisSolving = false;
  var anubisLastOk = 0;

  function solveAnubis(onOk, onFail, opts) {
    opts = opts || {};
    if (anubisSolving) return;
    var s = getSettings();
    if (!startsWithHttp(s.proxy)) {
      Lampa.Noty.show('Сначала настройте URL прокси-воркера в настройках плагина');
      if (onFail) onFail('no proxy');
      return;
    }
    anubisSolving = true;
    if (!opts.quiet) Lampa.Noty.show('Rezka: проходим проверку...');
    RezkaAnubis.get(s.proxy, s.host + '/', s.cookie, function (err, cookie) {
      anubisSolving = false;
      if (err) {
        console.error('[RezkaComment] anubis error:', err);
        if (!opts.silentFail) Lampa.Noty.show('Rezka: не удалось пройти проверку (' + err + ')');
        if (onFail) onFail(err);
        return;
      }
      Lampa.Storage.set('rezka_comment_cookie', cookie);
      if (!opts.quiet) Lampa.Noty.show('Rezka: проверка пройдена');
      if (onOk) onOk(cookie);
    });
  }

  function showCookieExpiredChoice(retryFn, sink) {
    function back() {
      if (sink) { if (sink.onError) sink.onError('blocked'); return; }
      try { Lampa.Controller.toggle('content'); } catch (e) {}
    }
    if (Date.now() - anubisLastOk < 30000) {
      Lampa.Noty.show('Rezka всё ещё блокирует запрос, попробуйте позже');
      back();
      return;
    }
    solveAnubis(function () {
      anubisLastOk = Date.now();
      if (retryFn) retryFn();
    }, back, { quiet: true, silentFail: !!sink });
  }

  function hasExplicitBotMarkers(text) {
    return text.indexOf("Проверяем, что вы не бот") !== -1 || text.indexOf("Anubis") !== -1;
  }

  function looksLikeBotBlockHtml(text, hasCookie) {
    if (hasExplicitBotMarkers(text)) return true;
    if (!hasCookie && text.indexOf("b-content") === -1) return true;
    return false;
  }

  function bgFail(sink, msg) {
    if (sink) {
      console.warn('[RezkaComment]', msg);
      if (sink.onError) sink.onError(msg);
      return;
    }
    Lampa.Noty.show(msg);
    Lampa.Loading.stop();
  }

  function getSettings() {
    var host = (Lampa.Storage.get('rezka_comment_host', 'https://rezka.ag') || 'https://rezka.ag').trim().replace(/\/+$/, '');
    var cookie = (Lampa.Storage.get('rezka_comment_cookie', '') || '').trim();
    var proxy = (Lampa.Storage.get('rezka_comment_proxy', 'https://rezka.lampasochka.workers.dev/') || 'https://rezka.lampasochka.workers.dev/').trim();
    if (proxy && !endsWithSlash(proxy)) {
      proxy += '/';
    }
    return { host: host, cookie: cookie, proxy: proxy };
  }

  function searchRezka(name, ye, sink) {
    var settings = getSettings();
    var host = settings.host;
    var cookie = settings.cookie;
    var proxy = settings.proxy;
    var path = host + "/search/?do=search&subaction=search&q=" + encodeURIComponent(name) + (ye ? "+" + ye : "");
    var searchUrl = proxy;
    if (cookie) {
      searchUrl += "param/Cookie=" + encodeURIComponent(cookie) + "/";
    }
    searchUrl += path;

    console.log('[RezkaComment] searching hdrezka with url:', searchUrl);

    return fetchCompat(searchUrl, {
      method: "GET",
      headers: { "Content-Type": "text/html" }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('HTTP status ' + response.status);
      }
      return response.text();
    }).then(function (fc) {
      var dom = new DOMParser().parseFromString(fc, "text/html");

      var item = dom.querySelector(".b-content__inline_item");
      if (!item) {
        console.warn('[RezkaComment] show not found on Rezka:', name, ye);
        if (!sink) Lampa.Loading.stop();
        if (looksLikeBotBlockHtml(fc, !!cookie)) {
          showCookieExpiredChoice(function () {
            if (!sink) Lampa.Loading.start();
            searchRezka(name, ye, sink);
          }, sink);
        } else {
          bgFail(sink, 'Фильм/сериал не найден на Rezka');
        }
        return;
      }

      var linkEl = item.querySelector(".b-content__inline_item-link");
      namemovie = linkEl ? linkEl.innerText : "";

      var itemUrl = linkEl ? linkEl.getAttribute("href") : "";
      return comment_rezka(item.dataset.id, itemUrl, sink);
    }).catch(function (e) {
      console.error('[RezkaComment] searchRezka error:', e);
      bgFail(sink, 'Ошибка поиска на Rezka: ' + e.message);
    });
  }

  function getEnTitle(id, type, sink, yr) {
    var tmdbType = type === 'movie' ? 'movie' : 'tv';
    var tmdbCacheKey = tmdbType + '_' + id;

    window.__tmdbTranslationsCache = window.__tmdbTranslationsCache || {};
    window.__tmdbFallbackTitleCache = window.__tmdbFallbackTitleCache || {};
    var cachedTr = window.__tmdbTranslationsCache[tmdbCacheKey];
    var fallbackTitle = window.__tmdbFallbackTitleCache[tmdbCacheKey] || '';

    var trPromise;

    if (cachedTr) {
      console.log('[RezkaComment] using shared translations cache for', tmdbCacheKey);
      trPromise = Promise.resolve(cachedTr);
    } else {
      trPromise = new Promise(function (res, rej) {
        Lampa.Api.sources.tmdb.get(
          tmdbType + '/' + id,
          { append_to_response: 'translations' },
          res,
          rej
        );
      }).then(function (data) {
        var tr = (data && data.translations && data.translations.translations) || [];
        window.__tmdbTranslationsCache[tmdbCacheKey] = tr;

        if (data && data.original_language === 'en') {
          fallbackTitle = (data && data.title) || (data && data.name) || (data && data.original_title) || (data && data.original_name) || '';
        }
        window.__tmdbFallbackTitleCache[tmdbCacheKey] = fallbackTitle;

        console.log('[RezkaComment] TMDB raw response for', tmdbCacheKey, data);
        return tr;
      });
    }

    return trPromise.then(function (tr) {
      var enTitle = '';
      var enList = tr.filter(function (t) {
        return t.iso_639_1 === 'en';
      });
      for (var i = 0; i < enList.length; i++) {
        var cand = enList[i];
        var candTitle = (cand && cand.data && cand.data.title) || (cand && cand.data && cand.data.name);
        if (candTitle) {
          enTitle = candTitle;
          break;
        }
      }
      if (!enTitle) enTitle = fallbackTitle;

      if (enTitle) {
        return searchRezka(normalizeTitle(enTitle), yr !== undefined ? yr : year, sink);
      } else {
        console.warn('[RezkaComment] English title not found for', tmdbCacheKey, tr, 'fallbackTitle:', fallbackTitle);
        bgFail(sink, 'Английское название не найдено');
      }
    }).catch(function (e) {
      console.error('[RezkaComment] TMDB error', e);
      var reason = (e && (e.message || e.status_message)) ? (e.message || e.status_message) : JSON.stringify(e);
      bgFail(sink, 'Ошибка получения данных TMDB: ' + reason);
    });
  }

  function cleanTitle(str) {
    return str.replace(/[\s.,:;’'`!?]+/g, " ").trim();
  }

  function normalizeTitle(str) {
    return cleanTitle(
      str
        .toLowerCase()
        .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, "-")
        .replace(/ё/g, "е")
    );
  }

  function buildCommentNode(item) {
    function q(s) {
      return item.querySelector(s);
    }

    var avaImg = q(".ava img");
    var avatar = (avaImg && (avaImg.dataset.src || avaImg.src)) || "";
    var nameEl = q(".name, .b-comment__user");
    var user = (nameEl && nameEl.innerText) || "Без имени";
    var dateEl = q(".date, .b-comment__time");
    var date = (dateEl && dateEl.innerText) || "";
    var textEl = q(".message .text, .text");
    var text = (textEl && textEl.innerHTML) || "";

    var wrapper = document.createElement("div");
    wrapper.className = "message";

    wrapper.innerHTML =
      '<div class="comment-wrap">' +
        '<div class="avatar-column">' +
          '<img src="' + avatar + '" class="avatar-img" alt="' + user + '">' +
        '</div>' +

        '<div class="comment-card">' +
          '<div class="comment-header">' +
            '<span class="name">' + user + '</span>' +
            '<span class="date">' + date + '</span>' +
          '</div>' +

          '<div class="comment-text">' +
            '<div class="text">' + text + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return fixCommentImages(wrapper);
  }

  function buildTree(root) {
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < root.children.length; i++) {
      var li = root.children[i];
      var indent = parseInt(li.dataset.indent || 0, 10);

      var wrapper = document.createElement("li");
      wrapper.className = "comments-tree-item";
      wrapper.style.marginLeft = indent > 0 ? "20px" : "0";
      wrapper.appendChild(buildCommentNode(li));

      var childrenList = li.querySelector("ol.comments-tree-list");
      if (childrenList) wrapper.appendChild(buildTree(childrenList));

      fragment.appendChild(wrapper);
    }

    return fragment;
  }

  function ensureCommentAssets() {
      if (!document.getElementById("rezka-comment-style")) {
        var styleEl = document.createElement("style");
        styleEl.id = "rezka-comment-style";
        styleEl.textContent =
          '    .comments-tree-list{list-style:none;margin:0;padding:0;}' +
          '.comments-tree-item{list-style:none;margin:0;padding:0;}' +
          '.comment-wrap{display:flex;margin-bottom:5px;}' +
          '.avatar-column{margin-right:10px;}' +
          '.avatar-img{width:48px;height:48px;border-radius:4px;}' +
          '.comment-card{background:#1b1b1b;padding:5px 12px;border-radius:6px;border:1px solid #2a2a2a;width:100%;}' +
          '.comment-header{display:flex;justify-content:space-between;margin-bottom:6px;}' +
          '.comment-header .name{font-weight:600;color:#fff;}' +
          '.comment-header .date{opacity:.7;font-size:11px;}' +
          '.comment-text .text{color:#ddd;line-height:1.45;}' +
          '.rc-children{margin-left:30px;border-left:1px solid #333;padding-left:14px;}' +
          '.title_spoiler{display:inline-flex;align-items:center;background:#2a2a2a;border-radius:6px;padding:1px 4px;margin:0 2px;font-size:13px;color:#e0e0e0;cursor:pointer;box-shadow:0 0 2px rgba(0,0,0,.4);}' +
          '.title_spoiler a{color:#e0e0e0!important;text-decoration:none!important;}' +
          '.title_spoiler img{height:14px;width:auto;vertical-align:middle;margin:0 2px;}' +
          '.title_spoiler .attention{height:14px;width:14px;margin-left:4px;vertical-align:middle;}' +
          '.modal-close-btn{background:#2a2a2a;border:1px solid #444;color:#ddd;border-radius:6px;font-size:18px;line-height:18px;cursor:pointer;transition:.15s;}' +
          '.modal-close-btn:hover{background:#3a3a3a;color:#fff;}';
        document.head.appendChild(styleEl);
      }
      if (!window.rezkaSpoilerInit) {
        window.rezkaSpoilerInit = true;
        var Script = document.createElement("script");
        Script.textContent =
          "function ShowOrHide(id){var t=$('#'+id);t.prev('.title_spoiler').remove();t.css('display','inline');}";
        document.head.appendChild(Script);
      }
  }

  function plainCommentText(textEl) {
    if (!textEl) return '';
    var c = textEl.cloneNode(true);
    var i, list = c.querySelectorAll('.title_spoiler');
    for (i = 0; i < list.length; i++) list[i].parentNode.removeChild(list[i]);
    list = c.querySelectorAll('[style]');
    for (i = 0; i < list.length; i++) {
      if (/display\s*:\s*none/i.test(list[i].getAttribute('style') || '') && list[i].parentNode) {
        list[i].parentNode.replaceChild(document.createTextNode(' [спойлер] '), list[i]);
      }
    }
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function fixCommentImages(root) {
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var s = img.getAttribute('src');
      if (s && !/^(data:|https?:)/i.test(s)) img.setAttribute('src', absUrl(s));
      img.onerror = function () {
        this.onerror = null;
        if (this.parentNode) this.parentNode.removeChild(this);
      };
    }
    return root;
  }

  function absUrl(src) {
    if (!src) return '';
    if (src.indexOf('//') === 0) return 'https:' + src;
    if (src.charAt(0) === '/') return getSettings().host + src;
    return src;
  }

  function flattenComments(root, out, depth) {
    for (var i = 0; i < root.children.length && out.length < 100; i++) {
      var li = root.children[i];
      var avaImg = li.querySelector('.ava img');
      var nameEl = li.querySelector('.name, .b-comment__user');
      var dateEl = li.querySelector('.date, .b-comment__time');
      var textEl = li.querySelector('.message .text, .text');
      var plain = plainCommentText(textEl);
      if (plain) {
        out.push({
          avatar: absUrl(avaImg && (avaImg.getAttribute('data-src') || avaImg.getAttribute('src'))),
          user: (nameEl && nameEl.textContent.replace(/\s+/g, ' ').trim()) || 'Без имени',
          date: ((dateEl && dateEl.textContent) || '').replace(/\s+/g, ' ').replace(/^\s*оставлен\s*/i, '').replace(/\s*,?\s*(\d{1,2}:\d{2})\s*$/, ' · $1').trim(),
          reply: (depth || 0) > 0,
          plain: plain,
          html: (textEl && textEl.innerHTML) || ''
        });
      }
      var children = li.querySelector('ol.comments-tree-list');
      if (children) flattenComments(children, out, (depth || 0) + 1);
    }
    return out;
  }

  function buildCommentNodeFromData(c) {
    var wrapper = document.createElement('div');
    wrapper.className = 'message';
    wrapper.innerHTML =
      '<div class="comment-wrap">' +
        '<div class="avatar-column"><img src="' + c.avatar + '" class="avatar-img" alt=""></div>' +
        '<div class="comment-card">' +
          '<div class="comment-header"><span class="name"></span><span class="date"></span></div>' +
          '<div class="comment-text"><div class="text">' + c.html + '</div></div>' +
        '</div>' +
      '</div>';
    wrapper.querySelector('.name').textContent = c.user;
    wrapper.querySelector('.date').textContent = c.date;
    return fixCommentImages(wrapper);
  }

  function showRezkaComment(c) {
    ensureCommentAssets();
    var ctl = '';
    try { ctl = Lampa.Controller.enabled().name; } catch (e) {}
    var body = $('<div><div class="broadcast__text" style="text-align:left;"><div class="comment"></div></div></div>');
    body.find('.comment').append(buildCommentNodeFromData(c));
    Lampa.Modal.open({
      title: c.user,
      html: body,
      size: 'medium',
      mask: true,
      onBack: function () {
        Lampa.Modal.close();
        if (ctl) { try { Lampa.Controller.toggle(ctl); } catch (e) {} }
      }
    });
  }

  function comment_rezka(id, pageUrl, sink) {
    var settings = getSettings();
    var host = settings.host;
    var cookie = settings.cookie;
    var proxy = settings.proxy;
    var t = Date.now();
    var path = host + "/ajax/get_comments/?t=" + t + "&news_id=" + (id ? id : "1") + "&cstart=1&type=0&comment_id=0&skin=hdrezka";

    var commentsUrl = proxy;
    if (cookie) {
      commentsUrl += "param/Cookie=" + encodeURIComponent(cookie) + "/";
    }
    if (pageUrl) {
      commentsUrl += "param/Referer=" + encodeURIComponent(pageUrl) + "/";
    }
    commentsUrl += path;

    console.log('[RezkaComment] fetching comments from:', commentsUrl);

    function openModal(treeContent) {
      Lampa.Loading.stop();
      var modal = $(
        '<div><div class="broadcast__text" style="text-align:left;"><div class="comment"></div></div></div>'
      );
      modal.find(".comment").append(treeContent);

      ensureCommentAssets();

      Lampa.Modal.open({
        title: "",
        html: modal,
        size: "large",
        style: "margin-top:10px;",
        mask: true,
        onBack: function () {
          Lampa.Modal.close();
          $(".modal--large").remove();
          Lampa.Controller.toggle("content");
        }
      });

      var modalHead = document.querySelector(".modal__head");
      if (modalHead) {
        modalHead.insertAdjacentHTML(
          "afterend",
          '<button class="modal-close-btn selector" onclick="$(\'.modal--large\').remove()">&times;</button>  ' + namemovie
        );
      }
    }

    return fetchCompat(commentsUrl, {
      method: "GET",
      headers: { "Content-Type": "text/plain" }
    }).then(function (r) {
      if (!r.ok) {
        throw new Error('HTTP status ' + r.status);
      }
      return r.text();
    }).then(function (fc) {
      if (hasExplicitBotMarkers(fc)) {
        if (!sink) Lampa.Loading.stop();
        showCookieExpiredChoice(function () {
          if (!sink) Lampa.Loading.start();
          comment_rezka(id, pageUrl, sink);
        }, sink);
        return;
      }

      var json;
      try {
        json = JSON.parse(fc);
      } catch (parseErr) {
        if (looksLikeBotBlockHtml(fc, !!cookie)) {
          if (!sink) Lampa.Loading.stop();
          showCookieExpiredChoice(function () {
            if (!sink) Lampa.Loading.start();
            comment_rezka(id, pageUrl, sink);
          }, sink);
          return;
        }
        throw new Error('Не удалось разобрать ответ сервера комментариев');
      }

      if (!json || !json.comments) {
        throw new Error('Пустой ответ от сервера комментариев');
      }

      var dom = new DOMParser().parseFromString(json.comments, "text/html");
      var toRemove = dom.querySelectorAll(".actions, i, .share-link");
      for (var i = 0; i < toRemove.length; i++) {
        toRemove[i].remove();
      }

      var rootList = dom.querySelector(".comments-tree-list");
      if (!rootList) {
        console.warn('[RezkaComment] comments-tree-list not found in parsed HTML for', id);
        if (sink) { sink.onComments([]); return; }
        Lampa.Noty.show('Комментарии к фильму/сериалу отсутствуют');
        Lampa.Loading.stop();
        return;
      }

      if (sink) {
        sink.onComments(flattenComments(rootList, []));
        return;
      }

      var newTree = buildTree(rootList);
      openModal(newTree);
    }).catch(function (e) {
      console.error('[RezkaComment] comment_rezka error:', e);
      bgFail(sink, 'Ошибка получения комментариев: ' + e.message);
    });
  }

  var cubCtx = null;

  function getCommentStyle() {
    return Lampa.Storage.get('rezka_comment_style', 'button') === 'cub' ? 'cub' : 'button';
  }

  function cubSupported() {
    return !!(Lampa.Maker && Lampa.Maker.make && window.Lampa && Lampa.Listener);
  }

  function ensureCubStyles() {
    if (document.getElementById('rezka-cub-style')) return;
    var s = document.createElement('style');
    s.id = 'rezka-cub-style';
    s.textContent =
      '.full-review.rz-review{display:flex;flex-direction:column}' +
      '.full-review.rz-review .full-review__text{flex:1 1 auto;line-height:1.4;margin-bottom:.9em}' +
      '.full-review.rz-review .full-review__footer{flex:none;display:flex;align-items:center;justify-content:flex-start;' +
        'margin-top:auto;padding-top:.8em;border-top:1px solid rgba(255,255,255,.1)}' +
      '.rz-ava{position:relative;flex:none;width:2.6em;height:2.6em;border-radius:50%;overflow:hidden;' +
        'display:flex;align-items:center;justify-content:center;font-size:1em;font-weight:600;color:#fff;' +
        'box-shadow:0 0 0 .12em rgba(255,255,255,.14)}' +
      '.rz-ava img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}' +
      '.rz-meta{flex:1;min-width:0;margin-left:.8em;display:flex;flex-direction:column}' +
      '.rz-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.rz-date{margin-top:.15em;font-size:.78em;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.rz-tags{flex:none;margin-left:.8em;display:flex;align-items:center}' +
      '.rz-tag{padding:.25em .7em;border-radius:1em;background:rgba(255,255,255,.1);font-size:.8em;white-space:nowrap}' +
      '.rz-tag+.rz-tag{margin-left:.4em}';
    document.head.appendChild(s);
  }

  function cubInitials(ava, name) {
    var h = 0, i;
    for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    ava.style.background = 'hsl(' + h + ',45%,38%)';
    ava.textContent = (name.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').charAt(0) || '?').toUpperCase();
  }

  function cubFooter(inst, c) {
    var root = inst.html;
    var f = root && root.querySelector && root.querySelector('.full-review__footer');
    if (!f) return;
    root.classList.add('rz-review');
    f.innerHTML = '';

    var ava = document.createElement('div');
    ava.className = 'rz-ava';
    if (c.avatar && !/noava|no-ava|default|placeholder/i.test(c.avatar)) {
      var img = document.createElement('img');
      img.onerror = function () {
        if (img.parentNode) img.parentNode.removeChild(img);
        cubInitials(ava, c.user);
      };
      img.src = c.avatar;
      ava.appendChild(img);
    } else {
      cubInitials(ava, c.user);
    }

    var meta = document.createElement('div');
    meta.className = 'rz-meta';
    var name = document.createElement('div');
    name.className = 'rz-name';
    name.textContent = c.user;
    meta.appendChild(name);

    if (c.date) {
      var date = document.createElement('div');
      date.className = 'rz-date';
      date.textContent = c.date;
      meta.appendChild(date);
    }

    f.appendChild(ava);
    f.appendChild(meta);

    if (c.reply) {
      var tags = document.createElement('div');
      tags.className = 'rz-tags';
      var re = document.createElement('div');
      re.className = 'rz-tag';
      re.textContent = 'ответ';
      tags.appendChild(re);
      f.appendChild(tags);
    }
  }

  function cubMakeElement(c, i) {
    return {
      id: 'rezka_' + i,
      email: c.user,
      comment: c.plain,
      text: c.plain,
      liked: 0,
      params: {
        createInstance: function (item) {
          return Lampa.Maker.make('Discuss', item, function (m) { return m.only('Line'); });
        },
        emit: {
          onCreate: function () { cubFooter(this, c); }
        },
        on: {
          'hover:enter': function () { showRezkaComment(c); }
        }
      }
    };
  }

  function cubApply(ctx) {
    if (ctx.applied || !ctx.line || !ctx.comments) return;
    ctx.applied = true;
    ensureCubStyles();
    var line = ctx.line;
    try {
      var root = line.render(true);

      if (!ctx.comments.length) {
        if (ctx.placeholder) {
          var t = root.querySelector('.full-review__text');
          if (t) t.textContent = 'Комментарии Rezka не найдены';
        }
        return;
      }

      var old = line.items || [];
      for (var i = 0; i < old.length; i++) {
        try { old[i].destroy(); } catch (e) {}
      }
      line.items = [];
      line.active = 0;
      line.more = null;
      line.scroll.clear();

      var els = [];
      for (var k = 0; k < ctx.comments.length; k++) els.push(cubMakeElement(ctx.comments[k], k));
      line.data.results = els;
      line.data.total_pages = 1;

      var moreBtn = root.querySelector('.items-line__more');
      if (moreBtn && moreBtn.parentNode) moreBtn.parentNode.removeChild(moreBtn);

      line.emit('scroll');
    } catch (err) {
      console.error('[RezkaComment] cub replace error:', err);
    }
  }

  function cubOnStart(e) {
    var data = e.data;
    var movie = data && data.movie;
    var ctx = cubCtx = { obj: e.object, started: true, line: null, comments: null, applied: false, placeholder: false };
    if (!movie) return;

    if (!data.discuss) data.discuss = { result: [], total_pages: 1 };
    if (!data.discuss.result) data.discuss.result = [];
    if (!data.discuss.result.length) {
      data.discuss.result.push({ id: 'rezka-placeholder', email: 'Rezka', comment: 'Загрузка комментариев Rezka…', liked: 0 });
      ctx.placeholder = true;
    }

    var yr = 0;
    if (movie.release_date) yr = movie.release_date.slice(0, 4);
    else if (movie.first_air_date) yr = movie.first_air_date.slice(0, 4);

    var sink = {
      onComments: function (list) {
        if (cubCtx !== ctx) return;
        ctx.comments = list || [];
        cubApply(ctx);
      },
      onError: function () {
        if (cubCtx !== ctx) return;
        ctx.comments = [];
        cubApply(ctx);
      }
    };
    getEnTitle(movie.id, e.object.method, sink, yr);
  }

  function cubOnBuild(e) {
    if (!cubCtx || e.name !== 'discuss') return;
    cubCtx.line = e.item;
    cubApply(cubCtx);
  }

  function startPlugin() {
    window.comment_plugin = true;

    try {
      Lampa.SettingsApi.addComponent({
        component: 'rezka_comment',
        name: 'Rezka Comments',
        icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_host',
          type: 'input',
          placeholder: 'https://rezka.ag',
          values: Lampa.Storage.get('rezka_comment_host', 'https://rezka.ag'),
          default: 'https://rezka.ag'
        },
        field: {
          name: 'Зеркало hdrezka',
          description: 'Адрес зеркала hdrezka (например, https://hdrezka.me)'
        },
        onChange: function(value) {
          Lampa.Storage.set('rezka_comment_host', value);
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_style',
          type: 'select',
          values: {
            button: 'Кнопка и окно',
            cub: 'Замена комментариев CUB'
          },
          default: 'button'
        },
        field: {
          name: 'Стиль комментариев',
          description: 'Кнопка на карточке с окном или ряд «Комментарии» как у CUB. Применяется при следующем открытии карточки'
        },
        onChange: function (value) {
          Lampa.Storage.set('rezka_comment_style', value);
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_comment_cookie',
          type: 'input',
          placeholder: 'вставьте cookie',
          values: Lampa.Storage.get('rezka_comment_cookie', ''),
          default: ''
        },
        field: {
          name: 'Cookie авторизации (Ручной ввод)'
        },
        onChange: function(value) {
          Lampa.Storage.set('rezka_comment_cookie', value);
        }
      });

      Lampa.SettingsApi.addParam({
        component: 'rezka_comment',
        param: {
          name: 'rezka_auth_auto',
          type: 'button'
        },
        field: {
          name: 'Обновить Cookie (автоматически)'
        },
        onChange: function () {
          solveAnubis(function (c) {
            try {
              $('.settings-param[data-name="rezka_comment_cookie"] .settings-param__value').text(c);
            } catch (e) {}
          });
        }
      });
    } catch (e) {
      console.error('[RezkaComment] Settings init error:', e);
    }

    function addCommentButton(e) {
      $(".button--comment").remove();
      $(".full-start-new__buttons").append(
        '<div class="full-start__button selector button--comment"><svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 356.484 356.484"><g><path d="M293.984 7.23H62.5C28.037 7.23 0 35.268 0 69.731v142.78c0 34.463 28.037 62.5 62.5 62.5l147.443.001 70.581 70.58a12.492 12.492 0 0 0 13.622 2.709 12.496 12.496 0 0 0 7.717-11.547v-62.237c30.759-3.885 54.621-30.211 54.621-62.006V69.731c0-34.463-28.037-62.501-62.5-62.501zm37.5 205.282c0 20.678-16.822 37.5-37.5 37.5h-4.621c-6.903 0-12.5 5.598-12.5 12.5v44.064l-52.903-52.903a12.493 12.493 0 0 0-8.839-3.661H62.5c-20.678 0-37.5-16.822-37.5-37.5V69.732c0-20.678 16.822-37.5 37.5-37.5h231.484c20.678 0 37.5 16.822 37.5 37.5v142.78z" fill="currentcolor"/></g></svg><span>' +
        Lampa.Lang.translate("title_comments") +
        '</span></div>'
      );

      $(".button--comment").on("hover:enter", function (card) {
        year = 0;
        if (e.data.movie.release_date) {
          year = e.data.movie.release_date.slice(0, 4);
        } else if (e.data.movie.first_air_date) {
          year = e.data.movie.first_air_date.slice(0, 4);
        }
        Lampa.Loading.start();
        getEnTitle(e.data.movie.id, e.object.method);
      });
    }

    Lampa.Listener.follow("full", function (e) {
      var cub = getCommentStyle() === 'cub' && cubSupported();

      if (e.type == "start" && cub) {
        cubOnStart(e);
      } else if (e.type == "build" && cub) {
        cubOnBuild(e);
      } else if (e.type == "complite") {
        $(".button--comment").remove();
        if (cub && cubCtx && cubCtx.started && cubCtx.obj === e.object) return;
        addCommentButton(e);
      }
    });
  }

  if (!window.comment_plugin) startPlugin();
})();
