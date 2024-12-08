document.addEventListener('DOMContentLoaded', function() {
  const contentDiv = document.getElementById("content");
  contentDiv.textContent = "Loading...";

  // Get the active tab and send a message to trigger summarization
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "summarizePage" });
  });

  // Listen for the summary response from content.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.summary) {
          contentDiv.textContent = message.summary;
      }
  });
});