---
title: "2. Wallet Protocol"
description: Implementing the Aztec wallet SDK protocol - discovery, ECDH key exchange, and secure messaging
sidebar_position: 2
references: ["docs/examples/webapp-tutorial/test-extension/src/background.ts", "yarn-project/wallet-sdk/src/*"]
---

# Wallet Protocol

The Aztec wallet SDK defines a protocol for dApps to discover and communicate with wallets securely. This section covers how the extension implements this protocol.

## Protocol Overview

The wallet SDK protocol has three phases:

1. **Discovery** - dApp broadcasts a request, wallets respond with their info
2. **Key Exchange** - ECDH establishes a shared secret for encrypted messaging
3. **Secure Messaging** - All subsequent messages are encrypted

This design:
- Works with any number of wallets
- Prevents eavesdropping on wallet calls
- Allows user verification (emoji codes)

## Discovery Phase

When a dApp calls `aztec.connect()`, it broadcasts a discovery request:

```typescript
// From dApp (simplified)
const wallet = await aztec.connect({
  appId: 'my-dapp',
  chainInfo: { chainId: 31337, version: 1 },
});
```

The content script receives this and forwards it to the background:

```typescript
// Content script forwards to background
chrome.runtime.sendMessage({
  type: 'DISCOVERY_REQUEST',
  content: { appId, chainInfo, requestId },
});
```

The background service worker handles it:

#include_code callbacks docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Key points:
- Each discovery becomes a "pending discovery" awaiting user approval
- The `BackgroundConnectionHandler` from wallet SDK manages the protocol state
- `onPendingDiscovery` callback lets us show the connection request to users

## Connection Approval

When the user clicks "Connect" in the popup:

#include_code popup-messages docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

The `handler.approveDiscovery()` call:
1. Marks the discovery as approved
2. Sends a discovery response to the dApp with wallet info
3. Triggers the key exchange phase

## Key Exchange Phase

After approval, the dApp initiates key exchange by sending its ECDH public key. The `BackgroundConnectionHandler` handles this automatically — the pseudocode below shows the conceptual flow, not code you write:

```typescript
// Conceptual flow inside BackgroundConnectionHandler (from wallet SDK)
async handleKeyExchangeRequest(sessionId, request) {
  // Generate our ECDH key pair
  const keyPair = await generateKeyPair();
  const publicKey = await exportPublicKey(keyPair.publicKey);

  // Derive shared secret from their public key
  const appPublicKey = await importPublicKey(request.publicKey);
  const sessionKeys = await deriveSessionKeys(keyPair, appPublicKey, false);

  // Store session with shared encryption key
  const session = {
    sessionId,
    sharedKey: sessionKeys.encryptionKey,
    verificationHash: sessionKeys.verificationHash, // For emoji display
    // ...
  };

  // Send our public key back
  this.transport.sendToTab(tabId, {
    type: 'KEY_EXCHANGE_RESPONSE',
    publicKey,
  });
}
```

The key exchange uses:
- **ECDH** (Elliptic Curve Diffie-Hellman) for shared secret derivation
- **AES-GCM** for subsequent message encryption
- **Verification hash** that can be displayed as emojis for visual confirmation

## Emoji Verification

The verification hash can be converted to emojis for users to confirm they're talking to the right wallet:

```typescript
// Convert hash to emoji sequence
function hashToEmojis(hash: string): string {
  const emojis = ['🔐', '🎮', '🚀', '⭐', '🎯', '💎', '🔥', '🌟'];
  return hash
    .slice(0, 8)
    .split('')
    .map((c) => emojis[parseInt(c, 16) % emojis.length])
    .join('');
}
```

Both the dApp and wallet should display the same emoji sequence, confirming the connection is secure.

## Secure Messaging

Once key exchange completes, all messages are encrypted:

```typescript
// In BackgroundConnectionHandler
async handleEncryptedMessage(sessionId, encrypted) {
  const session = this.activeSessions.get(sessionId);
  if (!session) return;

  // Decrypt using shared key
  const message = await decrypt(session.sharedKey, encrypted);

  // Call our handler
  this.callbacks.onWalletMessage?.(session, message);
}

async sendResponse(sessionId, response) {
  const session = this.activeSessions.get(sessionId);
  if (!session) return;

  // Encrypt response
  const encrypted = await encrypt(session.sharedKey, JSON.stringify(response));

  // Send to content script
  this.transport.sendToTab(session.tabId, {
    type: 'SECURE_RESPONSE',
    sessionId,
    content: encrypted,
  });
}
```

## Message Routing

The extension checks whether a wallet method needs user approval before forwarding:

```typescript
// sendTx always requires approval — it's a state-changing operation.
// batch requires approval only if it contains a sendTx.
// Read-only calls (getAccounts, simulateTx, executeUtility, etc.) auto-execute.
const needsApproval =
  message.type === 'sendTx' ||
  (message.type === 'batch' &&
    Array.isArray(message.args?.[0]) &&
    message.args[0].some((m: any) => m.name === 'sendTx'));
```

`requestCapabilities` has its own approval flow — the wallet stores it as pending and shows a capability grant prompt.

For methods that don't need approval, the extension forwards directly to offscreen via a persistent port. The port uses `messageId`-based request/response correlation with a 5-minute timeout and automatic retry if the offscreen document is torn down by Chrome:

#include_code send-to-offscreen docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

For methods that need approval, the extension stores them as pending and waits for user action:

```typescript
// Store pending transaction
const pending = {
  sessionId: session.sessionId,
  messageId: message.messageId,
  method: message.type,
  args: message.args,
  from: message.args?.options?.from,
  origin: session.origin,
  timestamp: Date.now(),
};
pendingTransactions.push(pending);
updateBadge();
```

## Transport Implementation

The transport bridges Chrome's messaging APIs:

#include_code transport docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Key points:
- `sendToTab` uses `chrome.tabs.sendMessage` to reach content scripts
- `addContentListener` uses `chrome.runtime.onMessage` to receive content script messages
- The listener skips messages with a `target` field (those are popup → background) and storage proxy messages (those are offscreen → background via broadcast)

## Session Lifecycle

Sessions are cleaned up automatically when:
- **Page refresh** — `onPendingDiscovery` terminates stale sessions from the same tab before processing the new discovery
- **Tab closed** — `chrome.tabs.onRemoved` calls `handler.terminateForTab()` to remove all sessions and discoveries for the tab
- **User disconnects** — The popup sends `DISCONNECT_SESSION`, which also removes the origin from trusted origins

## Next Steps

With the protocol in place, let's set up [PXE Integration](./03-pxe-integration.md) - running a full Private eXecution Environment inside the extension.
