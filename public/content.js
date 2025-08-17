chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action !== 'startAutomation') return;

  await startAutomation(request.searchQuery, request.message);
});

async function closeUpsellModal() {
  const upsellModal = document.querySelector('.modal-upsell');
  if (!upsellModal) return;

  const dismissButton = upsellModal.querySelector('button[aria-label="Dismiss"]');
  if (!dismissButton) throw new Error('Dismiss button not found');

  dismissButton.click();
  await sleep(500);
}

async function handleAddFreeNote(message) {
  const addFreeNoteButton = Array.from(document.querySelectorAll('button')).find(
    btn => btn.textContent && btn.textContent.trim() === 'Add a free note'
  );

  if (!addFreeNoteButton) throw new Error('Add free note button not found');

  addFreeNoteButton.click();
  await sleep(1000);

  const upsellModal = document.querySelector('.modal-upsell');
  if (upsellModal) {
    await closeUpsellModal();
    throw new Error('Cannot add a free note');
  }

  const messageInput = document.querySelector('textarea[name="message"], textarea[data-control-name="message"]');
  if (!messageInput) throw new Error('Message input not found');

  messageInput.value = message;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1000);

  const sendButton = Array.from(document.querySelectorAll('button')).find(
    btn => btn.textContent && btn.textContent.trim() === 'Send'
  );

  if (!sendButton || sendButton.disabled) throw new Error('Send button not found');
  sendButton.click();
}

async function handleSendWithoutNote() {
  const sendWithoutNoteButton = Array.from(document.querySelectorAll('button')).find(
    btn => btn.textContent && btn.textContent.trim() === 'Send without a note'
  );

  if (!sendWithoutNoteButton) throw new Error('Send without note button not found');

  sendWithoutNoteButton.click();
  await sleep(500);
}

async function handleConnect(personElement) {
  await sleep(1000);
  const connectButton = Array.from(personElement.querySelectorAll('button')).find(
    btn => btn.textContent && btn.textContent.trim() === 'Connect'
  );

  if (!connectButton || connectButton.disabled) throw new Error('Connect button not found');

  connectButton.click();
  await sleep(1000);
}

async function connectWithPerson(personElement, message) {
  console.log('linkedin-automation: Processing person:', personElement);
  const curriedHandleAddFreeNote = handleAddFreeNote.bind(null, message);
  const handlers = [curriedHandleAddFreeNote, handleSendWithoutNote];
  let didConnect = false;

  for (const handler of handlers) {
    try {
      await handleConnect(personElement);
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

  // Wait for page to load and get all people cards
  // TODO: refactor code to handle dynamic loading of HTML
  await sleep(3000);
  const peopleCards = document.querySelectorAll('.linked-area');

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

  console.log(`linkedin-automation: We processed ${numConnected} people out of ${peopleCards.length}`);
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
  await querySelectorAllWithTimeout('.search-results-container');
  const numProcessed = await connectWithPeople(message, maxPeople);

  if (isNextPageAvailable()) {
    if(maxPeople - numProcessed <= 0) { return; }
    await navigateToNextPage();
    await startAutomation(searchQuery, message, maxPeople - numProcessed);
  }
}

function querySelectorAllWithTimeout(selector, minCount = 0, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelectorAll(selector);
    if (element.length > minCount) {
      console.log('linkedin-automation: Element found:', selector);
      resolve(null);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelectorAll(selector);
      if (element.length > minCount) {
        observer.disconnect();
        resolve(null);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

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