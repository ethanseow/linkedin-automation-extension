const waitForTab = (tabId, timeout = 1e4) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not finish loading within ${timeout}ms`));
    }, timeout);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
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
      if (tab.status === "complete") {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
};
const handleAlert = async (message) => {
  if (!message.type) {
    throw new Error("Alert message must have a type");
  }
  await chrome.runtime.sendMessage({
    action: "update",
    alert: {
      type: message.type,
      message: message.message
    },
    isRunning: false
  });
  await chrome.storage.session.set({ isRunning: false });
  await chrome.storage.session.set({
    alert: {
      type: message.type,
      message: message.message
    }
  });
};
const handleTabChange = async (tabId) => {
  const data = await chrome.storage.session.get("automationTabId");
  if (data.automationTabId && data.automationTabId === tabId) {
    await chrome.storage.session.clear();
  }
};
const buildExpectedUrl = (action, payload) => {
  if (action === "startPeopleSearchAutomation") {
    if (!payload.searchQuery) {
      throw new Error("Search query is required");
    }
    return `https://www.linkedin.com/search/results/people/?keywords=${payload.searchQuery}`;
  } else if (action === "startMyNetworkAutomation") {
    return "https://www.linkedin.com/mynetwork/";
  }
  throw new Error("Invalid action");
};
const handleStartAutomation = async (action, payload) => {
  if (!payload.tabId) {
    throw new Error(`${action} message must have tabId`);
  }
  try {
    const tab = await chrome.tabs.get(payload.tabId);
    const expectedUrl = buildExpectedUrl(action, payload);
    if (!tab.url || !tab.url.includes(expectedUrl)) {
      await chrome.tabs.update(payload.tabId, { url: expectedUrl });
      await waitForTab(payload.tabId, 1e4);
    }
    await chrome.storage.session.set({ automationTabId: payload.tabId });
    await chrome.storage.session.set({ isRunning: true });
    await chrome.tabs.sendMessage(payload.tabId, {
      action,
      ...payload
    });
  } catch (error) {
    await handleAlert({
      type: "error",
      message: `Failed to start ${action}: ${error.message}`
    });
  }
};
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "alertUI") {
    await handleAlert(message.payload);
  } else {
    await handleStartAutomation(message.action, message.payload);
  }
});
chrome.tabs.onRemoved.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener((tabId) => {
  handleTabChange(tabId);
});
