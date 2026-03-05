---
title: "2. Wallet Extension Integration"
sidebar_position: 2
description: "Build an Aztec wallet extension — handle discovery, manage sessions, route messages, and extend BaseWallet"
---

# Wallet Extension Integration

This page covers the wallet extension side: handling discovery requests, managing encrypted sessions, routing messages, and implementing wallet methods. The patterns come from the [tutorial wallet extension](../../wallet-extension/index.md) in `test-extension/`.

## Overview

A wallet extension has three components that use the SDK:

| Component | SDK class | Responsibility |
|-----------|-----------|----------------|
| Content script | `ContentScriptConnectionHandler` | Relay messages between page and background |
| Background service worker | `BackgroundConnectionHandler` | Manage sessions, route messages, trigger approvals |
| Offscreen document | `BaseWallet` subclass | Execute wallet methods (sendTx, simulateTx, etc.) |

## Content Script

The content script is the simplest piece — it relays messages and never sees encryption keys:

#include_code content-script docs/examples/webapp-tutorial/test-extension/src/content-script.ts typescript

`ContentScriptConnectionHandler` needs a transport with two functions:
- `sendToBackground(message)` — forward to the background service worker
- `addBackgroundListener(handler)` — receive messages from background

Call `handler.start()` immediately. The handler listens for discovery requests from the page and relays them.

## Background Service Worker

The background script is where most of the SDK integration happens.

### Configuration

Define your wallet's identity:

#include_code wallet-config docs/examples/webapp-tutorial/test-extension/src/config.ts typescript

### Transport

The background transport sends messages to content scripts and filters incoming messages:

#include_code transport docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Key points:
- `sendToTab` uses `chrome.tabs.sendMessage` to reach specific content scripts
- `addContentListener` filters out popup messages (those have a `target` field) and storage proxy messages
- Only discovery, key exchange, and encrypted wallet messages reach the handler

### Handler Initialization

Create the handler with your config, transport, and callbacks:

```typescript
const handler = new BackgroundConnectionHandler(WALLET_CONFIG, transport, callbacks);
handler.initialize();
```

## Callbacks

The SDK provides four optional callbacks at different protocol stages. The tutorial uses three (the fourth, `onSessionTerminated`, fires when a session ends and is useful for cleanup):

### onPendingDiscovery

Called when a dApp broadcasts a discovery request. You decide whether to show an approval UI or auto-approve:

#include_code callbacks docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Key responsibilities:
- **Stale session cleanup** — terminate sessions from the same tab (handles page refresh)
- **Deduplication** — reject duplicate discoveries from the same tab
- **Trusted origins** — auto-approve if the user previously connected to this origin
- **Show UI** — open the popup for the user to approve new connections

Call `handler.approveDiscovery(requestId)` to proceed with key exchange, or `handler.rejectDiscovery(requestId)` to deny.

### onSessionEstablished

Called after ECDH key exchange completes. The session has a `verificationHash` for emoji verification:

- For **trusted origins**: auto-confirm the session and restore saved capabilities
- For **new origins**: store the session as pending verification and show the emoji grid in the popup

### onWalletMessage

Called when a dApp sends an encrypted wallet method call. Messages arriving before emoji verification are queued and flushed after the user confirms:

#include_code on-wallet-message docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

## Message Routing

The core routing logic decides which methods need user approval:

#include_code approval-check docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

The approval matrix:

| Method | Approval needed? | Why |
|--------|-----------------|-----|
| `sendTx` | Yes | State-changing transaction |
| `batch` containing `sendTx` | Yes | Contains state-changing calls |
| `requestCapabilities` | Yes (first time) | Grants permissions to the dApp |
| `simulateTx` | No | Read-only simulation |
| `executeUtility` | No | Unconstrained function call |
| `getAccounts` | No | Returns account info |
| `registerContract` | No | Registers contract with PXE |
| Everything else | No | Read-only or background operations |

## Sending Responses

Every wallet message must get a response. Use `handler.sendResponse()` — it encrypts and sends via the secure channel:

