// TODO: make sure everything is atomic
const waitForTab = (tabId, timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not finish loading within ${timeout}ms`));
    }, timeout);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(null);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Tab ${tabId} not found: ${chrome.runtime.lastError.message}`));
        return;
      }
      
      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(null);
      }
    });
  });
};

const handleAlert = async (message) => {
  await chrome.runtime.sendMessage({
    action: 'update',
    alert: {
      type: message.type,
      message: message.message,
    },
    isRunning: false
  });
  await chrome.storage.session.set({ isRunning: false });
  await chrome.storage.session.set({
    alert: {
      type: message.type,
      message: message.message,
    }
  });
}

const handleTabChange = async (tabId) => {
  const { automationTabId } = await chrome.storage.session.get('automationTabId');
  if (automationTabId && automationTabId === tabId) {
    await chrome.storage.session.clear();
  }
}

const handleStartAutomation = async (message) => {
  try {
    const tab = await chrome.tabs.get(message.tabId);
    const expectedUrl = 'https://www.linkedin.com/search/results/people/?keywords=' + message.searchQuery;
    
    if (!tab.url || !tab.url.includes('linkedin.com/search/results/people/?keywords=' + message.searchQuery)) {
      await chrome.tabs.update(message.tabId, { url: expectedUrl });
      await waitForTab(message.tabId, 10000);
    }
    
    await chrome.storage.session.set({ automationTabId: message.automationTabId });
    await chrome.storage.session.set({ isRunning: message.isRunning });
    await chrome.tabs.sendMessage(message.tabId, {
      action: 'startAutomation',
      tabId: message.tabId,
      searchQuery: message.searchQuery,
      message: message.message,
      peopleCount: message.peopleCount
    });
  } catch (error) {
    await handleAlert({
      type: 'error',
      message: 'Failed to start automation: ' + error.message,
    });
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'alertUI') {
    await handleAlert(message);
  }
  if (message.action === 'startAutomation') {
    await handleStartAutomation(message);
  }
});


chrome.tabs.onRemoved.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener(handleTabChange);
