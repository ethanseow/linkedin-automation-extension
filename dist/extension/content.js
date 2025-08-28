let observers = [];
let timeouts = [];
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "startAutomation") {
    if (!request.searchQuery || !request.message || !request.peopleCount) {
      throw new Error("Start automation request missing required fields");
    }
    await startAutomation(request.searchQuery, request.message, request.peopleCount);
  }
});
const alertUI = (alertData) => {
  chrome.runtime.sendMessage({
    action: "alertUI",
    type: alertData.type,
    message: alertData.message
  });
};
const handleAddFreeNote = async (message) => {
  const dismissButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1e3);
  const addFreeNoteButton = await querySelectorWithTimeout('[aria-label="Add a free note"]', 1, 1e3);
  const messageInput = await querySelectorWithTimeout('textarea[name="message"], textarea[data-control-name="message"]', 1, 1e3);
  const sendButton = await querySelectorWithTimeout('button[aria-label="Send"]', 1, 1e3);
  addFreeNoteButton.click();
  await sleep(500);
  dismissButton.click();
  await sleep(500);
  messageInput.value = message;
  messageInput.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(500);
  sendButton.click();
};
const handleSendWithoutNote = async () => {
  const sendWithoutNoteButton = await querySelectorWithTimeout('button[aria-label="Send without a note"]', 1, 1e3);
  await sleep(500);
  sendWithoutNoteButton.click();
};
const handleConnect = async () => {
  const connectButton = await querySelectorWithTimeout('[aria-label*="Invite"]', 1, 1e3);
  await sleep(500);
  connectButton.click();
};
const connectWithPerson = async (personElement, message) => {
  console.log("linkedin-automation: Processing person:", personElement);
  const curriedHandleAddFreeNote = message.length > 0 ? () => handleAddFreeNote(message) : async () => {
  };
  const handlers = [curriedHandleAddFreeNote, handleSendWithoutNote];
  let didConnect = false;
  for (const handler of handlers) {
    try {
      await handleConnect();
      await handler();
      didConnect = true;
      console.log("linkedin-automation: Person processed:", personElement);
      break;
    } catch (error) {
      console.log("linkedin-automation: Error processing person:", error);
      continue;
    }
  }
  if (!didConnect) {
    throw new Error("Did not connect to person");
  }
  const closeButton = await querySelectorWithTimeout('[aria-label="Dismiss"]', 1, 1e3);
  closeButton.click();
};
const isNextPageAvailable = async () => {
  try {
    const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1e3);
    return !nextPageButton.disabled;
  } catch (error) {
    return false;
  }
};
const navigateToNextPage = async () => {
  const nextPageButton = await querySelectorWithTimeout('button[aria-label="Next"]', 1, 1e3);
  nextPageButton.click();
  await sleep(3e3);
  observers.forEach((observer) => observer && observer.disconnect());
  timeouts.forEach((timeout) => timeout && clearTimeout(timeout));
  observers = [];
  timeouts = [];
};
const waitForPageLoad = async () => {
  let numLinkedArea = 0;
  let numActiveButtons = 0;
  let timeout = 0;
  while ((numLinkedArea == 0 || numActiveButtons != numLinkedArea) && timeout < 5) {
    numActiveButtons = Array.from(document.querySelectorAll(".linked-area .artdeco-button")).filter((button) => {
      const btn = button;
      return !btn.disabled;
    }).length;
    numLinkedArea = Array.from(document.querySelectorAll(".linked-area")).length;
    await sleep(1e3);
    timeout++;
  }
};
const connectWithPeople = async (message, maxPeople) => {
  let numConnected = 0;
  const peopleCards = Array.from(document.querySelectorAll(".linked-area")).filter((card) => card.textContent?.includes("Connect"));
  for (let i = 0; i < peopleCards.length && numConnected < maxPeople; i++) {
    const card = peopleCards[i];
    console.log("linkedin-automation: Processing person:", card);
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
const checkSearchResultsAvailable = async () => {
  let searchResults = null;
  try {
    searchResults = await querySelectorWithTimeout(".search-results-container", 1, 1e4);
  } catch (error) {
    throw new Error("Automation Failed: Could not find search container");
  }
  const textContent = searchResults.textContent;
  if (!textContent) {
    throw new Error("Automation Failed: Search results container has no content");
  }
  if (textContent.includes("No results found")) {
    throw new Error("Automation Failed: No results found.");
  }
};
const startAutomation = async (searchQuery, message, maxPeople = 20) => {
  console.log("linkedin-automation: Starting automation");
  await waitForPageLoad();
  try {
    await checkSearchResultsAvailable();
  } catch (error) {
    alertUI({ type: "error", message: error.message });
    return;
  }
  const numProcessed = await connectWithPeople(message, maxPeople);
  if (await isNextPageAvailable() && maxPeople - numProcessed > 0) {
    await navigateToNextPage();
    await startAutomation(searchQuery, message, maxPeople - numProcessed);
  } else {
    if (numProcessed < maxPeople) {
      alertUI({ type: "warning", message: `${numProcessed} out of ${maxPeople} processed, no more further to connect to` });
    } else {
      alertUI({ type: "success", message: `All ${maxPeople} processed` });
    }
  }
};
const querySelectorWithTimeout = (selector, minCount = 1, timeout = 3e3) => {
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
      const result2 = checkElements();
      if (result2) {
        observer.disconnect();
        resolve(result2);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      console.log("linkedin-automation: Element not found after timeout:", selector);
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
    observers.push(observer);
    timeouts.push(timeoutId);
  });
};
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
