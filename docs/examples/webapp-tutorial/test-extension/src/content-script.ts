import {
  ContentScriptConnectionHandler,
  type ContentScriptTransport,
} from '@aztec/wallet-sdk/extension/handlers';

const transport: ContentScriptTransport = {
  sendToBackground: (message) => {
    chrome.runtime.sendMessage(message);
  },
  addBackgroundListener: (handler) => {
    chrome.runtime.onMessage.addListener((message) => {
      handler(message);
    });
  },
};

const handler = new ContentScriptConnectionHandler(transport);
handler.start();

console.log('[test-wallet] Content script initialized');
