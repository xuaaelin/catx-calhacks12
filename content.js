console.log("EcoPrompt active ");

const ECO_ID = "eco-prompt-widget";
const ECO_TEXT_ID = "eco-prompt-text";
const ECO_ICON_ID = "eco-prompt-icon";
const ECO_ADVICE_ID = "eco-prompt-advice";
const ECO_TOTALS_ID = "eco-prompt-totals";
const ECO_OUTPUT_ID = "eco-prompt-output";
const ECO_POS_KEY = "eco_prompt_pos";
const ECO_TOTAL_KEY = "eco_prompt_totals";
const FRAME_FILES = [
  "happy1.png",
  "happy2.png",
  "lesshappy3.png",
  "lesshappy4.png",
  "sad5.png",
  "sad6.png"
];

// Cumulative totals storage
let cumulativeTotals = {
  tokens: 0,
  energyWh: 0,
  waterMl: 0,
  co2Grams: 0
};

let usageAvg = null;
let lastTextLength = 0;
const CONVO_STORAGE_KEY = "eco_prompt_convo_key";
// Conversation embedding state (resets per chat)
let convoVec = null; // Float32Array
let convoCount = 0;
let lastSendTs = 0;
let convoKeyFreq = new Map(); // keyword -> count
let lastActivityTs = Date.now(); // updated on typing, send, and when outputs stream

function getConversationKey() {
  // Consider a new chat only when the path changes (ignore query/hash churn).
  return `${location.host}${location.pathname}`;
}

function resetTotals() {
  cumulativeTotals = { tokens: 0, energyWh: 0, waterMl: 0, co2Grams: 0 };
  saveTotals();
  usageAvg = null;
  lastProcessedText = "";
  // Reset conversation model and advice
  convoVec = null;
  convoCount = 0;
  convoKeyFreq = new Map();
  // Clear output tracking so we will baseline again next time
  try {
    observedObservers.forEach(o => { try { o.disconnect(); } catch(e){} });
    observedObservers = [];
  } catch(e) {}
  countedTokenMap = new WeakMap();
  observedOutputNodes = new WeakMap();
  outputsBaselined = false;
  const w = getWidget();
  const t = w.querySelector(`#${ECO_TEXT_ID}`);
  if (t) t.textContent = `Current: Energy ${format(0, "Wh")} · Water ${format(0, "mL")} · CO₂ ${format(0, "g")} · ${format(0, "tokens")}`;
  const tot = w.querySelector(`#${ECO_TOTALS_ID}`);
  if (tot) tot.textContent = `Total: Energy ${format(0, "Wh")} · CO₂ ${format(0, "g")} · ${format(0, "tokens")}`;
  const adv = w.querySelector(`#${ECO_ADVICE_ID}`);
  if (adv) { adv.style.display = "none"; adv.textContent = ""; }
  const icon = w.querySelector(`#${ECO_ICON_ID}`);
  if (icon) setUsageIcon(icon, 0);
}

function checkConversationChange() {
  try {
    // Never reset totals on claude.ai per user request
    if ((location.hostname || '').includes('claude.ai')) {
      const now = Date.now();
      localStorage.setItem(CONVO_STORAGE_KEY, getConversationKey());
      localStorage.setItem(CONVO_STORAGE_KEY + ":ts", String(now));
      if (window.ECO_DEBUG) console.log("EcoPrompt: URL change ignored on claude.ai (no reset)");
      return;
    }
    const key = getConversationKey();
    const prev = localStorage.getItem(CONVO_STORAGE_KEY);
    // Debounce resets: avoid rapid replaceState churn
    const now = Date.now();
    const lastTs = Number(localStorage.getItem(CONVO_STORAGE_KEY + ":ts")) || 0;
    const enoughTime = now - lastTs > 1000; // 1s guard
    // Also avoid resetting within 2s of a send (path changes some sites do)
    const avoidAfterSend = now - lastSendTs < 2000;
    // Avoid resetting if there was recent activity (typing or streaming outputs)
    const recentActivity = now - (lastActivityTs || 0) < 120000; // 120s guard
    if (prev !== key && enoughTime && !avoidAfterSend && !recentActivity) {
      localStorage.setItem(CONVO_STORAGE_KEY, key);
      localStorage.setItem(CONVO_STORAGE_KEY + ":ts", String(now));
      resetTotals();
      console.log("EcoPrompt: new chat detected, totals reset.");
    } else if (prev !== key) {
      // Update the stored key timestamp but skip reset due to recent activity
      localStorage.setItem(CONVO_STORAGE_KEY, key);
      localStorage.setItem(CONVO_STORAGE_KEY + ":ts", String(now));
      if (window.ECO_DEBUG) console.log("EcoPrompt: URL changed but skipped reset due to recent activity.");
    }
  } catch (e) {}
}

