import { AlertData } from "./types";

interface AutomationRequest {
  action: string;
  searchQuery?: string;
  message?: string;
  peopleCount?: number;
}

let observers: MutationObserver[] = [];
let timeouts: number[] = [];

chrome.runtime.onMessage.addListener(async (request: AutomationRequest, sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    if (!request.searchQuery || !request.message || !request.peopleCount) {
      throw new Error('Start automation request missing required fields');
    }
    await startAutomation(request.searchQuery, request.message, request.peopleCount);
  }
});

const alertUI = (alertData: AlertData): void => {
  chrome.runtime.sendMessage({
    action: 'alertUI',
    type: alertData.type,
    message: alertData.message
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
    throw new Error('Did not connect to person');
  }

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

const connectWithPeople = async (message: string, maxPeople: number): Promise<number> => {
  let numConnected = 0;

  let peopleCards: Element[] = [];
  try {
    let cards = await querySelectorWithTimeout('.linked-area', Math.min(10, maxPeople), 3000);
    peopleCards = Array.isArray(cards) ? cards : [cards];
  } catch (error) {
    console.log('linkedin-automation: Error getting people cards:', error);
    return 0;
  }

  peopleCards = peopleCards.filter(card => card.textContent?.includes('Connect'));

  for (let i = 0; i < peopleCards.length && numConnected < maxPeople; i++) {
    const card = peopleCards[i];
    console.log('linkedin-automation: Processing person:', card);
    try {
      await sleep(500);
      await connectWithPerson(card, message);
      numConnected++;
    } catch (error) {
      continue;
    }
  }

  console.log(`linkedin-automation: We processed ${numConnected} people out of ${peopleCards.length} possible connections`);
  return numConnected;
};

const areSearchResultsAvailable = async (): Promise<boolean> => {
  let searchResults: Element | null = null;
  try {
    searchResults = await querySelectorWithTimeout('.search-results-container', 1, 10000) as Element;
  } catch (error) {
    alertUI({type: 'error', message: 'Automation Failed: Could not find search container'});
    return false;
  }

  const textContent = searchResults.textContent;

  if (!textContent) {
    alertUI({type: 'error', message: 'Automation Failed: Search results container has no content'});
    return false;
  }

   if(textContent.includes('No results found')) {
    alertUI({type: 'error', message: 'Automation Failed: No results found.'});
    return false;
  }

  return true;
};

const hasLimitedSearchResults = async (): Promise<boolean> => {
  console.log('linkedin-automation: Document:', document.querySelector('.search-results-container'));
  const searchResults = await querySelectorWithTimeout('.search-results-container', 1, 10000) as Element;
  console.log('linkedin-automation: Search results:', searchResults);
  const textContent = searchResults.textContent;
  return textContent?.includes('reached the monthly limit for profile searches') ?? false;
};

const getMaxPossibleConnections = async (): Promise<number> => {
  const peopleCards = Array.from(document.querySelectorAll('.linked-area'));
  const filteredPeopleCards = peopleCards.filter(card => card.textContent?.includes('Connect'));
  return filteredPeopleCards.length;
};


const startAutomation = async (searchQuery: string, message: string, maxPeople = 20): Promise<void> => {
  console.log('linkedin-automation: Starting automation');
  let maxAvailableToProcess = maxPeople;

  if (!await areSearchResultsAvailable()) {
    return;
  }

  if (await hasLimitedSearchResults()) {
    maxAvailableToProcess = await getMaxPossibleConnections();
  }

  const numProcessed = await connectWithPeople(message, maxAvailableToProcess);

  if (await isNextPageAvailable() && maxAvailableToProcess - numProcessed > 0) {
    await navigateToNextPage();
    await startAutomation(searchQuery, message, maxAvailableToProcess - numProcessed);
  } else {
    if (numProcessed < maxAvailableToProcess) {
      alertUI({type: 'warning', message: `${numProcessed} out of ${maxPeople} processed, no more further to connect to`});
    } else {
      alertUI({type: 'success', message: `All ${maxAvailableToProcess} processed`});
    }
  }
};

const querySelectorWithTimeout = (selector: string, minCount = 1, timeout = 3000): Promise<Element | Element[]> => {
  const checkElements = (): Element | Element[] | null => {
    const elements = document.querySelectorAll(selector);
    if (elements.length >= minCount) {
      return minCount === 1 ? elements[0] : Array.from(elements);
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
      reject(new Error(`Element ${selector} not found`));
    }, timeout);

    observers.push(observer);
    timeouts.push(timeoutId);
  });
};

const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};