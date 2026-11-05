/**
 * Browser half of the DeepSeek status pill.
 *
 * The pill lives in the Desktop window caption, immediately to the right of the
 * Desktop-owned 应用 / 编辑 menus: a rounded box with one indicator light and the
 * current service state. Hovering it, or focusing it with the keyboard, opens a
 * panel with the detail behind that state — the newest status feed entry, its
 * incident status, affected components, the feed time, and any error this client
 * or the Host hit while reading the feed.
 *
 * Why the caption rather than a Slot
 * ----------------------------------
 * `shell.leading` belongs to the sidebar's window-chrome controls and
 * `shell.overlay` sits below the caption, so neither can host an element that
 * must appear *inside* the Windows caption next to the Desktop menus. The
 * Desktop preload (not a plugin) owns those menus: it appends a fixed
 * `[data-windows-menu]` element to `document.body` and publishes
 * `--dsh-windows-titlebar-height`. This plugin therefore mounts one fixed
 * element into the same chrome strip and anchors it to that element's right
 * edge. It is the one deliberate exception to "render inside a Slot", and it
 * only appears in Desktop where the caption marker exists.
 *
 * Data comes from this plugin's Host route (`/deepseek-status/feed`), which reads
 * the DeepSeek status service's Atom feed. Styling uses `--dsw-alias-*` theme
 * tokens only, and no Harness Client package is imported.
 */