// lazy singleton
let openaiTok;
async function getOpenAiTokenizer() {
  if (openaiTok) return openaiTok;
  // Use @dqbd/tiktoken lite with cl100k_base
  const { Tiktoken } = await import('https://esm.sh/@dqbd/tiktoken/lite?target=es2022');
  const cl100k_base = (await import('https://esm.sh/@dqbd/tiktoken/encoders/cl100k_base.json')).default;
  const enc = new Tiktoken(
    cl100k_base.bpe_ranks,
    cl100k_base.special_tokens,
    cl100k_base.pat_str
  );
  openaiTok = {
    encode: (text) => enc.encode(text || ''),
    decode: (arr) => enc.decode(arr || []),
    _enc: enc,
  };
  return openaiTok;
}

async function countTokensOpenAI(text) {
  const tok = await getOpenAiTokenizer();
  return tok.encode(text).length; // cl100k_base by default
}

let claudeTok;
async function getClaudeTokenizer() {
  if (claudeTok) return claudeTok;
  const mod = await import('https://esm.sh/@anthropic-ai/tokenizer@0.1.9');
  claudeTok = mod;
  return claudeTok;
}

async function countTokensClaude(text) {
  const tok = await getClaudeTokenizer();
  return tok.countTokens(text);
}

async function getAccurateTokenCount(text) {
  const host = location.hostname;
  try {
    if (host.includes('chat.openai.com') || host.includes('chatgpt.com')) {
      return await countTokensOpenAI(text);
    }
    if (host.includes('claude.ai')) {
      return await countTokensClaude(text);
    }
  } catch (e) {
    // fall through to heuristic
  }
  // Fallback heuristic
  return Math.ceil((text || '').length / 4);
}

// Load saved totals on startup
function loadTotals() {
  try {
    const saved = localStorage.getItem(ECO_TOTAL_KEY);
    if (saved) {
      cumulativeTotals = JSON.parse(saved);
      console.log("Loaded cumulative totals:", cumulativeTotals);
    }
  } catch (e) {
    console.error("Failed to load totals:", e);
  }
}

// Save totals to localStorage
function saveTotals() {
  try {
    localStorage.setItem(ECO_TOTAL_KEY, JSON.stringify(cumulativeTotals));
  } catch (e) {
    console.error("Failed to save totals:", e);
  }
}

