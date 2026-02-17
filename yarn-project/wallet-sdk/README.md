# Wallet SDK Integration Guide for Third-Party Wallet Developers

This guide explains how to integrate your wallet with the Aztec Wallet SDK, enabling dApps to discover and interact with your wallet implementation.

## Available Types

All types and utilities needed for wallet integration are exported from `@aztec/wallet-sdk/types`:

```typescript
import type {
  DiscoveryRequest,
  DiscoveryResponse,
  KeyExchangeRequest,
  KeyExchangeResponse,
  WalletInfo,
  WalletMessage,
  WalletResponse,
} from '@aztec/wallet-sdk/types';
```

Cryptographic utilities for secure channel establishment are exported from `@aztec/wallet-sdk/crypto`:

```typescript
import type { EncryptedPayload, ExportedPublicKey } from '@aztec/wallet-sdk/crypto';
import {
  decrypt,
  deriveSessionKeys,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  hashToEmoji,
  importPublicKey,
} from '@aztec/wallet-sdk/crypto';
```

**For extension wallets**, pre-built connection handlers are available:

```typescript
import {
  BackgroundConnectionHandler,
  ContentScriptConnectionHandler,
} from '@aztec/wallet-sdk/extension/handlers';
```

## Overview

The Wallet SDK uses a **two-phase connection model** with **end-to-end encryption**:

### Phase 1: Discovery

1. **dApp broadcasts** a discovery request with chain information (NO public keys)
2. **Your wallet shows** a pending connection request to the user
3. **User approves** the connection request
4. **Your wallet responds** with basic wallet info and a MessagePort

### Phase 2: Secure Channel Establishment

5. **dApp initiates key exchange** by sending its ECDH public key over the MessagePort
6. **Wallet generates** ephemeral key pair and derives session keys using HKDF
7. **Both parties compute** the same verification hash independently
8. **User verifies** the has matches on both sides. A util for conversion to an emoji grid is provided
9. **User confirms** the connection in the dApp
10. **All subsequent communication** is encrypted using AES-256-GCM

### Key Security Features

- **User approval required**: Wallet never reveals itself without explicit user consent
- **Ephemeral keys**: New key pairs generated for each session
- **Anti-MITM verification**: 3x3 emoji grid (72 bits of security) for visual confirmation

## Architecture for Extension Wallets

```
┌─────────────┐    window.postMessage    ┌─────────────────┐    browser.runtime   ┌──────────────────┐
│   dApp      │◄──(discovery + port)────►│  Content Script │◄────────────────────►│ Background Script│
│ (web page)  │                          │  (message relay)│                      │ (crypto+state)   │
└─────────────┘                          └─────────────────┘                      └──────────────────┘
       │                                          │
       │              MessagePort                 │
       └──────────(key exchange + encrypted)──────┘
```

**Security model:**

- The MessagePort is transferred via `window.postMessage` - other scripts on the page could intercept it
- **Security comes from encryption**: After key exchange, all communication is AES-256-GCM encrypted
- Content script never has access to private keys or session secrets
- All cryptographic operations happen in the background script (service worker)
- Anti-MITM verification (emoji grid) ensures both parties derived the same keys

## Using Pre-built Connection Handlers

The SDK provides `BackgroundConnectionHandler` and `ContentScriptConnectionHandler` to handle the connection flow. These are the recommended way to build extension wallets.

### Background Script Setup

```typescript
import {
  BackgroundConnectionHandler,
  type BackgroundConnectionConfig,
  type BackgroundConnectionCallbacks,
  type BackgroundTransport,
} from '@aztec/wallet-sdk/extension/handlers';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';

// Configuration for your wallet
const config: BackgroundConnectionConfig = {
  walletId: 'my-aztec-wallet',
  walletName: 'My Aztec Wallet',
  walletVersion: '1.0.0',
  walletIcon: 'https://example.com/icon.png',
};

// Transport for browser extension APIs
const transport: BackgroundTransport = {
  sendToTab: (tabId, message) => browser.tabs.sendMessage(tabId, message),
  addContentListener: (handler) => browser.runtime.onMessage.addListener(handler),
};

// Event callbacks (all optional)
const callbacks: BackgroundConnectionCallbacks = {
  // Called when a new discovery request is received
  onPendingDiscovery: (discovery) => {
    // Show pending connection in wallet UI
    // Check if wallet supports this network (chainId AND version)
    const supported = supportedNetworks.some(
      n => n.chainId === discovery.chainInfo.chainId.toString() &&
           n.version === discovery.chainInfo.version.toString()
    );
    if (supported) {
      // Show the user so they can approve or reject
    }
  },

  // Called when key exchange completes and session is ready
  onSessionEstablished: (session) => {
    // Display verification emojis for user reference
    console.log('Session emojis:', hashToEmoji(session.verificationHash));
  },

  // Called when a session is terminated
  onSessionTerminated: (requestId) => {
    console.log('Session terminated:', requestId);
  },

  // Called when a decrypted wallet message is received
  onWalletMessage: (session, message) => {
    // Forward to your wallet backend
    wallet.postMessage(message);
  },
};

const handler = new BackgroundConnectionHandler(config, transport, callbacks);

// Initialize the handler to start listening
handler.initialize();

// User approves connection from wallet UI
function approveConnection(requestId: string) {
  handler.approveDiscovery(requestId);
}

// User denies connection
function denyConnection(requestId: string) {
  handler.rejectDiscovery(requestId);
}

// Send response back to dApp
async function sendWalletResponse(requestId: string, response: WalletResponse) {
  await handler.sendResponse(requestId, response);
}

// Clean up on tab close/navigate
browser.tabs.onRemoved.addListener((tabId) => {
  handler.terminateForTab(tabId);
});
```

