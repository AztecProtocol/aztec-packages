import {
  BackgroundConnectionHandler,
  type BackgroundTransport,
  type BackgroundConnectionCallbacks,
} from '@aztec/wallet-sdk/extension/handlers';

const WALLET_CONFIG = {
  walletId: 'test-wallet',
  walletName: 'Aztec Test Wallet',
  walletVersion: '1.0.0',
};

const transport: BackgroundTransport = {
  sendToTab: (tabId, message) => {
    chrome.tabs.sendMessage(tabId, message);
  },
  addContentListener: (handler) => {
    chrome.runtime.onMessage.addListener((message, sender) => {
      handler(message, {
        tab: sender.tab ? { id: sender.tab.id, url: sender.tab.url } : undefined,
      });
    });
  },
};

const callbacks: BackgroundConnectionCallbacks = {
  onPendingDiscovery: (discovery) => {
    // Auto-approve all discovery requests for testing
    handler.approveDiscovery(discovery.requestId);
  },
  onSessionEstablished: (session) => {
    console.log('[test-wallet] Session established:', session.sessionId);
  },
  onWalletMessage: async (session, message) => {
    console.log('[test-wallet] Received message:', message.type);

    // Handle getRegisteredAccounts with a hardcoded test address
    if (message.type === 'getRegisteredAccounts') {
      await handler.sendResponse(session.sessionId, {
        messageId: message.messageId,
        result: [
          {
            address: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            alias: 'Test Account',
          },
        ],
        walletId: WALLET_CONFIG.walletId,
      });
    } else {
      // Return empty result for unhandled methods
      await handler.sendResponse(session.sessionId, {
        messageId: message.messageId,
        result: null,
        walletId: WALLET_CONFIG.walletId,
      });
    }
  },
};

const handler = new BackgroundConnectionHandler(WALLET_CONFIG, transport, callbacks);
handler.initialize();

console.log('[test-wallet] Background script initialized');
