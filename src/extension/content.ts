import { AlertData } from "./types";
import { AutomationError, AutomationErrorType } from "./exceptions";

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

interface AutomationRequest {
  action: string;
  searchQuery?: string;
  message?: string;
  peopleCount?: number;
}

let observers: MutationObserver[] = [];
let timeouts: number[] = [];

chrome.runtime.onMessage.addListener(async (request: AutomationRequest, _sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return;
  }
  
  if (request.action === 'startPeopleSearchAutomation') {
    if (!request.message || !request.peopleCount) {
      alertUI({type: 'error', message: 'Start automation request missing required fields of message and people count'});
      return;
    }
    await startPeopleSearchAutomation(request.message, request.peopleCount);
  }
  else if (request.action === 'startMyNetworkAutomation') {
    if(!request.peopleCount) {
      alertUI({type: 'error', message: 'Start automation request missing required fields of people count'});
      return;
    }
    await startMyNetworkAutomation(request.peopleCount);
  }
});

const alertUI = (alertData: AlertData): void => {
  chrome.runtime.sendMessage({
    action: 'alertUI',
    payload: {
      type: alertData.type,
      message: alertData.message
    }
  });
};

const handleAddFreeNote = async (message: string): Promise<void> => {
  const dismissButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1000);
  const addFreeNoteButton = await querySelectorWithTimeout('[aria-label="Add a free note"]', 1, 1000);
  const messageInput = await querySelectorWithTimeout('textarea[name="message"], textarea[data-control-name="message"]', 1, 1000) as HTMLTextAreaElement;
  const sendButton = await querySelectorWithTimeout('button[aria-label="Send"]', 1, 1000) as HTMLButtonElement;
  
  (addFreeNoteButton as HTMLButtonElement).click();
  await sleep(500);
  (dismissButton as HTMLButtonElement).click();
  await sleep(500);
  messageInput.value = message;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  sendButton.click();

};

const checkReachedWeeklyLimit = async (): Promise<void> => {
  let reachedLimit = false;
  try {
    await querySelectorWithTimeout('#ip-fuse-limit-alert__header', 1, 1000, (btn) => btn.textContent?.trim().includes('reached the weekly') || false);
    reachedLimit = true;
  } catch (error) {
    console.log('linkedin-automation: No reached weekly limit dialog found', error);
    return;
  }

  if (reachedLimit) {
    throw new AutomationError('Automation Failed: Connection limit reached', AutomationErrorType.REACHED_WEEKLY_LIMIT);
  }
};

const handleSendWithoutNote = async (): Promise<void> => {
  const sendWithoutNoteButton = await querySelectorWithTimeout('button[aria-label="Send without a note"]', 1, 1000) as HTMLButtonElement;
  await sleep(500);
  sendWithoutNoteButton.click();
};

const handleConnect = async (): Promise<void> => {
  const connectButton = await querySelectorWithTimeout('[aria-label*="Invite"]', 1, 1000) as HTMLButtonElement;
  await sleep(500);
  connectButton.click();
};

const connectWithPerson = async (personElement: Element, message: string): Promise<void> => {
  console.log('linkedin-automation: Processing person:', personElement);
  const curriedHandleAddFreeNote = message.length > 0 ? () => handleAddFreeNote(message) : async () => {};
  const handlers = [curriedHandleAddFreeNote, handleSendWithoutNote];
  let didConnect = false;

  for (const handler of handlers) {
    try {
      await handleConnect();
      await handler();
      didConnect = true;
      console.log('linkedin-automation: Person processed:', personElement);
      break;
    } catch (error) {
      console.log('linkedin-automation: Error processing person:', error);
      continue;
    }
  }

  if (!didConnect) {
    throw new AutomationError('Did not connect to person', AutomationErrorType.DID_NOT_CONNECT_TO_PERSON);
  }

  await checkReachedWeeklyLimit();

  const closeButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1000) as HTMLButtonElement;
  closeButton.click();
};