### Content Script Setup

```typescript
import {
  ContentScriptConnectionHandler,
  type ContentScriptTransport,
} from '@aztec/wallet-sdk/extension/handlers';

const transport: ContentScriptTransport = {
  sendToBackground: (message) => browser.runtime.sendMessage(message),
  addBackgroundListener: (handler) => browser.runtime.onMessage.addListener(handler),
};

const handler = new ContentScriptConnectionHandler(transport);

// Start listening for discovery requests and background messages
handler.start();
```

## Testing Your Integration (dApp Side)

The `WalletManager` supports two patterns for consuming discovered wallets.

### Async Iterator Pattern

```typescript
import { Fr } from '@aztec/foundation/fields';
import { WalletManager } from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';

const discovery = WalletManager.configure({
  extensions: { enabled: true },
}).getAvailableWallets({
  chainInfo: {
    chainId: new Fr(31337),
    version: new Fr(1),
  },
  appId: 'my-dapp',
  timeout: 60000,
});

// Iterate over discovered wallets as they're approved
for await (const provider of discovery.wallets) {
  console.log(`Found: ${provider.name}`);

  // Establish secure channel (key exchange)
  const pending = await provider.establishSecureChannel('my-dapp');

  // Display verification emojis to user
  const emojis = hashToEmoji(pending.verificationHash);
  console.log('Verify this matches your wallet:', emojis);

  // User confirms emojis match
  const wallet = await pending.confirm();

  // All calls are now encrypted
  const accounts = await wallet.getAccounts();
  console.log('Accounts:', accounts);
}

// Cancel discovery when done or on cleanup
discovery.cancel();
```

### Callback Pattern

```typescript
import { Fr } from '@aztec/foundation/fields';
import { WalletManager, type WalletProvider } from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';

const discoveredProviders: WalletProvider[] = [];

const discovery = WalletManager.configure({
  extensions: { enabled: true },
}).getAvailableWallets({
  chainInfo: {
    chainId: new Fr(31337),
    version: new Fr(1),
  },
  appId: 'my-dapp',
  timeout: 60000,
  // Callback fires as each wallet is discovered
  onWalletDiscovered: (provider) => {
    discoveredProviders.push(provider);
    updateUI(); // Your UI update function
  },
});

// Wait for discovery to complete (or cancel early with discovery.cancel())
await discovery.done;
console.log('Discovery complete, found:', discoveredProviders.length);

// Connect to a selected provider
async function connectToWallet(provider: WalletProvider) {
  const pending = await provider.establishSecureChannel('my-dapp');

  // Show verification UI
  const emojis = hashToEmoji(pending.verificationHash);
  showVerificationDialog(emojis);

  // User confirms
  const wallet = await pending.confirm();
  return wallet;
}
```

### React Hook Example

```typescript
function useWalletDiscovery(chainInfo: ChainInfo, appId: string) {
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(true);
  const discoveryRef = useRef<DiscoverySession | null>(null);

  useEffect(() => {
    setProviders([]);
    setIsDiscovering(true);

    const discovery = WalletManager.configure({
      extensions: { enabled: true },
    }).getAvailableWallets({
      chainInfo,
      appId,
      timeout: 60000,
      onWalletDiscovered: (provider) => {
        setProviders(prev => [...prev, provider]);
      },
    });

    discoveryRef.current = discovery;

    discovery.done.then(() => setIsDiscovering(false));

    return () => {
      discovery.cancel();
      discoveryRef.current = null;
    };
  }, [chainInfo.chainId.toString(), chainInfo.version.toString(), appId]);

  return { providers, isDiscovering, cancel: () => discoveryRef.current?.cancel() };
}
```
