// SYNC ENGINE - Extension Service Worker (Manifest V3)
/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

let currentUnreadCount = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'UPDATE_UNREAD') {
    currentUnreadCount = Math.max(0, Number(message.count) || 0);
    const badgeText = currentUnreadCount > 0 ? (currentUnreadCount > 99 ? '99+' : String(currentUnreadCount)) : '';

    if (chrome.action && typeof chrome.action.setBadgeText === 'function') {
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: '#6c5ce7' });
    }

    sendResponse({ ok: true, count: currentUnreadCount });
    return true;
  }

  if (message.type === 'GET_UNREAD') {
    sendResponse({ ok: true, count: currentUnreadCount });
    return true;
  }

  return false;
});

if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener(() => {
    chrome.tabs.query({ url: '*://*/*' }, (tabs) => {
      const match = (tabs || []).find(tab => tab.url && (tab.url.includes('widget.html') || tab.url.includes('index.html')));
      if (match && match.id) {
        chrome.tabs.update(match.id, { active: true });
        if (match.windowId) {
          chrome.windows.update(match.windowId, { focused: true });
        }
      } else {
        chrome.tabs.create({ url: 'https://syncengine.local' });
      }
    });
  });
}