const isNextPageAvailable = async (): Promise<boolean> => {
  try { 
    const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1000) as HTMLButtonElement;
    return !nextPageButton.disabled;
  } catch (error) {
    return false;
  }
};

const navigateToNextPage = async (): Promise<void> => {
  const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1000) as HTMLButtonElement;
  nextPageButton.click();

  await sleep(3000);
  observers.forEach(observer => observer && observer.disconnect());
  timeouts.forEach(timeout => timeout && clearTimeout(timeout));
  observers = [];
  timeouts = [];
};

const waitForPeoplePageLoad = async (): Promise<void> => {
  let numLinkedArea = 0;
  let numActiveButtons = 0;
  let timeout = 0;

  while((numLinkedArea == 0 || numActiveButtons != numLinkedArea) && timeout < 5) {
    numActiveButtons = Array.from(document.querySelectorAll('.linked-area .artdeco-button')).filter(button => {
      const btn = button as HTMLButtonElement;
      return !btn.disabled;
    }).length;
    numLinkedArea = Array.from(document.querySelectorAll('.linked-area')).length;
    await sleep(1000);
    timeout++;
  }
};

const waitForMyNetworkPageLoad = async (): Promise<void> => {
  for(let i = 0; i < 5; i++) {
    const buttons = Array.from(document.querySelectorAll('button[aria-label]'))
      .filter(btn => btn && btn.getAttribute('aria-label')?.includes('Show all suggestions for People you may know'));
    if (buttons.length > 0) {
      break;
    }
    await sleep(1000);
  }
};



const waitForLoadMoreConnectionsToLoad = async (prevHeight: number): Promise<void> => {
  for(let i = 0; i < 5; i++) {
    const dialogScroll = await querySelectorWithTimeout('#dialog-header + div', 1, 5000) as Element;
    if (dialogScroll.scrollHeight > prevHeight) {
      return;
    }
    await sleep(1000);
  }
  throw new AutomationError('Automation Failed: Did not load more connections', AutomationErrorType.DID_NOT_LOAD_MORE_CONNECTIONS);
};

const connectWithPeople = async (message: string, maxPeople: number): Promise<number> => {
  let numConnected = 0;

  const peopleCards = Array.from(document.querySelectorAll('.linked-area')).filter(card => card.textContent?.includes('Connect'));

  for (let i = 0; i < peopleCards.length && numConnected < maxPeople; i++) {
    const card = peopleCards[i];
    console.log('linkedin-automation: Processing person:', card);
    await sleep(500);
    try {
      await connectWithPerson(card, message);
      numConnected++;
    } catch (error) {
      if (error instanceof AutomationError) {
        switch (error.type) {
          case AutomationErrorType.REACHED_WEEKLY_LIMIT:
            throw error;
          default:
            continue;
        }
      }
      continue;
    }
  }

  console.log(`linkedin-automation: We processed ${numConnected} people out of ${peopleCards.length} possible connections`);
  return numConnected;
};

const checkSearchResultsAvailable = async (): Promise<void> => {
  let searchResults: Element | null = null;
  try {
    searchResults = await querySelectorWithTimeout('.search-results-container', 1, 10000) as Element;
  } catch (error) {
    throw new AutomationError('Automation Failed: Could not find search container', AutomationErrorType.NO_SEARCH_RESULTS_FOUND);
  }

  const textContent = searchResults.textContent;

  if (!textContent) {
    throw new AutomationError('Automation Failed: Search results container has no content', AutomationErrorType.NO_SEARCH_RESULTS_FOUND);
  }

   if(textContent.includes('No results found')) {
    throw new AutomationError('Automation Failed: No results found.', AutomationErrorType.NO_SEARCH_RESULTS_FOUND);
  }
};

const checkConnectionLimitReached = async (): Promise<void> => {
  for(let i = 0; i < 3; i++) {
    const connectionLimit = document.querySelector('[role=alert]');
    if (connectionLimit) {
      throw new AutomationError('Automation Failed: Connection limit reached', AutomationErrorType.CONNECTION_LIMIT_REACHED);
    }
    await sleep(1000);
  }
};

