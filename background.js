chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ['content.js']
    }, () => {
      console.log("content.js loaded successfully");
    });
  });  