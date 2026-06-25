---
title: Building a wallet extension
sidebar_position: 2
tags: [wallet, sdk, extension]
description: Implement the Aztec wallet SDK protocol in a browser extension. Covers discovery, sessions, message routing, and BaseWallet.
---

This page is a reference for wallet extension developers. It walks through each piece of the integration without prescribing a full project layout. For the canonical source you can browse alongside this guide, see [`yarn-project/wallet-sdk/`](https://github.com/AztecProtocol/aztec-packages/tree/v4.3.1/yarn-project/wallet-sdk) at v4.3.1.

## Components

A typical Manifest V3 extension wallet has three components that use the SDK:

| Component | SDK class | Responsibility |
|---|---|---|
| Content script | `ContentScriptConnectionHandler` | Relay messages between the page and the background |
| Background service worker | `BackgroundConnectionHandler` | Manage sessions, route messages, trigger user approvals |
| Wallet host (e.g. an offscreen document) | `BaseWallet` subclass | Execute wallet methods (`sendTx`, `simulateTx`, etc.) |

A Manifest V3 service worker has a 5-minute inactivity timeout and limited WASM support. PXE state and proof generation typically live in an offscreen document so they survive longer than the service worker.

## Install

```bash
yarn add @aztec/wallet-sdk@4.3.1 @aztec/aztec.js@4.3.1 @aztec/pxe@4.3.1
```

## Content script

The content script never sees encryption keys. Construct a `ContentScriptConnectionHandler` with a transport that knows how to talk to your background service worker, then call `start()`:

```typescript
import { ContentScriptConnectionHandler } from '@aztec/wallet-sdk/extension/handlers';

const handler = new ContentScriptConnectionHandler({
  sendToBackground: (message) => chrome.runtime.sendMessage(message),
  addBackgroundListener: (listener) => chrome.runtime.onMessage.addListener(listener),
});

handler.start();
```

## Background service worker

The background script is where most of the SDK integration lives. Construct a `BackgroundConnectionHandler` with your wallet's identity, a transport, and a set of callbacks:

```typescript
import { BackgroundConnectionHandler } from '@aztec/wallet-sdk/extension/handlers';

const WALLET_CONFIG = {
  walletId: 'my-wallet',
  walletName: 'My Aztec Wallet',
  walletVersion: '1.0.0',
  // walletIcon is optional. Omit it if you don't have one; dApps render a fallback.
  walletIcon: 'data:image/png;base64,...',
};

const transport = {
  sendToTab: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  addContentListener: (handler) => chrome.runtime.onMessage.addListener(handler),
};

const handler = new BackgroundConnectionHandler(WALLET_CONFIG, transport, callbacks);
handler.initialize();
```

Chain selection is per-session, not per-wallet. The dApp passes its target `chainInfo` in the discovery request, and `BackgroundConnectionHandler` exposes it to your callbacks via `PendingDiscovery.chainInfo`.

### Callbacks

The handler exposes four optional callbacks at different protocol stages.

#### `onPendingDiscovery`

Fired when a dApp broadcasts a discovery request. Decide whether to auto-approve (trusted origin) or open the popup so the user can approve:

```typescript
const callbacks = {
  async onPendingDiscovery({ requestId, appId, origin, tabId, chainInfo }) {
    // Optional: terminate stale sessions from the same tab on page refresh.
    for (const s of handler.getActiveSessions()) {
      if (s.tabId === tabId) handler.terminateSession(s.sessionId);
    }

    if (await isTrustedOrigin({ appId, origin, chainInfo })) {
      handler.approveDiscovery(requestId);
    } else {
      await openApprovalPopup({ requestId, appId, origin, chainInfo });
      // The popup later calls handler.approveDiscovery(requestId)
      // or handler.rejectDiscovery(requestId).
    }
  },
  // onSessionEstablished, onWalletMessage, onSessionTerminated below.
};
```

#### `onSessionEstablished`

Fires after ECDH key exchange completes. The session has a `verificationHash` for the emoji grid. The SDK does not expose a "confirm" call on the wallet side, so what your wallet does at this point is pure policy:

- For trusted origins: mark the session as trusted in your own state and restore previously granted capabilities. Persistence and policy are entirely up to your wallet code.
- For new origins: stash the session and show the emoji grid in the popup so the user can match it against the dApp before you treat any incoming message as authorized.

#### `onWalletMessage`

Fires when a dApp sends an encrypted wallet method call. The handler decrypts the payload and immediately invokes your callback. The SDK does not buffer messages by verification state; if you want to defer messages that arrive before the user confirms the emojis, queue them yourself in your callback.

#### `onSessionTerminated`

Fires when a session ends (tab closed, user disconnects, etc.). Use it to clean up extension state.

### Routing wallet calls

For every incoming `onWalletMessage`, decide whether the call needs user approval, then either prompt the user or forward to your wallet implementation.

`aztec.js` models privileged methods behind named capabilities (see `AppCapabilities` and `Capability` in `@aztec/aztec.js/wallet`). The expected pattern is: the dApp calls `requestCapabilities` once, your wallet shows the user a single combined dialog, and methods covered by an approved capability can run without further prompting. The matrix below assumes you follow that pattern.

| Method | Approval policy | Capability gating the method |
|---|---|---|
| `requestCapabilities` (first time) | Per-call: prompt the user with the full manifest | n/a (grants the capabilities themselves) |
| `sendTx` | Per-call confirmation, on top of an approved `transaction` capability | `transaction` |
| `batch` | Treat as the union of its inner methods | derived from inner methods |
| `simulateTx`, `profileTx` | Run after an approved `simulation` (with a `transactions` scope) | `simulation.transactions` |
| `executeUtility` | Run after an approved `simulation` (with a `utilities` scope) | `simulation.utilities` |
| `getAccounts`, `createAuthWit` | Run after an approved `accounts` capability | `accounts` |
| `registerContract`, `getContractMetadata` | Run after an approved `contracts` capability | `contracts` |
| `getContractClassMetadata` | Run after an approved `contractClasses` capability | `contractClasses` |
| `getAddressBook`, `getPrivateEvents` | Run after an approved `data` capability | `data` |

The SDK does not enforce any of this — `requestCapabilities` in `BaseWallet` throws "Not implemented" by default, and capability persistence and per-call policy are entirely your wallet's responsibility. A wallet is free to require an extra confirmation for sensitive methods even when a capability is granted (for example, every `sendTx`), or to skip prompts for trusted origins it has remembered.

Once you decide a call may proceed, forward it to your wallet host and reply with `handler.sendResponse()`:

```typescript
await handler.sendResponse(session.sessionId, {
  messageId: message.messageId,
  result: someResult,
  walletId: WALLET_CONFIG.walletId,
});
```

For errors, send an error response in the same shape, but with `error` instead of `result`:

```typescript
await handler.sendResponse(session.sessionId, {
  messageId: message.messageId,
  error: 'Something went wrong',
  walletId: WALLET_CONFIG.walletId,
});
```

## Extending `BaseWallet`

`BaseWallet` provides default implementations of `sendTx`, `simulateTx`, `batch`, `createAuthWit`, `registerContract`, `getChainInfo`, and others. Subclass it and supply the two account hooks:

```typescript
import { BaseWallet, type CompleteFeeOptionsConfig } from '@aztec/wallet-sdk/base-wallet';
import type { Account } from '@aztec/aztec.js/account';
import type { Aliased } from '@aztec/aztec.js/wallet';
import type { AztecAddress } from '@aztec/aztec.js/addresses';

class MyWallet extends BaseWallet {
  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    // Look up the Account object for this address from your account store.
  }

  async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    // Return all accounts the wallet knows about, with aliases.
  }
}
```

`completeFeeOptions(config: CompleteFeeOptionsConfig)` has a default that uses the sender's fee juice balance. Override it if you want to inject a custom fee payment strategy (for example, paying via a sponsored fee paying contract on every transaction):

```typescript
protected async completeFeeOptions(config: CompleteFeeOptionsConfig) {
  const base = await super.completeFeeOptions(config);
  return {
    ...base,
    walletFeePaymentMethod: mySponsoredMethod,
  };
}
```

`requestCapabilities()` is part of the `Wallet` interface but throws "Not implemented" by default in `BaseWallet`. The SDK does not enforce capabilities for you, so a wallet that wants to support capability negotiation must override `requestCapabilities()` (or handle it inside the message-routing layer above) and decide what to grant.

## Session lifecycle

If you want returning users to skip the approval popup, your wallet code can persist the set of trusted origins. Use `chrome.storage.local` if the trust list should survive browser restarts, or `chrome.storage.session` if it should clear when the browser closes. The SDK does not store trust state for you.

Be careful what you scope trust to. Origin alone is rarely enough: a wallet that auto-approves an `origin` for one chain shouldn't auto-approve the same origin on a different chain or under a different `appId`. Storing the tuple `(appId, origin, chainInfo.chainId, chainInfo.version)` and checking the full tuple in `onPendingDiscovery` keeps the auto-approve scoped tightly enough (`chainInfo.version` is the L2 rollup version the dApp passed in; the SDK forwards both fields to your callback unchanged). The handler exposes:

- `handler.terminateSession(sessionId)`: end a specific session.
- `handler.terminateForTab(tabId)`: end every session for a tab.
- `handler.getPendingDiscoveries()`: list pending discovery requests.
- `handler.getActiveSessions()`: list active sessions.

The handler's in-memory state (active sessions, pending discoveries) does not survive service worker restarts. dApps will simply re-discover and reconnect; if your wallet recognizes the origin and skips the prompt, the reconnect feels seamless. On extension install or update, clear any persisted "pending" state since sessions never survive a reload.

## Reference

- API reference: [`@aztec/wallet-sdk` reference](pathname:///typescript-api/mainnet/wallet-sdk.md).
- `BaseWallet` source: [`yarn-project/wallet-sdk/src/base-wallet/base_wallet.ts`](https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/yarn-project/wallet-sdk/src/base-wallet/base_wallet.ts) at v4.3.1.
- `BackgroundConnectionHandler` source: [`yarn-project/wallet-sdk/src/extension/handlers/background_connection_handler.ts`](https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/yarn-project/wallet-sdk/src/extension/handlers/background_connection_handler.ts) at v4.3.1.
- Wallet SDK README at v4.3.1: [`yarn-project/wallet-sdk/README.md`](https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/yarn-project/wallet-sdk/README.md).
