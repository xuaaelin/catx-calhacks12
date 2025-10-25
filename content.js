// content.js
(function () {
    // Run when the page finishes loading
    window.addEventListener('load', () => {
      // Try to find the ChatGPT textarea (adjust selector for Claude etc.)
      const observer = new MutationObserver(() => {
        const textAreas = document.querySelectorAll('textarea');
        textAreas.forEach((ta) => {
          if (!ta.dataset.ecopromptHooked) {
            ta.dataset.ecopromptHooked = true;
  
            // Listen to typing
            ta.addEventListener('input', () => {
              const text = ta.value;
              analyzePrompt(text, ta);
            });
  
            // Intercept when Enter is pressed
            ta.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                const text = ta.value.trim();
                if (!isPromptEfficient(text)) {
                  e.preventDefault(); // stop sending
                  showWarning(ta, text);
                }
              }
            });
          }
        });
      });
  
      observer.observe(document.body, { childList: true, subtree: true });
    });
  
    // Basic token estimate (1 token ≈ 4 chars heuristic)
    function tokenEstimate(str) {
      return Math.ceil(str.length / 4);
    }
  
    // Check if prompt is inefficient (e.g., too long or repetitive)
    function isPromptEfficient(text) {
      const tokens = tokenEstimate(text);
      return tokens < 300 && !/(thank you|please|hello)/i.test(text);
    }
  
    function analyzePrompt(text, ta) {
      const tokens = tokenEstimate(text);
      ta.style.border = tokens > 300 ? '2px solid orange' : '';
    }
  
    function showWarning(ta, text) {
      const warning = document.createElement('div');
      warning.textContent =
        '⚠️ This prompt looks verbose — try summarizing to reduce cost!';
      warning.style =
        'background:#fff8e1;color:#8a6d3b;padding:8px;border-radius:6px;' +
        'position:absolute;z-index:9999;max-width:240px;top:-40px;left:0;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
      ta.parentElement.appendChild(warning);
      setTimeout(() => warning.remove(), 3000);
    }
  })();
  