window.__ModuleLoader__.load({
  id: 'dsh-deepseek-status-pill',
  factory: (require) => {
    /** Localization namespace owned by `apply`. */
    const NS = 'deepseek-status-pill';

    /** Host route that republishes the Atom snapshot. */
    const ROUTE = '/deepseek-status/feed';

    /** Custom header the Host route requires; non-simple, so a foreign page
     * cannot read the snapshot without a pre-flight this server never answers. */
    const GATE_HEADER = 'x-dsh-deepseek-status';

    /** Client poll interval; the Host caches for less than this. */
    const REFRESH_MS = 60_000;

    /** Deadline of one Host route request. */
    const REQUEST_TIMEOUT_MS = 12_000;

    /** Status words the feed publishes, in the user's language. */
    const ZH = {
      checking: '检查中…',
      operational: '服务正常',
      incident: '服务异常',
      unavailable: '状态获取失败',
      title: 'DeepSeek 服务状态',
      status: '状态',
      recent: '最近事件',
      incidentTitle: '最新事件',
      incidentStatus: '事件状态',
      components: '影响组件',
      detail: '详情',
      error: '错误',
      lastSuccess: '上次成功',
      updated: '更新于',
      source: '数据来源',
      noIncident: '最近没有进行中的故障，服务正常',
      resolved: '已解决',
      investigating: '调查中',
      identified: '已定位',
      monitoring: '观察中',
      scheduled: '计划维护',
      inProgress: '处理中',
      postmortem: '已复盘',
      unknown: '未知',
    };

    const EN = {
      checking: 'Checking…',
      operational: 'Operational',
      incident: 'Service issue',
      unavailable: 'Status unavailable',
      title: 'DeepSeek service status',
      status: 'Status',
      recent: 'Latest event',
      incidentTitle: 'Latest event',
      incidentStatus: 'Event status',
      components: 'Affected components',
      detail: 'Detail',
      error: 'Error',
      lastSuccess: 'Last success',
      updated: 'Updated',
      source: 'Source',
      noIncident: 'No open incident; the service is operating normally',
      resolved: 'Resolved',
      investigating: 'Investigating',
      identified: 'Identified',
      monitoring: 'Monitoring',
      scheduled: 'Scheduled',
      inProgress: 'In progress',
      postmortem: 'Postmortem',
      unknown: 'Unknown',
    };

    /** Theme-token stylesheet for the caption pill and its panel. */
    const CSS = [
      '.dsp-root{position:fixed;top:0;z-index:1100;display:flex;align-items:center;box-sizing:border-box;-webkit-app-region:no-drag;font-family:var(--dsw-font-family,inherit);color:var(--dsw-alias-label-secondary);user-select:none}',
      '.dsp-root[hidden],.dsp-root[data-cramped="true"]{display:none}',
      '.dsp-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:default;transition:background-color .15s ease,border-color .15s ease}',
      '.dsp-root:hover .dsp-pill,.dsp-root[data-open="true"] .dsp-pill{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}',
      '.dsp-root:focus-visible{outline:none}',
      '.dsp-root:focus-visible .dsp-pill{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsp-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);transition:background-color .2s ease}',
      '.dsp-root[data-state="operational"] .dsp-dot{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent)}',
      '.dsp-root[data-state="incident"] .dsp-dot,.dsp-root[data-state="error"] .dsp-dot{background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 22%,transparent);animation:dsp-pulse 2.6s ease-in-out infinite}',
      '.dsp-label{font-size:12px;line-height:16px;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.dsp-panel{position:fixed;z-index:1201;box-sizing:border-box;width:max-content;min-width:236px;max-width:min(348px,calc(100vw - 24px));padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);box-shadow:0 10px 28px #00000040;font-size:12px;line-height:18px;cursor:default}',
      '.dsp-panel[data-hidden="true"]{display:none}',
      '.dsp-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 8px}',
      '.dsp-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dsp-badge{flex:none;padding:0 6px;border-radius:999px;font-size:11px;line-height:18px;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.dsp-root[data-state="operational"] .dsp-badge{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent)}',
      '.dsp-root[data-state="incident"] .dsp-badge,.dsp-root[data-state="error"] .dsp-badge{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent)}',
      '.dsp-body{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;margin:0;max-height:232px;overflow:auto;overscroll-behavior:contain}',
      '.dsp-body dt{margin:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;opacity:.72}',
      '.dsp-body dd{margin:0;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
      '.dsp-body dd[data-long="true"]{white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.dsp-note{margin:0;padding:2px 0 0;color:var(--dsw-alias-label-secondary)}',
      '.dsp-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:9px 0 0;padding-top:7px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);opacity:.72;font-variant-numeric:tabular-nums}',
      '.dsp-foot span{white-space:nowrap}',
      '@keyframes dsp-pulse{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 26%,transparent)}}',
      '@media (prefers-reduced-motion:reduce){.dsp-dot,.dsp-pill{animation:none!important;transition:none!important}}',
    ].join('');

    /**
     * Create one element with an optional class and text.
     * @param tag - element name.
     * @param className - class list.
     * @param text - text content.
     * @returns the element.
     */
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className !== undefined) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    /**
     * The Desktop caption height, published by the Desktop preload.
     * @returns a positive pixel height.
     */
    function captionHeight() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height').trim();
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) && value > 0 ? value : 40;
    }

    /**
     * Local calendar stamp of one instant.
     * @param epochMs - instant in milliseconds.
     * @returns `MM-DD HH:mm`, or null when the instant is unusable.
     */
    function stamp(epochMs) {
      if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs <= 0) return null;
      const date = new Date(epochMs);
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    /**
     * Read one status snapshot from this plugin's Host route.
     * @returns the parsed payload.
     * @throws when the route fails, times out, or answers an unusable body.
     */
    async function readStatus() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(ROUTE, {
          headers: { [GATE_HEADER]: '1' },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (body === null || typeof body !== 'object' || body.ok !== true) throw new Error('unexpected payload');
        return body;
      } finally {
        window.clearTimeout(timer);
      }
    }

    /**
     * Render one state word.
     * @param phase - pill phase (`loading`, `operational`, `incident`, `error`).
     * @param t - bound dictionary lookup.
     * @returns display text.
     */
    function stateText(phase, t) {
      if (phase === 'operational') return t('operational');
      if (phase === 'incident') return t('incident');
      if (phase === 'error') return t('unavailable');
      return t('checking');
    }

    /**
     * Render one feed status token.
     * @param token - normalized `Status:` token.
     * @param t - bound dictionary lookup.
     * @returns display text.
     */
    function statusText(token, t) {
      if (token === 'resolved') return t('resolved');
      if (token === 'investigating') return t('investigating');
      if (token === 'identified') return t('identified');
      if (token === 'monitoring') return t('monitoring');
      if (token === 'scheduled') return t('scheduled');
      if (token === 'in-progress' || token === 'in_progress') return t('inProgress');
      if (token === 'postmortem') return t('postmortem');
      if (token === 'unknown') return t('unknown');
      return String(token);
    }

    /**
     * Mount the caption pill and keep it placed beside the Desktop menus.
     * @param t - bound dictionary lookup.
     * @returns the teardown of every listener, observer, timer, and element.
     */
    function mountPill(t) {
      const root = el('div', 'dsp-root');
      root.dataset.state = 'loading';
      root.dataset.cramped = 'false';
      root.hidden = true;
      root.tabIndex = 0;
      root.setAttribute('role', 'group');
      root.setAttribute('aria-describedby', 'dsp-panel');

      const dot = el('span', 'dsp-dot');
      dot.setAttribute('aria-hidden', 'true');
      const label = el('span', 'dsp-label', t('checking'));
      const pill = el('div', 'dsp-pill');
      pill.append(dot, label);

      const panel = el('div', 'dsp-panel');
      panel.id = 'dsp-panel';
      panel.dataset.hidden = 'true';
      panel.setAttribute('role', 'tooltip');
      root.append(pill, panel);
      document.body.append(root);

      /** Latest Host payload. */
      let payload;
      /** Current pill phase. */
      let phase = 'loading';
      /** Last client-side failure, when the Host route itself was unreachable. */
      let transportError = '';
      let pollTimer = 0;
      let polling = false;
      let closeTimer = 0;
      let observedMenu;
      let menuObserver;
      let resizeTimer = 0;
      /** Last width measured while the pill was not hidden for lack of room. */
      let measuredWidth = 0;

      /**
       * Place the pill and its panel beside the Desktop menus.
       *
       * The caption strip belongs to the Desktop preload; its menubar host is the
       * only element that says where the Desktop-owned menus end, so the pill
       * anchors to that element's right edge rather than to a guessed offset.
       * When the strip has no room left before the window controls, the pill
       * hides instead of overlapping them.
       */
      const place = () => {
        if (root.hidden) return;
        const caption = captionHeight();
        const menu = document.querySelector('[data-windows-menu]');
        const left = menu === null ? 48 : Math.round(menu.getBoundingClientRect().right + 10);
        root.style.height = `${caption}px`;
        root.style.left = `${Math.max(0, left)}px`;
        panel.style.top = `${caption}px`;
        panel.style.left = `${Math.max(8, left)}px`;
        panel.style.maxHeight = `${Math.max(140, window.innerHeight - caption - 16)}px`;
        if (root.dataset.cramped !== 'true') measuredWidth = root.offsetWidth;
        const cramped = left + measuredWidth > window.innerWidth - 150;
        root.dataset.cramped = cramped ? 'true' : 'false';
        if (cramped) {
          open(false);
          return;
        }
        if (panel.dataset.hidden !== 'true') clampPanel();
      };

      /** Keep an open panel inside the viewport. */
      const clampPanel = () => {
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        panel.style.left = `${Math.min(Math.max(8, Number.parseFloat(panel.style.left) || 0), maxLeft)}px`;
      };

      /** Follow a replaced Desktop menubar host. */
      const attachMenu = () => {
        const menu = document.querySelector('[data-windows-menu]');
        if (menu === observedMenu) return;
        if (menuObserver !== undefined) menuObserver.disconnect();
        menuObserver = undefined;
        observedMenu = menu ?? null;
        if (menu === null) return;
        menuObserver = new ResizeObserver(() => place());
        menuObserver.observe(menu);
      };

      /** Start polling only while the pill is actually on screen. */
      const startPolling = () => {
        if (polling) return;
        polling = true;
        const loop = async () => {
          if (!polling) return;
          if (!document.hidden) await refresh();
          if (!polling) return;
          pollTimer = window.setTimeout(() => void loop(), phase === 'error' ? 15_000 : REFRESH_MS);
        };
        void loop();
      };

      /** Stop polling when the pill leaves the caption. */
      const stopPolling = () => {
        polling = false;
        if (pollTimer === 0) return;
        window.clearTimeout(pollTimer);
        pollTimer = 0;
      };

      /** Recompute visibility from the Desktop caption marker and menubar host. */
      const sync = () => {
        const desktop = document.documentElement.hasAttribute('data-windows-titlebar');
        const menu = document.querySelector('[data-windows-menu]');
        const visible = desktop && menu !== null;
        root.hidden = !visible;
        if (!visible) {
          open(false);
          stopPolling();
          return;
        }
        attachMenu();
        place();
        startPolling();
      };

      /**
       * Open or close the detail panel.
       * @param next - whether the panel should be visible.
       */
      function open(next) {
        window.clearTimeout(closeTimer);
        if (next && root.hidden) return;
        panel.dataset.hidden = next ? 'false' : 'true';
        root.dataset.open = next ? 'true' : 'false';
        if (next) place();
      }

      /** Close after a short grace period, so crossing to the panel keeps it open. */
      const scheduleClose = () => {
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => open(false), 180);
      };

      /** Rebuild the detail panel from the current payload. */
      const renderPanel = () => {
        const head = el('div', 'dsp-head');
        head.append(el('span', 'dsp-title', t('title')), el('span', 'dsp-badge', stateText(phase, t)));

        const body = el('div', 'dsp-body');
        const row = (term, value, long) => {
          body.append(el('dt', undefined, term));
          const dd = el('dd', undefined, value);
          if (long === true) dd.dataset.long = 'true';
          body.append(dd);
        };

        row(t('status'), stateText(phase, t));
        if (phase === 'error') {
          const message = payload?.error?.message ?? (transportError.length > 0 ? transportError : t('unknown'));
          row(t('error'), message, true);
          /* Only a failure needs the "last good read" timestamp; a healthy feed
           * already carries its own time in the panel footer. */
          const lastSuccess = stamp(payload?.lastSuccessAt);
          if (lastSuccess !== null) row(t('lastSuccess'), lastSuccess);
        }

        const latest = payload?.latest ?? null;
        if (latest !== null) {
          row(t('incidentTitle'), String(latest.title), true);
          row(t('incidentStatus'), statusText(latest.status, t));
          const updated = stamp(latest.updatedAt);
          if (updated !== null) row(t('updated'), updated);
          if (Array.isArray(latest.components) && latest.components.length > 0) {
            row(t('components'), latest.components.join(' · '), true);
          }
          if (typeof latest.detail === 'string' && latest.detail.length > 0) {
            row(t('detail'), latest.detail, true);
          }
        } else if (phase === 'operational') {
          body.append(el('p', 'dsp-note', t('noIncident')));
        } else if (phase === 'loading') {
          body.append(el('p', 'dsp-note', t('checking')));
        }

        const foot = el('div', 'dsp-foot');
        foot.append(el('span', undefined, `status.deepseek.com · Atom`));
        const fetched = stamp(payload?.fetchedAt);
        if (fetched !== null) foot.append(el('span', undefined, `${t('updated')} ${fetched}`));

        panel.replaceChildren(head, body, foot);
      };

      /** Push the current phase and payload into the rendered pill and panel. */
      const render = () => {
        root.dataset.state = phase;
        const text = stateText(phase, t);
        label.textContent = text;
        root.setAttribute('aria-label', `${t('title')}: ${text}`);
        renderPanel();
        if (panel.dataset.hidden !== 'true') {
          place();
          clampPanel();
        }
      };

      /** Read one snapshot from the Host and render it. */
      async function refresh() {
        try {
          const body = await readStatus();
          payload = body;
          transportError = '';
          phase = body.state === 'operational' || body.state === 'incident' ? body.state : 'error';
        } catch (error) {
          transportError = error instanceof Error ? error.message : String(error);
          phase = 'error';
        }
        render();
      }

      /* Hover and focus both open the panel; pointer and focus moves inside the
       * root (pill or panel) keep it open. */
      root.addEventListener('pointerover', () => open(true));
      root.addEventListener('pointerout', (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && root.contains(next)) return;
        scheduleClose();
      });
      root.addEventListener('focusin', () => open(true));
      root.addEventListener('focusout', (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && root.contains(next)) return;
        scheduleClose();
      });
      root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        /* Closing must not pull focus back into the pill: a focus switch would
         * immediately reopen the panel the user just dismissed. */
        open(false);
      });

      const onResize = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => place(), 80);
      };
      const onVisibility = () => {
        if (!document.hidden && !root.hidden) void refresh();
      };
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibility);

      /* The Desktop preload sets the caption marker and toggles it with the
       * window layout; the language change reflows the menubar, so the pill
       * follows both. */
      const htmlObserver = new MutationObserver(() => {
        sync();
        render();
      });
      htmlObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['lang', 'data-windows-titlebar', 'data-sidebar-collapsed', 'data-fullscreen', 'class'],
      });

      /* The menubar host is appended to the body after the shell mounts, and may
       * be replaced on a window rebuild; watch direct body children for both. */
      const bodyObserver = new MutationObserver(() => sync());
      bodyObserver.observe(document.body, { childList: true });

      sync();

      return () => {
        open(false);
        stopPolling();
        window.clearTimeout(closeTimer);
        window.clearTimeout(resizeTimer);
        htmlObserver.disconnect();
        bodyObserver.disconnect();
        if (menuObserver !== undefined) menuObserver.disconnect();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        root.remove();
      };
    }

    return {
      name: 'deepseek-status-pill',
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: EN, zh: ZH }),
          'deepseek-status-pill: dictionaries',
        );
        const t = ctx.locale.bind(NS);

        const style = document.createElement('style');
        style.dataset.plugin = 'deepseek-status-pill';
        style.textContent = CSS;
        ctx.effect(
          () => {
            document.head.append(style);
            return () => style.remove();
          },
          'deepseek-status-pill: stylesheet',
        );

        ctx.effect(() => mountPill(t), 'deepseek-status-pill: caption pill');

        /* The bound lookup follows the active language; the pill re-renders its
         * two labels when the document language changes. */
      },
    };
  },
});
