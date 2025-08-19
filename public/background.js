let automationTabId = null;

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
  
  if (message.action === 'trackAutomationTab') {
    automationTabId = message.tabId;
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === automationTabId) {
    chrome.storage.local.remove('alert');
    chrome.storage.local.set({ isRunning: false });
    automationTabId = null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === automationTabId) {
    chrome.storage.local.remove('alert');
    chrome.storage.local.set({ isRunning: false });
    automationTabId = null;
  }
});