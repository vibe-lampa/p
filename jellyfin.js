(function () {
    'use strict';

    var JELLYFIN_SERVER = '';
    var JELLYFIN_USER = '';
    var JELLYFIN_PASS = '';

    // Оригинальная каплевидная форма иконки Jellyfin с градиентом фиолетовый→голубой
    var JELLYFIN_ICON_GRADIENT = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs><linearGradient id="jf_grad_g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#AA5CC3"/><stop offset="100%" stop-color="#00A4DC"/></linearGradient></defs><path fill="url(#jf_grad_g)" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z"/></svg>';
    // Белая версия той же иконки
    var JELLYFIN_ICON_WHITE = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path fill="#ffffff" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z"/></svg>';

    function getIcon() {
        try {
            return Lampa.Storage.get('jellyfin_icon_style', 'gradient') === 'white' ? JELLYFIN_ICON_WHITE : JELLYFIN_ICON_GRADIENT;
        } catch(e) { return JELLYFIN_ICON_GRADIENT; }
    }

    var JELLYFIN_ICON = JELLYFIN_ICON_GRADIENT;

    function sget(key, def) { return Lampa.Storage.get(key, def); }
    function sset(key, val) { Lampa.Storage.set(key, val); }

    var Jellyfin = {
        token: null,
        userId: null,
        lastServer: null,
        lastUser: null,
        quickConnectTimer: null,
        quickConnectSecret: null,
        quickConnectInFlight: false,
        quickConnectFailCount: 0,
        apiPatched: false,
        linePrefsKey: 'jellyfin_line_prefs',
        playbackStateKey: 'jellyfin_playback_state_v1',
        ticksPerSecond: 10000000,
        activePlayback: null,

        getDeviceId: function() {
            var id = sget('jellyfin_device_id', '');
            if (!id) {
                id = Math.random().toString(36).slice(2, 12);
                sset('jellyfin_device_id', id);
            }
            return id;
        },

        saveAuth: function (server, token, userId, userLabel) {
            this.token = token || null;
            this.userId = userId || null;
            this.lastServer = server || null;
            this.lastUser = userLabel || null;

            if (server) sset('jellyfin_server', server);
            sset('jellyfin_token', token || '');
            sset('jellyfin_user_id', userId || '');
            sset('jellyfin_auth_type', userLabel || '');
            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (e0) {}
        },

        clearAuth: function () {
            this.token = null;
            this.userId = null;
            this.lastServer = null;
            this.lastUser = null;
            sset('jellyfin_token', '');
            sset('jellyfin_user_id', '');
            sset('jellyfin_auth_type', '');
            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (e0) {}
        },

        getAuthHeader: function() {
            var parts = [
                'Client="Jellyfin Web"',
                'Device="Chrome"',
                'DeviceId="' + this.getDeviceId() + '"',
                'Version="10.9.11"'
            ];
            if (this.token) parts.push('Token="' + this.token + '"');
            return 'MediaBrowser ' + parts.join(', ');
        },

        request: function(url, method, body, callback, error, opts) {
            try {
                var options = opts || {};
                var retriesLeft = typeof options._retriesLeft === 'number' ? options._retriesLeft : 1;

                var req = new Lampa.Reguest();

                var timeoutMs = options.timeoutMs || (1000 * 20);
                req.timeout(timeoutMs);
                var headers = options.headers || {};

                // Заголовок с идентификацией клиента шлём всегда: раньше
                // большинство GET-запросов (списки, карточки, детали фильма)
                // отправлялись вообще без него — только с токеном в query,
                // что выглядит подозрительнее для анти-скрейпинг фильтров,
                // чем обычный официальный клиент.
                headers['X-Emby-Authorization'] = this.getAuthHeader();

                if (options.useTokenHeader !== false && this.token) {
                    headers['X-Emby-Token'] = this.token;
                }

                var post_data = false;
                var params = { dataType: options.dataType || 'json', headers: headers };

                if (method === 'POST') {
                    if (options.contentType) headers['Content-Type'] = options.contentType;
                    else headers['Content-Type'] = 'application/json';
                    headers['Accept'] = 'application/json';

                    if (options.form) post_data = String(body || '');
                    else post_data = JSON.stringify(body || {});
                }

                var self = this;
                req.native(
                    url,
                    function (res) {
                        if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e0) {} }
                        callback(res);
                    },
                    function (err) {
                        var status = '';
                        try { status = String(err && (err.status || err.decode_code || err.code) || ''); } catch (eS) { status = ''; }

                        // Некоторые прокси/сервера отдают 401 на быстрые
                        // подряд идущие запросы с одним и тем же токеном
                        // (похоже на анти-скрейпинг/рейтлимит, а не на
                        // реально протухший токен). Один раз тихо повторяем
                        // запрос с задержкой, прежде чем сдаться.
                        if (status === '401' && retriesLeft > 0) {
                            var retryOpts = {};
                            for (var k in options) { if (options.hasOwnProperty(k)) retryOpts[k] = options[k]; }
                            retryOpts._retriesLeft = retriesLeft - 1;
                            setTimeout(function () {
                                self.request(url, method, body, callback, error, retryOpts);
                            }, 900);
                            return;
                        }

                        error(err);
                    },
                    post_data,
                    params
                );
            } catch (e1) {
                if (error) error(e1);
            }
        },

        buildImageUrl: function (itemId, type) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var token = String(this.token || sget('jellyfin_token', '') || '');
                if (!server || !itemId) return '';

                var path = '';
                if (type === 'backdrop') path = '/Items/' + encodeURIComponent(itemId) + '/Images/Backdrop/0';
                else path = '/Items/' + encodeURIComponent(itemId) + '/Images/Primary';

                var url = server + path + '?maxWidth=' + (type === 'backdrop' ? '1280' : '420') + '&quality=90';
                if (token) url += '&api_key=' + encodeURIComponent(token);
                return url;
            } catch (e0) {
                return '';
            }
        },

        rememberTmdbMapping: function (cardType, tmdbId, jellyfinId) {
            try {
                if (!tmdbId || !jellyfinId) return;
                var map = sget('jellyfin_tmdb_map', {});
                if (!map || typeof map !== 'object') map = {};
                var key = String(cardType || 'movie') + ':' + String(tmdbId);
                map[key] = String(jellyfinId);
                sset('jellyfin_tmdb_map', map);
            } catch (e0) {}
        },

        findJellyfinIdByTmdb: function (cardType, tmdbId) {
            try {
                var map = sget('jellyfin_tmdb_map', {});
                if (!map || typeof map !== 'object') return '';
                var key = String(cardType || 'movie') + ':' + String(tmdbId);
                return map[key] ? String(map[key]) : '';
            } catch (e0) {
                return '';
            }
        },

        getLinePrefs: function () {
            var prefs = sget(this.linePrefsKey, {});
            if (!prefs || typeof prefs !== 'object') prefs = {};
            if (!Array.isArray(prefs.order)) prefs.order = [];
            if (!prefs.disabled || typeof prefs.disabled !== 'object') prefs.disabled = {};
            return prefs;
        },

        setLinePrefs: function (prefs) {
            try {
                sset(this.linePrefsKey, prefs || {});
            } catch (e0) {}
        },

        lineKey: function (line) {
            try {
                if (!line) return '';
                if (line.url) return String(line.url);
                if (line.title) return 'title:' + String(line.title);
                return '';
            } catch (e0) {
                return '';
            }
        },

        applyLinePrefs: function (lines) {
            var prefs = this.getLinePrefs();
            var disabled = prefs.disabled || {};
            var order = prefs.order || [];

            var byKey = {};
            var keys = [];

            (lines || []).forEach(function (l) {
                var k = this.lineKey(l);
                if (!k) return;
                if (byKey[k]) return;
                byKey[k] = l;
                keys.push(k);
            }.bind(this));

            var filtered = keys.filter(function (k) { return !disabled[k]; });

            var out = [];
            for (var i = 0; i < order.length; i++) {
                var ok = order[i];
                if (!ok || !byKey[ok]) continue;
                if (disabled[ok]) continue;
                out.push(byKey[ok]);
                byKey[ok] = null;
            }

            for (var j = 0; j < filtered.length; j++) {
                var k2 = filtered[j];
                if (byKey[k2]) out.push(byKey[k2]);
            }

            return out;
        },

        ticksToSeconds: function (ticks) {
            var t = 0;
            try { t = parseInt(ticks, 10) || 0; } catch (e0) { t = 0; }
            if (!t) return 0;
            return t / this.ticksPerSecond;
        },

        secondsToTicks: function (sec) {
            var s = 0;
            try { s = parseFloat(sec) || 0; } catch (e0) { s = 0; }
            if (!s) return 0;
            return Math.max(0, Math.round(s * this.ticksPerSecond));
        },

        getPlaybackState: function () {
            var st = sget(this.playbackStateKey, {});
            if (!st || typeof st !== 'object') st = {};
            if (!st.items || typeof st.items !== 'object') st.items = {};
            if (!st.series || typeof st.series !== 'object') st.series = {};
            return st;
        },

        setPlaybackState: function (st) {
            try { sset(this.playbackStateKey, st || {}); } catch (e0) {}
        },

        getLocalItemState: function (itemId) {
            try {
                var st = this.getPlaybackState();
                var it = st.items && itemId ? st.items[String(itemId)] : null;
                return it && typeof it === 'object' ? it : null;
            } catch (e0) {
                return null;
            }
        },

        setLocalItemState: function (itemId, data) {
            try {
                if (!itemId) return;
                var st = this.getPlaybackState();
                st.items[String(itemId)] = data || {};
                this.setPlaybackState(st);
            } catch (e0) {}
        },

        getSeriesLastState: function (seriesId) {
            try {
                var st = this.getPlaybackState();
                var it = st.series && seriesId ? st.series[String(seriesId)] : null;
                return it && typeof it === 'object' ? it : null;
            } catch (e0) {
                return null;
            }
        },

        setSeriesLastState: function (seriesId, data) {
            try {
                if (!seriesId) return;
                var st = this.getPlaybackState();
                st.series[String(seriesId)] = data || {};
                this.setPlaybackState(st);
            } catch (e0) {}
        },

        getResumeSecondsFromItem: function (it) {
            var sec = 0;
            try {
                if (it && it.UserData && it.UserData.PlaybackPositionTicks) {
                    sec = this.ticksToSeconds(it.UserData.PlaybackPositionTicks);
                }
            } catch (e0) { sec = 0; }
            if (!sec) {
                try {
                    var local = this.getLocalItemState(it && it.Id ? it.Id : '');
                    if (local && local.positionSec) sec = parseFloat(local.positionSec) || 0;
                } catch (e1) { sec = 0; }
            }
            return sec || 0;
        },

        getDurationSecondsFromItem: function (it) {
            var sec = 0;
            try { if (it && it.RunTimeTicks) sec = this.ticksToSeconds(it.RunTimeTicks); } catch (e0) { sec = 0; }
            if (!sec) {
                try {
                    var local = this.getLocalItemState(it && it.Id ? it.Id : '');
                    if (local && local.durationSec) sec = parseFloat(local.durationSec) || 0;
                } catch (e1) { sec = 0; }
            }
            return sec || 0;
        },

        shouldOfferContinue: function (resumeSec, durationSec) {
            var r = 0;
            var d = 0;
            try { r = parseFloat(resumeSec) || 0; } catch (e0) { r = 0; }
            try { d = parseFloat(durationSec) || 0; } catch (e1) { d = 0; }
            if (r < 30) return false;
            if (d > 0 && r > (d - 30)) return false;
            if (d > 0 && (r / d) >= 0.95) return false;
            return true;
        },

        formatSecondsShort: function (sec) {
            var s = 0;
            try { s = Math.max(0, Math.floor(parseFloat(sec) || 0)); } catch (e0) { s = 0; }
            try {
                if (Lampa && Lampa.Utils && Lampa.Utils.secondsToTime) return Lampa.Utils.secondsToTime(s, true);
            } catch (e1) {}
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            var ss = Math.floor(s % 60);
            var mm = (m < 10 ? '0' : '') + m;
            var sss = (ss < 10 ? '0' : '') + ss;
            return (h ? (h + ':') : '') + mm + ':' + sss;
        },

        openContinuePopup: function (opts) {
            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restoreTo = enabled && enabled.name ? enabled.name : 'full_start';

            try {
                if (this._continueOverlay && this._continueOverlay.remove) this._continueOverlay.remove();
                this._continueOverlay = null;
            } catch (e00) {}
            try { $('.jellyfin-continue-popup').remove(); } catch (e01) {}

            if (!document.getElementById('jellyfin-continue-styles')) {
                $('body').append('<style id="jellyfin-continue-styles">.jellyfin-continue-popup{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);}.jellyfin-continue__card{background:#1a1a1a;border-radius:1em;width:44em;max-width:94vw;overflow:hidden;box-shadow:0 1em 4em rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__img{position:relative;width:100%;padding-top:56.25%;background:#000;overflow:hidden;}.jellyfin-continue__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.75;}.jellyfin-continue__details{position:absolute;bottom:0;left:0;right:0;padding:1.3em;background:linear-gradient(transparent,rgba(0,0,0,0.95));}.jellyfin-continue__title{font-size:1.7em;font-weight:700;margin-bottom:0.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}.jellyfin-continue__info{font-size:1.05em;opacity:0.65;color:#fff;}.jellyfin-continue__body{padding:0 1.3em 0.4em;margin-top:-0.4em;}.jellyfin-continue__question{font-size:1.15em;font-weight:600;margin:1em 0 0.8em;}.jellyfin-continue__footer{display:flex;flex-direction:row;gap:1em;padding:1.2em;}.jellyfin-continue__btn{position:relative;padding:1em 1.2em;border-radius:0.6em;cursor:pointer;font-size:1.15em;font-weight:600;background:rgba(255,255,255,0.08);color:#fff;transition:all 0.2s ease;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__btn.focus{background:#fff;color:#000;transform:translateY(-0.2em);box-shadow:0 0.5em 1.5em rgba(255,255,255,0.2);}.jellyfin-continue__bar{height:0.42em;background:rgba(255,255,255,0.12);border-radius:0.3em;overflow:hidden;}.jellyfin-continue__barfill{height:100%;background:#9B59B6;width:0%;}</style>');
            }

            var title = opts && opts.title ? String(opts.title) : 'Продолжить просмотр?';
            var name = opts && opts.name ? String(opts.name) : '';
            var info = opts && opts.info ? String(opts.info) : '';
            var image = opts && opts.image ? String(opts.image) : '';
            var percent = 0;
            try { percent = opts && typeof opts.percent !== 'undefined' ? parseFloat(opts.percent) || 0 : 0; } catch (e1) { percent = 0; }
            percent = Math.max(0, Math.min(100, percent));

            var overlay = $([
                '<div class="jellyfin-continue-popup">',
                '  <div class="jellyfin-continue__card">',
                '    <div class="jellyfin-continue__img">',
                (image ? ('      <img src="' + image + '" alt="">') : ''),
                '      <div class="jellyfin-continue__details">',
                '        <div class="jellyfin-continue__title"></div>',
                '        <div class="jellyfin-continue__info"></div>',
                '      </div>',
                '    </div>',
                '    <div class="jellyfin-continue__body">',
                '      <div class="jellyfin-continue__question"></div>',
                '      <div class="jellyfin-continue__timeline"><div class="jellyfin-continue__bar"><div class="jellyfin-continue__barfill"></div></div></div>',
                '    </div>',
                '    <div class="jellyfin-continue__footer">',
                '      <div class="jellyfin-continue__btn selector jellyfin-continue__btn-yes">▶ Продолжить</div>',
                '      <div class="jellyfin-continue__btn selector jellyfin-continue__btn-no">Выбрать</div>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join(''));

            overlay.find('.jellyfin-continue__title').text(name || 'Jellyfin');
            overlay.find('.jellyfin-continue__info').text(info || '');
            overlay.find('.jellyfin-continue__question').text(title);
            overlay.find('.jellyfin-continue__barfill').css('width', percent + '%');

            $('body').append(overlay);
            this._continueOverlay = overlay;

            var yesBtn = overlay.find('.jellyfin-continue__btn-yes');
            var noBtn = overlay.find('.jellyfin-continue__btn-no');
            var last = yesBtn.length ? yesBtn[0] : null;

            overlay.find('.selector').on('hover:focus', function () { last = this; });

            var close = function () {
                try { overlay.remove(); } catch (e0) {}
                try { Jellyfin._continueOverlay = null; } catch (e00) {}
                try { Lampa.Controller.toggle(restoreTo); } catch (e1) {}
            };

            overlay.on('click', function (e) {
                try {
                    if (e && e.target === overlay[0]) close();
                } catch (e0) {}
            });

            yesBtn.on('hover:enter', function () {
                close();
                if (opts && opts.onContinue) setTimeout(function () { try { opts.onContinue(); } catch (e0) {} }, 0);
            });

            noBtn.on('hover:enter', function () {
                close();
                if (opts && opts.onChoose) setTimeout(function () { try { opts.onChoose(); } catch (e0) {} }, 0);
            });

            Lampa.Controller.add('jellyfin_continue', {
                toggle: function () {
                    try { Lampa.Controller.collectionSet(overlay); } catch (e0) {}
                    try { Lampa.Controller.collectionFocus(yesBtn[0], overlay); } catch (e1) {}
                },
                left: function () {
                    if (!yesBtn.length || !noBtn.length) return;
                    if (last === noBtn[0]) Lampa.Controller.collectionFocus(yesBtn[0], overlay);
                    else Lampa.Controller.collectionFocus(noBtn[0], overlay);
                },
                right: function () {
                    if (!yesBtn.length || !noBtn.length) return;
                    if (last === yesBtn[0]) Lampa.Controller.collectionFocus(noBtn[0], overlay);
                    else Lampa.Controller.collectionFocus(yesBtn[0], overlay);
                },
                enter: function () {
                    try { if (last) $(last).trigger('hover:enter'); } catch (e0) {}
                },
                back: function () {
                    close();
                },
                gone: function () {
                    try { overlay.find('.selector').removeClass('focus'); } catch (e0) {}
                }
            });

            try { Lampa.Controller.toggle('jellyfin_continue'); } catch (e2) {}
        },

        getTmdbIdFromItem: function (it) {
            try {
                if (!it) return '';
                var providers = it.ProviderIds || it.Providerids || {};
                var tmdb = providers && (providers.Tmdb || providers.tmdb || providers.TMDb || '');
                return tmdb ? String(tmdb) : '';
            } catch (e0) {
                return '';
            }
        },

        getTmdbLang: function () {
            try { return String(Lampa.Storage.field('tmdb_lang') || 'ru'); } catch (e0) { return 'ru'; }
        },

        getEpisodeStillFromTmdb: function (tmdbSeriesId, seasonNumber, episodeNumber, callback) {
            try {
                var sid = String(tmdbSeriesId || '');
                var s = parseInt(seasonNumber, 10) || 0;
                var e = parseInt(episodeNumber, 10) || 0;
                if (!sid || !s || !e) return callback('');
                if (!window.Lampa || !Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key || !Lampa.TMDB.image) return callback('');

                var lang = this.getTmdbLang();
                var epUrl = Lampa.TMDB.api('tv/' + sid + '/season/' + s + '/episode/' + e + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);
                $.ajax({ url: epUrl, timeout: 5000 })
                    .done(function (epData) {
                        try {
                            var still = (epData && epData.still_path) ? String(epData.still_path) : '';
                            if (still) return callback(Lampa.TMDB.image('t/p/w500' + still));
                        } catch (e0) {}
                        callback('');
                    })
                    .fail(function () { callback(''); });
            } catch (e1) {
                callback('');
            }
        },

        getResumeItems: function (callback, onFail) {
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) return (onFail ? onFail() : null);

                    var url = server + '/Users/' + encodeURIComponent(uid) + '/Items/Resume?Limit=100&Recursive=true&Fields=UserData,SeriesId,SeriesName,ParentId,IndexNumber,ParentIndexNumber,Name,RunTimeTicks,ProviderIds,Type&api_key=' + encodeURIComponent(token);
                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        callback(items || []);
                    }.bind(this), function () {
                        if (onFail) onFail();
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 25 });
                } catch (e0) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        getSeriesResume: function (seriesId, callback, onFail) {
            var sid = String(seriesId || '');
            if (!sid) return (onFail ? onFail() : null);
            this.getResumeItems(function (items) {
                var best = null;
                var bestTime = 0;
                for (var i = 0; i < (items || []).length; i++) {
                    var it = items[i];
                    var seriesMatch = '';
                    try { seriesMatch = String(it.SeriesId || it.seriesId || ''); } catch (e0) { seriesMatch = ''; }
                    if (seriesMatch !== sid) continue;
                    var pos = 0;
                    try { pos = it && it.UserData ? parseInt(it.UserData.PlaybackPositionTicks || 0, 10) || 0 : 0; } catch (e1) { pos = 0; }
                    if (!pos) continue;
                    var t = 0;
                    try { t = it && it.UserData && it.UserData.LastPlayedDate ? Date.parse(it.UserData.LastPlayedDate) : 0; } catch (e2) { t = 0; }
                    if (!t) t = pos;
                    if (!best || t > bestTime) {
                        best = it;
                        bestTime = t;
                    }
                }
                if (best) callback(best);
                else if (onFail) onFail();
            }.bind(this), onFail);
        },

        sessionReport: function (endpoint, payload) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                if (!server || !endpoint) return;
                var url = server + endpoint;
                this.request(url, 'POST', payload || {}, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e0) {}
        },

        playstateRequest: function (endpoint, method) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var uid = String(this.userId || '');
                if (!server || !uid || !endpoint) return;
                var url = server + endpoint;
                this.request(url, method || 'POST', {}, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e0) {}
        },

        updateUserData: function (itemId, positionTicks, played) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var uid = String(this.userId || '');
                var id = String(itemId || '');
                if (!server || !uid || !id) return;

                var pt = 0;
                try { pt = parseInt(positionTicks, 10) || 0; } catch (e0) { pt = 0; }
                if (pt < 0) pt = 0;

                var body = { PlaybackPositionTicks: pt };
                if (typeof played !== 'undefined') body.Played = !!played;
                try { body.LastPlayedDate = (new Date()).toISOString(); } catch (e1) {}

                var url = server + '/Users/' + encodeURIComponent(uid) + '/Items/' + encodeURIComponent(id) + '/UserData';
                this.request(url, 'POST', body, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e2) {}
        },

        markPlayed: function (itemId) {
            try {
                var uid = String(this.userId || '');
                var id = String(itemId || '');
                if (!uid || !id) return;
                this.playstateRequest('/Users/' + encodeURIComponent(uid) + '/PlayedItems/' + encodeURIComponent(id), 'POST');
            } catch (e0) {}
        },

        stopPlaybackSync: function (opts) {
            var pb = this.activePlayback;
            this.activePlayback = null;

            if (pb && pb.handlers) {
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('timeupdate', pb.handlers.timeupdate); } catch (e0) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('pause', pb.handlers.pause); } catch (e1) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('play', pb.handlers.play); } catch (e2) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('ended', pb.handlers.ended); } catch (e3) {}
                try { if (Lampa && Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.remove('destroy', pb.handlers.destroy); } catch (e4) {}
            }

            try {
                if (pb && pb.itemId && pb.playSessionId) {
                    var stopped = {
                        ItemId: pb.itemId,
                        MediaSourceId: pb.mediaSourceId || pb.itemId,
                        PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                        PlaySessionId: pb.playSessionId
                    };
                    if (opts && opts.playedToCompletion) stopped.PlayedToCompletion = true;
                    this.sessionReport('/Sessions/Playing/Stopped', stopped);

                    try {
                        if (opts && opts.playedToCompletion) this.markPlayed(pb.itemId);
                        var finalTicks = this.secondsToTicks(pb.positionSec || 0);
                        if (opts && opts.playedToCompletion) this.updateUserData(pb.itemId, 0, true);
                        else this.updateUserData(pb.itemId, finalTicks, false);
                    } catch (e7) {}
                }
            } catch (e5) {}
        },

        startPlaybackSync: function (meta) {
            try { this.stopPlaybackSync({}); } catch (e0) {}

            var pb = meta || {};
            pb.itemId = pb.itemId ? String(pb.itemId) : '';
            pb.mediaSourceId = pb.mediaSourceId ? String(pb.mediaSourceId) : '';
            pb.playSessionId = pb.playSessionId || (Math.random().toString(36).slice(2) + Date.now().toString(36));
            pb.playMethod = pb.playMethod || 'DirectPlay';
            pb.positionSec = pb.positionSec || 0;
            pb.durationSec = pb.durationSec || 0;
            pb.lastReportAt = 0;
            pb.lastUserDataAt = 0;
            pb.started = false;

            var updateLocal = function () {
                try {
                    if (!pb.itemId) return;
                    var itemState = {
                        positionSec: pb.positionSec || 0,
                        durationSec: pb.durationSec || 0,
                        updatedAt: Date.now(),
                        mediaSourceId: pb.mediaSourceId || '',
                        audioIndex: typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '',
                        title: pb.title || ''
                    };
                    Jellyfin.setLocalItemState(pb.itemId, itemState);

                    if (pb.seriesId) {
                        var seriesState = {
                            itemId: pb.itemId,
                            updatedAt: Date.now(),
                            seasonNumber: pb.seasonNumber || '',
                            episodeNumber: pb.episodeNumber || '',
                            seriesName: pb.seriesName || '',
                            episodeName: pb.title || ''
                        };
                        Jellyfin.setSeriesLastState(pb.seriesId, seriesState);
                    }
                } catch (e0) {}
            };

            var reportProgress = function (paused, force) {
                try {
                    var now = Date.now();
                    if (!force && pb.lastReportAt && (now - pb.lastReportAt) < 8000) return;
                    pb.lastReportAt = now;

                    if (!pb.started) {
                        pb.started = true;
                        this.sessionReport('/Sessions/Playing', {
                            ItemId: pb.itemId,
                            MediaSourceId: pb.mediaSourceId || pb.itemId,
                            PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                            PlaySessionId: pb.playSessionId,
                            CanSeek: true,
                            PlayMethod: pb.playMethod
                        });

                        try {
                            var uid = String(this.userId || '');
                            if (uid) {
                                var startUrl = '/Users/' + encodeURIComponent(uid) + '/PlayingItems/' + encodeURIComponent(pb.itemId) +
                                    '?MediaSourceId=' + encodeURIComponent(pb.mediaSourceId || pb.itemId) +
                                    '&AudioStreamIndex=' + encodeURIComponent(String(typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '')) +
                                    '&PositionTicks=' + encodeURIComponent(String(this.secondsToTicks(pb.positionSec || 0))) +
                                    '&PlaySessionId=' + encodeURIComponent(String(pb.playSessionId || '')) +
                                    '&CanSeek=true';
                                this.playstateRequest(startUrl, 'POST');
                            }
                        } catch (e2) {}
                    }

                    this.sessionReport('/Sessions/Playing/Progress', {
                        ItemId: pb.itemId,
                        MediaSourceId: pb.mediaSourceId || pb.itemId,
                        PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                        IsPaused: !!paused,
                        PlaySessionId: pb.playSessionId
                    });

                    try {
                        var uid2 = String(this.userId || '');
                        if (uid2) {
                            var progUrl = '/Users/' + encodeURIComponent(uid2) + '/PlayingItems/' + encodeURIComponent(pb.itemId) + '/Progress' +
                                '?MediaSourceId=' + encodeURIComponent(pb.mediaSourceId || pb.itemId) +
                                '&AudioStreamIndex=' + encodeURIComponent(String(typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '')) +
                                '&PositionTicks=' + encodeURIComponent(String(this.secondsToTicks(pb.positionSec || 0))) +
                                '&PlaySessionId=' + encodeURIComponent(String(pb.playSessionId || '')) +
                                '&IsPaused=' + (paused ? 'true' : 'false');
                            this.playstateRequest(progUrl, 'POST');
                        }
                    } catch (e3) {}

                    try {
                        if (!pb.lastUserDataAt || (now - pb.lastUserDataAt) > 15000) {
                            pb.lastUserDataAt = now;
                            this.updateUserData(pb.itemId, this.secondsToTicks(pb.positionSec || 0), false);
                        }
                    } catch (e4) {}
                } catch (e1) {}
            }.bind(this);

            pb.handlers = {};
            pb.handlers.timeupdate = function (e) {
                try {
                    pb.positionSec = e && typeof e.current !== 'undefined' ? (parseFloat(e.current) || 0) : pb.positionSec;
                    pb.durationSec = e && typeof e.duration !== 'undefined' ? (parseFloat(e.duration) || 0) : pb.durationSec;
                    updateLocal();
                    reportProgress(false, false);
                } catch (e0) {}
            };
            pb.handlers.pause = function () { reportProgress(true, true); };
            pb.handlers.play = function () { reportProgress(false, true); };
            pb.handlers.ended = function () {
                try {
                    updateLocal();
                    this.stopPlaybackSync({ playedToCompletion: true });
                } catch (e0) {}
            }.bind(this);
            pb.handlers.destroy = function () {
                try {
                    updateLocal();
                    this.stopPlaybackSync({});
                } catch (e0) {}
            }.bind(this);

            this.activePlayback = pb;

            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('timeupdate', pb.handlers.timeupdate); } catch (e2) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('pause', pb.handlers.pause); } catch (e3) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('play', pb.handlers.play); } catch (e4) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('ended', pb.handlers.ended); } catch (e5) {}
            try { if (Lampa && Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.follow('destroy', pb.handlers.destroy); } catch (e6) {}
        },

        configureLinesUI: function () {
            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restore = function () {
                try { Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'settings'); } catch (e1) {}
            };

            var prefs = this.getLinePrefs();
            var order = prefs.order || [];
            var disabled = prefs.disabled || {};

            this.getLineDefs(function (defs) {
                var map = {};
                (defs || []).forEach(function (d) {
                    if (!d || !d.key) return;
                    map[d.key] = { title: d.title, desc: '' };
                });

                var modal = null;
                try { modal = (Lampa && Lampa.Modal) ? Lampa.Modal : (typeof Modal !== 'undefined' ? Modal : null); } catch (e1) { modal = null; }
                if (!modal || !modal.open || !modal.close) {
                    Lampa.Noty.show('Jellyfin: Не удалось открыть окно');
                    restore();
                    return;
                }

                var keys = Object.keys(map || {});
                keys.sort(function (a, b) {
                    var ia = order.indexOf(a);
                    var ib = order.indexOf(b);
                    if (ia === -1 && ib === -1) return String(map[a].title).localeCompare(String(map[b].title));
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                });

                var buildRow = function (k) {
                    var title = '';
                    try { title = map[k] && map[k].title ? String(map[k].title) : String(k); } catch (e0) { title = String(k); }

                    var row = $([
                        '<div class="menu-edit-list__item" data-key="' + encodeURIComponent(String(k)) + '">',
                        '  <div class="menu-edit-list__icon">' + getIcon() + '</div>',
                        '  <div class="menu-edit-list__title"></div>',
                        '  <div class="menu-edit-list__move move-up selector">',
                        '    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12L11 3L20 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '  <div class="menu-edit-list__move move-down selector">',
                        '    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L11 11L20 2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '  <div class="menu-edit-list__toggle toggle selector">',
                        '    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/><path d="M7.44873 12.9658L10.8179 16.3349L18.1269 9.02588" stroke="currentColor" stroke-width="3" class="dot" opacity="0" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '</div>'
                    ].join(''));

                    row.find('.menu-edit-list__title').text(title);

                    var applyState = function () {
                        var off = !!disabled[k];
                        row.toggleClass('hidden', off);
                        row.find('.dot').attr('opacity', off ? 0 : 1);
                    };

                    row.find('.move-up').on('hover:enter', function () {
                        var prev = row.prev();
                        if (prev.length) row.insertBefore(prev);
                    });

                    row.find('.move-down').on('hover:enter', function () {
                        var next = row.next();
                        if (next.length) row.insertAfter(next);
                    });

                    row.find('.toggle').on('hover:enter', function () {
                        if (disabled[k]) delete disabled[k];
                        else disabled[k] = true;
                        applyState();
                    });

                    applyState();
                    return row;
                };

                var listEl = $('<div class="menu-edit-list"></div>');
                keys.forEach(function (k) { listEl.append(buildRow(k)); });

                modal.open({
                    title: 'Редактировать',
                    html: listEl,
                    size: 'small',
                    scroll_to_center: true,
                    onBack: function () {
                        var outOrder = [];
                        listEl.find('.menu-edit-list__item').each(function () {
                            var raw = $(this).attr('data-key') || '';
                            try { outOrder.push(decodeURIComponent(raw)); } catch (e0) { outOrder.push(raw); }
                        });

                        Jellyfin.setLinePrefs({ order: outOrder.filter(Boolean), disabled: disabled });
                        try { modal.close(); } catch (e1) {}
                        restore();
                    }
                });
            });
        },

        parseLocalUrl: function (url) {
            var raw = String(url || '');
            raw = raw.replace(/^jellyfin:\/*/i, '');
            var out = { path: '', query: {} };
            try {
                var parts = raw.split('?');
                out.path = parts[0] || '';
                if (parts[1]) {
                    parts[1].split('&').forEach(function (p) {
                        if (!p) return;
                        var kv = p.split('=');
                        var k = decodeURIComponent(kv[0] || '');
                        var v = decodeURIComponent(kv.slice(1).join('=') || '');
                        if (k) out.query[k] = v;
                    });
                }
            } catch (e0) {}
            return out;
        },

        jellyfinToCard: function (it) {
            try {
                if (!it || !it.Id) return null;
                var providers = it.ProviderIds || it.Providerids || {};
                var tmdb = providers && (providers.Tmdb || providers.tmdb || providers.TMDb || '');
                tmdb = tmdb ? String(tmdb) : '';

                var type = String(it.Type || '').toLowerCase();
                var isSeries = type === 'series';
                var isEpisode = type === 'episode';
                var date = '';
                try { date = String(it.PremiereDate || it.ProductionYear || '').slice(0, 10); } catch (e1) { date = ''; }

                // Для эпизодов (например, строка "Продолжить просмотр") id/tmdb
                // эпизода не годится для открытия карточки сериала — это
                // отдельный TMDB-объект серии, а не шоу. Поэтому эпизоды
                // всегда остаются "родными" jellyfin-карточками с играбельным id,
                // а название строится из имени сериала + номера серии.
                var card = {
                    jellyfin_item_id: String(it.Id),
                    card_type: (isSeries || isEpisode) ? 'tv' : 'movie',
                    source: (tmdb && !isEpisode) ? 'tmdb' : 'jellyfin',
                    id: (tmdb && !isEpisode) ? tmdb : String(it.Id),
                    img: this.buildImageUrl(it.Id, 'primary') || (it.SeriesId ? this.buildImageUrl(it.SeriesId, 'primary') : ''),
                    background_image: this.buildImageUrl(isEpisode ? (it.SeriesId || it.Id) : it.Id, 'backdrop')
                };

                if (isEpisode) {
                    var seriesName = it.SeriesName || it.seriesName || 'Эпизод';
                    var seasonNo = it.ParentIndexNumber || it.SeasonNumber || '';
                    var epNo = it.IndexNumber || '';
                    var epLabel = (seasonNo || epNo) ? (' \u2022 S' + (seasonNo || '?') + 'E' + (epNo || '?')) : '';
                    card.name = seriesName + epLabel;
                    card.original_name = seriesName;
                    card.episode_name = it.Name || '';
                    if (it.SeriesId) card.jellyfin_series_id = String(it.SeriesId);
                } else if (isSeries) {
                    card.name = it.Name || '';
                    card.original_name = it.OriginalTitle || it.Name || '';
                    if (date && date.length >= 4) card.first_air_date = date;
                } else {
                    card.title = it.Name || '';
                    card.original_title = it.OriginalTitle || it.Name || '';
                    if (date && date.length >= 4) card.release_date = date;
                }

                try {
                    if (it.CommunityRating) card.vote_average = parseFloat(it.CommunityRating) || 0;
                } catch (e2) {}
                try {
                    if (it.Overview) card.overview = String(it.Overview);
                } catch (e3) {}

                if (tmdb && !isEpisode) this.rememberTmdbMapping(isSeries ? 'tv' : 'movie', tmdb, it.Id);

                return card;
            } catch (e0) {
                return null;
            }
        },

        // Превращает BoxSet (франшиза/коллекция) в данные для
        // карточки-"папки" (JellyfinFolderCard): обложка самого BoxSet'а
        // (Jellyfin сам собирает коллаж из постеров внутри, если своя
        // обложка не задана) + счётчик вложенных фильмов/сериалов.
        boxsetToCard: function (it) {
            try {
                if (!it || !it.Id) return null;
                var childCount = 0;
                try { childCount = parseInt(it.ChildCount, 10) || 0; } catch (e0) { childCount = 0; }
                // Если ChildCount не пришел, пробуем получить из других полей
                if (!childCount) {
                    try { childCount = parseInt(it.RecursiveItemCount, 10) || 0; } catch (e1) { childCount = 0; }
                }
                return {
                    jellyfin_boxset_id: String(it.Id),
                    title: it.Name || '',
                    img: this.buildImageUrl(it.Id, 'primary') || '',
                    child_count: childCount
                };
            } catch (e0) {
                return null;
            }
        },

        // Карточка библиотеки для строки "Мои медиатеки".
        libraryViewCard: function (view, kind) {
            try {
                if (!view || !view.Id) return null;
                return {
                    jellyfin_view_id: String(view.Id),
                    title: view.Name || 'Библиотека',
                    img: this.buildImageUrl(view.Id, 'primary') || this.buildImageUrl(view.Id, 'backdrop') || '',
                    img_backdrop: this.buildImageUrl(view.Id, 'backdrop') || '',
                    kind: kind || 'media'
                };
            } catch (e0) {
                return null;
            }
        },

        // Единый метод получения содержимого библиотеки/папки для экрана
        // "Мои медиатеки": kind='boxset' — список франшиз/коллекций
        // (папок) внутри библиотеки; kind='media' — обычная сетка фильмов
        // и сериалов внутри библиотеки или внутри конкретной франшизы/
        // коллекции (тогда parentId — id самого BoxSet'а).
        browseItems: function (kind, parentId, page, callback, onFail) {
            var startTime = Date.now();
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) {
                        if (onFail) onFail();
                        return;
                    }

                    var reqPage = parseInt(page, 10) || 1;
                    if (reqPage < 1) reqPage = 1;
                    var pageSize = 40;
                    var startIndex = Math.max(0, (reqPage - 1) * pageSize);

                    var query = [];
                    query.push('StartIndex=' + startIndex);
                    query.push('Limit=' + pageSize);
                    query.push('SortBy=SortName');
                    query.push('SortOrder=Ascending');
                    if (parentId) query.push('ParentId=' + encodeURIComponent(String(parentId)));

                    if (kind === 'boxset') {
                        // Библиотека типа boxsets: получаем содержимое view напрямую.
                        // Запрашиваем RecursiveItemCount вместо ChildCount - он может быть быстрее
                        query.push('Recursive=false');
                        query.push('Fields=RecursiveItemCount');
                    } else {
                        // Содержимое библиотеки или BoxSet'а.
                        // Не фильтруем по IncludeItemTypes — если в библиотеке
                        // лежат BoxSet'ы (франшизы), они тоже должны прийти.
                        // Фильтруем на стороне клиента по типу элемента.
                        query.push('Recursive=false');
                        query.push('Fields=ChildCount,ProviderIds,PremiereDate,ProductionYear,CommunityRating,Type,OriginalTitle');
                    }
                    query.push('api_key=' + encodeURIComponent(token));

                    var url = server + '/Users/' + encodeURIComponent(uid) + '/Items?' + query.join('&');
                    
                    // Для boxsets используем меньший таймаут т.к. запрос должен быть быстрым без ChildCount
                    var timeout = (kind === 'boxset') ? 20 : 15;

                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        var total = 0;
                        try { total = parseInt(res.TotalRecordCount || res.totalRecordCount || 0, 10) || 0; } catch (e0) { total = 0; }

                        try { console.log('[Jellyfin DEBUG] browseItems получил items.length=' + items.length + ' total=' + total); } catch (e0) {}

                        // Для boxset-вида: если пришли BoxSet'ы/Playlist'ы — показываем их как папки,
                        // если пришли Movie/Series — показываем как обычные карточки.
                        var cards = [];
                        for (var i = 0; i < items.length; i++) {
                            var item = items[i];
                            if (!item) continue;
                            var itemType = String(item.Type || item.type || '').toLowerCase();
                            
                            // DEBUG: логируем первые 3 элемента для диагностики
                            if (i < 3) {
                                try { console.log('[Jellyfin DEBUG] browseItems kind=' + kind + ' itemType=' + itemType + ' Name=' + (item.Name || '') + ' ChildCount=' + (item.ChildCount || 0)); } catch (e0) {}
                            }
                            
                            var c;
                            // BoxSet и Playlist (франшизы) — это папки с коллекциями
                            if (itemType === 'boxset' || itemType === 'playlist') {
                                c = this.boxsetToCard(item);
                            } else {
                                c = this.jellyfinToCard(item);
                            }
                            if (c) cards.push(c);
                        }
                        if (kind !== 'boxset') cards = this.dedupeCards(cards);
                        try { console.log('[Jellyfin] browseItems(kind=' + kind + ',parentId=' + (parentId || 'null') + ') завершен за ' + (Date.now() - startTime) + 'мс, items=' + items.length + ' cards=' + cards.length); } catch (eLog) {}
                        callback({ cards: cards, total: total });
                    }.bind(this), function (err) {
                        try { console.warn('[Jellyfin] browseItems(kind=' + kind + ',parentId=' + (parentId || 'null') + ') ОШИБКА за ' + (Date.now() - startTime) + 'мс', err); } catch (eLog) {}
                        if (onFail) onFail(err);
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * timeout });
                } catch (e1) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        dedupeCards: function (cards) {
            var out = [];
            var seen = {};
            for (var i = 0; i < (cards || []).length; i++) {
                var c = cards[i];
                if (!c) continue;
                var key = '';
                try {
                    if (c.source === 'tmdb') key = 'tmdb:' + String(c.card_type || (c.name ? 'tv' : 'movie')) + ':' + String(c.id || '');
                    else key = 'jf:' + String(c.jellyfin_item_id || c.jellyfin_boxset_id || c.id || '');
                } catch (e0) {
                    key = '';
                }
                if (!key) continue;
                if (seen[key]) continue;
                seen[key] = true;
                out.push(c);
            }
            return out;
        },

        libraryItems: function (mode, media, page, callback, onFail, onlyTmdb, opts) {
            var startTime = Date.now();
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) {
                        if (onFail) onFail();
                        return;
                    }

                    var reqPage = parseInt(page, 10) || 1;
                    if (reqPage < 1) reqPage = 1;
                    var startIndex = Math.max(0, (reqPage - 1) * 20);
                    var base = server + '/Users/' + encodeURIComponent(uid) + '/Items';
                    var query = [];
                    query.push('Recursive=true');
                    query.push('StartIndex=' + startIndex);
                    query.push('Limit=20');
                    
                    // Для resume нужны дополнительные поля
                    if (mode === 'resume') {
                        query.push('Fields=ProviderIds,PremiereDate,ProductionYear,CommunityRating,Type,UserData,SeriesId,SeriesName,ParentIndexNumber,IndexNumber');
                    } else {
                        query.push('Fields=ProviderIds,PremiereDate,ProductionYear,CommunityRating,Type');
                    }

                    if (mode === 'resume') {
                        base = server + '/Users/' + encodeURIComponent(uid) + '/Items/Resume';
                    } else {
                        var types = (media === 'tv') ? 'Series' : 'Movie';
                        query.push('IncludeItemTypes=' + types);
                        if (mode === 'premiere') query.push('SortBy=PremiereDate,DateCreated');
                        else query.push('SortBy=DateCreated');
                        query.push('SortOrder=Descending');
                    }

                    try {
                        if (opts && opts.parentId) query.push('ParentId=' + encodeURIComponent(String(opts.parentId)));
                        if (opts && opts.genre) query.push('Genres=' + encodeURIComponent(String(opts.genre)));
                    } catch (e0) {}

                    query.push('api_key=' + encodeURIComponent(token));

                    var url = base + '?' + query.join('&');

                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        var total = 0;
                        try { total = parseInt(res.TotalRecordCount || res.totalRecordCount || res.Total || 0, 10) || 0; } catch (e0) { total = 0; }

                        // Раньше здесь отфильтровывались все карточки без
                        // соответствия TMDB (onlyTmdb), из-за чего ленты
                        // библиотек, где у контента нет TMDB-метаданных,
                        // оставались полностью пустыми и пропадали с главного
                        // экрана. Теперь показываем весь контент: карточки без
                        // TMDB-id остаются "родными" jellyfin-карточками и
                        // открываются напрямую через сам Jellyfin.
                        var cards = [];
                        for (var i = 0; i < items.length; i++) {
                            var c = this.jellyfinToCard(items[i]);
                            if (!c) continue;
                            cards.push(c);
                        }

                        cards = this.dedupeCards(cards).slice(0, 20);
                        try { console.log('[Jellyfin] libraryItems(' + mode + ',' + media + ') завершен за ' + (Date.now() - startTime) + 'мс, items=' + items.length); } catch (eLog) {}
                        callback({ cards: cards, total: total });
                    }.bind(this), function (err) {
                        try { console.warn('[Jellyfin] libraryItems(' + mode + ',' + media + ') ОШИБКА за ' + (Date.now() - startTime) + 'мс', err); } catch (eLog) {}
                        if (onFail) onFail(err);
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 15 });
                } catch (e1) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        getViews: function (callback, onFail) {
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) {
                        if (onFail) onFail();
                        return;
                    }

                    var url = server + '/UserViews?userId=' + encodeURIComponent(uid) + '&api_key=' + encodeURIComponent(token);
                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        callback(items || []);
                    }.bind(this), function (err) {
                        if (onFail) onFail(err);
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 15 });
                } catch (e0) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        // Единый источник правды для списка лент: и главный экран, и окно
        // настроек "Ленты Jellyfin" строят список на основе одних и тех же
        // библиотек (Views), реально присутствующих на подключённом сервере.
        getLineDefs: function (callback) {
            var fallbackDefs = function () {
                return [
                    { key: 'jellyfin://latest?type=movie', title: 'Последние фильмы', mode: 'latest', media: 'movie', parentId: '' },
                    { key: 'jellyfin://latest?type=tv', title: 'Последние сериалы', mode: 'latest', media: 'tv', parentId: '' },
                    { key: 'jellyfin://premiere?type=movie', title: 'Новинки (фильмы)', mode: 'premiere', media: 'movie', parentId: '' }
                ];
            };

            var resumeDef = { key: 'jellyfin://resume', title: 'Продолжить просмотр', mode: 'resume', media: 'all', parentId: '' };

            // Типы библиотек Jellyfin, в которых заведомо нет видео,
            // пригодного для лент фильмов/сериалов (музыка, книги, фото).
            // Их и только их отбрасываем — всё остальное (movies, tvshows,
            // mixed, homevideos, boxsets, библиотеки без CollectionType и
            // любые другие) парсим и пытаемся показать.
            var NON_VIDEO_TYPES = { music: true, musicvideos: true, books: true, photos: true };

            this.getViews(function (views) {
                var list = Array.isArray(views) ? views : [];
                try {
                    console.log('[Jellyfin] UserViews получено: ' + list.length, list.map(function (v) { return (v && (v.Name || v.name)) + ' [' + (v && (v.CollectionType || v.collectionType) || '—') + ']'; }));
                } catch (eLogV) {}
                var defs = [resumeDef];
                var seen = {};

                var addDef = function (media, mode, name, parentId) {
                    var key = 'jellyfin://' + mode + '?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(parentId));
                    if (seen[key]) return;
                    seen[key] = true;
                    var titlePrefix = mode === 'premiere' ? 'Новинки (' + name + ')' : 'Недавно добавлено в ' + name;
                    defs.push({ key: key, title: titlePrefix, mode: mode, media: media, parentId: String(parentId) });
                };

                for (var i = 0; i < list.length; i++) {
                    var v = list[i];
                    if (!v || !v.Id) continue;
                    var ct = '';
                    try { ct = String(v.CollectionType || v.collectionType || '').toLowerCase(); } catch (e0) { ct = ''; }
                    if (NON_VIDEO_TYPES[ct]) continue;

                    var name = '';
                    try { name = String(v.Name || v.name || '').trim(); } catch (e2) { name = ''; }

                    if (ct === 'movies') {
                        var mName = name || 'Фильмы';
                        addDef('movie', 'latest', mName, v.Id);
                        addDef('movie', 'premiere', mName, v.Id);
                    } else if (ct === 'tvshows') {
                        addDef('tv', 'latest', name || 'Сериалы', v.Id);
                    } else {
                        // Библиотека с неизвестным/смешанным типом (mixed,
                        // homevideos, boxsets, отсутствующий CollectionType
                        // и т.п.) — не знаем заранее, что внутри, поэтому
                        // пробуем и фильмы, и сериалы из неё. Пустые ленты
                        // всё равно отфильтровываются ниже по results.length.
                        var genName = name || 'Библиотека';
                        addDef('movie', 'latest', genName, v.Id);
                        addDef('movie', 'premiere', genName, v.Id);
                        addDef('tv', 'latest', genName, v.Id);
                    }
                }

                // Если на сервере не нашлось библиотек нужного типа (или
                // Views отдал пустой список), используем общие ленты без
                // привязки к конкретной библиотеке — но всё так же по
                // данным этого сервера, а не чужого.
                if (defs.length <= 1) defs = defs.concat(fallbackDefs());

                callback(defs);
            }, function (err) {
                try { console.warn('[Jellyfin] UserViews не загрузились, использую fallback', err); } catch (eLogF) {}
                callback([resumeDef].concat(fallbackDefs()));
            });
        },

        buildMainLines: function (oncomplite, onerror) {
            var self = this;
            var startTime = Date.now();
            try { console.log('[Jellyfin PERF] buildMainLines START'); } catch (e0) {}

            // Один вызов getViews — строим из него и строку "Мои медиатеки",
            // и список лент. Раньше было два параллельных вызова getViews
            // (из buildMainLines и внутри getLineDefs), из-за чего один из
            // них мог вернуть пустой результат при гонке authenticate.
            self.getViews(function (allViews) {
                try { console.log('[Jellyfin PERF] getViews завершился за ' + (Date.now() - startTime) + 'ms'); } catch (e0) {}
                var viewList = Array.isArray(allViews) ? allViews : [];
                var NON_VIDEO_TYPES = { music: true, musicvideos: true, books: true, photos: true };

                // --- Строка "Мои медиатеки" ---
                var libCards = [];
                for (var vi = 0; vi < viewList.length; vi++) {
                    var vv = viewList[vi];
                    if (!vv || !vv.Id) continue;
                    var vct = '';
                    try { vct = String(vv.CollectionType || vv.collectionType || '').toLowerCase(); } catch (e0) { vct = ''; }
                    // Пропускаем только явно не-видео библиотеки
                    if (vct === 'music' || vct === 'musicvideos' || vct === 'books' || vct === 'photos' || vct === 'livetv' || vct === 'trailers') continue;
                    var vkind = (vct === 'boxsets') ? 'boxset' : 'media';
                    var lc = self.libraryViewCard(vv, vkind);
                    if (lc) libCards.push(lc);
                }

                var lines = [];
                var lineSeen = {};
                var pushLine = function (line) {
                    try {
                        var k = (line && (line.url || line.title)) ? String(line.url || line.title) : '';
                        if (!k || lineSeen[k]) return;
                        lineSeen[k] = true;
                        lines.push(line);
                    } catch (e0) {}
                };

                var libLine = null;
                if (libCards.length) {
                    libLine = {
                        title: 'Мои медиатеки',
                        url: 'jellyfin://libraries',
                        results: libCards,
                        cardClass: function (item) { return new JellyfinLibraryCard(item); },
                        total_pages: 1
                    };
                    pushLine(libLine);
                }

                // --- Ленты из библиотек ---
                var fallbackDefs = [
                    { key: 'jellyfin://latest?type=movie&parentId=', title: 'Последние фильмы', mode: 'latest', media: 'movie', parentId: '' },
                    { key: 'jellyfin://latest?type=tv&parentId=', title: 'Последние сериалы', mode: 'latest', media: 'tv', parentId: '' },
                    { key: 'jellyfin://premiere?type=movie&parentId=', title: 'Новинки (фильмы)', mode: 'premiere', media: 'movie', parentId: '' }
                ];
                var resumeDef = { key: 'jellyfin://resume', title: 'Продолжить просмотр', mode: 'resume', media: 'all', parentId: '' };

                var defs = [resumeDef];
                var seenDef = {};
                var addDef = function (media, mode, name, parentId) {
                    var key = 'jellyfin://' + mode + '?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(parentId));
                    if (seenDef[key]) return;
                    seenDef[key] = true;
                    var titlePrefix = mode === 'premiere' ? 'Новинки (' + name + ')' : 'Недавно добавлено в ' + name;
                    defs.push({ key: key, title: titlePrefix, mode: mode, media: media, parentId: String(parentId) });
                };

                for (var i = 0; i < viewList.length; i++) {
                    var v = viewList[i];
                    if (!v || !v.Id) continue;
                    var ct = '';
                    try { ct = String(v.CollectionType || v.collectionType || '').toLowerCase(); } catch (e1) { ct = ''; }
                    if (NON_VIDEO_TYPES[ct]) continue;
                    var name = '';
                    try { name = String(v.Name || v.name || '').trim(); } catch (e2) { name = ''; }

                    if (ct === 'movies') {
                        addDef('movie', 'latest', name || 'Фильмы', v.Id);
                        addDef('movie', 'premiere', name || 'Фильмы', v.Id);
                    } else if (ct === 'tvshows') {
                        addDef('tv', 'latest', name || 'Сериалы', v.Id);
                    } else if (ct === 'boxsets') {
                        // boxsets — только карточка в "Мои медиатеки", лент не генерируем
                    } else {
                        var genName = name || 'Библиотека';
                        addDef('movie', 'latest', genName, v.Id);
                        addDef('movie', 'premiere', genName, v.Id);
                        addDef('tv', 'latest', genName, v.Id);
                    }
                }

                if (defs.length <= 1) defs = defs.concat(fallbackDefs);

                // --- Параллельная загрузка лент с concurrency=5 (было 3) ---
                var total = defs.length;
                var done = 0;
                var nextIdx = Math.min(5, total);
                var okCount = 0;
                var failCount = 0;
                var emptyCount = 0;
                var firstErr = null;

                var finalize = function () {
                    try { console.log('[Jellyfin PERF] buildMainLines ЗАВЕРШЕН за ' + (Date.now() - startTime) + 'ms, done=' + done + ' total=' + total); } catch (e0) {}
                    try { console.log('[Jellyfin] Ленты: total=' + total + ' ok=' + okCount + ' empty=' + emptyCount + ' fail=' + failCount); } catch (e0) {}
                    if (okCount === 0 && total > 1 && (failCount + emptyCount) > 0) {
                        try {
                            var st = firstErr ? (' [' + (firstErr.status || firstErr.decode_code || firstErr.code || '') + ']') : '';
                            Lampa.Noty.show('Jellyfin: ленты не загрузились' + st);
                        } catch (eN) {}
                    }
                    var visible = self.applyLinePrefs(lines.filter(function (l) { return l && l.results && l.results.length; }));
                    if (libLine && libLine.results && libLine.results.length) {
                        var idx2 = visible.indexOf(libLine);
                        if (idx2 > 0) { visible.splice(idx2, 1); visible.unshift(libLine); }
                        else if (idx2 === -1) { visible.unshift(libLine); }
                    }
                    oncomplite(visible);
                };

                var oneDone = function () {
                    done++;
                    if (nextIdx < total) runOne(nextIdx++);
                    if (done >= total) finalize();
                };

                var runOne = function (i) {
                    var def = defs[i];
                    var lineStartTime = Date.now();
                    var opts = def.parentId ? { parentId: def.parentId } : {};
                    try { console.log('[Jellyfin PERF] Загружаю ленту "' + def.title + '"...'); } catch (e0) {}
                    self.libraryItems(def.mode, def.media, 1, function (data) {
                        try { console.log('[Jellyfin PERF] Лента "' + def.title + '" загружена за ' + (Date.now() - lineStartTime) + 'ms, cards=' + ((data && data.cards) ? data.cards.length : 0)); } catch (e0) {}
                        if (data && data.cards && data.cards.length) okCount++; else emptyCount++;
                        pushLine({
                            title: 'Jellyfin \u2022 ' + def.title,
                            url: def.key,
                            results: data.cards || [],
                            total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                        });
                        oneDone();
                    }, function (err) {
                        try { console.log('[Jellyfin PERF] Лента "' + def.title + '" упала за ' + (Date.now() - lineStartTime) + 'ms'); } catch (e0) {}
                        failCount++;
                        if (!firstErr) firstErr = err;
                        try { console.warn('[Jellyfin] лента "' + def.title + '" упала', err); } catch (e0) {}
                        oneDone();
                    }, true, opts);
                };

                if (total === 0) {
                    finalize();
                } else {
                    for (var pi = 0; pi < Math.min(5, total); pi++) runOne(pi);
                }

            }, function () {
                // getViews упал — показываем хотя бы пустой главный экран
                try { console.warn('[Jellyfin] getViews не загрузился'); } catch (e0) {}
                oncomplite([]);
            });
        },

        fetchBrowseData: function (object, callback, onFail) {
            try {
                var parsed = this.parseLocalUrl((object && object.url) || '');
                var parentId = parsed.query.parentId || '';
                var kind = parsed.query.kind === 'boxset' ? 'boxset' : 'media';
                var title = parsed.query.title || (object && object.title) || 'Jellyfin';
                var page = parseInt(object && object.page, 10) || 1;

                this.browseItems(kind, parentId, page, function (data) {
                    var lineData = {
                        title: title,
                        results: data.cards,
                        page: page,
                        total_pages: Math.max(1, Math.ceil((data.total || 0) / 40)),
                        total_results: data.total || 0
                    };
                    // Устанавливаем cardClass для BoxSet-карточек:
                    // либо явный kind='boxset', либо сервер вернул BoxSet-элементы
                    // в ответ на media-запрос (например библиотека типа playlists
                    // содержит только папки-франшизы).
                    var hasBoxsets = false;
                    if (kind === 'boxset') {
                        hasBoxsets = true;
                    } else {
                        for (var ci = 0; ci < (data.cards || []).length; ci++) {
                            if (data.cards[ci] && data.cards[ci].jellyfin_boxset_id) { hasBoxsets = true; break; }
                        }
                    }
                    if (hasBoxsets) {
                        // Передаем kind в карточку чтобы различать коллекции (vertical) и франшизы (horizontal)
                        lineData.cardClass = function (item) { 
                            return new JellyfinFolderCard(item, kind); 
                        };
                    }
                    callback(lineData);
                }, function () {
                    if (onFail) onFail();
                });
            } catch (e0) {
                if (onFail) onFail();
            }
        },

        patchApi: function () {
            if (this.apiPatched) return;
            if (!Lampa || !Lampa.Api) return;
            this.apiPatched = true;

            var originalCategory = Lampa.Api.category;
            var originalList = Lampa.Api.list;

            Lampa.Api.category = function (params, oncomplite, onerror) {
                try {
                    if (params && params.url && String(params.url).indexOf('jellyfin:') === 0) {
                        var parsed = Jellyfin.parseLocalUrl(params.url);
                        if (parsed.path === 'main') {
                            Jellyfin.buildMainLines(oncomplite, function () { oncomplite([]); });
                            return;
                        }
                    }
                } catch (e0) {}
                return originalCategory(params, oncomplite, onerror);
            };

            Lampa.Api.list = function (params, oncomplite, onerror) {
                try {
                    if (params && params.url && String(params.url).indexOf('jellyfin:') === 0) {
                        var parsed = Jellyfin.parseLocalUrl(params.url);
                        var page = params.page || 1;

                        if (parsed.path === 'latest') {
                            var media = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var pid = parsed.query.parentId || parsed.query.topParentId || '';
                            Jellyfin.libraryItems('latest', media, page, function (data) {
                                oncomplite({
                                    title: (media === 'tv') ? 'Jellyfin • Последние сериалы' : 'Jellyfin • Последние фильмы',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { parentId: pid });
                            return;
                        }

                        if (parsed.path === 'premiere') {
                            var media2 = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var pid2 = parsed.query.parentId || parsed.query.topParentId || '';
                            Jellyfin.libraryItems('premiere', media2, page, function (data) {
                                oncomplite({
                                    title: (media2 === 'tv') ? 'Jellyfin • Новинки (сериалы)' : 'Jellyfin • Новинки (фильмы)',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { parentId: pid2 });
                            return;
                        }

                        if (parsed.path === 'genre') {
                            var media3 = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var genre = parsed.query.name ? String(parsed.query.name) : '';
                            var pid3 = parsed.query.parentId || parsed.query.topParentId || '';
                            var title = 'Jellyfin • Жанр';
                            if (genre.toLowerCase() === 'animation') title = (media3 === 'tv') ? 'Jellyfin • Мультсериалы' : 'Jellyfin • Мультфильмы';

                            Jellyfin.libraryItems('genre', media3, page, function (data) {
                                oncomplite({
                                    title: title,
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { genre: genre || 'Animation', parentId: pid3 });
                            return;
                        }

                        if (parsed.path === 'resume') {
                            Jellyfin.libraryItems('resume', 'all', page, function (data) {
                                oncomplite({
                                    title: 'Jellyfin • Продолжить просмотр',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            });
                            return;
                        }

                        if (parsed.path === 'browse') {
                            var browseParentId = parsed.query.parentId || '';
                            var browseKind = parsed.query.kind === 'boxset' ? 'boxset' : 'media';
                            var browseTitle = parsed.query.title || 'Jellyfin';

                            Jellyfin.browseItems(browseKind, browseParentId, page, function (data) {
                                var lineData = {
                                    title: browseTitle,
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 40)),
                                    total_results: data.total || 0
                                };
                                if (browseKind === 'boxset') {
                                    lineData.cardClass = function (item) { return new JellyfinFolderCard(item); };
                                }
                                oncomplite(lineData);
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            });
                            return;
                        }
                    }
                } catch (e0) {}
                return originalList(params, oncomplite, onerror);
            };

            // Карточки без TMDB-соответствия (source: 'jellyfin') раньше
            // пытались открыть стандартную страницу "full", которую Lampa
            // умеет строить только для source 'tmdb'/'cub' — в результате
            // клик по такой карточке ничего не делал. Теперь такие клики
            // перехватываются и ведут прямо во внутренний плеер/меню серий
            // Jellyfin, минуя обычную страницу описания.
            try {
                var originalActivityPush = Lampa.Activity.push;
                Lampa.Activity.push = function (params) {
                    try {
                        if (params && params.component === 'full' && params.source === 'jellyfin' && params.id) {
                            // Если это BoxSet (папка-франшиза) — открываем browse, не плеер
                            var card = params.movie || params.card || params.data || {};
                            var boxsetId = card.jellyfin_boxset_id || '';
                            if (!boxsetId && params.id) {
                                // Проверяем по сохранённой карте tmdb→jellyfin
                                // Если id совпадает с известным boxset — тоже browse
                                try {
                                    var tmdbMap = Lampa.Storage.get('jellyfin_tmdb_map', {}) || {};
                                    // boxset_id хранится в jellyfin_boxset_id карточки,
                                    // которая не попадает в tmdb_map — значит если id
                                    // не найден в tmdb_map ни для movie ни для tv,
                                    // но карточка имеет card_type отсутствующий — это boxset.
                                } catch(eBm) {}
                            }

                            if (boxsetId) {
                                // BoxSet — открываем содержимое как browse
                                Lampa.Activity.push({
                                    url: 'jellyfin://browse?parentId=' + encodeURIComponent(boxsetId) + '&kind=media&title=' + encodeURIComponent(card.title || card.name || ''),
                                    title: card.title || card.name || '',
                                    component: Jellyfin._componentsRegistered ? 'jellyfin_browse' : 'category',
                                    page: 1
                                });
                                return;
                            }

                            var jfId = String(params.id);
                            var back = function () {
                                var enabled = null;
                                try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
                                try { Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'full_start'); } catch (e1) {}
                            };
                            Jellyfin.authenticate(function () {
                                Jellyfin.getItemDetails(jfId, function (full) {
                                    // Дополнительная проверка: если сервер вернул BoxSet — открываем browse
                                    if (full && String(full.Type || '').toLowerCase() === 'boxset') {
                                        Lampa.Activity.push({
                                            url: 'jellyfin://browse?parentId=' + encodeURIComponent(jfId) + '&kind=media&title=' + encodeURIComponent(full.Name || ''),
                                            title: full.Name || '',
                                            component: Jellyfin._componentsRegistered ? 'jellyfin_browse' : 'category',
                                            page: 1
                                        });
                                        return;
                                    }
                                    Jellyfin.openPlayMenu(full || { Id: jfId }, back);
                                });
                            });
                            return;
                        }
                    } catch (e2) {}
                    return originalActivityPush.apply(this, arguments);
                };
            } catch (e3) {}
        },

        authenticate: function (callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            var user = sget('jellyfin_user', JELLYFIN_USER);
            var pass = sget('jellyfin_pass', JELLYFIN_PASS);
            var storedToken = sget('jellyfin_token', '');
            var storedUserId = sget('jellyfin_user_id', '');

            if (this.token && this.userId && this.lastServer === server) {
                callback(this.token);
                return;
            }

            if (storedToken && storedUserId && server) {
                this.token = storedToken;
                this.userId = storedUserId;
                this.lastServer = server;
                this.lastUser = 'token';
                callback(this.token);
                return;
            }

            if (!server || !user || !pass) {
                Lampa.Noty.show('Jellyfin: заполните адрес/логин/пароль или используйте "Быстрое подключение"');
                return;
            }

            var url = server + '/Users/AuthenticateByName';
            var payload = { Username: user, Pw: pass };

            var onFail = function (err) {
                var status = '';
                try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                if (String(status) === '401') Lampa.Noty.show('Jellyfin: неверный логин/пароль (401)');
                else if (String(status) === '405') Lampa.Noty.show('Jellyfin: сервер/прокси блокирует POST/OPTIONS (405)');
                else Lampa.Noty.show('Jellyfin: Сервер недоступен' + (status ? ' (' + status + ')' : ''));
            };

            this.request(url, 'POST', payload, function (res) {
                if (res && res.AccessToken) {
                    this.saveAuth(server, res.AccessToken, res.SessionInfo && res.SessionInfo.UserId ? res.SessionInfo.UserId : '', user);
                    callback(this.token);
                } else {
                    this.clearAuth();
                    Lampa.Noty.show('Jellyfin: Ошибка входа');
                }
            }.bind(this), function (err) {
                var status = '';
                try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                if (String(status) === '405') {
                    var form = 'Username=' + encodeURIComponent(user) + '&Pw=' + encodeURIComponent(pass);
                    this.request(url, 'POST', form, function (res) {
                        if (res && res.AccessToken) {
                            this.saveAuth(server, res.AccessToken, res.SessionInfo && res.SessionInfo.UserId ? res.SessionInfo.UserId : '', user);
                            callback(this.token);
                        } else {
                            onFail({ status: 401 });
                        }
                    }.bind(this), onFail, { form: true, contentType: 'application/x-www-form-urlencoded; charset=UTF-8', processData: false, useAuthHeader: false });
                } else {
                    onFail(err);
                }
            }.bind(this));
        },

        quickConnectStop: function () {
            if (this.quickConnectTimer) { try { clearTimeout(this.quickConnectTimer); } catch (e0) {} }
            this.quickConnectTimer = null;
            this.quickConnectSecret = null;
            this.quickConnectInFlight = false;
            this.quickConnectFailCount = 0;
        },

        quickConnectInitiate: function (server, callback, onFail) {
            var url = server + '/QuickConnect/Initiate';
            this.request(url, 'GET', null, function (res) {
                callback(res || null);
            }, function () {
                this.request(url, 'POST', {}, function (res2) {
                    callback(res2 || null);
                }, onFail, { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectConnect: function (server, secret, callback, onFail) {
            var s = secret || '';
            var url = server + '/QuickConnect/Connect?secret=' + encodeURIComponent(s);
            var url2 = server + '/QuickConnect/Connect';
            var payload = { Secret: s };

            this.request(url, 'POST', payload, function (res) {
                callback(res || null);
            }, function (e0) {
                this.request(url2, 'POST', payload, function (res2) {
                    callback(res2 || null);
                }, function (e1) {
                    this.request(url, 'GET', null, function (res3) { callback(res3 || null); }, function (e2) { if (onFail) onFail(e2 || e1 || e0); }, { useTokenHeader: false, dataType: 'json' });
                }.bind(this), { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectAuthenticate: function (server, secret, callback, onFail) {
            var url = server + '/Users/AuthenticateWithQuickConnect';
            var payload = { Secret: secret };

            this.request(url, 'POST', payload, function (res) {
                callback(res || null);
            }, function (e0) {
                var url2 = url + '?secret=' + encodeURIComponent(secret || '');
                this.request(url2, 'POST', {}, function (res2) {
                    callback(res2 || null);
                }, function (e1) {
                    this.request(url2, 'GET', null, function (res3) { callback(res3 || null); }, function (e2) { if (onFail) onFail(e2 || e1 || e0); }, { useTokenHeader: false, dataType: 'json' });
                }.bind(this), { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectUI: function () {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            if (!server) {
                Lampa.Noty.show('Jellyfin: заполните адрес сервера');
                return;
            }

            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restore = function () {
                Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'settings');
            };

            var modal = null;
            try { modal = (Lampa && Lampa.Modal) ? Lampa.Modal : (typeof Modal !== 'undefined' ? Modal : null); } catch (e1) { modal = null; }
            if (!modal || !modal.open) {
                Lampa.Noty.show('Jellyfin: Не удалось открыть окно');
                return;
            }

            this.quickConnectStop();

            var html = $('<div class="jellyfin-qc"><div class="jellyfin-qc__title">Быстрое подключение</div><div class="jellyfin-qc__text">Откройте Jellyfin в браузере и перейдите в "Быстрое подключение", затем введите код:</div><div class="jellyfin-qc__code">...</div><div class="jellyfin-qc__url">' + server + '/web/#/quickconnect.html</div><div class="jellyfin-qc__status">Получаем код...</div></div>');
            var statusEl = html.find('.jellyfin-qc__status');
            var codeEl = html.find('.jellyfin-qc__code');

            modal.open({
                title: 'Jellyfin',
                html: html,
                size: 'small',
                scroll_to_center: true,
                onBack: function () {
                    try { modal.close(); } catch (e0) {}
                    this.quickConnectStop();
                    restore();
                }.bind(this)
            });

            this.quickConnectInitiate(server, function (initRes) {
                var src = initRes || {};
                try { if (src && src.data) src = src.data; } catch (e0) {}
                try { if (src && src.Result) src = src.Result; } catch (e1) {}

                var code = src && (src.Code || src.code || src.QuickConnectCode || src.QuickConnectcode || '');
                var secret = src && (src.Secret || src.secret || src.QuickConnectSecret || src.QuickConnectsecret || '');

                if (!code || !secret) {
                    statusEl.text('Не удалось получить код (Quick Connect выключен на сервере?)');
                    return;
                }

                this.quickConnectSecret = secret;
                this.quickConnectFailCount = 0;
                codeEl.text(String(code));
                statusEl.text('Ожидание подтверждения...');

                var startedAt = Date.now();
                var poll = function () {
                    if (!this.quickConnectSecret) return;
                    if (this.quickConnectInFlight) {
                        this.quickConnectTimer = setTimeout(poll.bind(this), 1200);
                        return;
                    }
                    if (Date.now() - startedAt > 1000 * 180) {
                        statusEl.text('Время ожидания истекло. Повторите.');
                        this.quickConnectStop();
                        return;
                    }

                    this.quickConnectInFlight = true;
                    var scheduleNext = function (delay) {
                        if (!this.quickConnectSecret) return;
                        this.quickConnectInFlight = false;
                        this.quickConnectTimer = setTimeout(poll.bind(this), delay || 2000);
                    }.bind(this);

                    this.quickConnectAuthenticate(server, this.quickConnectSecret, function (authRes) {
                        if (authRes && authRes.AccessToken) {
                            this.quickConnectStop();
                            this.saveAuth(server, authRes.AccessToken, authRes.SessionInfo && authRes.SessionInfo.UserId ? authRes.SessionInfo.UserId : '', 'quickconnect');
                            statusEl.text('Подключено');
                            try { Lampa.Noty.show('Jellyfin: подключено'); } catch (e0) {}
                            setTimeout(function () { try { modal.close(); } catch (e1) {} restore(); }, 600);
                            return;
                        }

                        this.quickConnectConnect(server, this.quickConnectSecret, function (connectRes) {
                            var ok = false;
                            try { ok = !!(connectRes && (connectRes.Authenticated || connectRes.authenticated)); } catch (e2) { ok = false; }
                            if (ok) statusEl.text('Подтверждено, получаем токен...');
                            this.quickConnectFailCount = 0;
                            scheduleNext(ok ? 1200 : 2000);
                        }.bind(this), function () {
                            scheduleNext(2000);
                        });
                    }.bind(this), function (err) {
                        var status = '';
                        try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                        var statusStr = String(status || '');
                        var pending = (statusStr === '401' || statusStr === '403' || statusStr === '404' || statusStr === '400' || statusStr === '409');
                        if (pending) {
                            this.quickConnectFailCount = 0;
                            scheduleNext(2000);
                            return;
                        }

                        this.quickConnectFailCount++;
                        if (this.quickConnectFailCount >= 8 && Date.now() - startedAt > 15000) {
                            statusEl.text('Нет ответа от Quick Connect' + (statusStr ? ' (' + statusStr + ')' : ''));
                        }
                        scheduleNext(2500);
                    }.bind(this));
                }.bind(this);

                poll.call(this);
            }.bind(this), function () {
                statusEl.text('Не удалось получить код (сервер недоступен)');
            });
        },

        formatSize: function(bytes) {
            if (!bytes) return '';
            var gbs = bytes / (1024 * 1024 * 1024);
            return gbs.toFixed(1) + ' GB';
        },

        formatLang: function (lang) {
            var l = String(lang || '').toLowerCase();
            if (!l) return '';
            if (l === 'rus' || l === 'ru' || l === 'russian') return 'RU';
            if (l === 'eng' || l === 'en' || l === 'english') return 'EN';
            if (l === 'ukr' || l === 'uk' || l === 'ukrainian') return 'UK';
            if (l === 'spa' || l === 'es' || l === 'spanish') return 'ES';
            if (l === 'fra' || l === 'fr' || l === 'french') return 'FR';
            if (l === 'deu' || l === 'de' || l === 'german') return 'DE';
            if (l === 'ita' || l === 'it' || l === 'italian') return 'IT';
            return l.slice(0, 3).toUpperCase();
        },

        formatChannels: function (channels) {
            var ch = 0;
            try { ch = parseInt(channels, 10) || 0; } catch (e0) { ch = 0; }
            if (!ch) return '';
            if (ch === 1) return '1.0';
            if (ch === 2) return '2.0';
            if (ch === 6) return '5.1';
            if (ch === 8) return '7.1';
            return String(ch);
        },

        getMediaStreams: function (mediaSource, item) {
            try {
                if (mediaSource && mediaSource.MediaStreams && mediaSource.MediaStreams.length) return mediaSource.MediaStreams;
                if (item && item.MediaStreams && item.MediaStreams.length) return item.MediaStreams;
            } catch (e0) {}
            return [];
        },

        getVideoStream: function(mediaSource, item) {
            try {
                var streams = this.getMediaStreams(mediaSource, item);
                for (var i = 0; i < streams.length; i++) {
                    if (streams[i] && streams[i].Type === 'Video') return streams[i];
                }
            } catch (e) {}
            return null;
        },

        getAudioStreams: function (mediaSource, item) {
            var streams = this.getMediaStreams(mediaSource, item);
            var out = [];
            for (var i = 0; i < streams.length; i++) {
                if (streams[i] && streams[i].Type === 'Audio') out.push(streams[i]);
            }
            return out;
        },

        formatAudioStream: function (stream) {
            if (!stream) return '';
            var parts = [];

            var lang = '';
            try { lang = stream.DisplayLanguage || stream.Language || ''; } catch (e0) { lang = ''; }
            lang = this.formatLang(lang);
            if (lang) parts.push(lang);

            var codec = '';
            try { codec = stream.Codec || ''; } catch (e1) { codec = ''; }
            codec = codec ? String(codec).toUpperCase() : '';
            if (codec) parts.push(codec);

            var ch = this.formatChannels(stream.Channels);
            if (ch) parts.push(ch);

            var title = '';
            try { title = stream.Title || stream.DisplayTitle || ''; } catch (e2) { title = ''; }
            if (title) parts.push(String(title).trim());

            return parts.join(' • ');
        },

        getAudioSummary: function (mediaSource, item) {
            var audios = this.getAudioStreams(mediaSource, item);
            if (!audios.length) return '';

            var langs = {};
            for (var i = 0; i < audios.length; i++) {
                var l = '';
                try { l = audios[i].Language || audios[i].DisplayLanguage || ''; } catch (e0) { l = ''; }
                l = this.formatLang(l);
                if (l) langs[l] = true;
            }
            var list = Object.keys(langs);
            if (!list.length) return 'Audio: ' + audios.length;
            return 'Audio: ' + list.join('/') + ' (' + audios.length + ')';
        },

        getVideoCodecInfo: function (mediaSource, item) {
            var v = this.getVideoStream(mediaSource, item);
            if (!v) return '';
            var parts = [];

            var codec = '';
            try { codec = v.Codec || ''; } catch (e0) { codec = ''; }
            codec = codec ? String(codec).toUpperCase() : '';
            if (codec) parts.push(codec);

            var range = '';
            try { range = v.VideoRangeType || v.VideoRange || ''; } catch (e1) { range = ''; }
            range = String(range || '').toUpperCase();
            if (range === 'HDR' || range === 'HLG' || range === 'DOVI' || range === 'DV') parts.push(range === 'DV' ? 'DOVI' : range);

            return parts.join(' ');
        },

        getQuality: function(item, mediaSource) {
            var info = [];
            var ms = mediaSource || (item && item.MediaSources && item.MediaSources.length ? item.MediaSources[0] : null);

            if (ms) {
                var v = this.getVideoStream(ms, item);
                var w = 0;
                var h = 0;
                try { w = v && v.Width ? parseInt(v.Width, 10) : 0; } catch (e0) { w = 0; }
                try { h = v && v.Height ? parseInt(v.Height, 10) : 0; } catch (e1) { h = 0; }
                var px = Math.max(w || 0, h || 0);
                if (px >= 3800 || h >= 2000) info.push('4K');
                else if (px >= 1900 || h >= 1000) info.push('1080p');
                else if (px >= 1200 || h >= 700) info.push('720p');
                else if (px > 0) info.push('SD');

                var vcodec = this.getVideoCodecInfo(ms, item);
                if (vcodec) info.push(vcodec);

                var size = this.formatSize(ms.SizeInBytes || ms.Size);
                if (size) info.push(size);

                if (ms.Bitrate) info.push(Math.round(ms.Bitrate / 1000000) + ' Mbps');

                var as = this.getAudioSummary(ms, item);
                if (as) info.push(as);
            }

            return info.join(' • ') || (item && item.Type === 'Series' ? 'Сериал' : 'Фильм');
        },

        getItemDetails: function (id, callback) {
            try {
                if (!id) return callback(null);
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var url = server + '/Users/' + encodeURIComponent(this.userId) + '/Items/' + encodeURIComponent(id) + '?Fields=ProductionYear,Name,ProviderIds,MediaSources,MediaStreams,UserData,SeriesId,SeriesName,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || '');
                this.request(
                    url,
                    'GET',
                    null,
                    function (res) { callback(res || null); },
                    function () { callback(null); },
                    { useAuthHeader: false, useTokenHeader: false, dataType: 'json' }
                );
            } catch (e) {
                callback(null);
            }
        },

        search: function (query, year, callback) {
            this.authenticate(function (token) {
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var url = server + '/Users/' + encodeURIComponent(this.userId) + '/Items?searchTerm=' + encodeURIComponent(query) + '&IncludeItemTypes=Movie,Series&Recursive=true&limit=50&Fields=ProductionYear,Name&api_key=' + encodeURIComponent(token);

                this.request(url, 'GET', null, function (res) {
                    var items = (res && res.Items) ? res.Items : [];

                    var y = 0;
                    if (year) {
                        try { y = parseInt(year, 10) || 0; } catch (eY) { y = 0; }
                    }

                    var filtered = items;
                    if (y && items.length > 0) {
                        var exact = [];
                        var other = [];

                        for (var ii = 0; ii < items.length; ii++) {
                            var cand = items[ii];
                            if (cand && cand.ProductionYear == y) exact.push(cand);
                            else other.push(cand);
                        }

                        filtered = exact.concat(other);
                    }

                    filtered = filtered.slice(0, 20);

                    var out = [];
                    var idx = 0;
                    var seen = {};

                    var getItemKey = function (obj) {
                        try {
                            if (!obj || !obj.Id) return '';
                            return String(obj.Id);
                        } catch (e0) {
                            return '';
                        }
                    };

                    var pushUnique = function (obj) {
                        var key = getItemKey(obj);
                        if (!key) return;
                        if (seen[key]) return;
                        seen[key] = true;
                        out.push(obj);
                    };

                    var next = function () {
                        if (idx >= filtered.length) return callback(out);
                        var it = filtered[idx++];
                        if (!it || !it.Id) return next();

                        this.getItemDetails(it.Id, function (full) {
                            var item = full || it;
                            pushUnique(item);
                            next();
                        });
                    }.bind(this);

                    next();
                }.bind(this), function () {
                    Lampa.Noty.show('Jellyfin: Ошибка поиска');
                }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
            }.bind(this));
        },

        getSeasons: function (seriesId, callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            this.request(server + '/Shows/' + seriesId + '/Seasons?userId=' + this.userId + '&Fields=MediaSources,MediaStreams,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || ''), 'GET', null, callback, function() {}, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
        },

        getEpisodes: function (seriesId, seasonId, callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            this.request(server + '/Shows/' + seriesId + '/Episodes?seasonId=' + seasonId + '&userId=' + this.userId + '&Fields=MediaSources,MediaStreams,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || ''), 'GET', null, callback, function() {}, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
        },

        ensureItemDetails: function (item, callback) {
            if (item && item.MediaSources && item.MediaSources.length) return callback(item);
            this.getItemDetails(item && item.Id ? item.Id : '', function (full) {
                callback(full || item || null);
            });
        },

        getResolutionLabel: function (item, mediaSource) {
            try {
                var v = this.getVideoStream(mediaSource, item);
                var h = 0;
                try { h = v && v.Height ? parseInt(v.Height, 10) : 0; } catch (e0) { h = 0; }
                if (h >= 2000) return '2160p';
                if (h >= 1000) return '1080p';
                if (h >= 700) return '720p';
                if (h >= 500) return '480p';
                if (h > 0) return h + 'p';
                return '';
            } catch (e1) {
                return '';
            }
        },

        selectMediaSource: function (item, callback, onBack) {
            var sources = (item && item.MediaSources) ? item.MediaSources : [];
            if (!sources || sources.length <= 1) return callback(sources && sources.length ? sources[0] : null);

            var list = sources.map(function (ms, idx) {
                var res = this.getResolutionLabel(item, ms);
                var name = '';
                try { name = ms && ms.Name ? String(ms.Name) : ''; } catch (eN) { name = ''; }
                return {
                    title: res || name || ('Версия ' + (idx + 1)),
                    subtitle: this.getQuality(item, ms),
                    ms: ms
                };
            }.bind(this));

            Lampa.Select.show({
                title: (item && item.Name ? item.Name : 'Jellyfin') + ' • Качество',
                items: list,
                onSelect: function (a) { callback(a && a.ms ? a.ms : null); },
                onBack: onBack
            });
        },

        // Пресеты качества как в веб-клиенте Jellyfin: "Оригинал" — прямое
        // воспроизведение без перекодирования, остальные — транскодирование
        // с ограничением битрейта/разрешения на стороне сервера.
        QUALITY_PRESETS: [
            { id: 'original', title: 'Оригинал (без сжатия)', bitrate: 0, maxHeight: 0 },
            { id: '1080-20', title: '1080p • 20 Мбит/с', bitrate: 20000000, maxHeight: 1080 },
            { id: '1080-10', title: '1080p • 10 Мбит/с', bitrate: 10000000, maxHeight: 1080 },
            { id: '720-8', title: '720p • 8 Мбит/с', bitrate: 8000000, maxHeight: 720 },
            { id: '720-4', title: '720p • 4 Мбит/с', bitrate: 4000000, maxHeight: 720 },
            { id: '480-3', title: '480p • 3 Мбит/с', bitrate: 3000000, maxHeight: 480 },
            { id: '480-1_5', title: '480p • 1.5 Мбит/с', bitrate: 1500000, maxHeight: 480 },
            { id: '360-0_7', title: '360p • 0.7 Мбит/с', bitrate: 700000, maxHeight: 360 }
        ],

        selectQuality: function (item, mediaSource, callback, onBack) {
            var list = this.QUALITY_PRESETS.map(function (q) {
                return {
                    title: q.title,
                    subtitle: q.bitrate ? 'Транскодирование на сервере' : 'Максимальное качество, без перекодирования',
                    quality: q
                };
            });

            Lampa.Select.show({
                title: 'Качество',
                items: list,
                onSelect: function (a) { callback(a && a.quality ? a.quality : this.QUALITY_PRESETS[0]); }.bind(this),
                onBack: onBack
            });
        },

        selectAudioStreamIndex: function (item, mediaSource, callback, onBack) {
            var audios = this.getAudioStreams(mediaSource, item);
            if (!audios || audios.length <= 1) {
                var one = audios && audios.length ? audios[0] : null;
                var idx = one && typeof one.Index !== 'undefined' ? one.Index : 0;
                return callback(idx);
            }

            var list = audios.map(function (st, i) {
                var title = this.formatAudioStream(st) || ('Дорожка ' + (i + 1));
                var index = typeof st.Index !== 'undefined' ? st.Index : i;
                var isDef = false;
                try { isDef = !!(st.IsDefault || st.Default); } catch (e0) { isDef = false; }
                return {
                    title: title + (isDef ? ' • По умолчанию' : ''),
                    subtitle: '',
                    audioIndex: index
                };
            }.bind(this));

            Lampa.Select.show({
                title: 'Аудио',
                items: list,
                onSelect: function (a) { callback(a && typeof a.audioIndex !== 'undefined' ? a.audioIndex : 0); },
                onBack: onBack
            });
        },

        playWithOptions: function (item, mediaSource, audioIndex, startSeconds, quality) {
            this.authenticate(function () {
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var msid = '';
                try { msid = mediaSource && mediaSource.Id ? mediaSource.Id : (item && (item.MediaSourceId || (item.MediaSources && item.MediaSources[0] && item.MediaSources[0].Id) || '')); } catch (e0) { msid = ''; }

                var q = quality && typeof quality === 'object' ? quality : this.QUALITY_PRESETS[0];
                var isDirect = !q.bitrate;
                var playSessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
                var deviceId = this.getDeviceId();

                var url;
                if (isDirect) {
                    url = server + '/Videos/' + item.Id + '/stream?static=true&api_key=' + encodeURIComponent(this.token || '');
                } else {
                    // Транскодирование на сервере: ограничиваем битрейт и
                    // (опционально) высоту кадра, как это делает сам веб-клиент
                    // Jellyfin в меню "Качество".
                    url = server + '/Videos/' + item.Id + '/stream.mp4?VideoCodec=h264&AudioCodec=aac,mp3&MaxStreamingBitrate=' + q.bitrate + '&VideoBitrate=' + Math.round(q.bitrate * 0.85) + '&AudioBitrate=128000';
                    if (q.maxHeight) url += '&MaxHeight=' + encodeURIComponent(String(q.maxHeight));
                    url += '&PlaySessionId=' + encodeURIComponent(playSessionId) + '&DeviceId=' + encodeURIComponent(deviceId) + '&api_key=' + encodeURIComponent(this.token || '');
                }

                if (msid) url += '&MediaSourceId=' + encodeURIComponent(msid);
                if (typeof audioIndex !== 'undefined' && audioIndex !== null && audioIndex !== '') url += '&AudioStreamIndex=' + encodeURIComponent(audioIndex);

                var timeline = null;
                var ss = 0;
                try { ss = parseFloat(startSeconds) || 0; } catch (e1) { ss = 0; }
                if (ss > 0) timeline = { time: ss, percent: 0, continued: false };

                Lampa.Player.play({ url: url, title: item.Name, timeline: timeline, jellyfin_item: item, jellyfin_media_source_id: msid, jellyfin_audio_index: audioIndex });
                Lampa.Player.playlist([{ url: url, title: item.Name }]);

                var seriesId = '';
                var seasonNumber = '';
                var episodeNumber = '';
                try { seriesId = String(item.SeriesId || item.seriesId || ''); } catch (e2) { seriesId = ''; }
                try { seasonNumber = item.ParentIndexNumber ? String(item.ParentIndexNumber) : ''; } catch (e3) { seasonNumber = ''; }
                try { episodeNumber = item.IndexNumber ? String(item.IndexNumber) : ''; } catch (e4) { episodeNumber = ''; }

                this.startPlaybackSync({
                    itemId: String(item.Id),
                    mediaSourceId: msid || String(item.Id),
                    audioIndex: audioIndex,
                    positionSec: ss || 0,
                    durationSec: this.getDurationSecondsFromItem(item) || 0,
                    title: String(item.Name || ''),
                    seriesId: seriesId || '',
                    seasonNumber: seasonNumber || '',
                    episodeNumber: episodeNumber || '',
                    seriesName: '',
                    playSessionId: playSessionId,
                    playMethod: isDirect ? 'DirectPlay' : 'Transcode'
                });
            }.bind(this));
        },

        openPlayMenu: function (item, onBack, opts) {
            var ctx = opts && typeof opts === 'object' ? opts : {};
            this.ensureItemDetails(item, function (full) {
                if (!full || !full.Id) {
                    if (onBack) onBack();
                    return;
                }

                this.authenticate(function () {
                    var back = typeof onBack === 'function' ? onBack : function () {
                        var enabled = null;
                        try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
                        Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'full_start');
                    };

                    var playFlow = function (playItem, resumeSeconds, backHandler, flowOpts) {
                        var fo = flowOpts && typeof flowOpts === 'object' ? flowOpts : {};
                        var sources = [];
                        try { sources = (playItem && playItem.MediaSources) ? playItem.MediaSources : []; } catch (e0) { sources = []; }
                        var localState = null;
                        try { localState = this.getLocalItemState(playItem && playItem.Id ? playItem.Id : ''); } catch (e00) { localState = null; }

                        var showAudioForSource = function (ms, backH) {
                            this.selectAudioStreamIndex(playItem, ms, function (audioIndex) {
                                this.playWithOptions(playItem, ms, audioIndex, resumeSeconds || 0);
                            }.bind(this), backH);
                        }.bind(this);

                        if (sources && sources.length > 1) {
                            var prefMsId = '';
                            try { prefMsId = localState && localState.mediaSourceId ? String(localState.mediaSourceId) : ''; } catch (e03) { prefMsId = ''; }
                            if (!fo.forceSelect && prefMsId) {
                                for (var i0 = 0; i0 < sources.length; i0++) {
                                    if (sources[i0] && sources[i0].Id && String(sources[i0].Id) === prefMsId) {
                                        showAudioForSource(sources[i0], backHandler || back);
                                        return;
                                    }
                                }
                            }

                            var showMedia = function () {
                                this.selectMediaSource(playItem, function (ms) {
                                    showAudioForSource(ms, showMedia);
                                }.bind(this), backHandler || back);
                            }.bind(this);
                            showMedia();
                        } else {
                            var msOne = sources && sources.length ? sources[0] : null;
                            showAudioForSource(msOne, backHandler || back);
                        }
                    }.bind(this);

                    var typeLower = String(full.Type || '').toLowerCase();
                    if (typeLower === 'episode') {
                        var resumeSecEp = this.getResumeSecondsFromItem(full);
                        var durSecEp = this.getDurationSecondsFromItem(full);
                        var startAt = this.shouldOfferContinue(resumeSecEp, durSecEp) ? resumeSecEp : 0;
                        playFlow(full, startAt, back, { forceSelect: true });
                        return;
                    }

                    if (typeLower === 'series') {
                        var seriesId = String(full.Id);
                        var localSeries = this.getSeriesLastState(seriesId);

                        var proceedSeasons = function () {
                            this.getSeasons(full.Id, function (res) {
                                var seasons = (res && res.Items) ? res.Items : [];
                                var backToPrev = function () { back(); };

                                var seasonsConfig = {
                                    title: full.Name || 'Jellyfin',
                                    items: seasons.map(function (s) { return { title: s.Name || ('Сезон ' + (s.IndexNumber || '')), season: s }; }),
                                    onBack: backToPrev,
                                    onSelect: function (b) {
                                        if (!b || !b.season) return;
                                        this.getEpisodes(full.Id, b.season.Id, function (res2) {
                                            var episodes = (res2 && res2.Items) ? res2.Items : [];
                                            var backToSeasons = function () { Lampa.Select.show(seasonsConfig); };

                                            var lastEpisodeId = '';
                                            try { lastEpisodeId = localSeries && localSeries.itemId ? String(localSeries.itemId) : ''; } catch (e0) { lastEpisodeId = ''; }

                                            Lampa.Select.show({
                                                title: b.season.Name || 'Сезон',
                                                items: episodes.map(function (e) {
                                                    var isLast = false;
                                                    try { isLast = lastEpisodeId && e && e.Id && String(e.Id) === lastEpisodeId; } catch (e1) { isLast = false; }
                                                    var t = (e.IndexNumber ? e.IndexNumber + '. ' : '') + (e.Name || '');
                                                    if (isLast) t = t + ' <span class="jellyfin-badge jellyfin-badge--last">Последняя</span>';
                                                    var sub = Jellyfin.getQuality(e);
                                                    return { title: t, subtitle: sub, episode: e };
                                                }),
                                                onBack: backToSeasons,
                                                onSelect: function (c) { if (c && c.episode) this.openPlayMenu(c.episode, backToSeasons, { skipContinuePopup: true }); }.bind(this)
                                            });
                                        }.bind(this));
                                    }.bind(this)
                                };

                                if (!seasons.length) {
                                    back();
                                    return;
                                }

                                Lampa.Select.show(seasonsConfig);
                            }.bind(this));
                        }.bind(this);

                        this.getSeriesResume(seriesId, function (resumeEpisode) {
                            var resumeSec = this.getResumeSecondsFromItem(resumeEpisode);
                            var durSec = this.getDurationSecondsFromItem(resumeEpisode);
                            var percent = durSec ? ((resumeSec / durSec) * 100) : 0;
                            var sNo = '';
                            var eNo = '';
                            try { sNo = resumeEpisode.ParentIndexNumber ? String(resumeEpisode.ParentIndexNumber) : ''; } catch (e0) { sNo = ''; }
                            try { eNo = resumeEpisode.IndexNumber ? String(resumeEpisode.IndexNumber) : ''; } catch (e1) { eNo = ''; }
                            var info = [];
                            if (sNo) info.push('Сезон ' + sNo);
                            if (eNo) info.push('Серия ' + eNo);
                            if (resumeSec) info.push(this.formatSecondsShort(resumeSec));
                            var fallbackImg = this.buildImageUrl(resumeEpisode.Id, 'primary') || this.buildImageUrl(seriesId, 'backdrop') || this.buildImageUrl(seriesId, 'primary');
                            var tmdbSeriesId = this.getTmdbIdFromItem(full);

                            var openSeriesContinue = function (imgUrl) {
                                var img = imgUrl || fallbackImg;
                                if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSec, durSec)) {
                                    this.openContinuePopup({
                                        title: 'Продолжить просмотр?',
                                        name: String(full.Name || 'Jellyfin'),
                                        info: info.join(' • '),
                                        image: img,
                                        percent: percent,
                                        onContinue: function () {
                                            this.getItemDetails(resumeEpisode.Id, function (epFull) {
                                                playFlow(epFull || resumeEpisode, resumeSec, back, { forceSelect: false });
                                            }.bind(this));
                                        }.bind(this),
                                        onChoose: function () { proceedSeasons(); }
                                    });
                                    return;
                                }
                                proceedSeasons();
                            }.bind(this);

                            if (tmdbSeriesId && sNo && eNo) {
                                this.getEpisodeStillFromTmdb(tmdbSeriesId, sNo, eNo, function (stillUrl) {
                                    openSeriesContinue(stillUrl || '');
                                });
                            } else {
                                openSeriesContinue('');
                            }
                        }.bind(this), function () {
                            if (localSeries && localSeries.itemId) {
                                this.getItemDetails(localSeries.itemId, function (epFull) {
                                    if (!epFull || !epFull.Id) return proceedSeasons();
                                    var resumeSec = this.getResumeSecondsFromItem(epFull);
                                    var durSec = this.getDurationSecondsFromItem(epFull);
                                    var percent = durSec ? ((resumeSec / durSec) * 100) : 0;
                                    var info = [];
                                    if (localSeries.seasonNumber) info.push('Сезон ' + localSeries.seasonNumber);
                                    if (localSeries.episodeNumber) info.push('Серия ' + localSeries.episodeNumber);
                                    if (resumeSec) info.push(this.formatSecondsShort(resumeSec));
                                    var img = this.buildImageUrl(epFull.Id, 'primary') || this.buildImageUrl(seriesId, 'backdrop') || this.buildImageUrl(seriesId, 'primary');

                                    if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSec, durSec)) {
                                        this.openContinuePopup({
                                            title: 'Продолжить просмотр?',
                                            name: String(full.Name || 'Jellyfin'),
                                            info: info.join(' • '),
                                            image: img,
                                            percent: percent,
                                            onContinue: function () { playFlow(epFull, resumeSec, back, { forceSelect: false }); }.bind(this),
                                            onChoose: function () { proceedSeasons(); }
                                        });
                                        return;
                                    }
                                    proceedSeasons();
                                }.bind(this));
                                return;
                            }
                            proceedSeasons();
                        }.bind(this));

                        return;
                    }

                    var resumeSecItem = this.getResumeSecondsFromItem(full);
                    var durSecItem = this.getDurationSecondsFromItem(full);
                    var percentItem = durSecItem ? ((resumeSecItem / durSecItem) * 100) : 0;
                    var imgItem = this.buildImageUrl(full.Id, 'backdrop') || this.buildImageUrl(full.Id, 'primary');

                    if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSecItem, durSecItem)) {
                        this.openContinuePopup({
                            title: 'Продолжить просмотр?',
                            name: String(full.Name || 'Jellyfin'),
                            info: (resumeSecItem ? this.formatSecondsShort(resumeSecItem) : ''),
                            image: imgItem,
                            percent: percentItem,
                            onContinue: function () { playFlow(full, resumeSecItem, back, { forceSelect: false }); }.bind(this),
                            onChoose: function () { playFlow(full, 0, back, { forceSelect: true }); }.bind(this)
                        });
                        return;
                    }

                    playFlow(full, 0, back, { forceSelect: true });
                }.bind(this));
            }.bind(this));
        }
    };

    function showSelection(items, onBack) {
        var list = items.map(function (item) {
            return { 
                title: item.Name + (item.ProductionYear ? ' (' + item.ProductionYear + ')' : ''), 
                subtitle: Jellyfin.getQuality(item, item && item.MediaSources && item.MediaSources[0] ? item.MediaSources[0] : null), 
                item: item 
            };
        });

        if (list.length === 0) {
            list.push({ title: 'Ничего не найдено', subtitle: 'Попробуйте другой поиск или проверьте сервер' });
        }

        Lampa.Select.show({
            title: 'Jellyfin',
            items: list,
            onBack: onBack,
            onSelect: function (a) {
                if (!a.item) {
                    if (onBack) onBack();
                    return;
                }
                if (a.item.Type === 'Series') Jellyfin.openPlayMenu(a.item, function () { showSelection(items, onBack); });
                else Jellyfin.openPlayMenu(a.item, function () { showSelection(items, onBack); });
            }
        });
    }

    function addJellyfinButton(movie) {
        var buttons = $('.full-start-new__buttons, .full-start__buttons');
        if (buttons.length && !buttons.find('.button--jellyfin').length) {
            var btn = $('<div class="full-start__button selector button--jellyfin"></div>');
            btn.append($(getIcon()));
            btn.append($('<span class="button--jellyfin__text">Jellyfin</span>'));
            btn.on('hover:enter click', function () {
                var enabled = null;
                try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
                var restore = function () {
                    Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'full_start');
                    setTimeout(function () {
                        try {
                            if (btn && btn.length) Lampa.Controller.collectionFocus(btn[0], btn.parent());
                        } catch (e1) {}
                    }, 10);
                };

                var cardType = movie && (movie.name || movie.original_name) ? 'tv' : 'movie';
                var jfId = '';
                try { jfId = movie && movie.jellyfin_item_id ? String(movie.jellyfin_item_id) : ''; } catch (e2) { jfId = ''; }
                if (!jfId) {
                    try { jfId = Jellyfin.findJellyfinIdByTmdb(cardType, movie && movie.id ? movie.id : ''); } catch (e3) { jfId = ''; }
                }

                if (jfId) {
                    Jellyfin.authenticate(function () {
                        Jellyfin.getItemDetails(jfId, function (full) {
                            Jellyfin.openPlayMenu(full || { Id: jfId, Name: movie.title || movie.name || 'Jellyfin' }, restore);
                        });
                    });
                    return;
                }

                var title = movie.title || movie.name;
                var year = (movie.release_date || movie.first_air_date || '').split('-')[0];
                Lampa.Noty.show('Jellyfin: Поиск...');
                Jellyfin.search(title, year, function (items) {
                    showSelection(items, restore);
                });
            });
            var children = buttons.children();
            if (children && children.length >= 1) {
                btn.insertAfter(children.eq(0));
            } else {
                buttons.append(btn);
            }
            if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.toggle('full_start');
        }
    }

    if (!document.getElementById('jellyfin-button-styles')) {
        $('body').append('<style id="jellyfin-button-styles">.button--jellyfin{overflow:hidden !important;}.button--jellyfin svg{width:30px !important;height:30px !important;flex:0 0 30px !important;display:block !important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6)) !important;}.button--jellyfin .button--jellyfin__text{display:block !important;opacity:0 !important;max-width:0 !important;overflow:hidden !important;white-space:nowrap !important;margin-left:0 !important;transition:opacity .15s ease,max-width .2s ease,margin-left .2s ease !important;}.button--jellyfin.focus .button--jellyfin__text,.button--jellyfin:hover .button--jellyfin__text{opacity:1 !important;max-width:160px !important;margin-left:.6em !important;}.jellyfin-qc{padding:1.2em !important;}.jellyfin-qc__title{font-size:1.2em !important;font-weight:700 !important;margin-bottom:.8em !important;}.jellyfin-qc__text{opacity:.85 !important;line-height:1.35 !important;margin-bottom:1em !important;}.jellyfin-qc__code{font-size:2.4em !important;font-weight:900 !important;letter-spacing:.18em !important;padding:.45em .4em !important;border-radius:.6em !important;background:rgba(255,255,255,.08) !important;border:1px solid rgba(255,255,255,.18) !important;text-align:center !important;}.jellyfin-qc__url{margin-top:1em !important;opacity:.7 !important;word-break:break-all !important;font-size:.9em !important;}.jellyfin-qc__status{margin-top:1em !important;font-weight:600 !important;opacity:.9 !important;}.jellyfin-continue-popup{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);}.jellyfin-continue__card{background:#1a1a1a;border-radius:1em;width:44em;max-width:94vw;overflow:hidden;box-shadow:0 1em 4em rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__img{position:relative;width:100%;padding-top:56.25%;background:#000;overflow:hidden;}.jellyfin-continue__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.75;}.jellyfin-continue__details{position:absolute;bottom:0;left:0;right:0;padding:1.3em;background:linear-gradient(transparent,rgba(0,0,0,0.95));}.jellyfin-continue__title{font-size:1.7em;font-weight:700;margin-bottom:0.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}.jellyfin-continue__info{font-size:1.05em;opacity:0.65;color:#fff;}.jellyfin-continue__body{padding:0 1.3em 0.4em;margin-top:-0.4em;}.jellyfin-continue__question{font-size:1.15em;font-weight:600;margin:1em 0 0.8em;}.jellyfin-continue__footer{display:flex;flex-direction:row;gap:1em;padding:1.2em;}.jellyfin-continue__btn{position:relative;padding:1em 1.2em;border-radius:0.6em;cursor:pointer;font-size:1.15em;font-weight:600;background:rgba(255,255,255,0.08);color:#fff;transition:all 0.2s ease;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__btn.focus{background:#fff;color:#000;transform:translateY(-0.2em);box-shadow:0 0.5em 1.5em rgba(255,255,255,0.2);}.jellyfin-continue__bar{height:0.42em;background:rgba(255,255,255,0.12);border-radius:0.3em;overflow:hidden;}.jellyfin-continue__barfill{height:100%;background:#9B59B6;width:0%;}.jellyfin-badge{display:inline-block;margin-left:0.55em;padding:0.18em 0.55em;border-radius:0.55em;font-size:0.78em;line-height:1.2;font-weight:700;vertical-align:middle;white-space:nowrap;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.12);color:#fff;}.jellyfin-badge--last{background:rgba(155,89,182,0.25);border-color:rgba(155,89,182,0.45);}</style>');
    }

    // ------------------------------------------------------------------
    // Карточка библиотеки для строки "Мои медиатеки" на главном экране.
    // Широкая (16:9) обложка с названием библиотеки поверх — как на
    // главном экране веб-клиента Jellyfin. Клик открывает содержимое
    // библиотеки: обычную сетку (Фильмы/Сериалы/Мультфильмы и т.п.) или,
    // для библиотек типа boxsets (Франшизы/Коллекции), список папок.
    //
    // Важно: Lampa.Template.js() отдаёт jQuery-обёртку (как и в плагине
    // "Коллекции"), а не сырой DOM-элемент — у неё нет .querySelector,
    // только .find(). Раньше здесь ошибочно вызывался .querySelector,
    // из-за чего build() падал с исключением и Lampa молча откатывалась
    // на карточку по умолчанию (отсюда и вертикальная форма без обложки).
    // ------------------------------------------------------------------
    function JellyfinLibraryCard(data) {
        this.data = data;

        function findEl(root, selector) {
            try {
                var found = root && root.find ? root.find(selector) : null;
                if (found && found[0]) return found[0];
                if (found && found.nodeType === 1) return found;
            } catch (e0) {}
            return null;
        }

        this.build = function () {
            this.item = Lampa.Template.js('jellyfin_library_card');
            if (!this.item) return;

            this.item_dom = this.item[0] ? this.item[0] : (this.item.nodeType === 1 ? this.item : null);
            this.img_el = findEl(this.item, '.card__img');
            this.title_el = findEl(this.item, '.jf-lib-card__title');

            if (this.title_el) this.title_el.textContent = data.title || '';

            if (this.item.addEventListener) this.item.addEventListener('visible', this.visible.bind(this));
        };

        this.image = function () {
            var self = this;
            if (this.img_el) {
                this.img_el.onload = function () {
                    try {
                        if (self.item_dom) self.item_dom.classList.add('card--loaded');
                    } catch (e) {}
                };
                this.img_el.onerror = function () {
                    try {
                        var fallback = data.img_backdrop || '';
                        if (fallback && self.img_el.src !== fallback) {
                            self.img_el.src = fallback;
                        } else {
                            self.img_el.src = './img/img_load.svg';
                        }
                    } catch (e) {}
                };
            }
        };

        this.visible = function () {
            if (this.img_el) this.img_el.src = data.img || './img/img_load.svg';
            if (this.onVisible) this.onVisible(this.item, data);
        };

        this.create = function () {
            var self = this;
            this.build();
            if (!this.item) return;

            this.item.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.item, data); });
            this.item.addEventListener('hover:hover', function () { if (self.onHover) self.onHover(self.item, data); });
            this.item.addEventListener('hover:touch', function () { if (self.onTouch) self.onTouch(self.item, data); });
            this.item.addEventListener('hover:enter', function () {
                Lampa.Activity.push({
                    url: 'jellyfin://browse?parentId=' + encodeURIComponent(data.jellyfin_view_id || '') + '&kind=' + encodeURIComponent(data.kind || 'media') + '&title=' + encodeURIComponent(data.title || ''),
                    title: data.title || '',
                    component: (Jellyfin._componentsRegistered ? 'jellyfin_browse' : 'category'),
                    page: 1
                });
            });

            this.image();
        };

        this.destroy = function () {
            if (this.img_el) { this.img_el.onload = null; this.img_el.onerror = null; this.img_el.src = ''; }
            if (this.item && this.item.remove) this.item.remove();
            this.item = null;
        };

        this.render = function (js) { return js ? this.item : $(this.item); };
    }

    // ------------------------------------------------------------------
    // Карточка-"папка" для франшизы/коллекции (BoxSet) внутри библиотеки
    // типа boxsets. Обложку берёт напрямую у самого BoxSet'а — Jellyfin
    // сам собирает коллаж из постеров вложенных фильмов, если своя
    // обложка не задана, поэтому отдельно тянуть и раскладывать постеры
    // не нужно. Визуально — форма папки (вырез-язычок сверху слева, как
    // в плагине "Коллекции") + бейдж с количеством вложенных тайтлов.
    // Клик открывает обычную сетку фильмов/сериалов внутри этой франшизы/
    // коллекции.
    // ------------------------------------------------------------------
    function JellyfinFolderCard(data, kind) {
        this.data = data;
        this.kind = kind || 'media'; // 'boxset' для коллекций, 'media' для франшиз

        function findEl(root, selector) {
            try {
                var found = root && root.find ? root.find(selector) : null;
                if (found && found[0]) return found[0];
                if (found && found.nodeType === 1) return found;
            } catch (e0) {}
            return null;
        }

        this.build = function () {
            // Для коллекций используем вертикальный шаблон, для франшиз - горизонтальный
            var templateName = (this.kind === 'boxset') ? 'jellyfin_folder_card_vertical' : 'jellyfin_folder_card';
            this.item = Lampa.Template.js(templateName);
            if (!this.item) return;

            this.item_dom = this.item[0] ? this.item[0] : (this.item.nodeType === 1 ? this.item : null);
            this.img_el = findEl(this.item, '.jf-folder-card__img');
            this.badge_el = findEl(this.item, '.jf-folder-card__badge');
            this.title_el = findEl(this.item, '.card__title');

            if (this.title_el) this.title_el.textContent = data.title || '';

            if (this.badge_el) {
                var cnt = parseInt(data.child_count, 10) || 0;
                if (cnt > 0) {
                    this.badge_el.textContent = cnt > 99 ? '99+' : String(cnt);
                } else {
                    this.badge_el.style.display = 'none';
                }
            }

            if (this.item.addEventListener) this.item.addEventListener('visible', this.visible.bind(this));
        };

        this.image = function () {
            var self = this;
            if (this.img_el) {
                this.img_el.onload = function () {
                    try {
                        if (self.item_dom) self.item_dom.classList.add('card--loaded');
                    } catch (e) {}
                };
                this.img_el.onerror = function () { try { self.img_el.src = './img/img_load.svg'; } catch (e) {} };
            }
        };

        this.visible = function () {
            if (this.img_el) this.img_el.src = data.img || './img/img_load.svg';
            if (this.onVisible) this.onVisible(this.item, data);
        };

        this.create = function () {
            var self = this;
            this.build();
            if (!this.item) return;

            this.item.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.item, data); });
            this.item.addEventListener('hover:hover', function () { if (self.onHover) self.onHover(self.item, data); });
            this.item.addEventListener('hover:touch', function () { if (self.onTouch) self.onTouch(self.item, data); });
            this.item.addEventListener('hover:enter', function () {
                Lampa.Activity.push({
                    url: 'jellyfin://browse?parentId=' + encodeURIComponent(data.jellyfin_boxset_id || '') + '&kind=media&title=' + encodeURIComponent(data.title || ''),
                    title: data.title || '',
                    component: (Jellyfin._componentsRegistered ? 'jellyfin_browse' : 'category'),
                    page: 1
                });
            });

            this.image();
        };

        this.destroy = function () {
            if (this.img_el) { this.img_el.onload = null; this.img_el.onerror = null; this.img_el.src = ''; }
            if (this.item && this.item.remove) this.item.remove();
            this.item = null;
        };

        this.render = function (js) { return js ? this.item : $(this.item); };
    }


    function addJellyfinFoldersUi() {
        if (!Lampa.Template || !Lampa.Template.add) return;

        Lampa.Template.add('jellyfin_library_card',
            '<div class="card selector layer--visible layer--render jf-lib-card">' +
                '<div class="card__view">' +
                    '<img src="./img/img_load.svg" class="card__img">' +
                    '<div class="jf-lib-card__gradient"></div>' +
                    '<div class="jf-lib-card__title"></div>' +
                '</div>' +
                '<div class="card__title" style="display:none"></div>' +
            '</div>');

        // Горизонтальная карточка для франшиз (16:9)
        Lampa.Template.add('jellyfin_folder_card',
            '<div class="card selector layer--visible layer--render card--collection jf-folder-card jf-folder-card--horizontal">' +
                '<div class="card__view">' +
                    '<img src="./img/img_load.svg" class="card__img jf-folder-card__img">' +
                    '<div class="jf-folder-card__badge"></div>' +
                '</div>' +
                '<div class="card__title"></div>' +
            '</div>');

        // Вертикальная карточка для коллекций БЕЗ выреза (обычный прямоугольник)
        Lampa.Template.add('jellyfin_folder_card_vertical',
            '<div class="card selector layer--visible layer--render card--collection jf-folder-card jf-folder-card--vertical">' +
                '<div class="card__view">' +
                    '<img src="./img/img_load.svg" class="card__img jf-folder-card__img">' +
                    '<div class="jf-folder-card__badge"></div>' +
                '</div>' +
                '<div class="card__title"></div>' +
            '</div>');

        var css = '' +
            '.jf-lib-card{-webkit-flex:0 0 31.5%;flex:0 0 31.5%;width:31.5%;min-width:31.5%;max-width:31.5%;margin-right:1.2%;position:relative}' +
            '.jf-lib-card .card__view{padding-bottom:56.2% !important;border-radius:.8em !important;overflow:visible !important;position:relative;background-color:#2b2b2b}' +
            '.jf-lib-card .card__view::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:.8em;overflow:hidden;pointer-events:none}' +
            '.jf-lib-card .card__img{width:100%;height:100%;position:absolute;top:0;left:0;object-fit:cover;opacity:0;transition:opacity .2s ease;border-radius:.8em !important}' +
            '.jf-lib-card.card--loaded .card__img{opacity:1 !important}' +
            '.jf-lib-card__gradient{position:absolute;left:0;right:0;bottom:0;height:60%;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.75) 100%);pointer-events:none;border-radius:0 0 .8em .8em}' +
            '.jf-lib-card__title{position:absolute;left:0;right:0;bottom:0;padding:.7em 1em;color:#fff;font-size:1.15em;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.6)}' +
            '.jf-lib-card>.card__title{max-height:0 !important;overflow:hidden !important;padding:0 !important;margin:0 !important;visibility:hidden !important}' +
            // Горизонтальные карточки франшиз (16:9) - фикс для фокусной рамки
            '.jf-folder-card--horizontal{position:relative}' +
            '.jf-folder-card--horizontal .card__view{padding-bottom:56.25% !important;position:relative;border-radius:.8em !important;overflow:visible !important;background-color:#2b2b2b}' +
            '.jf-folder-card--horizontal .card__view::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:.8em;overflow:hidden;pointer-events:none}' +
            '.jf-folder-card--horizontal .jf-folder-card__img{width:100%;height:100%;position:absolute;top:0;left:0;object-fit:cover;opacity:0;transition:opacity .2s ease;border-radius:.8em !important}' +
            '.jf-folder-card--horizontal.card--loaded .jf-folder-card__img{opacity:1 !important}' +
            '.jf-folder-card--horizontal .jf-folder-card__badge{position:absolute;top:.5em;right:.5em;min-width:1.9em;height:1.9em;padding:0 .5em;border-radius:1em;background:#2f9bf0;color:#fff;font-size:.9em;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.5);z-index:5}' +
            '.jf-folder-card--horizontal .card__title{margin-top:.5em;text-align:center}' +
            // Вертикальные карточки коллекций БЕЗ выреза
            '.jf-folder-card--vertical{position:relative}' +
            '.jf-folder-card--vertical .card__view{padding-bottom:150%;position:relative;border-radius:.8em !important;overflow:visible !important;background-color:#3e3e3e}' +
            '.jf-folder-card--vertical .card__view::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:.8em;overflow:hidden;pointer-events:none}' +
            '.jf-folder-card--vertical .jf-folder-card__img{width:100%;height:100%;position:absolute;top:0;left:0;object-fit:cover;opacity:0;transition:opacity .2s ease;border-radius:.8em !important}' +
            '.jf-folder-card--vertical.card--loaded .jf-folder-card__img{opacity:1 !important}' +
            '.jf-folder-card--vertical .jf-folder-card__badge{position:absolute;top:.5em;right:.5em;min-width:1.9em;height:1.9em;padding:0 .5em;border-radius:1em;background:#2f9bf0;color:#fff;font-size:.9em;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.5);z-index:5}' +
            '.jf-folder-card--vertical .card__title{margin-top:.5em;text-align:center}' +
            'body.size--bigger .jf-lib-card{-webkit-flex-basis:31.5%;flex-basis:31.5%}';

        Lampa.Template.add('jellyfin_folders_css', '<style>' + css + '</style>');
        $('body').append(Lampa.Template.get('jellyfin_folders_css', {}, true));
    }

    function registerJellyfinComponents() {
        if (!Lampa || !Lampa.Component || !Lampa.Component.add) return;
        if (!Lampa.InteractionMain || !Lampa.InteractionCategory) return;
        if (Jellyfin._componentsRegistered) return;
        Jellyfin._componentsRegistered = true;

        // Главный экран Jellyfin: "Мои медиатеки" + ленты.
        Lampa.Component.add('jellyfin_main', function (object) {
            var comp = new Lampa.InteractionMain(object);
            comp.create = function () {
                var _this = this;
                this.activity.loader(true);
                Jellyfin.buildMainLines(function (lines) {
                    _this.build(lines);
                }, this.empty.bind(this));
                return this.render();
            };
            comp.onMore = function (data) {
                var url = data && (data.url || data.category);
                if (!url) return;
                // "Мои медиатеки" — нет отдельной страницы "показать всё"
                if (String(url).indexOf('jellyfin://libraries') === 0) return;
                Lampa.Activity.push({
                    url: url,
                    title: data.title || '',
                    component: 'category_full',
                    page: 1
                });
            };
            return comp;
        });

        // Плоская сетка: содержимое библиотеки или папки (BoxSet).
        Lampa.Component.add('jellyfin_browse', function (object) {
            var comp = new Lampa.InteractionCategory(object);
            comp.create = function () {
                var _this = this;
                Jellyfin.fetchBrowseData(object, function (data) {
                    _this.build(data);
                }, this.empty.bind(this));
            };
            comp.nextPageReuest = function (obj2, resolve, reject) {
                Jellyfin.fetchBrowseData(obj2, resolve.bind(comp), reject.bind(comp));
            };
            comp.cardRender = function (obj2, element, card) {
                if (element && element.jellyfin_boxset_id) {
                    card.onEnter = function () {
                        Lampa.Activity.push({
                            url: 'jellyfin://browse?parentId=' + encodeURIComponent(element.jellyfin_boxset_id) + '&kind=media&title=' + encodeURIComponent(element.title || ''),
                            title: element.title || '',
                            component: 'jellyfin_browse',
                            page: 1
                        });
                    };
                }
            };
            return comp;
        });
    }

    function init() {
        if (!window.Lampa) return setTimeout(init, 500);
        Lampa.SettingsApi.addComponent({ component: 'jellyfin_settings', name: 'Jellyfin', icon: getIcon() });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_server', type: 'input', values: '', 'default': JELLYFIN_SERVER }, field: { name: 'Адрес сервера', description: 'Например: https://myserver.example.com' } });
        Lampa.SettingsApi.addParam({
            component: 'jellyfin_settings',
            param: { name: 'jellyfin_auth_status', type: 'static' },
            field: { name: 'Статус авторизации', description: '' },
            onRender: function (item) {
                var server = '';
                var token = '';
                var uid = '';
                var type = '';

                try { server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, ''); } catch (e0) { server = ''; }
                try { token = String(sget('jellyfin_token', '') || ''); } catch (e1) { token = ''; }
                try { uid = String(sget('jellyfin_user_id', '') || ''); } catch (e2) { uid = ''; }
                try { type = String(sget('jellyfin_auth_type', '') || ''); } catch (e3) { type = ''; }

                var value = item.find('.settings-param__value');
                if (value.length) value.text(token ? 'Авторизован' : 'Не авторизован');

                var descr = item.find('.settings-param__descr');
                if (!descr.length) descr = $('<div class="settings-param__descr"></div>').appendTo(item);

                if (token) {
                    var parts = [];
                    if (server) parts.push('Сервер: ' + server);
                    if (uid) parts.push('UserId: ' + uid);
                    if (type) parts.push('Способ: ' + type);
                    descr.text(parts.join(' • ') || 'Токен сохранён');
                } else {
                    descr.text('Нет сохранённого токена. Войдите по логину/паролю или через "Быстрое подключение".');
                }
            }
        });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_user', type: 'input', values: '', 'default': JELLYFIN_USER }, field: { name: 'Логин', description: '' } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_pass', type: 'input', values: '', 'default': JELLYFIN_PASS }, field: { name: 'Пароль', description: '' } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_login' }, field: { name: 'Войти', description: 'Авторизоваться по логину и паролю' }, onChange: function () {
            var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
            var user = String(sget('jellyfin_user', '') || '');
            var pass = String(sget('jellyfin_pass', '') || '');
            if (!server) { Lampa.Noty.show('Jellyfin: заполните адрес сервера'); return; }
            if (!user || !pass) { Lampa.Noty.show('Jellyfin: заполните логин и пароль'); return; }
            Jellyfin.clearAuth();
            Lampa.Noty.show('Jellyfin: авторизация...');
            Jellyfin.authenticate(function () {
                Lampa.Noty.show('Jellyfin: успешно авторизован');
                try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (e0) {}
            });
        } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_quick_connect' }, field: { name: 'Быстрое подключение', description: 'Войти по коду (Quick Connect) без логина/пароля' }, onChange: function () { Jellyfin.quickConnectUI(); } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_lines_config' }, field: { name: 'Ленты Jellyfin', description: 'Порядок и видимость лент в разделе Jellyfin' }, onChange: function () { Jellyfin.configureLinesUI(); } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_logout' }, field: { name: 'Выйти', description: 'Удалить сохранённый токен Jellyfin' }, onChange: function () { Jellyfin.clearAuth(); try { Lampa.Noty.show('Jellyfin: токен очищен'); } catch (e0) {} } });

        // Настройка стиля иконки
        Lampa.SettingsApi.addParam({
            component: 'jellyfin_settings',
            param: { type: 'button', name: 'jellyfin_icon_style_btn' },
            field: { name: 'Иконка', description: 'Выбрать стиль иконки Jellyfin' },
            onChange: function () {
                Lampa.Select.show({
                    title: 'Иконка Jellyfin',
                    items: [
                        {
                            title: '<div style="display:flex;align-items:center;gap:.6em;line-height:1.2"><svg style="width:1.4em;height:1.4em;flex-shrink:0;display:block" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="jf_sel_g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#AA5CC3"/><stop offset="100%" stop-color="#00A4DC"/></linearGradient></defs><path fill="url(#jf_sel_g)" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z"/></svg>Градиент</div>',
                            val: 'gradient'
                        },
                        {
                            title: '<div style="display:flex;align-items:center;gap:.6em;line-height:1.2"><svg style="width:1.4em;height:1.4em;flex-shrink:0;display:block" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#ffffff" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z"/></svg>Белый</div>',
                            val: 'white'
                        }
                    ],
                    onSelect: function (item) {
                        Lampa.Storage.set('jellyfin_icon_style', item.val);
                        try { $('.menu__item[data-action="jellyfin"] .menu__ico').html(getIcon()); } catch(e0) {}
                        try { Lampa.Controller.toggle('settings'); } catch(e1) {}
                    },
                    onBack: function () {
                        try { Lampa.Controller.toggle('settings'); } catch(e0) {}
                    }
                });
            }
        });
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' || e.type === 'build') {
                var movie = e.data.movie || e.object;
                if (movie) setTimeout(function() { addJellyfinButton(movie); }, 200);
            }
        });

        addJellyfinFoldersUi();
        registerJellyfinComponents();

        Jellyfin.patchApi();

        Lampa.Listener.follow('menu', function (e) {
            try {
                if (!e || e.type !== 'start' || !e.body) return;
                var list = $('.menu__list:eq(0)', e.body);
                if (!list.length) return;
                if (list.find('[data-action="jellyfin"]').length) return;

                var item = $('<li class="menu__item selector" data-action="jellyfin"><div class="menu__ico"></div><div class="menu__text">Jellyfin</div></li>');
                item.find('.menu__ico').html(getIcon());
                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: Jellyfin._componentsRegistered ? 'jellyfin_main' : 'category',
                        title: 'Jellyfin',
                        url: 'jellyfin://main',
                        page: 1,
                        source: 'tmdb'
                    });
                });
                list.append(item);
            } catch (e0) {}
        });
    }
    init();
})();
