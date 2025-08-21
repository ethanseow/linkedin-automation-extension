let observers = [];
let timeouts = [];


// TODO: does not have receiving end content.js when navigating to linkedin page and sending message to startAutomation
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    await startAutomation(request.searchQuery, request.message, request.peopleCount);
  }
});

function alertUI(alertData) {
  chrome.runtime.sendMessage({
    action: 'alertUI',
    type: alertData.type,
    message: alertData.message
  });
}

async function handleAddFreeNote(message) {
  const dismissButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1000);
  const addFreeNoteButton = await querySelectorWithTimeout('[aria-label="Add a free note"]', 1, 1000);
  const messageInput = await querySelectorWithTimeout('textarea[name="message"], textarea[data-control-name="message"]', 1, 1000);
  const sendButton = await querySelectorWithTimeout('button[aria-label="Send"]', 1, 1000);
  addFreeNoteButton.click();
  await sleep(500)
  dismissButton.click();
  await sleep(500)
  messageInput.value = message;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500)
  sendButton.click();
}

async function handleSendWithoutNote() {
  const sendWithoutNoteButton = await querySelectorWithTimeout('button[aria-label="Send without a note"]', 1, 1000);
  await sleep(500)
  sendWithoutNoteButton.click();
}

async function handleConnect() {
  const connectButton = await querySelectorWithTimeout('[aria-label*="Invite"]', 1, 1000);
  await sleep(500)
  connectButton.click();
}

async function connectWithPerson(personElement, message) {
  console.log('linkedin-automation: Processing person:', personElement);
  const curriedHandleAddFreeNote = message.length > 0 ? handleAddFreeNote.bind(null, message) : async () => {};
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

  const closeButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1000);
  closeButton.click();
}

async function isNextPageAvailable() {
  try { 
    const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1000);
    return !nextPageButton.disabled;
  } catch (error) {
    return false;
  }
}

async function navigateToNextPage() {
  const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1000);
  nextPageButton.click();

  await sleep(3000)
  observers.forEach(observer => observer && observer.disconnect());
  timeouts.forEach(timeout => timeout && clearTimeout(timeout));
  observers = [];
  timeouts = [];
}


async function connectWithPeople(message, maxPeople) {
  let numConnected = 0;

  let peopleCards = [];
  try {
    peopleCards = await querySelectorWithTimeout('.linked-area', 10, 3000);
  } catch (error) {
    console.log('linkedin-automation: Error getting people cards:', error);
    return 0;
  }
  peopleCards = peopleCards.filter(card => card.textContent.includes('Connect'));

  for (let i = 0; i < peopleCards.length && numConnected < maxPeople; i++) {
    const card = peopleCards[i];
    console.log('linkedin-automation: Processing person:', card);
    try {
      await sleep(500)
      await connectWithPerson(card, message);
      numConnected++;
    } catch (error) {
      continue;
    }
  }

  console.log(`linkedin-automation: We processed ${numConnected} people out of ${peopleCards.length} possible connections`);
  return numConnected;
}

async function areSearchResultsAvailable() {
  let searchResults = null;
  try {
    searchResults = await querySelectorWithTimeout('.search-results-container',1,10000);
  } catch (error) {
    alertUI({type: 'error', message: 'Automation Failed: Could not find search container'});
    return false;
  }

  const textContent = searchResults.textContent;

  if (textContent.includes('reached the monthly limit for profile searches')) {
    alertUI({type: 'error', message: 'Automation Failed: You\'ve reached the monthly limit for profile searches.'});
    return false;
  } else if(textContent.includes('No results found')) {
    alertUI({type: 'error', message: 'Automation Failed: No results found.'});
    return false;
  }

  return true;
}

async function startAutomation(searchQuery, message, maxPeople = 20) {
  console.log('linkedin-automation: Starting automation');

  if (!await areSearchResultsAvailable()) {
    return;
  }

  const numProcessed = await connectWithPeople(message, maxPeople);

  if (await isNextPageAvailable() && maxPeople - numProcessed > 0) {
    await navigateToNextPage();
    await startAutomation(searchQuery, message, maxPeople - numProcessed);
  } else {
    if (numProcessed < maxPeople) {
      alertUI({type: 'warning', message: `${numProcessed} out of ${maxPeople} processed, no more further to connect to`});
    } else {
      alertUI({type: 'success', message: `All ${maxPeople} processed`});
    }
  }
}

function querySelectorWithTimeout(selector, minCount = 1, timeout = 3000) {
  const checkElements = () => {
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

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      console.log('linkedin-automation: Element not found after timeout:', selector);
      reject(new Error(`Element ${selector} not found`));
    }, timeout);

    observers.push(observer);
    timeouts.push(timeoutId);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}