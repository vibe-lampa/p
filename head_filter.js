(function () {
	'use strict';

	// ---------------------------------------------------------------------
	// Localization
	// ---------------------------------------------------------------------
	Lampa.Lang.add({
		search: {
			ru: 'Поиск',
			en: 'Search',
			uk: 'Пошук',
			zh: '搜索'
		},
		settings: {
			ru: 'Настройки',
			en: 'Settings',
			uk: 'Налаштування',
			zh: '设置'
		},
		premium: {
			ru: 'Премиум',
			en: 'Premium',
			uk: 'Преміум',
			zh: '高级'
		},
		profile: {
			ru: 'Профиль',
			en: 'Profile',
			uk: 'Профіль',
			zh: '个人资料'
		},
		feed: {
			ru: 'Новости',
			en: 'Feed',
			uk: 'Новини',
			zh: '饲料'
		},
		notice: {
			ru: 'Уведомления',
			en: 'Notifications',
			uk: 'Сповіщення',
			zh: '通知'
		},
		broadcast: {
			ru: 'Вещание',
			en: 'Broadcast',
			uk: 'Мовлення',
			zh: '广播'
		},
		fullscreen: {
			ru: 'Полноэкранный режим',
			en: 'Fullscreen mode',
			uk: 'Повноекранний режим',
			zh: '全屏模式'
		},
		reload: {
			ru: 'Обновление страницы',
			en: 'Page reload',
			uk: 'Оновлення сторінки',
			zh: '页面重新加载'
		},
		blackfriday: {
			ru: 'Черная пятница',
			en: 'Black Friday',
			uk: 'Чорна п’ятниця',
			zh: '黑色星期五'
		},
		name_menu: {
			ru: 'Отображать в шапке',
			en: 'Display in header',
			uk: 'Відображати у шапці',
			zh: '在标题中显示'
		},
		name_plugin: {
			ru: 'Настройка шапки',
			en: 'Header customization',
			uk: 'Налаштування шапки',
			zh: '帽子设置'
		},
		plugin_description: {
			ru: 'Плагин для настройки шапки',
			en: 'Plugin for customizing the header',
			uk: 'Плагін для налаштування шапки',
			zh: '用于配置上限的插件'
		},
		head_filter_edit_button: {
			ru: 'Порядок и видимость иконок',
			en: 'Order and visibility of icons',
			uk: 'Порядок і видимість іконок',
			zh: '图标顺序和可见性'
		},
		head_filter_edit_title: {
			ru: 'Иконки шапки',
			en: 'Header icons',
			uk: 'Іконки шапки',
			zh: '页眉图标'
		},
		head_filter_unknown_icon: {
			ru: 'Иконка плагина',
			en: 'Plugin icon',
			uk: 'Іконка плагіна',
			zh: '插件图标'
		},
		head_filter_reset_button: {
			ru: 'Сбросить позиции иконок',
			en: 'Reset icon positions',
			uk: 'Скинути позиції іконок',
			zh: '重置图标位置'
		},
		head_filter_reset_done: {
			ru: 'Позиции иконок сброшены',
			en: 'Icon positions have been reset',
			uk: 'Позиції іконок скинуто',
			zh: '图标位置已重置'
		},
		back: {
			ru: 'Назад',
			en: 'Back',
			uk: 'Назад',
			zh: '返回'
		}
	});

	function startPlugin() {
		var manifest = {
			type: 'other',
			version: '0.3.0',
			name: Lampa.Lang.translate('name_plugin'),
			description: Lampa.Lang.translate('plugin_description'),
			component: 'head_filter'
		};
		Lampa.Manifest.plugins = manifest;

		// -------------------------------------------------------------------
		// Storage keys
		// -------------------------------------------------------------------
		// head_filter_sort -> flat array of icon ids, in the order the user
		//                     wants them to appear (only compared within
		//                     icons that actually share the same DOM parent,
		//                     see order() below).
		// head_filter_hide -> array of icon ids that should be hidden.
		var STORAGE_SORT = 'head_filter_sort';
		var STORAGE_HIDE = 'head_filter_hide';
		var STORAGE_DYNAMIC = 'head_filter_dynamic';

		// Container(s) that plugins normally append their head icons into.
		// ".head__actions" is the official slot; some builds also render
		// extra buttons straight into ".head__body". Both are scanned.
		var CONTAINERS = ['.head__actions', '.head__body'];

		// Elements that are structural / native and must never be listed as
		// manageable "icons", even though they live inside one of the
		// CONTAINERS above — the clock, the divider, status markers, etc.
		var IGNORE_SELECTOR = '.head__logo-icon, .head__menu-icon, .head__title, .head__actions, ' +
			'.head__markers, .head__time, .head__split';

		// Heuristic filter for native navigation arrows (episode/page
		// scroll controls some builds inject near the header) — these
		// aren't "icons" a person would want to hide/reorder either.
		var ARROW_PATTERN = /arrow/i;

		function looksLikeNativeArrow($el) {
			return ARROW_PATTERN.test($el.attr('class') || '');
		}

		// Classes that are pure UI/interaction state and must be stripped
		// out before turning an element's class list into a stable id.
		var STATE_CLASSES = ['selector', 'hide', 'hidden', 'focus', 'active', 'hover', 'traverse'];

		// Known, "official" icons this plugin has always understood — kept
		// so their labels stay nicely translated instead of falling back
		// to an auto-generated name. Anything not in this list is picked
		// up automatically from the DOM. This is only used for naming —
		// discovery order always follows the real DOM order (see discover()).
		var KNOWN = {
			'back': {name: Lampa.Lang.translate('back'), selector: '.head__backward'},
			'search': {name: Lampa.Lang.translate('search'), selector: '.open--search'},
			'settings': {name: Lampa.Lang.translate('settings'), selector: '.open--settings'},
			'premium': {name: Lampa.Lang.translate('premium'), selector: '.open--premium'},
			'profile': {name: Lampa.Lang.translate('profile'), selector: '.open--profile'},
			'feed': {name: Lampa.Lang.translate('feed'), selector: '.open--feed'},
			'notice': {name: Lampa.Lang.translate('notice'), selector: '.notice--icon'},
			'broadcast': {name: Lampa.Lang.translate('broadcast'), selector: '.open--broadcast'},
			'fullscreen': {name: Lampa.Lang.translate('fullscreen'), selector: '.full--screen, .full-screen'},
			'reload': {name: Lampa.Lang.translate('reload'), selector: '.m-reload-screen'},
			'blackfriday': {name: Lampa.Lang.translate('blackfriday'), selector: '.black-friday__button'}
		};

		// One-time migration from the old per-icon boolean settings
		// (head_filter_show_search = true/false, etc.) so people upgrading
		// don't lose their existing choices.
		function migrateOldSettings() {
			if (Lampa.Storage.get(STORAGE_SORT, null) !== null) return;

			var hide = [];
			Object.keys(KNOWN).forEach(function (id) {
				var old = Lampa.Storage.get('head_filter_show_' + id, true);
				if (old === false) hide.push(id);
			});

			Lampa.Storage.set(STORAGE_SORT, []);
			Lampa.Storage.set(STORAGE_HIDE, hide);
		}

		// Words that only describe the plugin's generic wrapper markup
		// (every header icon has them) and carry no useful naming info.
		var NAME_NOISE_WORDS = ['auto', 'head', 'action', 'item', 'icon', 'btn', 'button'];

		// A couple of well-known abbreviations worth spelling out.
		var NAME_ABBREVIATIONS = {'jf': 'Jellyfin'};

		function titleCase(str) {
			return str.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
		}

		// Best-effort human name for an icon we don't otherwise recognize —
		// tries the sprite reference plugins commonly use
		// (<use xlink:href="#sprite-something">), then falls back to
		// cleaning up the generated id itself. Not a real substitute for
		// knowing which plugin/file added the icon (the DOM doesn't carry
		// that), but far more readable than the raw auto-id.
		function guessNameFrom($el, id) {
			var spriteHref = $el.find('use').attr('xlink:href') || $el.find('use').attr('href');
			var source = spriteHref ? spriteHref.replace('#sprite-', '') : id.replace(/^auto-/, '');

			var words = source.split(/[-_.]+/).filter(function (word) {
				return word && NAME_NOISE_WORDS.indexOf(word.toLowerCase()) === -1;
			}).map(function (word) {
				return NAME_ABBREVIATIONS[word.toLowerCase()] || word;
			});

			var cleaned = words.join(' ').trim();
			return cleaned ? titleCase(cleaned) : (Lampa.Lang.translate('head_filter_unknown_icon') + ' (' + id + ')');
		}

		// -------------------------------------------------------------------
		// Discovery
		// -------------------------------------------------------------------
		function fingerprint($el) {
			var cls = ($el.attr('class') || '').split(/\s+/).filter(function (c) {
				return c && STATE_CLASSES.indexOf(c) === -1;
			});
			return 'auto-' + (cls.join('-') || $el.prop('tagName').toLowerCase());
		}

		// Looks up an element against the KNOWN dictionary, purely for a
		// nice display name — never used to decide discovery order.
		function knownIdFor($el) {
			var found = null;
			Object.keys(KNOWN).forEach(function (id) {
				if (found) return;
				if ($el.is(KNOWN[id].selector)) found = id;
			});
			return found;
		}

		// Returns an array of {id, el, name, known} for every icon this
		// plugin currently manages, in real DOM/document order — this is
		// what makes "default position on load" behave correctly, since
		// nothing here re-sequences items based on a fixed dictionary.
		function discoverCandidates() {
			var result = [];
			var seenNodes = [];

			function alreadySeen(node) {
				return seenNodes.indexOf(node) !== -1;
			}

			CONTAINERS.forEach(function (sel) {
				$(sel).each(function () {
					$(this).children().each(function () {
						var node = this;
						var $el = $(node);

						if (alreadySeen(node)) return;
						if ($el.is(IGNORE_SELECTOR)) return;
						if (looksLikeNativeArrow($el)) return;

						var id = $el.attr('data-hf-id');
						var known = knownIdFor($el);

						if (!id) id = known || fingerprint($el);
						$el.attr('data-hf-id', id);

						if (alreadySeen(node)) return;
						seenNodes.push(node);

						result.push({
							id: id,
							el: $el,
							name: known ? KNOWN[known].name :
								($el.attr('title') || $el.attr('data-name') || guessNameFrom($el, id)),
							known: !!known
						});
					});
				});
			});

			return result;
		}

		var warmupUntil = Date.now() + 3000;
		var dynamic = null;
		var dynamicState = {};

		function loadDynamic() {
			if (dynamic) return dynamic;
			dynamic = {};
			var stored = Lampa.Storage.get(STORAGE_DYNAMIC, []);
			if (Array.isArray(stored)) {
				stored.forEach(function (id) {
					dynamic[id] = true;
				});
			}
			var removedKnown = false;
			Object.keys(KNOWN).forEach(function (id) {
				if (dynamic[id]) {
					delete dynamic[id];
					removedKnown = true;
				}
			});
			if (removedKnown) persistDynamic();
			return dynamic;
		}

		function persistDynamic() {
			if (!dynamic) return;
			Lampa.Storage.set(STORAGE_DYNAMIC, Object.keys(dynamic));
		}

		function isVisibleElement(el) {
			if (!el) return false;
			try {
				if (el.classList && (el.classList.contains('hide') || el.classList.contains('hidden'))) return false;
			} catch (e) {}

			try {
				var st = el.style || {};
				if (st.display === 'none' || st.visibility === 'hidden') return false;
			} catch (e) {}

			try {
				if (el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length)) return true;
			} catch (e) {}

			try {
				if (window.getComputedStyle) {
					var cs = window.getComputedStyle(el);
					if (!cs) return true;
					if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
				}
			} catch (e) {}

			return true;
		}

		function updateDynamic(items) {
			loadDynamic();
			var now = Date.now();
			var ids = items.map(function (item) { return item.id; });

			if (now >= warmupUntil) {
				Object.keys(dynamicState).forEach(function (id) {
					if (KNOWN[id]) return;
					if (ids.indexOf(id) === -1) dynamicState[id].missing = true;
				});
			}

			items.forEach(function (item) {
				var id = item.id;
				if (item.known) return;
				if (!dynamicState[id]) dynamicState[id] = {visible: false, hidden: false, missing: false};

				var el = item.el && item.el.get ? item.el.get(0) : null;
				if (isVisibleElement(el)) dynamicState[id].visible = true;
				else dynamicState[id].hidden = true;
			});

			var changed = false;
			var newDynamic = [];
			Object.keys(dynamicState).forEach(function (id) {
				if (dynamic[id]) return;
				if (KNOWN[id]) return;
				var st = dynamicState[id];
				if (st.visible && (st.hidden || st.missing)) {
					dynamic[id] = true;
					newDynamic.push(id);
					changed = true;
				}
			});

			if (changed) {
				try {
					var hide = Lampa.Storage.get(STORAGE_HIDE, []);
					var sort = Lampa.Storage.get(STORAGE_SORT, []);
					var changedHide = false;
					var changedSort = false;

					newDynamic.forEach(function (id) {
						var hi = hide.indexOf(id);
						if (hi !== -1) {
							hide.splice(hi, 1);
							changedHide = true;
						}
						var si = sort.indexOf(id);
						if (si !== -1) {
							sort.splice(si, 1);
							changedSort = true;
						}
					});

					if (changedHide) Lampa.Storage.set(STORAGE_HIDE, hide);
					if (changedSort) Lampa.Storage.set(STORAGE_SORT, sort);
				} catch (e) {}

				newDynamic.forEach(function (id) {
					for (var i = 0; i < items.length; i++) {
						if (items[i].id !== id) continue;
						try {
							if (items[i].el && items[i].el.attr && items[i].el.attr('data-hf-hidden') == '1') {
								items[i].el.attr('data-hf-hidden', null);
								items[i].el.show();
							}
						} catch (e) {}
						break;
					}
				});

				persistDynamic();
			}
		}

		function discoverStable() {
			var items = discoverCandidates();
			updateDynamic(items);
			loadDynamic();
			return items.filter(function (item) {
				return !dynamic[item.id];
			});
		}

		// Reset just clears the plugin's own two storage keys, without
		// touching anything else in Lampa's storage. Once both are empty,
		// order() has nothing to reorder by and hide() has nothing to hide,
		// so icons fall back to the natural DOM order untouched.
		var defaultSnapshots = [];

		function captureDefaultOrder() {
			defaultSnapshots = [];
			CONTAINERS.forEach(function (sel) {
				$(sel).each(function () {
					defaultSnapshots.push({
						parent: this,
						children: Array.prototype.slice.call(this.children)
					});
				});
			});
		}

		function restoreDefaultOrder() {
			defaultSnapshots.forEach(function (snap) {
				if (!snap || !snap.parent) return;
				if (!document.contains(snap.parent)) return;

				var parent = snap.parent;
				var current = Array.prototype.slice.call(parent.children);
				var inSnap = snap.children.slice();

				var snapSet = [];
				inSnap.forEach(function (node) {
					if (node && node.parentNode === parent) snapSet.push(node);
				});

				var rest = current.filter(function (node) {
					return snapSet.indexOf(node) === -1;
				});

				snapSet.concat(rest).forEach(function (node) {
					parent.appendChild(node);
				});
			});
		}

		function resetToDefaults() {
			restoreDefaultOrder();
			Lampa.Storage.set(STORAGE_SORT, []);
			Lampa.Storage.set(STORAGE_HIDE, []);
			Lampa.Storage.set(STORAGE_DYNAMIC, []);

			try {
				Lampa.Noty.show(Lampa.Lang.translate('head_filter_reset_done'));
			} catch (e) {}

			setTimeout(function () {
				try {
					window.location.reload();
				} catch (e) {}
			}, 50);
		}

		// -------------------------------------------------------------------
		// Apply saved order / visibility to the real header
		// -------------------------------------------------------------------
		// Icons are only reordered relative to siblings that share the same
		// DOM parent — this lets the icon row itself be freely rearranged
		// without dragging structural pieces (clock, divider) out of the
		// slot the app's own layout expects them in.
		function order(items) {
			var sort = Lampa.Storage.get(STORAGE_SORT, []);
			if (!sort.length) return;

			var groups = [];
			items.forEach(function (item) {
				var parentNode = item.el.parent().get(0);
				var group = null;

				for (var i = 0; i < groups.length; i++) {
					if (groups[i].parentNode === parentNode) {
						group = groups[i];
						break;
					}
				}
				if (!group) {
					group = {parentNode: parentNode, items: []};
					groups.push(group);
				}
				group.items.push(item);
			});

			groups.forEach(function (group) {
				var parent = group.parentNode;
				var byId = {};
				group.items.forEach(function (item) {
					byId[item.id] = item.el.get(0);
				});

				var managedIds = group.items.map(function (item) { return item.id; });
				var desiredIds = sort.filter(function (id) { return managedIds.indexOf(id) !== -1; });
				managedIds.forEach(function (id) {
					if (desiredIds.indexOf(id) === -1) desiredIds.push(id);
				});

				var desiredNodes = desiredIds.map(function (id) { return byId[id]; }).filter(Boolean);
				var desiredIndex = 0;

				var currentChildren = Array.prototype.slice.call(parent.children);
				currentChildren.forEach(function (child) {
					var id = child && child.getAttribute ? child.getAttribute('data-hf-id') : null;
					if (id && byId[id]) {
						if (desiredNodes[desiredIndex]) parent.appendChild(desiredNodes[desiredIndex++]);
					} else {
						parent.appendChild(child);
					}
				});

				while (desiredIndex < desiredNodes.length) {
					parent.appendChild(desiredNodes[desiredIndex++]);
				}
			});
		}

		// Same show()/hide() approach the old plugin used, just driven off
		// the discovered item list instead of a fixed selector dictionary.
		function showHideElement($el, show) {
			if (show) {
				try { $el.attr('data-hf-hidden', null); } catch (e) {}
				$el.show();
			} else {
				try { $el.attr('data-hf-hidden', '1'); } catch (e) {}
				$el.hide();
			}
		}

		function hide(items) {
			var hidden = Lampa.Storage.get(STORAGE_HIDE, []);
			items.forEach(function (item) {
				showHideElement(item.el, hidden.indexOf(item.id) === -1);
			});
		}

		var ignoreMutationsUntil = 0;

		function apply() {
			ignoreMutationsUntil = Date.now() + 100;
			var candidates = discoverCandidates();
			updateDynamic(candidates);
			loadDynamic();

			var items = candidates.filter(function (item) {
				return !dynamic[item.id];
			});
			order(items);
			hide(items);
		}

		// -------------------------------------------------------------------
		// CSS for the hidden state
		// -------------------------------------------------------------------
		function injectStyle() {
			if (document.getElementById('head-filter-style')) return;
			var style = document.createElement('style');
			style.id = 'head-filter-style';
			style.innerHTML =
				'.menu-edit-list__item { display: flex !important; align-items: center !important; }' +
				'.menu-edit-list__icon { flex: 0 0 auto !important; }' +
				'.menu-edit-list__title { flex: 1 1 auto !important; min-width: 0 !important; ' +
					'white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; ' +
					'margin-right: 1em !important; }' +
				'.menu-edit-list__move, .menu-edit-list__toggle { flex: 0 0 auto !important; }';
			document.head.appendChild(style);
		}

		// -------------------------------------------------------------------
		// Editor UI — same look & interaction pattern as Lampa's built-in
		// menu editor, but with left/right move arrows since the header is
		// a horizontal row instead of a vertical list.
		// -------------------------------------------------------------------
		function openEditor() {
			var items = discoverStable();
			order(items);
			hide(items);

			var list = $('<div class="menu-edit-list"></div>');
			var hiddenIds = Lampa.Storage.get(STORAGE_HIDE, []);

			items.forEach(function (item) {
				var isHidden = hiddenIds.indexOf(item.id) !== -1;

				var row = $(
					'<div class="menu-edit-list__item">' +
						'<div class="menu-edit-list__icon"></div>' +
						'<div class="menu-edit-list__title">' + item.name + '</div>' +
						'<div class="menu-edit-list__move move-up selector">' +
							'<svg width="14" height="22" viewBox="0 0 14 22" fill="none" xmlns="http://www.w3.org/2000/svg">' +
								'<path d="M12 2L3 11L12 20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
							'</svg>' +
						'</div>' +
						'<div class="menu-edit-list__move move-down selector">' +
							'<svg width="14" height="22" viewBox="0 0 14 22" fill="none" xmlns="http://www.w3.org/2000/svg">' +
								'<path d="M2 2L11 11L2 20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
							'</svg>' +
						'</div>' +
						'<div class="menu-edit-list__toggle toggle selector">' +
							'<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
								'<rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/>' +
								'<path d="M7.44873 12.9658L10.8179 16.3349L18.1269 9.02588" stroke="currentColor" stroke-width="3" class="dot" opacity="' + (isHidden ? 0 : 1) + '" stroke-linecap="round"/>' +
							'</svg>' +
						'</div>' +
					'</div>'
				);

				row.data('hf-id', item.id);
				row.find('.menu-edit-list__icon').append(item.el.clone().removeAttr('data-hf-id').html());

				if (isHidden) row.addClass('hf-row--hidden');

				row.find('.move-up').on('hover:enter', function () {
					var prev = row.prev();
					if (prev.length) row.insertBefore(prev);
				});

				row.find('.move-down').on('hover:enter', function () {
					var next = row.next();
					if (next.length) row.insertAfter(next);
				});

				row.find('.toggle').on('hover:enter', function () {
					row.toggleClass('hf-row--hidden');
					row.find('.dot').attr('opacity', row.hasClass('hf-row--hidden') ? 0 : 1);
				});

				list.append(row);
			});

			function persist() {
				var sort = [];
				var hidden = [];

				list.find('.menu-edit-list__item').each(function () {
					var id = $(this).data('hf-id');
					sort.push(id);
					if ($(this).hasClass('hf-row--hidden')) hidden.push(id);
				});

				Lampa.Storage.set(STORAGE_SORT, sort);
				Lampa.Storage.set(STORAGE_HIDE, hidden);

				apply();
			}

			Lampa.Modal.open({
				title: Lampa.Lang.translate('head_filter_edit_title'),
				html: list,
				size: 'small',
				scroll_to_center: true,
				onBack: function () {
					Lampa.Modal.close();
					persist();
					Lampa.Controller.toggle('settings_component');
				}
			});
		}

		// -------------------------------------------------------------------
		// Watch for icons plugins add/remove after startup
		// -------------------------------------------------------------------
		var syncTimer;

		function scheduleSync() {
			if (Date.now() < ignoreMutationsUntil) return;
			clearTimeout(syncTimer);
			syncTimer = setTimeout(function () {
				apply();
			}, 400);
		}

		function observe() {
			if (!window.MutationObserver) return;

			CONTAINERS.forEach(function (sel) {
				var node = document.querySelector(sel);
				if (!node) return;

				var observer = new MutationObserver(scheduleSync);
				observer.observe(node, {childList: true});
			});
		}

		// -------------------------------------------------------------------
		// Settings entry point
		// -------------------------------------------------------------------
		Lampa.Template.add('settings_head_filter', '<div></div>');

		Lampa.SettingsApi.addParam({
			component: 'interface',
			param: {
				type: 'button'
			},
			field: {
				name: Lampa.Lang.translate('name_plugin'),
				description: Lampa.Lang.translate('plugin_description')
			},
			onChange: function () {
				Lampa.Settings.create('head_filter', {
					onBack: function () {
						Lampa.Settings.create('interface');
					}
				});
			}
		});

		Lampa.SettingsApi.addParam({
			component: 'head_filter',
			param: {
				type: 'title'
			},
			field: {
				name: Lampa.Lang.translate('name_menu')
			}
		});

		Lampa.SettingsApi.addParam({
			component: 'head_filter',
			param: {
				type: 'button'
			},
			field: {
				name: Lampa.Lang.translate('head_filter_edit_button')
			},
			onChange: function () {
				openEditor();
			}
		});

		Lampa.SettingsApi.addParam({
			component: 'head_filter',
			param: {
				type: 'button'
			},
			field: {
				name: Lampa.Lang.translate('head_filter_reset_button')
			},
			onChange: function () {
				resetToDefaults();
			}
		});

		// -------------------------------------------------------------------
		// Boot
		// -------------------------------------------------------------------
		migrateOldSettings();
		injectStyle();

		setTimeout(function () {
			captureDefaultOrder();
			apply();
			observe();
		}, 1000);

		Lampa.Listener.follow('activity', function (event) {
			if (event.type == 'start' || event.type == 'complite') {
				setTimeout(function () {
					captureDefaultOrder();
					apply();
					observe();
				}, 500);
			}
		});
	}

	if (window.appready) {
		startPlugin();
	} else {
		Lampa.Listener.follow('app', function (e) {
			if (e.type == 'ready') {
				startPlugin();
			}
		});
	}
})();