function setIconFrame(img, idx) {
  const i = Math.max(0, Math.min(FRAME_FILES.length - 1, Math.floor(idx)));
  const base = FRAME_FILES[i];
  const candidates = [base,
    base.replace(/\.jpe?g$/i, ".jpeg"),
    base.replace(/\.jpe?g$/i, ".jpg"),
    base.replace(/\.jpe?g$/i, ".png")
  ].filter((v, k, a) => v && a.indexOf(v) === k);
  let tried = 0;
  function tryNext() {
    if (tried >= candidates.length) return;
    const name = candidates[tried++];
    let url = name;
    try { url = chrome.runtime?.getURL ? chrome.runtime.getURL(name) : name; } catch(e) {}
    img.onerror = () => tryNext();
    img.src = url;
  }
  tryNext();
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function computeUsageScore({ energyWh, waterMl, co2g, tokens }) {
  const t = Math.max(1, tokens || 1);
  const ePerTok = (energyWh || 0) / t;
  const wPerTok = (waterMl || 0) / t;
  const cPerTok = (co2g || 0) / t;
  const eNorm = clamp(ePerTok / 0.0085, 0, 3);
  const wNorm = clamp(wPerTok / 0.00425, 0, 3);
  const cNorm = clamp(cPerTok / 0.00365, 0, 3);
  const score = 0.5 * eNorm + 0.3 * wNorm + 0.2 * cNorm;
  return score;
}

function setUsageIcon(icon, currentTokens) {
  // Convert current tokens to water (mL): per token water = 0.0085 Wh * 0.5 mL/Wh = 0.00425 mL
  const currentWater = (currentTokens || 0) * 0.00425;
  const sumWater = (cumulativeTotals.waterMl || 0) + currentWater;
  // Thresholds in mL, scaled so median (between frames 2 and 3) is 0.23 mL
  // Derived by scaling prior token thresholds (100,500,1000,2000,5000) -> water (0.425,2.125,4.25,8.5,21.25)
  // by factor 0.23 / 4.25 ≈ 0.054117647.
  const T1 = 2.30;   // frame 0 -> 1
  const T2 = 11.49;   // frame 1 -> 2
  const T3 = 23;     // frame 2 -> 3 (median)
  const T4 = 45.9;    // frame 3 -> 4
  const T5 = 114.8;    // frame 4 -> 5
  let frameIdx = 0;
  if (sumWater < T1) frameIdx = 0;
  else if (sumWater < T2) frameIdx = 1;
  else if (sumWater < T3) frameIdx = 2;
  else if (sumWater < T4) frameIdx = 3;
  else if (sumWater < T5) frameIdx = 4;
  else frameIdx = 5;
  setIconFrame(icon, frameIdx);
}

function getWidget() {
  let el = document.getElementById(ECO_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ECO_ID;
    el.style.position = "fixed";
    el.style.left = "16px";
    el.style.top = "16px";
    el.style.right = "unset";
    el.style.bottom = "unset";
    el.style.zIndex = "999999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(16,16,16,0.9)";
    el.style.color = "#fff";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    el.style.fontSize = "12px";
    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    el.style.backdropFilter = "saturate(180%) blur(10px)";
    el.style.pointerEvents = "auto";
    el.style.display = "inline-flex";
    el.style.alignItems = "center";
    el.style.gap = "8px";
    el.style.cursor = "grab";
    
    const icon = document.createElement("img");
    icon.id = ECO_ICON_ID;
    icon.width = 32;
    icon.height = 32;
    icon.style.display = "block";
    icon.style.objectFit = "contain";
    icon.style.flex = "0 0 auto";
    icon.alt = "usage";
    
    const textBox = document.createElement("div");
    textBox.style.display = "flex";
    textBox.style.flexDirection = "column";
    textBox.style.lineHeight = "1.25";
    const advice = document.createElement("span");
    advice.id = ECO_ADVICE_ID;
    advice.style.display = "none";
    advice.style.color = "#f59e0b"; // amber
    advice.style.fontWeight = "600";
    advice.textContent = "";
    const text = document.createElement("span");
    text.id = ECO_TEXT_ID;
    text.textContent = "Current: Energy 0 Wh · Water 0 mL · CO₂ 0 g · 0 tokens";
    const totals = document.createElement("span");
    totals.id = ECO_TOTALS_ID;
    totals.style.opacity = "0.8";
    totals.textContent = "Total: Energy 0 Wh · CO₂ 0 g · 0 tokens";
    const out = document.createElement("span");
    out.id = ECO_OUTPUT_ID;
    out.style.opacity = "0.9";
    out.textContent = "Estimated output: ~0 tokens";
    textBox.appendChild(advice);
    textBox.appendChild(text);
    textBox.appendChild(totals);
    textBox.appendChild(out);
    setIconFrame(icon, 0);
    el.appendChild(icon);
    el.appendChild(textBox);
    
    restorePosition(el);
    makeDraggable(el);
    document.documentElement.appendChild(el);
  }
  return el;
}

function format(n, unit) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function getEstimatedOutputCap() {
  const host = location.hostname;
  // Conversational UI caps (approximate)
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 4096; // GPT-4o via ChatGPT app ~4k
  if (host.includes('claude.ai')) return 4096; // conservative default for Claude UI
  // API defaults (if ever used in web tools)
  if (host.includes('openai.com')) return 16384; // GPT-4o API
  return 4096;
}

function calculateImpact(text) {
  const chars = text.trim().length;
  const tokens = Math.ceil(chars / 4);
  
  const energyWh = tokens * 0.0085;
  const waterMl = energyWh * 0.5;
  const co2Grams = (energyWh / 1000) * 430;
  
  return {tokens, energyWh, waterMl, co2Grams};
}

function impactFromTokens(tokens) {
  const t = Math.max(0, Math.ceil(tokens || 0));
  const energyWh = t * 0.0085;
  const waterMl = energyWh * 0.5;
  const co2Grams = (energyWh / 1000) * 430;
  return { tokens: t, energyWh, waterMl, co2Grams };
}

let userDragged = false;
let lastProcessedText = "";
let tokenizeRequestId = 0;
let pendingSendText = "";
let pendingSendTimer = null;
let pendingSendConsumed = false;
let lastCurrentImpact = { tokens: 0, energyWh: 0, waterMl: 0, co2Grams: 0 };
let suppressUntilTs = 0;
let lastFocusedEditable = null;

function commitSendNowFrom(el) {
  try {
    // Recompute current impact from editor now to match what user sees (for display only)
    let currentText = (getEditorValue(el) || "").trim();
    if (!currentText && lastProcessedText) currentText = lastProcessedText;
    const impact = currentText ? calculateImpact(currentText) : lastCurrentImpact || { tokens: 0, energyWh: 0, waterMl: 0, co2Grams: 0 };
    // Update conversation embedding with the sent text (but do not add to cumulative here)
    if (currentText) updateConversationModel(currentText);
    // On claude.ai and chatgpt.com/chat.openai.com, immediately add current impact into totals at send-time
    const host = (location.hostname || '');
    const addInputNow = host.includes('claude.ai') || host.includes('chatgpt.com') || host.includes('chat.openai.com');
    if (addInputNow && impact && impact.tokens > 0) {
      cumulativeTotals.tokens += impact.tokens;
      cumulativeTotals.energyWh += impact.energyWh;
      cumulativeTotals.waterMl += impact.waterMl;
      cumulativeTotals.co2Grams += impact.co2Grams;
      saveTotals();
    }
    // Reset current row to 0 immediately, update totals line
    renderTotals(impactFromTokens(0));
    // Suppress immediate subsequent re-render from pending input events
    suppressUntilTs = Date.now() + 350;
    lastActivityTs = Date.now();
    // Prevent double-count when the input clears right after
    lastProcessedText = "";
    pendingSendConsumed = true;
    if (pendingSendTimer) clearTimeout(pendingSendTimer);
    pendingSendText = "";
    pendingSendTimer = null;
    // Allow next send shortly after
    setTimeout(() => { pendingSendConsumed = false; }, 300);
    lastSendTs = Date.now();
    // Kick off aggressive output scanning for a short window so we catch streaming
    startOutputBoostScan();
  } catch (e) {}
}

function setPendingSendFrom(el) {
  try {
    pendingSendText = getEditorValue(el) || "";
    if (pendingSendTimer) clearTimeout(pendingSendTimer);
    pendingSendTimer = setTimeout(() => {
      pendingSendText = "";
      pendingSendTimer = null;
    }, 1500);
    // Try to commit immediately on send trigger (avoid waiting for clear)
    maybeCommitPendingSend();
  } catch (e) {}
}

function maybeCommitPendingSend() {
  if (pendingSendConsumed) return;
  const text = (pendingSendText || "").trim();
  if (!text) return;
  // Do not add to cumulative here; outputs will be accumulated separately
  updateConversationModel(text);
  // On claude.ai and chatgpt.com/chat.openai.com, also add current snapshot to totals when we had a pending send
  {
    const host = (location.hostname || '');
    const addInputNow = host.includes('claude.ai') || host.includes('chatgpt.com') || host.includes('chat.openai.com');
    if (addInputNow) {
      const sentImpact = calculateImpact(text);
      if (sentImpact && sentImpact.tokens > 0) {
        cumulativeTotals.tokens += sentImpact.tokens;
        cumulativeTotals.energyWh += sentImpact.energyWh;
        cumulativeTotals.waterMl += sentImpact.waterMl;
        cumulativeTotals.co2Grams += sentImpact.co2Grams;
        saveTotals();
      }
    }
  }
  pendingSendConsumed = true;
  // Reset current row to zero and refresh totals line
  renderTotals(impactFromTokens(0));
  lastActivityTs = Date.now();
  // Clear snapshot shortly after to allow next send
  if (pendingSendTimer) clearTimeout(pendingSendTimer);
  pendingSendText = "";
  pendingSendTimer = null;
  // Also reset lastProcessedText so future clear doesn't re-add
  lastProcessedText = "";
}

function renderTotals(currentImpact) {
  const w = getWidget();
  const t = w.querySelector(`#${ECO_TEXT_ID}`);
  if (t) {
    t.textContent = `Current: Energy ${format(currentImpact.energyWh, "Wh")} · Water ${format(currentImpact.waterMl, "mL")} · CO₂ ${format(currentImpact.co2Grams, "g")} · ${format(currentImpact.tokens, "tokens")}`;
  }
  // Track last displayed current values for exact accumulation on send
  lastCurrentImpact = currentImpact;
  const tot = w.querySelector(`#${ECO_TOTALS_ID}`);
  if (tot) {
    tot.textContent = `Total: Energy ${format(cumulativeTotals.energyWh, "Wh")} · CO₂ ${format(cumulativeTotals.co2Grams, "g")} · ${format(cumulativeTotals.tokens, "tokens")}`;
  }
  const out = w.querySelector(`#${ECO_OUTPUT_ID}`);
  if (out) {
    const cap = getEstimatedOutputCap();
    const remaining = Math.max(0, Math.floor(cap - (lastCurrentImpact.tokens || 0)));
    out.textContent = `Estimated output remaining: ~${format(remaining, "tokens")} (cap ${format(cap, "tokens")})`;
  }
  const icon = w.querySelector(`#${ECO_ICON_ID}`);
  if (icon) {
    setUsageIcon(icon, currentImpact.tokens);
  }
}

async function refineWithAccurateTokenizer(text) {
  const id = ++tokenizeRequestId;
  const trimmed = (text || "").trim();
  try {
    const tokens = await getAccurateTokenCount(trimmed);
    if (id !== tokenizeRequestId) return; // stale
    const current = impactFromTokens(tokens);
    renderTotals(current);
  } catch (e) {
    // ignore, keep heuristic
  }
}

function updateWidget(text, anchorEl) {
  const w = getWidget();
  const trimmedText = (text || "").trim();
  // If we just sent, keep current at zero briefly to make the reset visible
  if (Date.now() < suppressUntilTs) {
    renderTotals(impactFromTokens(0));
  } else {
    // Calculate current prompt impact
    const current = calculateImpact(trimmedText);
    renderTotals(current);
  }
  // Any typing/edit counts as recent activity to prevent accidental resets
  lastActivityTs = Date.now();
  // Update advice based on similarity to conversation context
  updateAdviceForText(trimmedText);

  // Detect if text was cleared (user sent message)
  const textCleared = lastProcessedText.length > 0 && trimmedText.length === 0;
  
  if (textCleared && lastProcessedText.length > 0) {
    // Only treat as send if we have a recent pending send snapshot
    if (!pendingSendConsumed && pendingSendText && pendingSendText.trim().length > 0) {
      maybeCommitPendingSend();
    } else {
      // Cleared without a send indicator (likely Ctrl/Cmd+A delete). Do not add.
      console.log("Input cleared without send; not adding to totals.");
    }
    if (pendingSendTimer) clearTimeout(pendingSendTimer);
    pendingSendText = "";
    pendingSendTimer = null;
    pendingSendConsumed = false;
  }
  
  lastProcessedText = trimmedText;
  // Try to refine with accurate tokenizer asynchronously
  refineWithAccurateTokenizer(trimmedText);
  
  // Only reposition if user hasn't manually dragged
  if (!userDragged && anchorEl && document.body.contains(anchorEl)) {
    const rect = anchorEl.getBoundingClientRect();
    const x = Math.min(window.innerWidth - w.offsetWidth - 16, rect.right - 4);
    const y = Math.max(16, rect.bottom + 8);
    w.style.left = "";
    w.style.right = `${Math.max(16, window.innerWidth - x - w.offsetWidth)}px`;
    w.style.bottom = `${Math.max(16, window.innerHeight - y)}px`;
    w.style.top = "";
  }
  
  return w;
}

// --- Accumulate assistant outputs (LLM responses) ---
const ECO_ASSIST_COUNT_KEY = "eco_assist_counted";
let countedTokenMap = new WeakMap(); // Element -> counted token total
let observedOutputNodes = new WeakMap(); // Element -> MutationObserver
let observedObservers = [];
let outputsBaselined = false;

function getAssistantSelectors() {
  const host = location.hostname;
  const generic = [
    '[data-message-author-role="assistant"]',
    '[data-testid*="assistant" i]',
    'article[aria-live]',
    '[role="article"]',
    '[class*="assistant" i]',
    '[data-role*="assistant" i]'
  ];
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    generic.push(
      '[data-message-author-role="assistant"]',
      '[data-testid="conversation-turn"] [data-message-author-role="assistant"]',
      '[data-testid="conversation-turn"] article',
      'main article'
    );
  }
  if (host.includes('claude.ai')) {
    generic.push(
      '[data-testid="assistant-message"]',
      '[data-testid="answer"]',
      'div[data-testid*="assistant" i]',
      'main [data-testid="message"] article',
      'div[aria-live="polite"] article',
      'section[aria-label*="Chat" i] article',
      // Broader fallbacks seen on Claude variants
      'main article',
      'article',
      '[data-testid="message"] article',
      'div.markdown, div.prose',
      // User-provided outer container class
      '.font-claude-response',
      '[class*="font-claude-response"]'
    );
  }
  return Array.from(new Set(generic));
}

