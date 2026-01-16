# Wallet SDK Integration Guide for Third-Party Wallet Developers

This guide explains how to integrate your wallet with the Aztec Wallet SDK, enabling dApps to discover and interact with your wallet implementation.

## Available Types

All types and utilities needed for wallet integration are exported from `@aztec/wallet-sdk/types`:

```typescript
import type {
  DiscoveryRequest,
  DiscoveryResponse,
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
  deriveSharedKey,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  hashSharedSecret,
  hashToEmoji,
  importPublicKey,
} from '@aztec/wallet-sdk/crypto';
```

## Overview

The Wallet SDK uses a **unified discovery and connection** model with **end-to-end encryption**:

1. **dApp requests wallets** for a specific chain/version via `WalletManager.getAvailableWallets({ chainInfo })`
2. **SDK broadcasts** a discovery message with chain information and the dApp's ECDH public key
3. **Your wallet responds** with its ECDH public key and a MessagePort ONLY if it supports that network
4. **Both parties derive** the same shared secret via ECDH key exchange
5. **SDK receives** discovered wallets with secure channel already established (port + sharedKey)
6. **All subsequent communication** is encrypted using AES-256-GCM over the private MessagePort

### Key Features

- **No separate connection step**: The secure channel is established during discovery
- **MessagePort transferred immediately**: The discovery response includes a MessagePort for private communication
- **Anti-MITM verification**: Both parties can display emoji verification codes derived from the shared secret

### Transport Mechanisms

This guide uses **browser extension wallets** as the primary example, which communicate via `window.postMessage` for discovery and MessageChannel for secure communication. The same message protocol can be adapted for other transport mechanisms.

## Discovery Protocol

### 1. Listen for Discovery Requests

**Extension wallet (content script):**

```typescript
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  let data: DiscoveryRequest;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === 'aztec-wallet-discovery') {
    await handleDiscoveryRequest(data);
  }
});
```

### 2. Discovery Message Format

Discovery messages have this structure:

```typescript
interface DiscoveryRequest {
  type: 'aztec-wallet-discovery';
  requestId: string;              // UUID for tracking this request
  chainInfo: ChainInfo;           // Chain ID and protocol version
  publicKey: ExportedPublicKey;   // dApp's ECDH public key for key exchange
}
```

### 3. Handle Discovery and Establish Secure Channel

When your wallet receives a discovery request:

1. Check if you support the requested network
2. Derive the shared secret from the dApp's public key
3. Create a MessageChannel for secure communication
4. Respond with your wallet info and transfer one end of the channel

**Extension wallet (background script):**

```typescript
import {
  deriveSharedKey,
  exportPublicKey,
  generateKeyPair,
  hashSharedSecret,
  importPublicKey,
} from '@aztec/wallet-sdk/crypto';

// Generate key pair on wallet initialization (per session)
let walletKeyPair = await generateKeyPair();
let walletPublicKey = await exportPublicKey(walletKeyPair.publicKey);

// Store sessions by requestId
const sessions = new Map<string, { sharedKey: CryptoKey; verificationHash: string; tabId: number }>();

async function handleDiscovery(
  request: DiscoveryRequest,
  tabId: number
): Promise<{ success: true; response: DiscoveryResponse }> {
  // Check network support
  if (!supportsNetwork(request.chainInfo)) {
    throw new Error('Network not supported');
  }

  // Import dApp's public key and derive shared secret
  const dAppPublicKey = await importPublicKey(request.publicKey);
  const sharedKey = await deriveSharedKey(walletKeyPair.privateKey, dAppPublicKey);

  // Compute verification hash for anti-MITM verification
  const verificationHash = await hashSharedSecret(sharedKey);

  // Store the session with verificationHash (emoji computed lazily for display)
  sessions.set(request.requestId, { sharedKey, verificationHash, tabId });

  const response: DiscoveryResponse = {
    type: 'aztec-wallet-discovery-response',
    requestId: request.requestId,
    walletInfo: {
      id: 'my-aztec-wallet',
      name: 'My Aztec Wallet',
      version: '1.0.0',
      publicKey: walletPublicKey,
    },
  };

  return { success: true, response };
}
```

**Content script (creates MessageChannel and sends response):**

```typescript
async function handleDiscoveryRequest(request: DiscoveryRequest) {
  // Forward to background script for key derivation
  const result = await browser.runtime.sendMessage({
    type: 'aztec-wallet-discovery',
    content: request,
  });

  if (!result?.success) return;

  // Create MessageChannel for secure communication
  const channel = new MessageChannel();

  // Set up relay from page to background
  channel.port1.onmessage = (event) => {
    browser.runtime.sendMessage({
      type: 'secure-message',
      requestId: request.requestId,
      content: event.data,  // Encrypted payload
    });
  };
  channel.port1.start();

  // Send response with port2 to the page
  window.postMessage(JSON.stringify(result.response), '*', [channel.port2]);
}
```

### 4. Discovery Response Format

```typescript
interface DiscoveryResponse {
  type: 'aztec-wallet-discovery-response';
  requestId: string;              // Must match the request
  walletInfo: WalletInfo;         // Wallet info including public key
}

interface WalletInfo {
  id: string;                     // Unique wallet identifier
  name: string;                   // Display name
  icon?: string;                  // Optional icon URL
  version: string;                // Wallet version
  publicKey: ExportedPublicKey;   // ECDH public key for key exchange
}
```

**Important:** The response is sent via `window.postMessage` with a MessagePort transferred as the third argument. The SDK receives the port and uses it for all subsequent encrypted communication.

