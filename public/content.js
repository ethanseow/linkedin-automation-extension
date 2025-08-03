window.addEventListener('load', async () => {
  try {
    const automationSettings = await getAutomationSettings();
    if (!automationSettings) return;

    startAutomation(automationSettings.searchQuery, automationSettings.message, automationSettings.maxPeople);
  } catch (error) {
    console.error('Error reading from storage:', error);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'startAutomation') return;
  
  startAutomation(request.searchQuery, request.message);
});

async function getAutomationSettings() {
  const result = await chrome.storage.local.get(['automationSettings']);
  const { automationSettings } = result;

  if (!automationSettings?.searchQuery || !automationSettings?.message || !automationSettings?.maxPeople) {
    return null;
  }

  return automationSettings;
}

async function saveAutomationSettings(searchQuery, message, maxPeople) {
  await chrome.storage.local.set({
    automationSettings: {
      searchQuery,
      message,
      maxPeople
    }
  });
}

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
  await sleep(500);

  const upsellModal = document.querySelector('.modal-upsell');
  if (upsellModal) {
    await closeUpsellModal();
    throw new Error('Cannot add a free note');
  }

  const messageInput = document.querySelector('textarea[name="message"], textarea[data-control-name="message"]');
  if (!messageInput) throw new Error('Message input not found');

  messageInput.value = message;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);

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

  const sendButton = document.querySelector('button[aria-label="Send now"], button[data-control-name="send"]');
  if (!sendButton) throw new Error('Send button not found');

  sendButton.click();
}

async function handleConnect(card) {
  const connectButton = Array.from(card.querySelectorAll('button')).find(
    btn => btn.textContent && btn.textContent.trim().toLowerCase() === 'connect'
  );

  if (!connectButton || connectButton.disabled) throw new Error('Connect button not found');

  connectButton.click();
  await sleep(1000);
}

async function processPerson(card, message) {
  const curriedHandleAddFreeNote = handleAddFreeNote.bind(null, message);
  const handlers = [curriedHandleAddFreeNote, handleSendWithoutNote];

  for(const handler of handlers) {
    try {
      await handleConnect(card);
      await handler();
      break;
    } catch (error) {
      continue;
    }
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
  await waitForElement('.search-results-container');
}

async function processPeople(message, maxPeople) {
  let numProcessed = 0;
  const peopleCards = document.querySelectorAll('.linked-area');

  for (let i = 0; i < peopleCards.length && numProcessed < maxPeople; i++) {
    const card = peopleCards[i];
    try {
      await processPerson(card, message);
      numProcessed++;
    } catch (error) {
      continue;
    }
  }

  console.log(`We processed ${numProcessed} people out of ${peopleCards.length}`);
  return numProcessed;
}

async function startAutomation(searchQuery, message, maxPeople = 20) {
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;

  if (!window.location.href.includes(`/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`)) {
    window.location.href = searchUrl;
    return;
  }

  await waitForElement('.search-results-container');
  const numProcessed = await processPeople(message, maxPeople);

  if (isNextPageAvailable()) {
    await saveAutomationSettings(searchQuery, message, maxPeople - numProcessed);
    await navigateToNextPage();
  }
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
} 