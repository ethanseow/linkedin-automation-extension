let observers = [];
let timeouts = [];
chrome.runtime.onMessage.addListener(async (request) => {
  if (request.action === "startPeopleSearchAutomation") {
    if (!request.message || !request.peopleCount) {
      throw new Error("Start automation request missing required fields");
    }
    await startPeopleSearchAutomation(request.message, request.peopleCount);
  }
  if (request.action === "startMyNetworkAutomation") {
    if (!request.peopleCount) {
      throw new Error("Start automation request missing required fields");
    }
    await startMyNetworkAutomation(request.peopleCount);
  }
});
const alertUI = (alertData) => {
  chrome.runtime.sendMessage({
    action: "alertUI",
    payload: {
      type: alertData.type,
      message: alertData.message
    }
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
const waitForPeoplePageLoad = async () => {
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
const waitForMyNetworkPageLoad = async () => {
  for (let i = 0; i < 5; i++) {
    const buttons = Array.from(document.querySelectorAll("button[aria-label]")).filter((btn) => btn && btn.getAttribute("aria-label")?.includes("Show all suggestions for People you may know"));
    if (buttons.length > 0) {
      break;
    }
    await sleep(1e3);
  }
};
const waitForLoadMoreConnectionsToLoad = async (prevHeight) => {
  for (let i = 0; i < 5; i++) {
    const dialogScroll = await querySelectorWithTimeout("#dialog-header + div", 1, 5e3);
    if (dialogScroll.scrollHeight > prevHeight) {
      return;
    }
    await sleep(1e3);
  }
  throw new Error("Automation Failed: Did not load more connections");
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
const connectWithMyNetwork = async (maxPeople) => {
  const showAllButton = Array.from(document.querySelectorAll("button[aria-label]")).filter((btn) => btn && btn.getAttribute("aria-label")?.includes("Show all suggestions for People you may know"))[0];
  showAllButton.click();
  while (maxPeople > 0) {
    const dialog = await querySelectorWithTimeout('[data-testid="dialog"]', 1, 5e3);
    const connectButtons = await querySelectorWithTimeout("button", 2, 5e3, (btn) => btn.textContent?.trim() === "Connect", dialog);
    if (connectButtons.length === 0) {
      return maxPeople;
    }
    for (const connectButton of connectButtons) {
      connectButton.click();
      await sleep(250);
      maxPeople -= 1;
      if (maxPeople <= 0) {
        break;
      }
    }
    const dialogScroll = await querySelectorWithTimeout("#dialog-header + div", 1, 5e3);
    const prevScrollHeight = dialogScroll.scrollHeight;
    dialogScroll.scrollTop = prevScrollHeight;
    const loadMoreBtn = await querySelectorWithTimeout("button", 1, 5e3, (btn) => btn.textContent?.trim() === "Load more", dialog);
    loadMoreBtn.click();
    await waitForLoadMoreConnectionsToLoad(prevScrollHeight);
    dialogScroll.scrollTop = dialogScroll.scrollHeight;
  }
  return maxPeople;
};
const startMyNetworkAutomation = async (maxPeople) => {
  console.log("linkedin-automation: Starting my network automation");
  await waitForMyNetworkPageLoad();
  try {
    const numConnected = await connectWithMyNetwork(maxPeople);
    alertUI({ type: "success", message: `${numConnected} out of ${maxPeople} people connected` });
  } catch (error) {
    alertUI({ type: "error", message: error.message });
  }
};
const startPeopleSearchAutomation = async (message, maxPeople = 20) => {
  console.log("linkedin-automation: Starting people search automation");
  await waitForPeoplePageLoad();
  try {
    await checkSearchResultsAvailable();
  } catch (error) {
    alertUI({ type: "error", message: error.message });
    return;
  }
  const numProcessed = await connectWithPeople(message, maxPeople);
  if (await isNextPageAvailable() && maxPeople - numProcessed > 0) {
    await navigateToNextPage();
    await startPeopleSearchAutomation(message, maxPeople - numProcessed);
  } else {
    if (numProcessed < maxPeople) {
      alertUI({ type: "warning", message: `${numProcessed} out of ${maxPeople} processed, no more further to connect to` });
    } else {
      alertUI({ type: "success", message: `All ${maxPeople} processed` });
    }
  }
};
const querySelectorWithTimeout = (selector, minCount = 1, timeout = 3e3, filterFunction, parentElement = document) => {
  const checkElements = () => {
    const elements = parentElement.querySelectorAll(selector);
    if (elements.length >= minCount) {
      const filteredElements = Array.from(elements).filter(filterFunction || (() => true));
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
