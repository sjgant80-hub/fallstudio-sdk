// fallstudio SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallstudio/index.html · 46805 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallstudio" }); }
    else go();
  })();
'use strict';
const PRIME = 1409;
const VERSION = '1.0.0';
const state = {
  settings: {},
  pSel: 0,
  pResults: [],
  liveCount: 0,
};
/* ---------- suite registry ---------- */
const SUITE = [
  {
    id:'fallmage', icon:'◧', name:'FallMage', replaces:'Photoshop',
    url:'https://sjgant80-hub.github.io/fallmage/',
    purpose:'Raster image editor · crop, filter, paint, retouch · runs entirely in your browser.',
    size:'~210KB', prime:269,
    features:['Layers · blend modes · masks','Brushes · filters · adjustments','PNG / JPG / WebP export','Drag-drop or paste any image'],
  },
  {
    id:'fallpdf', icon:'▦', name:'FallPDF', replaces:'Acrobat (writer)',
    url:'https://sjgant80-hub.github.io/fallpdf/',
    purpose:'Author PDFs from text, images and templates · letters, memos, invoices, briefs.',
    size:'~180KB', prime:311,
    features:['Template-driven authoring','Headers, footers, page numbers','Inline images and tables','One-click export · self-contained PDF'],
  },
  {
    url:'https://sjgant80-hub.github.io/fallvector/',
    purpose:'Vector illustration · logos, icons, SVG · pen tool, paths, boolean ops.',
    size:'~240KB', prime:347,
    features:['Pen · pencil · shape tools','Boolean path operations','SVG export · pixel-perfect','Layers · groups · alignment'],
  },
  {
    id:'fallpage', icon:'▤', name:'FallPage', replaces:'InDesign',
    url:'https://sjgant80-hub.github.io/fallpage/',
    purpose:'Page layout · brochures, magazines, booklets, spreads · grids and columns.',
    size:'~200KB', prime:373,
    features:['Multi-page documents','Grids · guides · columns','Text frames with linking','PDF / print-ready export'],
  },
  {
    id:'fallaudio', icon:'♪', name:'FallAudio', replaces:'Audition',
    url:'https://sjgant80-hub.github.io/fallaudio/',
    purpose:'Audio capture and editing · voice memos, podcasts, soundbeds · WAV / MP3.',
    size:'~190KB', prime:401,
    features:['Browser mic capture · multi-track','Trim · fade · normalise · EQ','WAV / MP3 / OGG export','Waveform editing'],
  },
  {
    id:'fallmotion', icon:'▶', name:'FallMotion', replaces:'After Effects',
    url:'https://sjgant80-hub.github.io/fallmotion/',
    purpose:'Motion graphics · logo animation, lower thirds, GIF / WebM loops · keyframe timeline.',
    size:'~260KB', prime:431,
    features:['Keyframe timeline · easing','SVG + raster animation','GIF / WebM / MP4 export','Presets · reveals · lower thirds'],
  },
  {
    id:'fallasset', icon:'⊞', name:'FallAsset', replaces:'Bridge / Lightroom',
    url:'https://sjgant80-hub.github.io/fallasset/',
    purpose:'Asset library · catalogue, tag, rate, browse · photo and graphic collections.',
    size:'~170KB', prime:457,
    features:['IndexedDB-backed library','Tags · ratings · collections','EXIF · filter · search','Drag-drop import · batch ops'],
  },
  {
    id:'fallscene', icon:'◉', name:'FallScene', replaces:'Dimension',
    url:'https://sjgant80-hub.github.io/fallscene/',
    purpose:'3D product staging · GLB import, materials, lighting, render to PNG.',
    size:'~280KB', prime:479,
    features:['GLB / GLTF import','PBR materials · HDRI lighting','Real-time WebGL preview','Snapshot · PNG render export'],
  },
];
/* ---------- T0 router ---------- */
const ROUTES = [
  { tool:'fallmage',   verbs:/\b(image|photo|crop|filter|brush|paint|jpg|png|webp|edit picture|retouch|mask|layer)\b/i },
  { tool:'fallpdf',    verbs:/\b(pdf|document|letter|memo|invoice|cv|resume|report|brief|contract)\b/i },
  { tool:'fallvector', verbs:/\b(vector|svg|logo|illustration|icon|graphic)\b/i },
  { tool:'fallpage',   verbs:/\b(brochure|layout|page|magazine|booklet|spread|columns|newsletter|zine)\b/i },
  { tool:'fallaudio',  verbs:/\b(audio|sound|record|voice|wav|mp3|podcast|mic|jingle)\b/i },
  { tool:'fallmotion', verbs:/\b(animat|motion|gif|video|webm|reveal|lower third|loop|kinetic)\b/i },
  { tool:'fallasset',  verbs:/\b(organi[sz]e|browse|library|collection|tag|rate|catalog|catalogue|sort)\b/i },
  { tool:'fallscene',  verbs:/\b(3d|render|scene|model|product render|glb|gltf|staging|three-?d)\b/i },
];
function routeT0(intent){
  if(!intent || !intent.trim()) return [];
  const hits = [];
  for(const r of ROUTES){
    const m = intent.match(r.verbs);
    if(m){
      const tool = SUITE.find(t => t.id === r.tool);
      if(tool) hits.push({tool, match:m[0], hint:intent});
    }
  }
  // dedupe by tool id
  const seen = new Set();
  return hits.filter(h => { if(seen.has(h.tool.id))return false; seen.add(h.tool.id); return true; });
}
/* ---------- Cascade (T0 / T2 / T3) ---------- */
const Cascade={
  async detectTier(){if(await this._probe())return'T2';const s=state.settings;if(s.anthropicKey||s.openaiKey||s.geminiKey||s.openrouterKey)return'T3';return'T0'},
  async _probe(){if(this._p!==undefined)return this._p;try{this._p=await Promise.race([fetch('http://127.0.0.1:11434/api/tags').then(r=>r.ok),new Promise(r=>setTimeout(()=>r(false),350))])}catch(e){this._p=false}return this._p},
  async generate(sys,user,maxTok){const s=state.settings,max=maxTok||1200;
    if(s.anthropicKey)try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':s.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:max,system:sys,messages:[{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·Claude',text:d?.content?.[0]?.text||''}}catch(e){}
    if(s.geminiKey)try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${s.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{parts:[{text:user}]}]})});const d=await r.json();return{tier:'T3·Gemini',text:d?.candidates?.[0]?.content?.parts?.[0]?.text||''}}catch(e){}
    if(s.openaiKey)try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·GPT',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    if(s.openrouterKey)try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openrouterKey,'HTTP-Referer':location.origin},body:JSON.stringify({model:'anthropic/claude-haiku-4-5',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·OpenRouter',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    return{tier:'T0',text:null}
  }
};
/* ---------- T3 LLM router ---------- */
async function routeT3(intent){
  const sys = `You are the FallStudio router. The suite contains 8 tools:
${SUITE.map(t => `- ${t.id} (replaces ${t.replaces}): ${t.purpose}`).join('\n')}
Given a user intent, return a JSON object: {"tool":"<tool id>","hint":"<short pre-fill hint for the tool>","why":"<one-line reason>"}
Return ONLY the JSON object, no prose, no markdown fences.`;
  const out = await Cascade.generate(sys, intent, 240);
  if(!out.text) return null;
  try{
    const m = out.text.match(/\{[\s\S]*\}/);
    if(!m) return null;
    const parsed = JSON.parse(m[0]);
    const tool = SUITE.find(t => t.id === parsed.tool);
    if(!tool) return null;
    return {tool, hint:parsed.hint||intent, why:parsed.why||'', tier:out.tier};
  }catch(e){ return null; }
}
/* ---------- render grid ---------- */
function renderGrid(){
  g.innerHTML = SUITE.map(t => `
    <div class="card" data-id="${t.id}" onclick="this.classList.toggle('touched')">
      <div class="card-top">
        <span class="card-glyph">${t.icon}</span>
        <span class="card-status"><span class="dot checking" id="dot-${t.id}"></span><span id="st-${t.id}">checking</span></span>
      </div>
      <div>
        <div class="card-name">${t.name}</div>
        <div class="card-replaces">replaces ${t.replaces}</div>
      </div>
      <div class="card-purpose">${t.purpose}</div>
      <div class="card-detail">
        <ul class="card-features">${t.features.map(f => `<li>${f}</li>`).join('')}</ul>
        <div class="card-meta">
          <span>prime <b>${t.prime}</b></span>
          <span>size <b>${t.size}</b></span>
        </div>
      </div>
      <div class="card-actions">
        <a class="btn primary" href="${t.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">open ${t.name} ↗</a>
      </div>
    </div>
  `).join('');
}
/* ---------- live status ping ---------- */
async function checkLive(){
  let live = 0;
  await Promise.all(SUITE.map(async t => {
    try{
      const ctl = new AbortController();
      const timer = setTimeout(()=>ctl.abort(), 5000);
      // use no-cors so we at least get a response opaque to us; if it errors, it's down
      const r = await fetch(t.url, {method:'GET', mode:'no-cors', signal:ctl.signal, cache:'no-store'});
      clearTimeout(timer);
      // opaque responses succeed silently — treat as live
      dot.classList.remove('checking','down');
      dot.classList.add('up');
      lbl.textContent = 'live';
      live++;
    }catch(e){
      dot.classList.remove('checking','up');
      dot.classList.add('down');
      lbl.textContent = 'deploying';
    }
  }));
  state.liveCount = live;
}
/* ---------- Ω palette ---------- */
function openPalette(){
  inp.value = '';
  setTimeout(()=>inp.focus(), 40);
  renderPaletteSuggestions();
}
function closePalette(){
}
function renderPaletteSuggestions(){
  state.pResults = SUITE.map(t => ({tool:t, hint:''}));
  state.pSel = 0;
  body.innerHTML = `<div style="padding:10px 16px 6px;font-family:var(--mono);font-size:10px;color:var(--cream-muted);text-transform:uppercase;letter-spacing:1.2px">all tools</div>` +
    state.pResults.map((r,i) => paletteRow(r, i)).join('');
  attachPaletteHandlers();
}
function paletteRow(r, i){
  return `<div class="p-row ${i===state.pSel?'sel':''}" data-i="${i}">
    <span class="pg">${r.tool.icon}</span>
    <div class="pi">
      <span class="pn">${r.tool.name}</span>
      <span class="pd">${r.tool.replaces} · ${r.tool.purpose.split('·')[0].trim()}</span>
    </div>
    <span class="pk">↵</span>
  </div>`;
}
function attachPaletteHandlers(){
    el.onclick = () => {
      const i = +el.dataset.i;
      const r = state.pResults[i];
    };
  });
}
async function runPaletteQuery(q){
  if(!q.trim()){ renderPaletteSuggestions(); return; }
  // T0 first
  const t0 = routeT0(q);
  if(t0.length){
    state.pResults = t0.map(h => ({tool:h.tool, hint:q, match:h.match}));
    state.pSel = 0;
    body.innerHTML = `<div style="padding:10px 16px 6px;font-family:var(--mono);font-size:10px;color:var(--brass);text-transform:uppercase;letter-spacing:1.2px">T0 · keyword match</div>` +
      state.pResults.map((r,i) => paletteRow(r, i)).join('');
    attachPaletteHandlers();
    return;
  }
  // try T3
  const tier = await Cascade.detectTier();
  if(tier === 'T3'){
    body.innerHTML = `<div class="p-empty">routing via ${tier} · parsing intent…</div>`;
    const t3 = await routeT3(q);
    if(t3){
      state.pResults = [{tool:t3.tool, hint:t3.hint}];
      state.pSel = 0;
      body.innerHTML = `<div style="padding:10px 16px 6px;font-family:var(--mono);font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1.2px">${t3.tier} · ${t3.why||'parsed intent'}</div>` +
        paletteRow(state.pResults[0], 0);
      attachPaletteHandlers();
      return;
    }
  }
  // fallback: fuzzy name match
  const ql = q.toLowerCase();
  const fuzzy = SUITE.filter(t =>
    t.name.toLowerCase().includes(ql) ||
    t.replaces.toLowerCase().includes(ql) ||
    t.purpose.toLowerCase().includes(ql)
  );
  if(fuzzy.length){
    state.pResults = fuzzy.map(t => ({tool:t, hint:q}));
    state.pSel = 0;
    body.innerHTML = `<div style="padding:10px 16px 6px;font-family:var(--mono);font-size:10px;color:var(--cream-muted);text-transform:uppercase;letter-spacing:1.2px">fuzzy match</div>` +
      state.pResults.map((r,i) => paletteRow(r, i)).join('');
    attachPaletteHandlers();
    return;
  }
  body.innerHTML = `<div class="p-empty">no match · try "edit photo", "make brochure", "3d render", "voice memo"</div>`;
  state.pResults = [];
}
function launchTool(tool, hint){
  const url = new URL(tool.url);
  if(hint && hint.trim()) url.searchParams.set('intent', hint.trim());
  url.searchParams.set('from', 'fallstudio');
  toast('opening ' + tool.name + ' ↗');
  closePalette();
}
/* ---------- settings ---------- */
function openSettings(){
  const s = state.settings;
}
function saveSettings(){
  localStorage.setItem('fallstudio.settings', JSON.stringify(state.settings));
  closeSettings();
  toast('settings saved');
  updateTierBadge();
}
function loadSettings(){
  try{ state.settings = JSON.parse(localStorage.getItem('fallstudio.settings') || '{}'); }catch(e){ state.settings = {}; }
}
/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
/* ---------- manifest export ---------- */
function exportManifest(){
  const manifest = {
    name:'fallstudio', version:VERSION, prime:PRIME,
    description:'sovereign creative suite · hub for the fall* creative tools',
    tools: SUITE.map(t => ({id:t.id, icon:t.icon, name:t.name, replaces:t.replaces, url:t.url, prime:t.prime, size:t.size})),
    routes: ROUTES.map(r => ({tool:r.tool, pattern:r.verbs.source})),
    generated: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fallstudio-manifest-v' + VERSION + '.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('manifest exported');
}
/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    else openPalette();
    return;
  }
  if(e.key === 'Escape'){
    closePalette();
    closeSettings();
    return;
  }
  if(e.key === 'ArrowDown'){ e.preventDefault(); if(state.pResults.length){ state.pSel = (state.pSel+1)%state.pResults.length; refreshPaletteSel(); } }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); if(state.pResults.length){ state.pSel = (state.pSel-1+state.pResults.length)%state.pResults.length; refreshPaletteSel(); } }
  else if(e.key === 'Enter'){
    e.preventDefault();
    const r = state.pResults[state.pSel];
  }
});
function refreshPaletteSel(){
  if(sel) sel.scrollIntoView({block:'nearest'});
}
let debounce;
document.addEventListener('input', e => {
  if(e.target.id === 'pInput'){
    clearTimeout(debounce);
    const q = e.target.value;
    debounce = setTimeout(()=>runPaletteQuery(q), 180);
  }
});
/* ---------- URL intent handoff (if someone arrives with ?intent=...) ---------- */
function handleArrivingIntent(){
  const p = new URLSearchParams(location.search);
  const intent = p.get('intent');
  if(intent){
    setTimeout(()=>{
      openPalette();
      inp.value = intent;
      runPaletteQuery(intent);
    }, 400);
  }
}
/* ---------- boot ---------- */
loadSettings();
renderGrid();
checkLive();
updateTierBadge();
handleArrivingIntent();
/* ---------- KONOMI sovereign shim · fallmesh · postMessage API ---------- */
try{const sig=new BroadcastChannel('fall-signal');sig.postMessage({source:'fallstudio',type:'hello',prime:PRIME,version:VERSION,ts:Date.now()});sig.addEventListener('message',e=>{const m=e.data;if(m&&m.type==='ping')sig.postMessage({source:'fallstudio',type:'pong',prime:PRIME})})}catch(e){}

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { PRIME };
export { VERSION };
