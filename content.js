console.log("EcoPrompt active ");

const ECO_ID = "eco-prompt-widget";

function getWidget() {
  let el = document.getElementById(ECO_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ECO_ID;
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.zIndex = "999999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(16,16,16,0.9)";
    el.style.color = "#fff";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    el.style.fontSize = "12px";
    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    el.style.backdropFilter = "saturate(180%) blur(10px)";
    el.style.pointerEvents = "none";
    el.textContent = "EcoPrompt: estimating...";
    document.documentElement.appendChild(el);
  }
  return el;
}

function format(n, unit) {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function estimateFromText(text) {
  const chars = (text || "").trim().length;
  const tokens = Math.max(0, Math.ceil(chars / 4));
  const energyKwh = tokens * 0.000005;
  const waterL = energyKwh * 0.5;
  return { tokens, energyKwh, waterL };
}

function updateWidget(text, anchorEl) {
  const w = getWidget();
  const { tokens, energyKwh, waterL } = estimateFromText(text);
  const energyWh = energyKwh * 1000;
  const waterMl = waterL * 1000;
  w.textContent = `Est. energy ${format(energyWh, "Wh")} · water ${format(waterMl, "mL")} · ${format(tokens, "tokens")}`;
  if (anchorEl && document.body.contains(anchorEl)) {
    const rect = anchorEl.getBoundingClientRect();
    const x = Math.min(window.innerWidth - w.offsetWidth - 16, rect.right - 4);
    const y = Math.max(16, rect.bottom + 8);
    w.style.left = "";
    w.style.right = `${Math.max(16, window.innerWidth - x - w.offsetWidth)}px`;
    w.style.bottom = `${Math.max(16, window.innerHeight - y)}px`;
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
      // Recurse one level deeper
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

// Hook into ChatGPT textareas
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
