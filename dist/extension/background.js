const isTabReady = (tabId, timeout = 5) => {
  return new Promise(async (resolve, _) => {
    for (let i = 0; i < timeout; i += 1) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status !== "complete") {
          await sleep(1e3);
          continue;
        }
        await chrome.tabs.sendMessage(tabId, {
          action: "ping"
        });
        resolve(true);
      } catch (error) {
        await sleep(1e3);
        continue;
      }
    }
    resolve(false);
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
const handleTabRemoved = async (tabId) => {
  try {
    const data = await chrome.storage.session.get(["automationTabId", "isRunning"]);
    if (data.automationTabId === tabId && data.isRunning) {
      console.log("linkedin-automation: Automation tab closed, clearing session data");
      await chrome.storage.session.clear();
    }
  } catch (error) {
    console.error("linkedin-automation: Error handling tab removal:", error);
  }
};
const handleTabUpdated = async (tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.includes("linkedin.com")) {
    try {
      const data = await chrome.storage.session.get(["automationTabId"]);
      if (data.automationTabId === tabId) {
        console.log("linkedin-automation: Navigated away from LinkedIn, clearing session");
        await chrome.storage.session.clear();
      }
    } catch (error) {
      console.error("linkedin-automation: Error handling tab update:", error);
    }
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
  const tabTimeout = 10;
  const expectedUrl = buildExpectedUrl(action, payload);
  try {
    const tab = await chrome.tabs.get(payload.tabId);
    await chrome.storage.session.clear();
    if (!tab.url || !tab.url.includes(expectedUrl)) {
      await chrome.tabs.update(payload.tabId, { url: expectedUrl });
    }
    if (!await isTabReady(payload.tabId, tabTimeout)) {
      throw new Error(`LinkedIn tab not ready after ${tabTimeout} seconds`);
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
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
