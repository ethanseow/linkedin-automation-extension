const handleTabChange = async (tabId) => {
  const { automationTabId } = await chrome.storage.session.get('automationTabId');
  if (automationTabId && automationTabId === tabId) {
    await chrome.storage.session.clear();
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'alertUI') {
    chrome.storage.session.set({
      alert: {
        type: message.type,
        message: message.message,
      }
    });
  }
  if (message.action === 'saveCurrentTab') {
    await chrome.storage.session.set({ automationTabId: sender.tab.id });
  }
});

chrome.tabs.onRemoved.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener(handleTabChange);