function getAssistantNodes() {
  try {
    const nodes = deepQueryAll(getAssistantSelectors());
    return nodes.filter(n => n && n.isConnected && !n.closest?.(`#${ECO_ID}`));
  } catch (e) {
    return [];
  }
}

async function tokenizeForHost(text) {
  const host = location.hostname;
  try {
    if (host.includes('claude.ai')) return await countTokensClaude(text);
    // default to OpenAI cl100k
    return await countTokensOpenAI(text);
  } catch (e) {
    // Fallback heuristic if CDN blocked or tokenizer fails
    return Math.ceil((text || '').length / 4);
  }
}

async function scanAndAccumulateOutputs() {
  try {
    const nodes = getAssistantNodes();
    // On first detection after load, baseline counts without adding to totals
    if (!outputsBaselined && nodes.length) {
      for (const el of nodes) {
        const txt0 = (el.innerText || el.textContent || '').trim();
        if (!txt0) continue;
        const cur0 = Number(await tokenizeForHost(txt0)) || 0;
        countedTokenMap.set(el, cur0);
      }
      outputsBaselined = true;
      // Continue to attach observers below so streaming gets counted
    }
    for (const el of nodes) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt) continue;
      const prev = countedTokenMap.get(el) || 0;
      const cur = Number(await tokenizeForHost(txt)) || 0;
      if (cur > prev) {
        const delta = cur - prev;
        const deltaImpact = impactFromTokens(delta);
        cumulativeTotals.tokens += deltaImpact.tokens;
        cumulativeTotals.energyWh += deltaImpact.energyWh;
        cumulativeTotals.waterMl += deltaImpact.waterMl;
        cumulativeTotals.co2Grams += deltaImpact.co2Grams;
        countedTokenMap.set(el, cur);
        saveTotals();
        lastActivityTs = Date.now();
        if (ECO_DEBUG) {
          console.log('EcoPrompt output delta', { tokensDelta: delta, newTotal: cumulativeTotals.tokens, node: el });
        }
        // Refresh totals line; keep current at whatever is being typed
        renderTotals(lastCurrentImpact || impactFromTokens(0));
      }
      // Attach a streaming observer once per node to catch incremental updates
      if (!observedOutputNodes.has(el)) {
        try {
          const obs = new MutationObserver(() => {
            // Schedule a lightweight rescan for just this node
            Promise.resolve().then(async () => {
              try {
                const t2 = (el.innerText || el.textContent || '').trim();
                if (!t2) return;
                const prev2 = countedTokenMap.get(el) || 0;
                const cur2 = Number(await tokenizeForHost(t2)) || 0;
                if (cur2 > prev2) {
                  const d = cur2 - prev2;
                  const imp = impactFromTokens(d);
                  cumulativeTotals.tokens += imp.tokens;
                  cumulativeTotals.energyWh += imp.energyWh;
                  cumulativeTotals.waterMl += imp.waterMl;
                  cumulativeTotals.co2Grams += imp.co2Grams;
                  countedTokenMap.set(el, cur2);
                  saveTotals();
                  lastActivityTs = Date.now();
                  if (ECO_DEBUG) console.log('EcoPrompt output delta (stream)', { tokensDelta: d, newTotal: cumulativeTotals.tokens });
                  renderTotals(lastCurrentImpact || impactFromTokens(0));
                }
              } catch (_) {}
            });
          });
          obs.observe(el, { subtree: true, childList: true, characterData: true });
          observedOutputNodes.set(el, obs);
          observedObservers.push(obs);
        } catch (_) {}
      }
    }
  } catch (e) {}
}