const connectWithMyNetwork = async (maxPeople: number): Promise<number> => {
  const showAllButton = Array.from(document.querySelectorAll('button[aria-label]'))
    .filter(btn => btn && btn.getAttribute('aria-label')?.includes('Show all suggestions for People you may know'))[0] as HTMLButtonElement;
  showAllButton.click();
  while(maxPeople > 0) {
    const dialog = await querySelectorWithTimeout('[data-testid="dialog"]', 1, 5000) as Element;
    const connectButtons = await querySelectorWithTimeout('button', 2, 5000, (btn) => btn.textContent?.trim() === 'Connect', dialog) as HTMLButtonElement[];
    if(connectButtons.length === 0) {
      return maxPeople;
    }
    connectButtons[0].click();
    await checkConnectionLimitReached();
    for(const connectButton of connectButtons) {
      connectButton.click();
      await sleep(250);
      maxPeople -= 1;
      if(maxPeople <= 0) {
        break;
      }
    }
    const dialogScroll = await querySelectorWithTimeout('#dialog-header + div', 1, 5000) as Element;
    const prevScrollHeight = dialogScroll.scrollHeight;
    dialogScroll.scrollTop = prevScrollHeight;
    const loadMoreBtn = await querySelectorWithTimeout('button', 1, 5000, (btn) => btn.textContent?.trim() === 'Load more', dialog) as HTMLButtonElement;
    loadMoreBtn.click();
    await waitForLoadMoreConnectionsToLoad(prevScrollHeight);
    dialogScroll.scrollTop = dialogScroll.scrollHeight;
  }
  return maxPeople;
};

const startMyNetworkAutomation = async (maxPeople: number): Promise<void> => {
  console.log('linkedin-automation: Starting my network automation');
  await waitForMyNetworkPageLoad();
  try{
    const numConnected = await connectWithMyNetwork(maxPeople);
    alertUI({type: 'success', message: `${maxPeople - numConnected} out of ${maxPeople} people connected`});
  } catch (error) {
    alertUI({type: 'error', message: (error as Error).message});
  }
};

const startPeopleSearchAutomation = async (message: string, maxPeople = 20): Promise<void> => {
  console.log('linkedin-automation: Starting people search automation');
  await waitForPeoplePageLoad();
  let numProcessed = 0;

  try{  
    await checkSearchResultsAvailable();
    numProcessed = await connectWithPeople(message, maxPeople);
  } catch (error) {
    alertUI({type: 'error', message: (error as Error).message});
    return;
  }

  if (await isNextPageAvailable() && maxPeople - numProcessed > 0) {
    await navigateToNextPage();
    await startPeopleSearchAutomation(message, maxPeople - numProcessed);
  } else {
    if (numProcessed < maxPeople) {
      alertUI({type: 'warning', message: `${numProcessed} out of ${maxPeople} processed, no more further to connect to`});
    } else {
      alertUI({type: 'success', message: `All ${maxPeople} processed`});
    }
  }
};


const querySelectorWithTimeout = (selector: string, minCount = 1, timeout = 3000, filterFunction?: (element: Element) => boolean, parentElement: Document | Element = document): Promise<Element | Element[]> => {
  const checkElements = (): Element | Element[] | null => {
    const elements = parentElement.querySelectorAll(selector);
    if (elements.length >= minCount) {
      const filteredElements = Array.from(elements).filter(filterFunction || ((() => true)));
      if (filteredElements.length === 0) {
        return null;
      }
      return minCount === 1 ? filteredElements[0] : filteredElements;
    }
    return null;
  };

  return new Promise((resolve, reject) => {
    const result = checkElements();
    if (result) return resolve(result);

    const observer = new MutationObserver(() => {
      const result = checkElements();
      if (result) {
        observer.disconnect();
        resolve(result);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      console.log('linkedin-automation: Element not found after timeout:', selector);
      reject(new AutomationError(`Element ${selector} not found`, AutomationErrorType.QUERY_SELECTOR_TIMEOUT));
    }, timeout);

    observers.push(observer);
    timeouts.push(timeoutId);
  });
};
