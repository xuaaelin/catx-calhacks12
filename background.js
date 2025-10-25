chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "notify") {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon.png",
        title: "EcoPrompt 🌱",
        message: msg.text || "You’re typing in ChatGPT!"
      });
    }
  });
  