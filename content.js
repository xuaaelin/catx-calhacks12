console.log("EcoPrompt active ");

const ECO_ID = "eco-prompt-widget";
const ECO_TEXT_ID = "eco-prompt-text";
const ECO_ICON_ID = "eco-prompt-icon";
const ECO_POS_KEY = "eco_prompt_pos";
const ECO_TOTAL_KEY = "eco_prompt_totals";
const FRAME_FILES = [
  "happy1.jpeg",
  "happy2.jpeg",
  "lesshappy3.jpeg",
  "lesshappy4.jpeg",
  "sad5.jpeg",
  "sad6.jpeg"
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
  const name = FRAME_FILES[i];
  console.log(`Setting bear frame to: ${name} (index ${i})`);
  try {
    const url = chrome.runtime?.getURL ? chrome.runtime.getURL(name) : name;
    img.src = url;
    console.log(`Bear image URL: ${url}`);
  } catch (e) {
    img.src = name;
    console.error("Failed to load bear image:", e);
  }
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
  // Use cumulative tokens to determine bear happiness
  const totalTokens = cumulativeTotals.tokens;
  
  console.log(`Total tokens consumed: ${totalTokens}`);
  
  // Bear gets sadder as total consumption increases
  let frameIdx = 0; // Start happy
  
  if (totalTokens < 100) frameIdx = 0;         // happy1 (0-100 tokens)
  else if (totalTokens < 500) frameIdx = 1;    // happy2 (100-500 tokens)
  else if (totalTokens < 1000) frameIdx = 2;   // neutral3 (500-1k tokens)
  else if (totalTokens < 2000) frameIdx = 3;   // lesshappy4 (1k-2k tokens)
  else if (totalTokens < 5000) frameIdx = 4;   // sad5 (2k-5k tokens)
  else frameIdx = 5;                           // sad6 (5k+ tokens)
  
  console.log(`Bear frame index: ${frameIdx} based on ${totalTokens} total tokens`);
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
    
    const text = document.createElement("span");
    text.id = ECO_TEXT_ID;
    text.textContent = "EcoPrompt: Ready...";
    
    setIconFrame(icon, 0);
    el.appendChild(icon);
    el.appendChild(text);
    
    restorePosition(el);
    makeDraggable(el);
    document.documentElement.appendChild(el);
  }
  return el;
}

function format(n, unit) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function calculateImpact(text) {
  const chars = text.trim().length;
  const tokens = Math.ceil(chars / 4);
  
  const energyWh = tokens * 0.0085;
  const waterMl = energyWh * 0.5;
  const co2Grams = (energyWh / 1000) * 430;
  
  return { tokens, energyWh, waterMl, co2Grams };
}

let userDragged = false;
let lastProcessedText = "";

function updateWidget(text, anchorEl) {
  const w = getWidget();
  const trimmedText = (text || "").trim();
  
  // Calculate current prompt impact
  const current = calculateImpact(trimmedText);
  
  // Detect if text was cleared (user sent message)
  const textCleared = lastProcessedText.length > 0 && trimmedText.length === 0;
  
  if (textCleared && lastProcessedText.length > 0) {
    // Add last prompt to cumulative totals
    const lastImpact = calculateImpact(lastProcessedText);
    cumulativeTotals.tokens += lastImpact.tokens;
    cumulativeTotals.energyWh += lastImpact.energyWh;
    cumulativeTotals.waterMl += lastImpact.waterMl;
    cumulativeTotals.co2Grams += lastImpact.co2Grams;
    saveTotals();
    console.log("Message sent! Added to cumulative totals:", lastImpact);
    console.log("New cumulative totals:", cumulativeTotals);
  }
  
  lastProcessedText = trimmedText;
  
  // Display current + cumulative
  const totalTokens = cumulativeTotals.tokens + current.tokens;
  const totalEnergy = cumulativeTotals.energyWh + current.energyWh;
  const totalWater = cumulativeTotals.waterMl + current.waterMl;
  const totalCO2 = cumulativeTotals.co2Grams + current.co2Grams;
  
  const t = w.querySelector(`#${ECO_TEXT_ID}`);
  if (t) {
    t.textContent = `Total: Energy ${format(totalEnergy, "Wh")} · Water ${format(totalWater, "mL")} · CO₂ ${format(totalCO2, "g")} · ${format(totalTokens, "tokens")}`;
  }
  
  // Update bear icon based on cumulative totals
  const icon = w.querySelector(`#${ECO_ICON_ID}`);
  if (icon) {
    setUsageIcon(icon, current.tokens);
  }
  
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
  const onEdit = throttle(() => {
    const text = getEditorValue(el);
    updateWidget(text, el);
  }, 150);
  el.addEventListener("input", onEdit);
  el.addEventListener("keyup", onEdit);
  onEdit();
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
}

const observer = new MutationObserver(hookTextareas);
observer.observe(document.body, { childList: true, subtree: true });
hookTextareas();
let rescanTimer = setInterval(hookTextareas, 1500);

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