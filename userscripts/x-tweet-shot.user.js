// ==UserScript==
// @name         X Tweet Shot (for AI agents)
// @namespace    local.tools
// @version      0.5.2
// @description  Pick a tweet, capture it (+ its own replies only) as one PNG with permalinks stamped in the footer, straight to the clipboard.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setClipboard
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/choephix/my-agents/main/userscripts/x-tweet-shot.user.js
// @updateURL    https://raw.githubusercontent.com/choephix/my-agents/main/userscripts/x-tweet-shot.user.js
// ==/UserScript==

(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const HOTKEY = e => e.altKey && e.shiftKey && e.code === 'KeyS';   // arm pick mode
  const SCALE  = 2;            // capture resolution multiplier
  const MAX_TWEETS = 30;       // sanity cap on stitched tweets
  const MAX_FOOT_ROWS = 6;     // footer link lines before "+N more"
  const MAX_GAP    = 16;       // px between articles before we call it a new context

  const TWEET     = 'article[data-testid="tweet"]';
  const SHOW_MORE = '[data-testid="tweet-text-show-more-link"]';
  const AVATAR    = '[data-testid^="UserAvatar-Container-"]';

  // ------------------------------------------------------------------ theme
  // Match X's current theme (light / dim / lights-out) so the PNG blends in.
  function theme() {
    const bg = getComputedStyle(document.body).backgroundColor || 'rgb(0,0,0)';
    const [r, g, b] = (bg.match(/\d+/g) || [0, 0, 0]).map(Number);
    const lum  = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const dark = lum < 0.5;
    return {
      bg,
      dark,
      divider: dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)',
      footBg:  dark ? `rgb(${Math.min(r + 14, 255)},${Math.min(g + 14, 255)},${Math.min(b + 16, 255)})`
                    : `rgb(${Math.max(r - 10, 0)},${Math.max(g - 8, 0)},${Math.max(b - 4, 0)})`,
      footFg:  dark ? 'rgba(255,255,255,.78)' : 'rgba(0,0,0,.62)',
      footFgDim: dark ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.36)',
    };
  }

  // ------------------------------------------------------------------- url
  /** Permalink of a tweet article: the anchor wrapping its timestamp. */
  function tweetUrl(article) {
    const a = [...article.querySelectorAll('a[href]')].find(x =>
      /\/status\/\d+/.test(x.getAttribute('href') || '') && x.querySelector('time'));
    if (a) return new URL(a.getAttribute('href'), location.origin).href.split('?')[0];
    // The focused tweet on its own /status/ page has no self-linking timestamp.
    const m = location.pathname.match(/^\/[^/]+\/status\/\d+/);
    return m ? location.origin + m[0] : location.href.split('?')[0];
  }

  /**
   * Best-effort peek into React fiber props for data the DOM doesn't expose:
   * a text-only quote's status id, or the parent id when the tweet is a
   * reply. Wrapped hard — if X's internals shift, we just return null and
   * the footer simply has fewer lines.
   */
  function tweetDataNear(el) {
    try {
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      let f = key && el[key];
      for (let i = 0; f && i < 35; i++, f = f.return) {
        for (const t of [f.memoizedProps?.tweet, f.memoizedProps?.quotedTweet]) {
          if (!t) continue;
          const id = t.id_str || t.rest_id;
          if (!id) continue;
          return {
            id,
            handle: t.user?.screen_name || t.user?.legacy?.screen_name
              || t.core?.user_results?.result?.legacy?.screen_name || null,
            replyTo: t.in_reply_to_status_id_str
              || t.legacy?.in_reply_to_status_id_str || null,
          };
        }
      }
    } catch { /* fall through */ }
    return null;
  }
  const statusUrl = d => d && (d.handle
    ? `https://x.com/${d.handle}/status/${d.id}`
    : `https://x.com/i/status/${d.id}`);   // /i/status/ redirects by id alone

  /** Footer rows: each tweet's permalink, quoted tweets, the reply parent. */
  function collectUrls(run) {
    const rows = [];
    const ids  = new Set();   // dedup by status id, not string — formats vary
    const add = (label, u) => {
      if (!u) return;
      u = u.split('?')[0];
      const id = (u.match(/status\/(\d+)/) || [])[1] || u;
      if (ids.has(id)) return;
      ids.add(id);
      rows.push({ label, url: u });
    };

    run.forEach((art, i) => {
      add(i === 0 ? 'tweet' : 'reply', tweetUrl(art));

      // quoted tweet: media quotes carry /status/…/photo anchors; text-only
      // quotes need the fiber peek (the role="link" box has no href at all)
      const quote = [...art.querySelectorAll('div[role="link"]')]
        .find(d => d.querySelector('[data-testid="User-Name"]'));
      if (quote) {
        const href = [...quote.querySelectorAll('a[href*="/status/"]')]
          .map(a => ((a.getAttribute('href') || '').match(/^\/[^/]+\/status\/\d+/) || [])[0])
          .find(Boolean);
        add('quote', href ? location.origin + href : statusUrl(tweetDataNear(quote)));
      }
    });

    const d = tweetDataNear(run[0]);
    if (d?.replyTo) add('parent', `https://x.com/i/status/${d.replyTo}`);

    if (rows.length > MAX_FOOT_ROWS) {
      const extra = rows.length - (MAX_FOOT_ROWS - 1);
      rows.length = MAX_FOOT_ROWS - 1;
      rows.push({ label: '', url: `… +${extra} more` });
    }
    return rows;
  }

  // -------------------------------------------------------------- discovery
  // X positions timeline cells with translateY, so DOM order can drift from
  // visual order after scrolling — always sort by on-screen position.
  const allTweets = () => [...document.querySelectorAll(TWEET)]
    .map(a => ({ a, r: a.getBoundingClientRect() }))
    .filter(x => x.r.height > 0)
    .sort((x, y) => x.r.top - y.r.top);

  const onScreen = r => r.bottom > 0 && r.top < innerHeight;

  /**
   * Thread-connector detection. When X renders tweets as one conversation
   * module (feed threads, "X replied" pairs), it draws a ~2px vertical line
   * through the avatar column. We look for that line above / below the
   * avatar — it's the DOM's own statement that two tweets belong together.
   */
  const lineCache = new WeakMap();
  function threadLines(art) {
    if (lineCache.has(art)) return lineCache.get(art);
    const res = { above: false, below: false };
    const av = art.querySelector('[data-testid="Tweet-User-Avatar"]');
    if (av) {
      const ar = av.getBoundingClientRect();
      const cx = (ar.left + ar.right) / 2;
      for (const d of art.querySelectorAll('div')) {
        if (d.childElementCount) continue;                 // the line is a leaf div
        const r = d.getBoundingClientRect();
        if (r.width < 1 || r.width > 4 || r.height < 12) continue;
        if (Math.abs((r.left + r.right) / 2 - cx) > ar.width) continue;  // avatar column only
        if (r.top    >= ar.bottom - 4) res.below = true;
        if (r.bottom <= ar.top    + 4) res.above = true;
      }
    }
    lineCache.set(art, res);
    return res;
  }
  const connected = (prev, next) => threadLines(prev).below && threadLines(next).above;

  /**
   * The picked tweet + only the replies that belong to it:
   *  - on a /status/ page, everything below IS the conversation → include
   *    visible replies, stopping at any layout gap ("Discover more" etc.);
   *  - on feeds, only follow X's own thread-connector line; otherwise the
   *    next tweet is an unrelated post and the run ends at one.
   */
  function tweetsFrom(head) {
    const inConvo = /\/status\/\d+/.test(location.pathname);
    const list = allTweets();
    const i = list.findIndex(x => x.a === head);
    if (i < 0) return [head];

    const run = [head];
    for (let j = i + 1; j < list.length && run.length < MAX_TWEETS; j++) {
      const prev = list[j - 1], next = list[j];
      if (!onScreen(next.r)) break;
      if (next.r.top - prev.r.bottom > MAX_GAP) break;          // heading / section break
      if (!inConvo && !connected(prev.a, next.a)) break;        // feed: same module only
      run.push(next.a);
    }
    return run;
  }

  // ----------------------------------------------------------------- toast
  let toastEl = null;
  function toast(msg, kind = 'ok', ms = 2800) {
    toastEl?.remove();
    const colors = { ok: '#1d9bf0', good: '#00ba7c', bad: '#f4212e' };
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      z-index:2147483647;max-width:80vw;padding:10px 16px;border-radius:10px;
      font:13px/1.4 system-ui,sans-serif;color:#fff;background:${colors[kind]};
      box-shadow:0 4px 16px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    document.body.appendChild(el);
    toastEl = el;
    if (ms) setTimeout(() => { if (toastEl === el) { el.remove(); toastEl = null; } }, ms);
  }

  // --------------------------------------------------------------- avatars
  // html2canvas has failed to render X's avatar stack correctly through two
  // different repair strategies, so it no longer gets the chance: avatars
  // are BLANKED in the clone and composited onto the final canvas by hand
  // with drawImage + a circular clip. Raw canvas geometry — no CSS involved.

  /** Measure every avatar in an article: position relative to it + image url. */
  function collectAvatars(art) {
    const base = art.getBoundingClientRect();
    return [...art.querySelectorAll(AVATAR)].map(el => {
      const r = el.getBoundingClientRect();
      let url = el.querySelector('img[src]')?.src || null;
      if (!url) {
        for (const d of el.querySelectorAll('div')) {
          const m = (getComputedStyle(d).backgroundImage || '').match(/url\("?([^")]+)"?\)/);
          if (m) { url = m[1]; break; }
        }
      }
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, url };
    }).filter(a => a.w > 4 && a.h > 4);
  }

  /** In the clone, gut every avatar container so no broken layer can render. */
  function blankAvatars(origRoot, cloneRoot) {
    const orig  = origRoot.querySelectorAll(AVATAR);
    const clone = cloneRoot.querySelectorAll(AVATAR);
    orig.forEach((o, i) => {
      const c = clone[i];
      if (!c) return;
      const r = o.getBoundingClientRect();
      c.replaceChildren();
      c.style.cssText += `;width:${r.width}px;height:${r.height}px;overflow:hidden`;
    });
  }

  const imgCache = new Map();
  function loadImage(url) {
    if (!imgCache.has(url)) {
      imgCache.set(url, new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';   // pbs.twimg.com sends CORS headers
        im.onload  = () => res(im);
        im.onerror = () => rej(new Error('avatar load failed'));
        im.src = url;
      }));
    }
    return imgCache.get(url);
  }

  // --------------------------------------------------------------- capture
  /**
   * html2canvas 1.4.x predates the CSS `aspect-ratio` property, which X uses
   * to size media boxes (notably inside quoted tweets). Ignored, those
   * wrappers collapse and the surrounding flex layout re-solves wrong — text
   * shifts off-canvas, quote borders vanish. Fix: hand the renderer
   * pre-solved geometry. Parallel-walk original vs clone and stamp the real
   * on-screen size, in pixels, onto every aspect-ratio-sized element.
   */
  function freezeBoxes(origRoot, cloneRoot) {
    const orig  = [origRoot, ...origRoot.querySelectorAll('*')];
    const clone = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
    orig.forEach((o, i) => {
      const c = clone[i];
      if (!c || !c.style) return;
      const ar = getComputedStyle(o).aspectRatio;
      if (ar && ar !== 'auto') {
        const r = o.getBoundingClientRect();
        c.style.aspectRatio = 'auto';
        c.style.width  = r.width + 'px';
        c.style.height = r.height + 'px';
      }
    });
  }

  /**
   * html2canvas 1.4.x doesn't understand the `inset: 0` shorthand X uses to
   * stretch media <img>s inside their wrappers; unconstrained they render at
   * natural size and get clipped. Freeze each img's real on-screen box into
   * inline pixel styles on the clone. (Avatars are handled separately above.)
   */
  function freezeImages(origRoot, cloneRoot) {
    const orig  = origRoot.querySelectorAll('img');
    const clone = cloneRoot.querySelectorAll('img');
    orig.forEach((o, i) => {
      const c = clone[i];
      if (!c) return;
      const r = o.getBoundingClientRect();
      if (!r.width || !r.height) return;
      c.style.width     = r.width + 'px';
      c.style.height    = r.height + 'px';
      c.style.maxWidth  = 'none';
      c.style.maxHeight = 'none';
      const pos = getComputedStyle(o).position;
      if (pos === 'absolute' || pos === 'fixed') {
        c.style.top = '0px';  c.style.left = '0px';
        c.style.right = 'auto'; c.style.bottom = 'auto';
      }
    });
  }

  /** The tweet's own Show-more, ignoring one inside a truncated *quote*. */
  const ownShowMore = art =>
    [...art.querySelectorAll(SHOW_MORE)].find(el => !el.closest('[role="link"]'));

  async function waitFor(pred, timeout = 2000, step = 100) {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (pred()) return true;
      await new Promise(r => setTimeout(r, step));
    }
    return false;
  }

  async function capture(head) {
    const more = ownShowMore(head);
    if (more) {
      more.click();                                   // expands in place
      await waitFor(() => !ownShowMore(head));        // text swapped in
      await new Promise(r => setTimeout(r, 150));     // one layout beat
    }

    const t    = theme();
    const run  = tweetsFrom(head);
    const url  = tweetUrl(head);

    toast(`Rendering ${run.length} tweet${run.length === 1 ? '' : 's'}…`, 'ok', 0);

    const shots = [];
    for (const art of run) {
      const r = art.getBoundingClientRect();
      const canvas = await html2canvas(art, {
        backgroundColor: t.bg, useCORS: true, allowTaint: false,
        scale: SCALE, logging: false,
        onclone: (_doc, clonedArt) => {
          freezeBoxes(art, clonedArt);
          freezeImages(art, clonedArt);
          blankAvatars(art, clonedArt);
        },
      });
      shots.push({ canvas, avatars: collectAvatars(art), w: r.width, h: r.height });
    }

    // ---- stitch, composite avatars, then stamp permalinks into a footer bar
    const rows  = collectUrls(run);
    const fs    = 11.5 * SCALE;
    const lineH = 20 * SCALE;
    const padV  = 7 * SCALE;
    const W    = Math.max(...shots.map(s => s.canvas.width));
    const SEP  = Math.max(1, Math.round(SCALE));         // 1px divider between tweets
    const FOOT = padV * 2 + lineH * rows.length;
    const body = shots.reduce((h, s) => h + s.canvas.height, 0) + SEP * (shots.length - 1);

    const out = document.createElement('canvas');
    out.width  = W;
    out.height = body + FOOT;
    const ctx = out.getContext('2d');

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, out.height);

    let y = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (i) {
        ctx.fillStyle = t.divider;
        ctx.fillRect(0, y, W, SEP);
        y += SEP;
      }
      ctx.drawImage(s.canvas, 0, y);

      // hand-composited avatars: circular clip + drawImage at measured spots
      const fx = s.canvas.width / s.w, fy = s.canvas.height / s.h;
      for (const av of s.avatars) {
        const ax = av.x * fx, ay = y + av.y * fy, aw = av.w * fx, ah = av.h * fy;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + aw / 2, ay + ah / 2, Math.min(aw, ah) / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = t.divider;      // neutral disc if the image never loads
        ctx.fill();
        if (av.url) {
          try { ctx.drawImage(await loadImage(av.url), ax, ay, aw, ah); } catch {}
        }
        ctx.restore();
      }
      y += s.canvas.height;
    }

    ctx.fillStyle = t.footBg;
    ctx.fillRect(0, body, W, FOOT);
    ctx.fillStyle = t.divider;
    ctx.fillRect(0, body, W, SEP);

    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const stamp  = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const stampW = ctx.measureText(stamp).width;

    rows.forEach((row, i) => {
      const ly = body + padV + lineH * i + lineH / 2;
      const label = (row.label || '').padEnd(7);
      ctx.fillStyle = t.footFgDim;
      ctx.fillText(label, 12 * SCALE, ly);
      const lx = 12 * SCALE + ctx.measureText(label).width;
      // first row shares its line with the timestamp; the rest run full width
      const maxW = (i === 0 ? W - stampW - 24 * SCALE : W - 12 * SCALE) - lx;
      let shown = row.url;
      while (shown.length > 12 && ctx.measureText(shown + '…').width > maxW) shown = shown.slice(0, -1);
      ctx.fillStyle = t.footFg;
      ctx.fillText(shown === row.url ? shown : shown + '…', lx, ly);
    });

    ctx.fillStyle = t.footFgDim;
    ctx.fillText(stamp, W - stampW - 12 * SCALE, body + padV + lineH / 2);

    // ---- deliver
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Canvas export failed.');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(`✓ ${run.length} tweet${run.length === 1 ? '' : 's'} on clipboard · ${url}`, 'good', 4200);
      flashFab();
    } catch (err) {
      // No image-clipboard support (or focus lost): save the PNG, copy the link.
      console.warn('[tweet-shot] clipboard image write failed, downloading instead', err);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tweet-${(url.match(/status\/(\d+)/) || [, 'shot'])[1]}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      (typeof GM_setClipboard === 'function')
        ? GM_setClipboard(url, 'text')
        : await navigator.clipboard.writeText(url);
      toast('Clipboard refused the image — PNG downloaded, link copied instead.', 'ok', 5000);
    }
  }

  // -------------------------------------------------------------- pick mode
  let picking = null;
  let setPickActive = () => {};
  let flashFab = () => {};

  function startPicking() {
    if (picking) return;

    const style = document.createElement('style');
    style.textContent = '*{cursor:crosshair !important}';
    const mk = css => { const d = document.createElement('div'); d.style.cssText = css; return d; };

    const head = mk(`position:fixed;pointer-events:none;z-index:2147483646;display:none;
      border:2px solid #1d9bf0;border-radius:10px;background:rgba(29,155,240,.14)`);
    const tail = mk(`position:fixed;pointer-events:none;z-index:2147483645;display:none;
      border-left:2px solid rgba(29,155,240,.5);background:rgba(29,155,240,.06)`);
    const hint = mk(`position:fixed;top:14px;left:50%;transform:translateX(-50%);
      z-index:2147483647;padding:8px 14px;border-radius:10px;pointer-events:none;
      font:13px/1.4 system-ui,sans-serif;color:#fff;background:#1d9bf0;box-shadow:0 4px 14px rgba(0,0,0,.4)`);
    hint.textContent = 'Click a tweet — captures it + its own replies. Esc to cancel.';

    document.head.appendChild(style);
    document.body.append(tail, head, hint);

    let frame = 0;
    const hostAt = t => (t instanceof Element ? t.closest(TWEET) : null);
    const hide = () => { head.style.display = tail.style.display = 'none'; };
    let current = null;

    function redraw() {
      if (!current || !current.isConnected) return hide();
      const run = tweetsFrom(current);
      const a = current.getBoundingClientRect();
      const b = run[run.length - 1].getBoundingClientRect();

      Object.assign(head.style, { display: 'block', top: `${a.top}px`, left: `${a.left}px`,
        width: `${a.width}px`, height: `${a.height}px` });

      const bottom = Math.min(b.bottom, innerHeight);
      if (bottom - a.bottom > 2) {
        Object.assign(tail.style, { display: 'block', top: `${a.bottom}px`, left: `${a.left}px`,
          width: `${a.width}px`, height: `${bottom - a.bottom}px` });
      } else tail.style.display = 'none';

      hint.textContent = run.length === 1
        ? 'This tweet only — Esc to cancel'
        : `${run.length} tweets (same thread) — Esc to cancel`;
    }

    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw(); }); };
    const onMove = e => { current = hostAt(e.target); redraw(); if (!current) hide(); };

    const eat = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    const onDown = e => { if (hostAt(e.target)) eat(e); };
    const onClick = e => {
      const host = hostAt(e.target);
      if (!host) return;
      eat(e);
      stop();
      capture(host).catch(err => { console.error(err); toast(err.message, 'bad'); });
    };
    const onKey = e => { if (e.key === 'Escape') { eat(e); stop(); } };

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mouseup', onDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      style.remove(); head.remove(); tail.remove(); hint.remove();
      picking = null;
      setPickActive(false);
    }

    picking = { stop };
    setPickActive(true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mouseup', onDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // ---------------------------------------------------------- corner button
  // A triangle bleeding off the top-right corner — its right angle IS the
  // corner of the page. Icon only. (clip-path clips box-shadow, so glow and
  // pulse live as drop-shadows on the un-clipped wrapper.)
  const ICON_CAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h1.5l1.2-1.8A2 2 0 0 1 9.4 3h5.2a2 2 0 0 1 1.7 1.2L17.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
      <circle cx="12" cy="12.5" r="3.4"/>
    </svg>`;
  const ICON_OK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"
      stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>`;

  function mountFab() {
    if (document.getElementById('xts-fab') || !document.body) return;

    const css = document.createElement('style');
    css.textContent = `
      #xts-fab{position:fixed;top:0;right:0;z-index:2147483644;
        filter:drop-shadow(0 3px 10px rgba(0,0,0,.5))}
      #xts-fab-btn{display:block;width:76px;height:76px;padding:0;border:none;cursor:pointer;
        position:relative;color:#fff;transform-origin:top right;
        clip-path:polygon(0 0,100% 0,100% 100%);
        background:linear-gradient(215deg,#7b3ff2,#1d9bf0 45%,#00c2ff);
        transition:transform .15s cubic-bezier(.2,.9,.3,1.4), filter .15s}
      #xts-fab-btn svg{position:absolute;top:11px;right:11px;width:24px;height:24px}
      #xts-fab-btn:hover{transform:scale(1.1);filter:brightness(1.14) saturate(1.1)}
      #xts-fab-btn:active{transform:scale(.94)}
      #xts-fab.xts-on{animation:xts-pulse 1.1s ease-in-out infinite}
      #xts-fab.xts-on #xts-fab-btn{background:linear-gradient(215deg,#00b8d9,#12d18e)}
      #xts-fab.xts-ok #xts-fab-btn{background:linear-gradient(215deg,#0aa66f,#12d18e)}
      @keyframes xts-pulse{
        0%,100%{filter:drop-shadow(0 0 0 rgba(18,209,142,0)) drop-shadow(0 3px 10px rgba(0,0,0,.5))}
        50%{filter:drop-shadow(0 0 12px rgba(18,209,142,.85)) drop-shadow(0 3px 10px rgba(0,0,0,.5))}}
    `;

    const b = document.createElement('button');
    b.id = 'xts-fab-btn';
    b.type = 'button';
    b.title = 'Pick a tweet → PNG of it + its replies, permalinks stamped in footer  (Alt+Shift+S · Esc cancels)';
    b.innerHTML = ICON_CAM;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => (picking ? picking.stop() : startPicking()));

    const wrap = document.createElement('div');
    wrap.id = 'xts-fab';
    wrap.appendChild(b);
    document.head.appendChild(css);
    document.body.appendChild(wrap);

    setPickActive = on => wrap.classList.toggle('xts-on', on);
    flashFab = () => {
      wrap.classList.add('xts-ok');
      b.innerHTML = ICON_OK;
      setTimeout(() => { wrap.classList.remove('xts-ok'); b.innerHTML = ICON_CAM; }, 1100);
    };
  }

  mountFab();
  setInterval(mountFab, 3000);   // self-heal across X's SPA route swaps

  // ---------------------------------------------------------------- hotkey
  window.addEventListener('keydown', e => {
    if (HOTKEY(e)) { e.preventDefault(); picking ? picking.stop() : startPicking(); }
  }, true);

  console.info('[tweet-shot] ready — Alt+Shift+S or the corner triangle. Esc cancels.');
})();