## Secure Communication

### Architecture for Extension Wallets

```
┌─────────────┐    window.postMessage    ┌─────────────────┐    browser.runtime   ┌──────────────────┐
│   dApp      │◄───(discovery only)─────►│  Content Script │◄────────────────────►│ Background Script│
│ (web page)  │                          │  (message relay)│                      │ (decrypt+process)│
└─────────────┘                          └─────────────────┘                      └──────────────────┘
       │                                          │
       │         MessagePort (private channel)    │
       └──────────(encrypted messages)────────────┘
```

**Security benefits:**

- Content script never has access to private keys or shared secrets
- All cryptographic operations happen in the background script (service worker)
- MessagePort provides a private channel not visible to other page scripts
- Only discovery uses `window.postMessage`; all wallet calls are encrypted on the MessagePort

### Handle Encrypted Messages

All wallet method calls arrive as encrypted payloads on the MessagePort:

```typescript
interface EncryptedPayload {
  iv: string;         // Base64-encoded initialization vector
  ciphertext: string; // Base64-encoded encrypted data
}
```

**Background script:**

```typescript
import { decrypt, encrypt } from '@aztec/wallet-sdk/crypto';

async function handleSecureMessage(requestId: string, encrypted: EncryptedPayload) {
  const session = sessions.get(requestId);
  if (!session) return;

  try {
    // Decrypt the incoming message
    const message = await decrypt<WalletMessage>(session.sharedKey, encrypted);
    const { type, messageId, args, chainInfo, walletId } = message;

    // Process the wallet method call
    const wallet = await getWalletForChain(chainInfo);
    const result = await wallet[type](...args);

    // Create and encrypt response
    const response: WalletResponse = { messageId, result, walletId };
    const encryptedResponse = await encrypt(session.sharedKey, response);

    // Send back through content script
    browser.tabs.sendMessage(session.tabId, {
      type: 'secure-response',
      requestId,
      content: encryptedResponse,
    });
  } catch (error) {
    // Send encrypted error response
    const errorResponse: WalletResponse = {
      messageId: message?.messageId ?? '',
      error: { message: error.message },
      walletId: message?.walletId ?? '',
    };
    const encryptedError = await encrypt(session.sharedKey, errorResponse);
    // ... send error response
  }
}
```

## Message Formats

### Wallet Method Request (Decrypted)

```typescript
interface WalletMessage {
  type: string;        // Wallet method name (e.g., 'getAccounts', 'sendTx')
  messageId: string;   // UUID for tracking this request
  args: unknown[];     // Method arguments
  chainInfo: ChainInfo;
  appId: string;       // Application identifier
  walletId: string;    // Your wallet's ID
}
```

### Wallet Method Response

```typescript
interface WalletResponse {
  messageId: string;   // Must match the request
  result?: unknown;    // Method result (if successful)
  error?: unknown;     // Error (if failed)
  walletId: string;    // Your wallet's ID
}
```

## Anti-MITM Verification

Both the dApp and wallet independently compute a `verificationHash` from the shared secret. If both parties compute the same hash, they know there's no man-in-the-middle attack.

```typescript
import { hashSharedSecret } from '@aztec/wallet-sdk/crypto';

// Compute verification hash from shared key
const verificationHash = await hashSharedSecret(sharedKey);

// Store verificationHash in session - this is the cryptographic proof
sessions.set(requestId, { sharedKey, verificationHash, tabId });
```

For user-friendly display, convert the hash to an emoji sequence:

```typescript
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';

// Convert to emoji only when displaying to the user
const emoji = hashToEmoji(verificationHash);  // e.g., "🔵🦋🎯🐼"
```

The dApp displays the same emoji sequence. If they match, the connection is secure.

## Session Management

Sessions should be cleaned up when:

- **Tab closes**: Browser tabs API `onRemoved` event
- **Tab navigates**: Browser tabs API `onUpdated` event with `status === 'loading'`

```typescript
// Clean up when tab closes
browser.tabs.onRemoved.addListener((tabId) => {
  for (const [requestId, session] of sessions) {
    if (session.tabId === tabId) {
      sessions.delete(requestId);
    }
  }
});

// Clean up when tab navigates
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    for (const [requestId, session] of sessions) {
      if (session.tabId === tabId) {
        sessions.delete(requestId);
      }
    }
  }
});
```

## Testing Your Integration

### Using WalletManager

```typescript
import { Fr } from '@aztec/foundation/fields';
import { WalletManager, hashToEmoji } from '@aztec/wallet-sdk/manager';

const manager = WalletManager.configure({
  extensions: { enabled: true },
});

// Discover wallets (secure channel established automatically)
const wallets = await manager.getAvailableWallets({
  chainInfo: {
    chainId: new Fr(31337),
    version: new Fr(0),
  },
  timeout: 2000,
});

// Each wallet provider has verification info
for (const provider of wallets) {
  const emoji = hashToEmoji(provider.metadata.verificationHash);
  console.log(`${provider.name}: ${emoji}`);
}

// Connect and use
const walletProvider = wallets.find(w => w.id === 'my-aztec-wallet');
if (walletProvider) {
  const wallet = await walletProvider.connect('my-app-id');

  // All calls are automatically encrypted
  const accounts = await wallet.getAccounts();
  console.log('Accounts:', accounts);
}
```

## Reference Implementation

For a complete reference implementation, see the demo wallet at:

- Repository: `~/repos/demo-wallet`
