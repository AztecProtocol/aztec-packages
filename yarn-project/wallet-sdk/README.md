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

## Storage backends

Your wallet and the PXE it embeds persist state through a pluggable key-value store (`@aztec/kv-store`). In the browser there are two backends:

- **IndexedDB** (`@aztec/kv-store/deprecated/indexeddb`): the default in browser environments up to Aztec Alpha v4, now moved to a deprecated subpath. We plan to remove this backend, so new browser code should use the SQLite backend below.
- **SQLite-OPFS** (`@aztec/kv-store/sqlite-opfs`, also exported as the recommended `@aztec/kv-store/browser` entrypoint): the default KV store backend from Aztec Alpha v5 on. It's backed by the durable Origin Private File System web standard, and it offers a number of advantages over IndexedDB: a sane transaction model (IDB transactions auto-close the moment the event loop yields, which constrains the store layer), support for encryption at rest, and better performance in the access patterns we exercise the most from both wallet and PXE.

The backend is chosen by *which store you construct and hand to the wallet* there is no runtime flag or environment variable.

> **Data migration is not supported between backends, by design.** The v4→v5 protocol upgrade discards all local state regardless, so switching to SQLite-OPFS simply means starting from a fresh store.

### Quick start: embedded wallet with an encrypted SQLite store

If you build on `@aztec/wallets`' `EmbeddedWallet`, open its two stores (PXE state + the wallet DB) with `openEncryptedEmbeddedStores`, then pass them in:

```typescript
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { openEncryptedEmbeddedStores } from '@aztec/wallets/embedded/store-encryption';
import { createLogger } from '@aztec/foundation/log';

const log = createLogger('wallet:storage');

// Your wallet derives a 32-byte key (see "Key management" below).
// IMPORTANT: return a *fresh* Uint8Array each call. Opening a store consumes (empties)
// the key, so a reused array would be empty on the second open (see "important" below).
const getEncryptionKey = async () => new Uint8Array(myDerivedKey);

const { pxeStore, walletStore } = await openEncryptedEmbeddedStores(
  {
    pxe: { name: `pxe-${rollupAddress}`, poolDirectory: '/pxe' },
    wallet: { name: `wallet-${rollupAddress}`, poolDirectory: '/wallet' },
  },
  getEncryptionKey,
  log,
);

const wallet = await EmbeddedWallet.create(nodeUrl, {
  pxe: { store: pxeStore },
  walletDb: { store: walletStore },
});
```

If the supplied key cannot decrypt an existing store, `openEncryptedEmbeddedStores` throws `EmbeddedWalletEncryptionError` with `storeName: 'pxe' | 'wallet'`, which you can then surface as a "wrong password" error in your UI:

```typescript
import { EmbeddedWalletEncryptionError } from '@aztec/wallets/embedded/store-encryption';

try {
  await openEncryptedEmbeddedStores(/* ... */);
} catch (err) {
  if (err instanceof EmbeddedWalletEncryptionError) {
    showWrongPasswordError(); // err.storeName tells you which store failed
  } else {
    throw err;
  }
}
```

### Important 

1. **Opening a store consumes the key, it does not copy it.** So that raw key material does not linger in page memory, the SDK moves your key into the storage worker and detaches the buffer on your side. The `Uint8Array` you passed comes back empty, so the same array cannot be reused to open a second store. To open more than one store with the same key, hand each open a fresh copy (`new Uint8Array(key)`). `openEncryptedEmbeddedStores` does this for you by invoking your `getEncryptionKey` callback once per store.
2. **Each coexisting store needs its own `poolDirectory`.** The OPFS SAH Pool holds an *exclusive* lock on its directory, so two stores sharing the default pool fail with "Access Handles cannot be created if there is another open Access Handle…". Give every store a distinct, stable `poolDirectory` (stable so the same files re-open next session).

### No multi-tab access: assume one tab at a time

A store can be opened by **one browser tab at a time per origin**. If the user opens your wallet in a second tab of the same origin pointing at the same store, the second open contends for that lock.

Thanks to the lock, the data is never corrupted, but the second open fails or hangs rather than succeeding, and there is no graceful "already open elsewhere" signal yet.

Until it does, design for a single active tab: detect a second instance (e.g. with the [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) or a `BroadcastChannel`) and steer the user back to the existing tab, or open the store read-only there.

If you need genuine concurrent multi-tab access, route all storage access through a single `SharedWorker` that you own and that holds the one connection.

### Opting out of encryption

If you do not need at-rest encryption (you rely on full-disk encryption, or the device is trusted), an *unencrypted* SQLite-OPFS store is still a better default than IndexedDB.

The `createStore` convenience helper always uses the default OPFS pool directory and does not currently let you change it, so it only works for a single store per tab. The embedded wallet runs two stores (PXE + walletDB), so open them directly from `AztecSQLiteOPFSStore` with a distinct `poolDirectory` each:

```typescript
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { AztecSQLiteOPFSStore } from '@aztec/kv-store/sqlite-opfs';
import { createLogger } from '@aztec/foundation/log';

const log = createLogger('wallet:storage');

// No key; just name, ephemeral=false, and a distinct poolDirectory per store.
const pxeStore = await AztecSQLiteOPFSStore.open(log, `pxe-${rollupAddress}`, false, '/pxe');
const walletStore = await AztecSQLiteOPFSStore.open(log, `wallet-${rollupAddress}`, false, '/wallet');

const wallet = await EmbeddedWallet.create(nodeUrl, {
  pxe: { store: pxeStore },
  walletDb: { store: walletStore },
});
```

### Building your own wallet (lower-level API)

If you are not using `EmbeddedWallet`, construct stores directly from `@aztec/kv-store/sqlite-opfs` and pass them wherever a store is accepted (e.g. `PXECreationOptions.store`):

```typescript
import { openEncryptedStore, createStore, SqliteEncryptionError } from '@aztec/kv-store/sqlite-opfs';

// Encrypted, persistent:
const store = await openEncryptedStore(new Uint8Array(myDerivedKey), 'my-store', '/my-pool');

// Or unencrypted:
const plain = await createStore('my-store', { dataStoreMapSizeKb: 2e10 });
```

Note: `dataStoreMapSizeKb` is an LMDB-specific ceiling (the maximum memory-map size). SQLite-OPFS grows its file dynamically and ignores the value, but it is a required field of the shared `DataStoreConfig` type, so you must still pass something (any number is fine). We will fix this implementation leak in coming versions.

Note: `openEncryptedStore` throws `SqliteEncryptionError` (with a typed `code`, e.g. `'decrypt_failed'`) on a bad key.

### Using SQLite-OPFS in a browser extension (MV3)

SQLite-OPFS needs OPFS, a Web Worker, and cross-origin isolation (SharedArrayBuffer). In a Chrome MV3 extension:

- **Run it in an offscreen document, not the background service worker.** The service worker is ephemeral and does not reliably provide OPFS/SharedArrayBuffer; an offscreen document does, and it is where your PXE and stores should live.
- **No COOP/COEP header setup is needed inside the extension.** Extension pages are cross-origin-isolated by default. (A plain web page hosting the wallet *does* need those headers.)

### Key management is your responsibility

The store encrypts data at rest given a 32-byte key, but deriving and safeguarding that key is the wallet's job. A common pattern is to derive the key from a user password with a memory-hard KDF (e.g. Argon2id) and hold it only in memory while the wallet is unlocked. Adapt this to your own security model.
