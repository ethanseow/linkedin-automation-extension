import { AlertData, BaseActionPayload } from "./types";
interface PeopleSearchAutomationPayload extends BaseActionPayload {
  searchQuery: string;
  message: string;
  peopleCount: number;
}

interface MyNetworkAutomationPayload extends BaseActionPayload {}

type Message = 
 | {action: "startPeopleSearchAutomation", payload: PeopleSearchAutomationPayload}
 | {action: "startMyNetworkAutomation", payload: MyNetworkAutomationPayload}
 | {action: "alertUI", payload: AlertData}

interface StorageData {
  automationTabId?: number;
  isRunning?: boolean;
  alert?: AlertData;
}

const isTabReady = (tabId: number, timeout = 5): Promise<boolean> => {
  return new Promise(async (resolve, _) => {
    for (let i = 0; i < timeout; i += 1) {
      try {
        const tab = await chrome.tabs.get(tabId);
        
        if (tab.status !== 'complete') {
          await sleep(1000);
          continue;
        }
        
        await chrome.tabs.sendMessage(tabId, {
          action: 'ping'
        });
        resolve(true)
      } catch (error) {
        await sleep(1000);
        continue;
      }
    }
    resolve(false);
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

const clearAutomationSession = async (tabId: number, reason: string): Promise<void> => {
  try {
    const data = await chrome.storage.session.get(['automationTabId']) as StorageData;
    if (data.automationTabId === tabId) {
      console.log(`linkedin-automation: ${reason}, clearing session data`);
      await chrome.storage.session.clear();
    }
  } catch (error) {
    console.error('linkedin-automation: Error clearing automation session:', error);
  }
};

const handleTabRemoved = async (tabId: number): Promise<void> => {
  await clearAutomationSession(tabId, 'Automation tab closed');
};

const handleTabUpdated = async (tabId: number, changeInfo: any): Promise<void> => {
  if (changeInfo.url && !changeInfo.url.includes('linkedin.com')) {
    await clearAutomationSession(tabId, 'Navigated away from LinkedIn');
  }
};

const buildExpectedUrl = (action: string, payload: any): string => {
  if (action === 'startPeopleSearchAutomation') {
    if (!payload.searchQuery) {
      throw new Error('Search query is required');
    }
    return `https://www.linkedin.com/search/results/people/?keywords=${payload.searchQuery}`;
  } else if (action === 'startMyNetworkAutomation') {
    return 'https://www.linkedin.com/mynetwork/';
  }
  throw new Error('Invalid action');
}

const handleStartAutomation = async (action: string, payload: any): Promise<void> => {
  if (!payload.tabId) {
    throw new Error(`${action} message must have tabId`);
  }

  const tabTimeout = 10;
  const expectedUrl = buildExpectedUrl(action, payload);
  
  try {
    await saveAutomationInputs(action, payload);
    await chrome.tabs.update(payload.tabId, { url: expectedUrl });

    if (!await isTabReady(payload.tabId, tabTimeout)) {
      throw new Error(`LinkedIn tab not ready after ${tabTimeout} seconds`);
    }

    await chrome.storage.session.set({ automationTabId: payload.tabId});
    await chrome.storage.session.set({ isRunning: true });
    
    await chrome.tabs.sendMessage(payload.tabId, {
      action,
      ...payload,
    });
  } catch (error) {
    await handleAlert({
      type: 'error',
      message: `Failed to start ${action}: ${(error as Error).message}`,
    });
  }
};  

const saveAutomationInputs = async (action: string, payload: any): Promise<void> => {
  try {
    if (action === 'startPeopleSearchAutomation') {
      await chrome.storage.session.set({
          selectedFlow: 'searchQuery',
          searchQuery: payload.searchQuery,
          message: payload.message,
          peopleCount: payload.peopleCount,
        });
    } else if (action === 'startMyNetworkAutomation') {
      await chrome.storage.session.set({
          selectedFlow: 'myNetwork',
          peopleCount: payload.peopleCount,
        });
      }
  } catch (error) {
    throw new Error(`Failed to save automation inputs: ${(error as Error).message}`);
  }
}

chrome.runtime.onMessage.addListener(async (message: Message) => {
  if (message.action === 'alertUI') {
    await handleAlert(message.payload);
  } else {
    await handleStartAutomation(message.action, message.payload);
  }
});

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
