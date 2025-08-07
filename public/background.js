// Background script for LinkedIn Automation Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Automation Extension installed');
});

// chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
//   try {
//     await chrome.storage.local.remove(['automationSettings']);
//     console.log('Automation settings cleared - tab closed');
//   } catch (error) {
//     console.error('Error clearing automation settings:', error);
//   }
// }); 