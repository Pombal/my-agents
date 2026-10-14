// ==UserScript==
// @name         Gmail Attachment Harvester
// @namespace    local
// @version      1.3.2
// @description  Bulk-download attachments from Gmail search results, renamed "Sender - filename", into a folder of your choice
// @match        https://mail.google.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/choephix/my-agents/main/tampermonkey/gmail-attachment-harvester.user.js
// @updateURL    https://raw.githubusercontent.com/choephix/my-agents/main/tampermonkey/gmail-attachment-harvester.user.js
// ==/UserScript==

(function () {
  'use strict';

  const sanitize = s => s.replace(/[\\/:*?"<>|]/g, '_').trim();

  // Trusted Types shim: Gmail's CSP requires TrustedHTML for innerHTML assignments
  const tt = window.trustedTypes?.createPolicy?.('gah', { createHTML: s => s }) || null;
  const html = s => tt ? tt.createHTML(s) : s;

  // ---------- UI ----------
  const css = `
    #gah-root { position: fixed; bottom: 18px; left: 18px; z-index: 99999;
      font-family: 'Google Sans', Roboto, sans-serif; }

    /* Pill: muted dark (original palette) once used\u2026 */
    #gah-pill { display: flex; align-items: center; gap: 8px; cursor: pointer;
      background: #1b1e24; color: #e8ecf2; border: 1px solid #2a3348;
      border-radius: 999px; padding: 9px 16px; font-size: 13px; user-select: none;
      box-shadow: 0 4px 16px rgba(0,0,0,.35); transition: transform .12s ease; }
    #gah-pill:hover { transform: translateY(-1px); }
    #gah-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: #60a5fa; }
    #gah-pill.busy .dot { background: #38bdf8; animation: gah-pulse 1s infinite; }
    @keyframes gah-pulse { 50% { opacity: .3; } }

    /* \u2026but bright blue until the first click, so it can't be missed */
    #gah-pill.fresh { background: #3b82f6; color: #f0f7ff; font-weight: 600;
      border-color: #3b82f6; box-shadow: 0 4px 18px rgba(59,130,246,.55); }
    #gah-pill.fresh .dot { display: none; }

    /* Panel: near-black with a subtle blue glow drifting in from one corner */
    #gah-panel { display: none; margin-bottom: 10px; width: 300px;
      background:
        radial-gradient(130% 130% at 100% -10%, rgba(59,130,246,.16), transparent 55%),
        #121419;
      color: #d9dde3; border: 1px solid #232838;
      border-radius: 12px; padding: 12px 14px;
      box-shadow: 0 8px 28px rgba(0,0,0,.5); }
    #gah-panel.open { display: block; }

    #gah-title { font-size: 11px; letter-spacing: .5px; text-transform: uppercase;
      color: #8891a3; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: baseline; }
    #gah-count { color: #e8ecf2; }

    #gah-bar { height: 3px; background: #262b36; border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
    #gah-fill { height: 100%; width: 0%; background: #60a5fa; transition: width .25s ease; }
    /* Moving rainbow sweep while actively downloading (JS hard-stops this on completion,
       see setBarWorking \u2014 removing the class alone isn't enough to kill an in-flight frame) */
    #gah-fill.working { background: linear-gradient(90deg,
        #f87171, #fbbf24, #a3e635, #34d399, #38bdf8, #a78bfa, #f472b6, #f87171);
      background-size: 300% 100%; animation: gah-rainbow 1.6s linear infinite; }
    @keyframes gah-rainbow { to { background-position: -300% 0; } }

    /* Status line: always tells you what's happening right now.
       Bright blue while active so it reads clearly against the rainbow bar above it. */
    #gah-status { font-size: 11px; color: #60a5fa; margin-bottom: 8px;
      display: flex; align-items: center; gap: 6px; min-height: 14px; }
    #gah-status.idle { color: #7b8494; }
    #gah-status.working { color: #38bdf8; font-weight: 600; }
    #gah-status .spin { width: 9px; height: 9px; border: 1.5px solid #60a5fa;
      border-top-color: transparent; border-radius: 50%;
      animation: gah-spin .7s linear infinite; display: none; }
    #gah-status.working .spin { border-color: #38bdf8; border-top-color: transparent; display: inline-block; }
    @keyframes gah-spin { to { transform: rotate(360deg); } }

    /* Log: fixed height, tight lines, bleeds to the card's left/right/bottom edges.
       Negative margins cancel the panel padding; inner padding keeps text off the glass. */
    #gah-log { font: 10px/1.35 'SF Mono', Consolas, monospace;
      height: 128px; overflow-y: auto; white-space: nowrap;
      background: #0d0f13;
      margin: 0 -14px -12px; padding: 6px 14px 10px;
      border-radius: 0 0 12px 12px; }
    #gah-log div { overflow: hidden; text-overflow: ellipsis; }
    #gah-log .ok { color: #c3c8d1; }
    #gah-log .ok::before { content: '\\2713'; color: #60a5fa; margin-right: 6px; }
    #gah-log .err { color: #c3c8d1; }
    #gah-log .err::before { content: '\\2717'; color: #d97b7b; margin-right: 6px; }
    #gah-log .info { color: #7b8494; }

    /* Thin, muted custom scrollbar */
    #gah-log::-webkit-scrollbar { width: 4px; }
    #gah-log::-webkit-scrollbar-track { background: transparent; }
    #gah-log::-webkit-scrollbar-thumb { background: #2f3644; border-radius: 2px; }
    #gah-log::-webkit-scrollbar-thumb:hover { background: #404a5c; }
    #gah-log { scrollbar-width: thin; scrollbar-color: #2f3644 transparent; }

    /* ---- Per-attachment chip overlays (injected into Gmail's own chips) ----
       Every one of these is pointer-events:none so the chips stay fully clickable. */
    .gah-mark { position: absolute; inset: 0; pointer-events: none;
      border-radius: inherit; z-index: 5;
      display: flex; align-items: flex-start; justify-content: flex-end; }

    /* Shared badge geometry: both the spinner and the tick sit in the same corner spot. */
    .gah-mark::after { width: 11px; height: 11px; border-radius: 50%;
      margin: -4px -4px 0 0; box-sizing: border-box;
      box-shadow: 0 0 0 1.5px rgba(13,15,19,.9); }

    /* Active: tiny spinning ring, same size/placement as the tick badge. */
    .gah-mark.scan::after { content: '';
      background: #0d0f13;
      border: 1.5px solid rgba(56,189,248,.25);
      border-top-color: #38bdf8;
      animation: gah-badge-spin .5s linear infinite; }
    @keyframes gah-badge-spin { to { transform: rotate(1turn); } }

    /* Done: minimal tick badge in the corner, nothing else touched. */
    .gah-mark.done::after { content: '\\2713';
      font: 700 8px/10px 'SF Mono', Consolas, monospace; color: #0b1220;
      background: #60a5fa; text-align: center;
      animation: gah-pop .18s ease-out; }
    .gah-mark.done.failed::after { content: '\\2717'; background: #d97b7b; }
    @keyframes gah-pop { from { transform: scale(0); } to { transform: scale(1); } }
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  const root = document.createElement('div');
  root.id = 'gah-root';
  root.innerHTML = html(`
    <div id="gah-panel">
      <div id="gah-title">
        <span>Attachments</span>
        <span id="gah-count">\u2013</span>
      </div>
      <div id="gah-bar"><div id="gah-fill"></div></div>
      <div id="gah-status" class="idle"><span class="spin"></span><span id="gah-status-text">Idle</span></div>
      <div id="gah-log"><div class="info">Run a search, then hit the button.</div></div>
    </div>
    <div id="gah-pill" class="fresh"><span class="dot"></span><span id="gah-label">Harvest attachments</span></div>`);
  document.body.appendChild(root);

  const $ = id => document.getElementById(id);

  // Every UI log line is mirrored to the console with a [GAH] prefix
  const log = (msg, cls = 'info') => {
    const line = document.createElement('div');
    line.className = cls; line.textContent = msg; line.title = msg;
    $('gah-log').appendChild(line);
    $('gah-log').scrollTop = 1e9;
    const fn = cls === 'err' ? console.warn : console.log;
    fn(`[GAH] ${cls === 'ok' ? '\u2713 ' : cls === 'err' ? '\u2717 ' : ''}${msg}`);
  };

  const status = (text, working = false) => {
    $('gah-status-text').textContent = text;
    $('gah-status').className = working ? 'working' : (text === 'Idle' ? 'idle' : '');
    if (text !== 'Idle') console.log(`[GAH] \u25b8 ${text}`);
  };

  // Class removal alone can leave a rainbow frame visually "stuck" mid-cycle in some
  // Chrome builds; forcing animation:none on stop, then clearing it on the next start,
  // guarantees the bar is a flat solid color the instant a run finishes.
  const setBarWorking = on => {
    const fill = $('gah-fill');
    if (on) {
      fill.style.animation = '';
      fill.classList.add('working');
    } else {
      fill.classList.remove('working');
      fill.style.animation = 'none';
    }
  };

  // ---- Chip overlay helpers ----
  // Overlays are absolutely positioned children of Gmail's own attachment chips.
  // They're out of flow and pointer-events:none, so they change neither layout nor clicks.
  function markChip(chip, state, failed) {
    if (!chip) return;
    clearChip(chip);
    if (getComputedStyle(chip).position === 'static') {
      chip.style.position = 'relative';
      chip.dataset.gahPos = '1';          // remember we set it, so we can undo cleanly
    }
    const m = document.createElement('div');
    m.className = 'gah-mark ' + state + (failed ? ' failed' : '');
    chip.appendChild(m);
  }

  function clearChip(chip) {
    chip?.querySelectorAll(':scope > .gah-mark').forEach(el => el.remove());
  }

  function clearAllChips() {
    document.querySelectorAll('.gah-mark').forEach(el => el.remove());
    document.querySelectorAll('[data-gah-pos]').forEach(el => {
      el.style.position = '';
      delete el.dataset.gahPos;
    });
  }

  let running = false;

  // ---------- Core ----------
  function collectJobs() {
    const jobs = [];
    document.querySelectorAll('tr.zA').forEach(row => {
      const sender = row.querySelector('.yW span[name]')?.getAttribute('name') || 'UnknownSender';
      const msgId = row.querySelector('[data-legacy-last-message-id]')
                       ?.getAttribute('data-legacy-last-message-id');
      if (!msgId) return;
      row.querySelectorAll('.brc[data-index]').forEach(chip => {
        jobs.push({
          sender, msgId, chip,
          attid: '0.' + (parseInt(chip.getAttribute('data-index'), 10) + 1),
          fname: chip.getAttribute('title')
        });
      });
    });
    return jobs;
  }

  function getIk() {
    return (window.GLOBALS && GLOBALS[9]) ||
      (document.documentElement.innerHTML.match(/var GM_ID_KEY\s*=\s*'([^']+)'/) || [])[1] ||
      (document.documentElement.innerHTML.match(/"ik"\s*:\s*"([^"]+)"/) || [])[1] || null;
  }

  async function run() {
    if (running) return;
    $('gah-pill').classList.remove('fresh');   // yellow only until first click
    $('gah-panel').classList.add('open');
    $('gah-log').innerHTML = html('');
    clearAllChips();                            // wipe marks from any previous run

    status('Scanning rows\u2026', true);
    const jobs = collectJobs();
    if (!jobs.length) {
      status('Idle');
      log('No attachment rows found in this view.', 'err');
      return;
    }
    log(`Found ${jobs.length} attachments in view.`);

    status('Reading account token\u2026', true);
    const ik = getIk();
    if (!ik) {
      status('Idle');
      log('Could not find account ik token.', 'err');
      return;
    }

    status('Waiting for folder permission\u2026', true);
    let dir;
    try {
      // id makes Chrome remember the last-picked folder for this picker
      dir = await showDirectoryPicker({ id: 'gah-invoices', mode: 'readwrite' });
    } catch {
      status('Idle');
      log('Folder selection cancelled.');
      return;
    }

    running = true;
    $('gah-pill').classList.add('busy');
    setBarWorking(true);
    $('gah-label').textContent = 'Harvesting\u2026';
    log(`Writing to "${dir.name}"`);

    let done = 0, ok = 0;
    for (const j of jobs) {
      const name = `${sanitize(j.sender)} - ${sanitize(j.fname)}`;
      status(`Downloading ${done + 1}/${jobs.length}\u2026`, true);
      markChip(j.chip, 'scan');
      const url = `https://mail.google.com/mail/u/0?ui=2&ik=${ik}&view=att&th=${j.msgId}&attid=${j.attid}&disp=safe&zw`;
      let failed = false;
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        if (!blob.size) throw new Error('empty');
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob); await w.close();
        ok++; log(name, 'ok');
      } catch (e) {
        failed = true;
        log(`${name} (${e.message})`, 'err');
      }
      done++;
      $('gah-count').textContent = `${done}/${jobs.length}`;
      $('gah-fill').style.width = (done / jobs.length * 100) + '%';
      // Pacing delay happens while the ring is still spinning, so even an instant
      // download stays lit long enough (~400ms) to actually register visually.
      await new Promise(r => setTimeout(r, 400));
      markChip(j.chip, 'done', failed);
    }

    status('Idle');
    log(`Done \u2014 ${ok}/${jobs.length} saved.`);
    $('gah-pill').classList.remove('busy');
    setBarWorking(false);
    $('gah-label').textContent = 'Harvest attachments';
    running = false;
  }

  $('gah-pill').addEventListener('click', run);
})();
