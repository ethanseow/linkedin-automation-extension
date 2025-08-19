chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Automation Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'alertUI') {
    chrome.storage.local.set({
      alert: {
        type: message.type,
        message: message.message,
      }
    });
  }
});