```typescript
// Success response
await handler.sendResponse(session.sessionId, {
  messageId: message.messageId,
  result: someResult,
  walletId: WALLET_CONFIG.walletId,
});

// Error response
await handler.sendResponse(session.sessionId, {
  messageId: message.messageId,
  error: 'Something went wrong',
  walletId: WALLET_CONFIG.walletId,
});
```

For auto-executing methods, forward to the offscreen document and return the result:

#include_code send-to-offscreen docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

## Extending BaseWallet

The offscreen document hosts your wallet implementation. Extend `BaseWallet` to get `sendTx`, `simulateTx`, `batch`, and other methods for free:

#include_code wallet-instance docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

### What You Must Implement

| Method | Purpose |
|--------|---------|
| `getAccountFromAddress(address)` | Look up an `Account` by its `AztecAddress` |
| `getAccounts()` | Return all accounts (with aliases) |

:::tip Custom Fee Payment
`completeFeeOptions` has a default implementation that uses the sender's fee juice balance. Override it to inject a custom fee payment strategy (e.g., `SponsoredFPC`). The tutorial wallet overrides this — see the `complete-fee-options` code block below.
:::

### What BaseWallet Provides

| Method | What it does |
|--------|-------------|
| `sendTx(payload, opts)` | Completes fee options, creates execution request, generates proof, submits to node |
| `simulateTx(payload, opts)` | Simulates without proving |
| `executeUtility(call, opts)` | Executes an unconstrained function call |
| `batch(methods)` | Batches multiple wallet method calls |
| `createAuthWit(from, intent)` | Creates authorization witnesses |
| `registerContract(instance, artifact)` | Registers contracts with PXE |
| `getChainInfo()` | Returns chain ID and version |

:::note
`requestCapabilities()` is part of the `Wallet` interface but throws `"Not implemented"` in BaseWallet by default. The `BackgroundConnectionHandler` handles capability requests for extension wallets — see [Callbacks](#callbacks) above.
:::

### Dynamic Method Dispatch

The offscreen document handles all wallet methods dynamically using `WalletSchema` for type-safe argument parsing:

#include_code wallet-method-handler docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

## Session Lifecycle

### Trusted Origins

Store approved origins so returning users get auto-reconnected:

#include_code trusted-origins docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

When a trusted origin connects, the wallet:
1. Auto-approves discovery (no popup)
2. Auto-confirms the session (no emoji verification)
3. Auto-grants capabilities (if requesting the same set)

### Cleanup

Sessions are cleaned up when:
- **Page refresh** — `onPendingDiscovery` terminates stale sessions from the same tab
- **Tab closed** — `chrome.tabs.onRemoved` calls `handler.terminateForTab(tabId)`
- **User disconnects** — popup sends `DISCONNECT_SESSION`, which also removes the origin from trusted origins

The handler provides cleanup methods:
- `handler.terminateSession(sessionId)` — end a specific session
- `handler.terminateForTab(tabId)` — end all sessions for a tab
- `handler.getPendingDiscoveries()` — list pending discovery requests
- `handler.getActiveSessions()` — list active sessions

## State Persistence

Service workers restart frequently. Persist critical state to survive restarts:

#include_code state-persistence docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Use `chrome.storage.session` — it survives service worker restarts but clears when the browser closes.

:::note
The `BackgroundConnectionHandler`'s internal state (active sessions, pending discoveries) is **not** persisted — sessions don't survive extension reloads. On restart, dApps will re-discover and reconnect. Trusted origin auto-approve makes this seamless.
:::

## Extension Lifecycle

Handle extension install/update and startup:

#include_code lifecycle docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

On install/update, clear pending state since sessions don't survive reloads. On startup, restore persisted state and preload the offscreen document to warm up WASM.

## Next Steps

- [dApp Integration](./01-dapp-integration.md) — See how the other side connects to your wallet
- [Wallet Extension Tutorial](../../wallet-extension/index.md) — Full step-by-step guide to building a wallet extension, including accounts, transactions, and approval UIs