function throttle(fn, ms) {
  let t = 0;
  let lastArgs = null;
  let pending = false;
  return function throttled(...args) {
    const now = Date.now();
    lastArgs = args;
    if (!pending && now - t >= ms) {
      t = now;
      fn.apply(this, args);
    } else if (!pending) {
      pending = true;
      const wait = Math.max(0, ms - (now - t));
      setTimeout(() => {
        t = Date.now();
        pending = false;
        fn.apply(this, lastArgs);
      }, wait);
    }
  };
}

function getEditorValue(el) {
  if (!el) return "";
  if (el.tagName === "TEXTAREA") return el.value || "";
  if (el.isContentEditable) return el.innerText || el.textContent || "";
  return "";
}

function attachListeners(el) {
  if (!el || el.dataset.ecoHooked) return;
  el.dataset.ecoHooked = true;
  el.addEventListener("focusin", () => { lastFocusedEditable = el; });
  const onEdit = throttle(() => {
    const text = getEditorValue(el);
    updateWidget(text, el);
    lastFocusedEditable = el;
  }, 150);
  el.addEventListener("input", onEdit);
  el.addEventListener("keyup", onEdit);
  // Capture large edits from non-keyboard interactions
  const triggerImmediate = () => {
    const text = getEditorValue(el);
    updateWidget(text, el);
  };
  ["cut", "paste", "drop", "compositionend", "change"].forEach((evt) => {
    el.addEventListener(evt, triggerImmediate);
  });
  // Detect Enter-based send (no modifiers)
  el.addEventListener("keydown", (e) => {
    // Enter to send (no modifiers)
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // Immediately accumulate current stats into totals and reset current row
      commitSendNowFrom(el);
    }
    // Backspace/Delete should reflect immediately (including after Ctrl/Cmd+A)
    if (e.key === "Backspace" || e.key === "Delete") {
      // Wait until DOM updates this keystroke, then recalc
      requestAnimationFrame(() => {
        const text = getEditorValue(el);
        updateWidget(text, el);
      });
    }
  });
  // Detect click/submit on likely send buttons near the editor
  try {
    const form = el.closest("form");
    if (form && !form.__ecoSendHooked) {
      form.__ecoSendHooked = true;
      form.addEventListener("submit", () => commitSendNowFrom(el));
    }
    // Common send buttons
    const candidates = [
      'button[type="submit"]',
      '[data-testid*="send"]',
      '[data-testid="send-button"]',
      '[aria-label*="Send" i]',
      '[title*="Send" i]',
      'button svg[aria-label*="Send" i]'
    ];
    // Domain-specific additions for reliability
    const host = location.hostname;
    if (host.includes('chatgpt.com')) {
      candidates.push('button[data-testid="send-button"]', '[aria-label="Send message" i]');
    }
    if (host.includes('claude.ai')) {
      candidates.push(
        'button[data-testid="send-button"]',
        'button[aria-label="Send" i]',
        '[aria-label="Send message" i]',
        '[aria-label*="Send message" i]'
      );
    }
    const btns = (form || document).querySelectorAll(candidates.join(","));
    btns.forEach((b) => {
      if (!b.__ecoSendHooked) {
        b.__ecoSendHooked = true;
        b.addEventListener("click", () => commitSendNowFrom(el));
      }
    });
  } catch (e) {}
  onEdit();
}

