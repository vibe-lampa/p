(function () {
	'use strict';

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

		var STORAGE_SORT = 'head_filter_sort';
		var STORAGE_HIDE = 'head_filter_hide';

		var STORAGE_DEFAULT_SORT = 'head_filter_default_sort';
		var STORAGE_DEFAULT_HIDE = 'head_filter_default_hide';

		var CONTAINERS = ['.head__actions', '.head__body'];

		var IGNORE_SELECTOR = '.head__logo-icon, .head__menu-icon, .head__title, .head__actions, ' +
			'.head__markers, .head__time, .head__split';

		var ARROW_PATTERN = /arrow/i;

		function looksLikeNativeArrow($el) {
			return ARROW_PATTERN.test($el.attr('class') || '');
		}

		var STATE_CLASSES = ['selector', 'hide', 'hidden', 'focus', 'active', 'hover', 'traverse', 'hf--hidden'];

		var KNOWN = {
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

		var NAME_NOISE_WORDS = ['auto', 'head', 'action', 'item', 'icon', 'btn', 'button'];

		var NAME_ABBREVIATIONS = {'jf': 'Jellyfin'};

		function titleCase(str) {
			return str.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
		}

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

		function fingerprint($el) {
			var cls = ($el.attr('class') || '').split(/\s+/).filter(function (c) {
				return c && STATE_CLASSES.indexOf(c) === -1;
			});
			return 'auto-' + (cls.join('-') || $el.prop('tagName').toLowerCase());
		}

		function knownIdFor($el) {
			var found = null;
			Object.keys(KNOWN).forEach(function (id) {
				if (found) return;
				if ($el.is(KNOWN[id].selector)) found = id;
			});
			return found;
		}

		function discover() {
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

		function captureDefaultsIfNeeded(items) {
			if (Lampa.Storage.get(STORAGE_DEFAULT_SORT, null) !== null) return;

			var sort = [];
			var hidden = [];

			items.forEach(function (item) {
				sort.push(item.id);
				if (item.el.hasClass('hide') || item.el.css('display') === 'none') hidden.push(item.id);
			});

			Lampa.Storage.set(STORAGE_DEFAULT_SORT, sort);
			Lampa.Storage.set(STORAGE_DEFAULT_HIDE, hidden);
		}

		function resetToDefaults() {
			var sort = Lampa.Storage.get(STORAGE_DEFAULT_SORT, []);
			var hidden = Lampa.Storage.get(STORAGE_DEFAULT_HIDE, []);

			Lampa.Storage.set(STORAGE_SORT, sort);
			Lampa.Storage.set(STORAGE_HIDE, hidden);

			apply();

			try {
				Lampa.Noty.show(Lampa.Lang.translate('head_filter_reset_done'));
			} catch (e) {}
		}

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
				var ordered = sort.filter(function (id) {
					return group.items.some(function (item) {
						return item.id === id;
					});
				});
				var byId = {};
				group.items.forEach(function (item) {
					byId[item.id] = item.el;
				});

				ordered.forEach(function (id) {
					if (byId[id]) byId[id].appendTo(group.parentNode);
				});
			});
		}

		function hide(items) {
			var hidden = Lampa.Storage.get(STORAGE_HIDE, []);
			items.forEach(function (item) {
				item.el.toggleClass('hf--hidden', hidden.indexOf(item.id) !== -1);
			});
		}

		function apply() {
			var items = discover();
			captureDefaultsIfNeeded(items);
			order(items);
			hide(items);
		}

		function injectStyle() {
			if (document.getElementById('head-filter-style')) return;
			var style = document.createElement('style');
			style.id = 'head-filter-style';
			style.innerHTML =
				'.hf--hidden { display: none !important; }' +
				'.menu-edit-list__item { display: flex !important; align-items: center !important; }' +
				'.menu-edit-list__icon { flex: 0 0 auto !important; }' +
				'.menu-edit-list__title { flex: 1 1 auto !important; min-width: 0 !important; ' +
					'white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; ' +
					'margin-right: 1em !important; }' +
				'.menu-edit-list__move, .menu-edit-list__toggle { flex: 0 0 auto !important; }';
			document.head.appendChild(style);
		}

		function openEditor() {
			var items = discover();
			captureDefaultsIfNeeded(items);
			order(items);
			hide(items);

			var list = $('<div class="menu-edit-list"></div>');

			items.forEach(function (item) {
				var isHidden = item.el.hasClass('hf--hidden');

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

		var syncTimer;

		function scheduleSync() {
			clearTimeout(syncTimer);
			syncTimer = setTimeout(function () {
				var items = discover();

				var sort = Lampa.Storage.get(STORAGE_SORT, []);

				var defaultSort = Lampa.Storage.get(STORAGE_DEFAULT_SORT, []);
				var defaultHide = Lampa.Storage.get(STORAGE_DEFAULT_HIDE, []);
				var defaultChanged = false;

				items.forEach(function (item) {
					if (sort.indexOf(item.id) === -1) sort.push(item.id);

					if (defaultSort.indexOf(item.id) === -1) {
						defaultSort.push(item.id);
						if (item.el.hasClass('hide') || item.el.css('display') === 'none') defaultHide.push(item.id);
						defaultChanged = true;
					}
				});

				Lampa.Storage.set(STORAGE_SORT, sort);

				if (defaultChanged) {
					Lampa.Storage.set(STORAGE_DEFAULT_SORT, defaultSort);
					Lampa.Storage.set(STORAGE_DEFAULT_HIDE, defaultHide);
				}

				order(items);
				hide(items);
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

		migrateOldSettings();
		injectStyle();

		setTimeout(function () {
			apply();
			observe();
		}, 1000);

		Lampa.Listener.follow('activity', function (event) {
			if (event.type == 'start' || event.type == 'complite') {
				setTimeout(function () {
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
