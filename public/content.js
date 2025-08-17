chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action !== 'startAutomation') return;

  await startAutomation(request.searchQuery, request.message);
});

async function closeUpsellModal() {
  const dismissButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1000);
  dismissButton.click();
}

async function handleAddFreeNote(message) {
  const addFreeNoteButton = await querySelectorWithTimeout('[aria-label="Add a free note"]', 1, 1000);
  addFreeNoteButton.click();
  await closeUpsellModal();
  const messageInput = await querySelectorWithTimeout('textarea[name="message"], textarea[data-control-name="message"]', 1, 1000);
  messageInput.value = message;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  const sendButton = await querySelectorWithTimeout('button[aria-label="Send"]', 1, 1000);
  sendButton.click();
}

async function handleSendWithoutNote() {
  const sendWithoutNoteButton = await querySelectorWithTimeout('button[aria-label="Send without a note"]', 1, 1000);
  sendWithoutNoteButton.click();
}

async function handleConnect() {
  const connectButton = await querySelectorWithTimeout('.linked-area button', 1, 1000);
  connectButton.click();
}

async function connectWithPerson(personElement, message) {
  console.log('linkedin-automation: Processing person:', personElement);
  const curriedHandleAddFreeNote = handleAddFreeNote.bind(null, message);
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

  const closeButton = document.querySelector('button[aria-label="Dismiss"], button[data-control-name="close"]');
  if (!closeButton) throw new Error('Close button not found');
  closeButton.click();
}

function getNextPageButton() {
  return document.querySelector('button[aria-label="Next"]');
}

function isNextPageAvailable() {
  const nextPageButton = getNextPageButton();
  return nextPageButton && !nextPageButton.disabled;
}

async function navigateToNextPage() {
  const nextPageButton = getNextPageButton();
  if (!nextPageButton) throw new Error('Next page button not found');

  nextPageButton.click();
  await sleep(2000);
}


async function connectWithPeople(message, maxPeople) {
  let numConnected = 0;

  let peopleCards = [];
  try {
    peopleCards = await querySelectorWithTimeout('.linked-area', 10, 10000);
  } catch (error) {
    console.log('linkedin-automation: Error getting people cards:', error);
    return 0;
  }
  peopleCards = peopleCards.filter(card => card.textContent.includes('Connect'));

  for (let i = 0; i < peopleCards.length && numConnected < maxPeople; i++) {
    const card = peopleCards[i];
    console.log('linkedin-automation: Processing person:', card);
    try {
      await connectWithPerson(card, message);
      numConnected++;
    } catch (error) {
      continue;
    }
  }

  console.log(`linkedin-automation: We processed ${numConnected} people out of ${peopleCards.length} possible connections`);
  return numConnected;
}

async function startAutomation(searchQuery, message, maxPeople = 20) {
  console.log('linkedin-automation: Starting automation');
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;

  // TODO: refactor code for navigating to correct search results page
  // if (!window.location.href.includes(`/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`)) {
  //   await saveAutomationSettings(searchQuery, message, maxPeople);
  //   window.location.href = searchUrl;
  //   return;
  // }


  // TODO: wait for element seems to be stuck here, does not move on from this step when triggering the automation
  await querySelectorWithTimeout('.search-results-container',1,5000);
  const numProcessed = await connectWithPeople(message, maxPeople);

  if (isNextPageAvailable()) {
    if(maxPeople - numProcessed <= 0) { return; }
    await navigateToNextPage();
    await startAutomation(searchQuery, message, maxPeople - numProcessed);
  }
}

function querySelectorWithTimeout(selector, minCount = 1, timeout = 3000) {
  const checkElements = () => {
    const elements = document.querySelectorAll(selector);
    if (elements.length >= minCount) {
      console.log('linkedin-automation: Element found:', selector);
      return minCount === 1 ? elements[0] : elements;
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

    setTimeout(() => {
      observer.disconnect();
      console.log('linkedin-automation: Element not found after timeout:', selector);
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
} 