// Global delegated click handler as a safety net for send buttons
if (!window.__ecoGlobalSendHooked) {
  window.__ecoGlobalSendHooked = true;
  const delegatedSelectors = [
    'button[type="submit"]',
    '[data-testid*="send"]',
    '[data-testid="send-button"]',
    '[aria-label*="Send" i]',
    '[title*="Send" i]'
  ];
  if (location.hostname.includes('chatgpt.com')) {
    delegatedSelectors.push('button[data-testid="send-button"]', '[aria-label="Send message" i]');
  }
  if (location.hostname.includes('claude.ai')) {
    delegatedSelectors.push(
      'button[data-testid="send-button"]',
      'button[aria-label="Send" i]',
      '[aria-label="Send message" i]',
      '[aria-label*="Send message" i]'
    );
  }
  document.addEventListener('click', (e) => {
    try {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const sel = delegatedSelectors.join(',');
      const btn = target.closest(sel);
      if (btn) {
        // Use active editable element as the source
        const ae = document.activeElement;
        const source = isEditable(ae) ? ae : (lastFocusedEditable && isEditable(lastFocusedEditable) ? lastFocusedEditable : null);
        if (source) commitSendNowFrom(source);
      }
    } catch (_) {}
  }, true);
}

// --- Keyword extraction and pseudo-embeddings ---
const ECO_STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","at","by","for","in","of","on","to","with","is","are","was","were","be","been","it","this","that","these","those","as","from","about","into","over","after","before","than","so","too","very","can","will","just","not","no","yes","you","your","yours","me","my","we","our","they","their"
]);

