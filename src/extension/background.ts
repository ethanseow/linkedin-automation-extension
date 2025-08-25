import { AlertData } from "./types";

interface TabUpdateInfo {
  status?: string;
}

interface Tab {
  id?: number;
  url?: string;
  status?: string;
}

interface Message {
  action: string;
  type?: string;
  message?: string;
  tabId?: number;
  searchQuery?: string;
  peopleCount?: number;
}

interface StorageData {
  automationTabId?: number;
  isRunning?: boolean;
  alert?: AlertData;
}

const waitForTab = (tabId: number, timeout = 10000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not finish loading within ${timeout}ms`));
    }, timeout);

    const listener = (updatedTabId: number, changeInfo: TabUpdateInfo, tab: Tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
    
    chrome.tabs.get(tabId, (tab: Tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Tab ${tabId} not found: ${chrome.runtime.lastError.message}`));
        return;
      }
      
      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
};

const handleAlert = async (message: AlertData): Promise<void> => {
  if (!message.type) {
    throw new Error('Alert message must have a type');
  }
  
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
};

const handleTabChange = async (tabId: number): Promise<void> => {
  const data = await chrome.storage.session.get('automationTabId') as StorageData;
  if (data.automationTabId && data.automationTabId === tabId) {
    await chrome.storage.session.clear();
  }
};

const handleStartAutomation = async (message: Message): Promise<void> => {
  if (!message.tabId || !message.searchQuery) {
    throw new Error('Start automation message must have tabId and searchQuery');
  }
  
  try {
    const tab = await chrome.tabs.get(message.tabId);
    const expectedUrl = 'https://www.linkedin.com/search/results/people/?keywords=' + message.searchQuery;
    
    if (!tab.url || !tab.url.includes('linkedin.com/search/results/people/?keywords=' + message.searchQuery)) {
      await chrome.tabs.update(message.tabId, { url: expectedUrl });
      await waitForTab(message.tabId, 10000);
    }
    
    await chrome.storage.session.set({ automationTabId: message.tabId});
    await chrome.storage.session.set({ isRunning: true });
    
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
      message: 'Failed to start automation: ' + (error as Error).message,
    });
  }
};

chrome.runtime.onMessage.addListener(async (message: Message, sender, sendResponse) => {
  if (message.action === 'alertUI') {
    await handleAlert(message as AlertData);
  }
  if (message.action === 'startAutomation') {
    await handleStartAutomation(message);
  }
});

chrome.tabs.onRemoved.addListener(handleTabChange);
chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: TabUpdateInfo, tab: Tab) => {
  handleTabChange(tabId);
});