function tokenizeText(t) {
  return (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_\-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractKeywords(text, maxK = 12) {
  const toks = tokenizeText(text);
  const freq = new Map();
  for (const w of toks) {
    if (w.length < 3) continue;
    if (ECO_STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a,b) => b[1]-a[1])
    .slice(0, maxK)
    .map(([w]) => w);
}

function seededHash(str) {
  let h1 = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
  }
  return h1 >>> 0;
}

function wordToVec(word, dim = 32) {
  const out = new Float32Array(dim);
  let seed = seededHash(word);
  for (let i=0;i<dim;i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = ((seed & 0xffff) / 0xffff) * 2 - 1; // [-1,1]
    out[i] = v;
  }
  // normalize
  let norm = 0; for (let i=0;i<dim;i++) norm += out[i]*out[i];
  norm = Math.sqrt(norm) || 1;
  for (let i=0;i<dim;i++) out[i] /= norm;
  return out;
}

function embedText(text, dim = 32) {
  const keys = extractKeywords(text, 12);
  if (!keys.length) return null;
  const v = new Float32Array(dim);
  for (const k of keys) {
    const wv = wordToVec(k, dim);
    for (let i=0;i<dim;i++) v[i] += wv[i];
  }
  // normalize
  let norm = 0; for (let i=0;i<dim;i++) norm += v[i]*v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i=0;i<dim;i++) v[i] /= norm;
  return v;
}

function cosineSim(a, b) {
  if (!a || !b) return 1;
  let dot = 0, na = 0, nb = 0;
  for (let i=0;i<a.length;i++) {
    const x=a[i], y=b[i];
    dot += x*y; na += x*x; nb += y*y;
  }
  const d = (Math.sqrt(na)||1) * (Math.sqrt(nb)||1);
  return dot / d;
}

function updateConversationModel(text) {
  const ev = embedText(text);
  if (!ev) return;
  if (!convoVec) {
    convoVec = new Float32Array(ev.length);
    convoCount = 0;
  }
  // running average
  const n = convoCount;
  for (let i=0;i<ev.length;i++) {
    const prev = convoVec[i];
    convoVec[i] = (prev * n + ev[i]) / (n + 1);
  }
  convoCount = n + 1;
  // update keyword frequency set
  const k = extractKeywords(text, 20);
  for (const kw of k) {
    convoKeyFreq.set(kw, (convoKeyFreq.get(kw) || 0) + 1);
  }
}

const ECO_DEBUG = false; // set true to log similarity and keywords
function updateAdviceForText(text) {
  const w = getWidget();
  const adv = w.querySelector(`#${ECO_ADVICE_ID}`);
  if (!adv) return;
  const keys = extractKeywords(text, 12);
  const ev = embedText(text);
  if (!ev || !convoVec || convoCount < 1) {
    adv.style.display = "none";
    adv.textContent = "";
    return;
  }
  const sim = cosineSim(ev, convoVec);
  // keyword overlap ratio (Jaccard-like on keywords)
  let overlap = 0;
  if (keys.length && convoKeyFreq.size) {
    const keySet = new Set(keys);
    let common = 0;
    keySet.forEach(k => { if (convoKeyFreq.has(k)) common++; });
    overlap = common / keySet.size;
  }
  if (ECO_DEBUG) {
    console.log("EcoPrompt advice:", { keys, sim: Number(sim.toFixed(3)), overlap: Number(overlap.toFixed(3)), convoCount });
  }
  // Trigger advice only if both cosine and keyword overlap are low
  if (sim < 0.45 && overlap < 0.15) {
    adv.style.display = "block";
    adv.textContent = "Tip: This prompt seems unrelated. Start a new chat for better efficiency.";
  } else {
    adv.style.display = "none";
    adv.textContent = "";
  }
}

function isEditable(node) {
  return (
    node &&
    (node.tagName === "TEXTAREA" ||
      node.isContentEditable ||
      node.getAttribute?.("role") === "textbox")
  );
}

const onGlobalInput = throttle((e) => {
  const t = e.target;
  if (isEditable(t)) {
    updateWidget(getEditorValue(t), t);
  }
}, 120);

window.addEventListener("input", onGlobalInput, true);
window.addEventListener("keyup", onGlobalInput, true);

let pollTimer = setInterval(() => {
  const ae = document.activeElement;
  if (isEditable(ae)) {
    updateWidget(getEditorValue(ae), ae);
  }
}, 500);

function deepQueryAll(selectors, root = document) {
  const out = new Set();
  const sel = Array.isArray(selectors) ? selectors.join(",") : selectors;
  try {
    root.querySelectorAll(sel).forEach((n) => out.add(n));
  } catch (e) {}
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const el = node;
    if (el.shadowRoot) {
      try {
        el.shadowRoot.querySelectorAll(sel).forEach((n) => out.add(n));
      } catch (e) {}
      const inner = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_ELEMENT);
      let n2 = inner.currentNode;
      while (n2) {
        const el2 = n2;
        if (el2.shadowRoot) {
          try {
            el2.shadowRoot.querySelectorAll(sel).forEach((n) => out.add(n));
          } catch (e) {}
        }
        n2 = inner.nextNode();
      }
    }
    node = walker.nextNode();
  }
  return Array.from(out);
}

function hookTextareas() {
  const selectors = [
    "textarea",
    'div[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
    '[data-testid="textbox"]',
    'div[contenteditable][data-id*="prompt"]'
  ];
  const nodes = deepQueryAll(selectors);
  nodes.forEach((el) => attachListeners(el));
  // Also check if conversation changed while DOM updated
  checkConversationChange();
  // Scan for assistant outputs on each mutation pass
  scanAndAccumulateOutputs();
}

const observer = new MutationObserver(hookTextareas);
observer.observe(document.body, { childList: true, subtree: true });
hookTextareas();
let rescanTimer = setInterval(hookTextareas, 1500);
// Periodically scan for assistant outputs in case of streaming updates
let outputScanTimer = setInterval(scanAndAccumulateOutputs, 800);

// After a send, increase scan frequency briefly to catch streaming outputs quickly
let boostTimer = null;
let boostUntil = 0;
function startOutputBoostScan() {
  try {
    boostUntil = Date.now() + 15000; // 15s window
    if (boostTimer) clearInterval(boostTimer);
    boostTimer = setInterval(() => {
      if (Date.now() > boostUntil) {
        clearInterval(boostTimer);
        boostTimer = null;
        return;
      }
      scanAndAccumulateOutputs();
    }, 150);
  } catch (e) {}
}

// Detect SPA URL changes (new chat) and reset totals
function patchHistoryForUrlEvents() {
  try {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    if (!window.__ecoHistoryPatched) {
      window.__ecoHistoryPatched = true;
      history.pushState = function (...args) {
        const ret = origPush.apply(this, args);
        window.dispatchEvent(new Event("eco-url-change"));
        return ret;
      };
      history.replaceState = function (...args) {
        const ret = origReplace.apply(this, args);
        window.dispatchEvent(new Event("eco-url-change"));
        return ret;
      };
      window.addEventListener("popstate", () => window.dispatchEvent(new Event("eco-url-change")));
      window.addEventListener("eco-url-change", checkConversationChange);
    }
  } catch (e) {}
}

patchHistoryForUrlEvents();
checkConversationChange();
// Fallback polling in case site uses non-history URL changes
setInterval(checkConversationChange, 2000);

function restorePosition(el) {
  try {
    const raw = localStorage.getItem(ECO_POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
      el.style.right = "";
      el.style.bottom = "";
      el.style.position = "fixed";
    }
  } catch (e) {}
}

function makeDraggable(el) {
  let dragging = false;
  let dx = 0, dy = 0;
  function onDown(e) {
    userDragged = true;
    dragging = true;
    const rect = el.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) || 0;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) || 0;
    dx = cx - rect.left;
    dy = cy - rect.top;
    el.style.cursor = "grabbing";
    el.style.right = "unset";
    el.style.bottom = "unset";
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) || 0;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) || 0;
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, cx - dx));
    const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, cy - dy));
    el.style.right = "unset";
    el.style.bottom = "unset";
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = "grab";
    try {
      const rect = el.getBoundingClientRect();
      localStorage.setItem(ECO_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
    } catch (e) {}
  }
  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
}

// Initialize on load
loadTotals();
console.log("EcoPrompt initialized with cumulative totals:", cumulativeTotals);