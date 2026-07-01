---
title: "2. Wallet Extension Integration"
sidebar_position: 2
description: "Build an Aztec wallet extension — handle discovery, manage sessions, route messages, and extend BaseWallet"
---

# Wallet Extension Integration

This page is a reference for wallet extension developers. It walks through each component of the SDK integration — you don't need to follow it step-by-step. For the full source, see the [`test-extension/`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension) directory.

## What you'll learn

- How to set up a **content script** that relays messages between a dApp page and the extension background
- How to use `BackgroundConnectionHandler` to manage **discovery**, **ECDH key exchange**, and **encrypted sessions**
- How to **route wallet method calls** — deciding which need user approval and which auto-execute
- How to extend `BaseWallet` to implement your own **wallet methods** (accounts, transactions, fees)
- How to handle **session lifecycle** — trusted origins, cleanup, and state persistence across service worker restarts

## Overview

A wallet extension has three components that use the SDK:

| Component | SDK class | Responsibility |
|-----------|-----------|----------------|
| Content script | `ContentScriptConnectionHandler` | Relay messages between page and background |
| Background service worker | `BackgroundConnectionHandler` | Manage sessions, route messages, trigger approvals |
| Offscreen document | `BaseWallet` subclass | Execute wallet methods (sendTx, simulateTx, etc.) |

## Content Script

The content script is the simplest piece — it relays messages between the page and the background service worker, and never sees encryption keys. Create a `ContentScriptConnectionHandler` with a transport that provides `sendToBackground(message)` and `addBackgroundListener(handler)`, then call `handler.start()`. See [`test-extension/src/content-script.ts`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/content-script.ts) for the full implementation.

## Background Service Worker

The background script is where most of the SDK integration happens.

### Configuration

Define your wallet's identity in a config object with `walletId`, `name`, `icon`, and `chainId`. See [`test-extension/src/config.ts`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/config.ts).

### Transport

The background transport sends messages to content scripts via `chrome.tabs.sendMessage` and filters incoming messages — only discovery, key exchange, and encrypted wallet messages reach the handler (popup and storage proxy messages are filtered out). See the transport setup in [`test-extension/src/background.ts`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts).

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

```typescript title="callbacks" showLineNumbers 
const callbacks: BackgroundConnectionCallbacks = {
  onPendingDiscovery: async (discovery) => {
    log.debug(
      "[background] Pending discovery:",
      discovery.requestId,
      "from",
      discovery.origin,
    );

    // Clean up stale sessions from this tab (e.g. page refresh creates a new
    // discovery while the old session is still in activeSessions).
    for (const session of handler.getActiveSessions()) {
      if (session.tabId === discovery.tabId) {
        log.debug(
          "[background] Terminating stale session for tab:",
          discovery.tabId,
          session.sessionId,
        );
        capabilitiesApprovedSessions.delete(session.sessionId);
        queuedMessages.delete(session.sessionId);
        handler.terminateSession(session.sessionId);
      }
    }

    // Deduplicate: reject any existing discovery from the same tab
    const existing = handler
      .getPendingDiscoveries()
      .find(
        (d) =>
          d.tabId === discovery.tabId && d.requestId !== discovery.requestId,
      );
    if (existing) {
      handler.rejectDiscovery(existing.requestId);
    }

    // Auto-approve if origin is already trusted (reconnection after page refresh)
    if (await isTrustedOrigin(discovery.origin, discovery.appId)) {
      log.debug(
        "[background] Auto-approving trusted origin:",
        discovery.origin,
      );
      handler.approveDiscovery(discovery.requestId);
      return;
    }

    updateBadge();

    openPopupWithFallback();
  },

  onSessionEstablished: async (session: ActiveSession) => {
    log.debug("[background] Session established:", session.sessionId);

    // Auto-confirm if origin is already trusted (skip emoji verification)
    if (await isTrustedOrigin(session.origin, session.appId)) {
      log.debug(
        "[background] Auto-confirming trusted session:",
        session.sessionId,
      );

      // Pre-approve capabilities if previously granted (enables seamless reconnect)
      const savedCaps = await getStoredCapabilities(
        session.origin,
        session.appId,
      );
      if (savedCaps) {
        capabilitiesApprovedSessions.add(session.sessionId);
      }

      // Flush any queued messages immediately (same logic as CONFIRM_SESSION handler)
      const queued = queuedMessages.get(session.sessionId) ?? [];
      queuedMessages.delete(session.sessionId);
      for (const { session: s, message: msg } of queued) {
        processWalletMessage(s, msg);
      }
      pushStateToPopup();
      return;
    }

    // New origin — require emoji verification
    log.debug(
      "[background] Awaiting emoji verification for:",
      session.sessionId,
    );
    // SDK automatically removes the discovery when key exchange completes.
    // Show emojis in approvals so user can compare with the webapp
    pendingSessionVerifications.push({
      sessionId: session.sessionId,
      origin: session.origin,
      appId: session.appId,
      verificationHash: session.verificationHash,
      timestamp: Date.now(),
    });
    updateBadge();

    // Only open popup if not already connected — calling openPopup() on an
    // already-open popup rejects, and the fallback creates a second window
    // that steals the popupPort from the original.
    if (!popupPort) {
      openPopupWithFallback();
    }

    pushStateToPopup();
  },

  /**
   * Handles wallet method calls from the ExtensionWallet proxy.
   * Messages are queued while emoji verification is pending — the extension
   * user must confirm before any dApp calls are processed.
   */
  onWalletMessage: async (session: ActiveSession, message: any) => {
    log.debug(
      "[background] Wallet message:",
      message.type,
      "from session:",
      session.sessionId,
    );

    // Block wallet messages until the user confirms emoji verification in the extension.
    // The dApp's calls (e.g. getAccounts) will wait until the extension user approves.
    const awaitingVerification = pendingSessionVerifications.some(
      (v) => v.sessionId === session.sessionId,
    );
    if (awaitingVerification) {
      log.debug(
        "[background] Session awaiting verification, queuing message:",
        message.type,
      );
      const queue = queuedMessages.get(session.sessionId) ?? [];
      queue.push({ session, message });
      queuedMessages.set(session.sessionId, queue);
      return;
    }

    await processWalletMessage(session, message);
  },
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts#L744-L884" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L744-L884</a></sub></sup>


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

```typescript title="on-wallet-message" showLineNumbers 
/**
 * Handles wallet method calls from the ExtensionWallet proxy.
 * Messages are queued while emoji verification is pending — the extension
 * user must confirm before any dApp calls are processed.
 */
onWalletMessage: async (session: ActiveSession, message: any) => {
  log.debug(
    "[background] Wallet message:",
    message.type,
    "from session:",
    session.sessionId,
  );

  // Block wallet messages until the user confirms emoji verification in the extension.
  // The dApp's calls (e.g. getAccounts) will wait until the extension user approves.
  const awaitingVerification = pendingSessionVerifications.some(
    (v) => v.sessionId === session.sessionId,
  );
  if (awaitingVerification) {
    log.debug(
      "[background] Session awaiting verification, queuing message:",
      message.type,
    );
    const queue = queuedMessages.get(session.sessionId) ?? [];
    queue.push({ session, message });
    queuedMessages.set(session.sessionId, queue);
    return;
  }

  await processWalletMessage(session, message);
},
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts#L850-L882" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L850-L882</a></sub></sup>


## Message Routing

The core routing logic decides which methods need user approval:

```typescript title="approval-check" showLineNumbers 
// sendTx always requires approval — it's a state-changing operation.
// batch requires approval only if it contains a sendTx (e.g. BatchCall.send()).
// Read-only batches (simulateTx, executeUtility, etc.) auto-execute.
const needsApproval =
  message.type === "sendTx" ||
  (message.type === "batch" &&
    Array.isArray(message.args?.[0]) &&
    message.args[0].some((m: any) => m.name === "sendTx"));

if (needsApproval) {
  // Extract `from` address from the method args:
  // - sendTx args: [executionPayload, sendOptions] → from is in sendOptions
  // - batch args: [methodsArray] → find the sendTx entry and get from from its opts
  let from = "";
  if (message.type === "sendTx") {
    from = message.args?.[1]?.from?.toString?.() || "";
  } else if (message.type === "batch") {
    const sendTxMethod = message.args[0].find(
      (m: any) => m.name === "sendTx",
    );
    from = sendTxMethod?.args?.[1]?.from?.toString?.() || "";
  }

  const pending: PendingTransaction = {
    sessionId: session.sessionId,
    messageId: message.messageId,
    method: message.type,
    args: message.args,
    from,
    origin: session.origin,
    timestamp: Date.now(),
  };

  pendingTransactions.push(pending);
  updateBadge();
  log.debug("[background] Transaction pending approval:", pending.method);

  openPopupWithFallback();
  return;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts#L582-L623" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L582-L623</a></sub></sup>


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

```typescript title="send-to-offscreen" showLineNumbers 
/**
 * Persistent port to the offscreen document.
 * Unlike chrome.runtime.sendMessage() (broadcast), a port gives us:
 * - Point-to-point channel (no broadcast to all extension pages)
 * - Automatic disconnect detection (offscreen teardown)
 * - No `return true`/`false` landmine for async responses
 */
let offscreenPort: chrome.runtime.Port | null = null;
const pendingOffscreenCalls = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let offscreenMessageId = 0;

const OFFSCREEN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function connectOffscreenPort() {
  const port = chrome.runtime.connect({ name: "offscreen" });
  offscreenPort = port;

  port.onMessage.addListener((message: any) => {
    // Progress updates — relay to popup
    if (message.type === "task-progress") {
      const runningTask = backgroundTasks.find((t) => t.status === "running");
      if (runningTask) {
        runningTask.progress = message.stage;
        notifyPopup({ type: "task-update", task: { ...runningTask } });
      }
      return;
    }

    // Request/response correlation
    const pending = pendingOffscreenCalls.get(message.messageId);
    if (!pending) return;
    pendingOffscreenCalls.delete(message.messageId);
    clearTimeout(pending.timer);

    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error || "Unknown error"));
    }
  });

  port.onDisconnect.addListener(() => {
    log.debug("[background] Offscreen port disconnected");
    offscreenPort = null;
    // Reject all pending calls — sendToOffscreen will retry
    for (const [id, pending] of pendingOffscreenCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Offscreen port disconnected"));
      pendingOffscreenCalls.delete(id);
    }
  });
}

/**
 * Sends a message to the offscreen document and waits for response.
 * Uses a persistent port with request/response correlation via messageId.
 * Retries once if the offscreen document was torn down. (#15)
 */
async function sendToOffscreen(message: any, _retried = false): Promise<any> {
  await ensureOffscreenDocument();

  if (!offscreenPort) {
    connectOffscreenPort();
  }

  const messageId = `off-${++offscreenMessageId}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingOffscreenCalls.delete(messageId);
      reject(new Error(`Offscreen call timed out: ${message.type}`));
    }, OFFSCREEN_TIMEOUT_MS);

    pendingOffscreenCalls.set(messageId, { resolve, reject, timer });

    try {
      if (!offscreenPort) {
        throw new Error("Offscreen port not connected");
      }
      offscreenPort.postMessage({ ...message, messageId });
    } catch (err: unknown) {
      pendingOffscreenCalls.delete(messageId);
      clearTimeout(timer);

      // Port may have disconnected — retry once
      if (!_retried) {
        log.warn("[background] Offscreen port send failed, retrying...");
        offscreenPort = null;
        offscreenCreating = null;
        sendToOffscreen(message, true).then(resolve, reject);
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts#L72-L176" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L72-L176</a></sub></sup>


## Extending BaseWallet

The offscreen document hosts your wallet implementation. Extend `BaseWallet` to get `sendTx`, `simulateTx`, `batch`, and other methods for free:

```typescript title="wallet-instance" showLineNumbers 
/** Single wallet class used for all operations. (#18, #20) */

import type { BaseWallet } from '@aztec/wallet-sdk/base-wallet';

/**
 * The wallet instance holds a BaseWallet subclass with an additional
 * registerAccount method for tracking which accounts we can sign for.
 * BaseWallet is dynamically imported at runtime; using `import type` gives
 * us the type without a runtime dependency. (#20)
 */
type OffscreenWalletType = BaseWallet & { registerAccount(address: string, account: Account): void };

let walletInstance: OffscreenWalletType | null = null;

/**
 * Creates a SponsoredFPC contract instance from its artifact and well-known salt.
 * Shared between OffscreenWallet.ensureSponsoredFPC() and handleDeployAccount().
 */
async function getSponsoredFPCInstance() {
  const { Fr, SponsoredFPCContract, SPONSORED_FPC_SALT, getContractInstanceFromInstantiationParams } = await getAztecDeploy();
  return getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
}

async function getWallet() {
  if (walletInstance) return walletInstance;

  const { BaseWallet, AztecAddress, SignerlessAccount } = await getAztecWallet();
  const { pxe, node } = await ensurePXE();

  // AccountFeePaymentMethodOptions.EXTERNAL = 0 — fee is paid by an external FPC
  const EXTERNAL_FEE_PAYMENT = 0;

  class OffscreenWallet extends BaseWallet {
    protected minFeePadding = 1.0; // 100% padding for fee estimation variance
    private accounts: Map<string, Account> = new Map();
    private sponsoredFPCAddress: any | null = null;

    constructor(pxeInstance: PXE, aztecNode: AztecNode) {
      super(pxeInstance, aztecNode);
    }

    registerAccount(address: string, account: Account) {
      this.accounts.set(address, account);
    }

    protected async getAccountFromAddress(address: any): Promise<Account> {
      if (address.equals(AztecAddress.ZERO)) {
        return new SignerlessAccount();
      }
      const key = address.toString();
      const account = this.accounts.get(key);
      if (!account) {
        throw new Error(`Account not found for address: ${key}`);
      }
      return account;
    }

    async getAccounts() {
      return Array.from(this.accounts.entries()).map(([, acc]) => ({
        alias: '',
        item: acc.getAddress(),
      }));
    }

    /** Lazily registers the SponsoredFPC contract and caches its address. */
    private async ensureSponsoredFPC() {
      if (this.sponsoredFPCAddress) return this.sponsoredFPCAddress;
      const { SponsoredFPCContract } = await getAztecDeploy();
      const sponsoredFPCInstance = await getSponsoredFPCInstance();
      await this.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
      this.sponsoredFPCAddress = sponsoredFPCInstance.address;
      return this.sponsoredFPCAddress;
    }

    /**
     * Always uses SponsoredFPC for fee payment, mirroring the deployment flow.
     * The tutorial wallet doesn't hold fee juice, so every tx is sponsor-paid.
     *
     * If the execution payload already has a feePayer (e.g. DeployAccountMethod
     * embeds SponsoredFPC in its own payload), we skip injecting a wallet-level
     * payment method to avoid calling sponsor_unconditionally() twice, which
     * would trigger "Cannot enter the revertible phase twice".
     */
    protected async completeFeeOptions(from: any, feePayer?: any, gasSettings?: any) {
      const base = await super.completeFeeOptions(from, feePayer, gasSettings);
      // If the payload already includes a fee payer, don't inject another one
      if (feePayer) {
        return {
          ...base,
          accountFeePaymentMethodOptions: EXTERNAL_FEE_PAYMENT,
        };
      }
      const address = await this.ensureSponsoredFPC();
      const { SponsoredFeePaymentMethod } = await getAztecDeploy();
      return {
        ...base,
        walletFeePaymentMethod: new SponsoredFeePaymentMethod(address),
        accountFeePaymentMethodOptions: EXTERNAL_FEE_PAYMENT,
      };
    }

    /**
     * Overrides sendTx to auto-extract auth witnesses from offchain effects.
     *
     * dApps like gregoswap don't explicitly create auth witnesses. Instead, they
     * expect the wallet to handle it: simulate with a stub account (which passes
     * all auth checks), extract the authorization requests emitted by
     * `#[authorize_once]` in Noir contracts, sign them, and include them in the
     * real transaction.
     */
    async sendTx(executionPayload: any, opts: any): Promise<any> {
      if (executionPayload.authWitnesses.length === 0 && opts.from && !opts.from.equals(AztecAddress.ZERO)) {
        try {
          await this.extractAndInjectAuthWitnesses(executionPayload, opts.from, opts.fee?.gasSettings);
        } catch (err: any) {
          log.error('[offscreen] Auth witness extraction failed, proceeding without:', err.message, err.stack);
        }
      }
      return super.sendTx(executionPayload, opts);
    }

    /**
     * Simulates the tx with a stub account to collect offchain effects,
     * parses CallAuthorizationRequest objects, and creates real auth witnesses.
     */
    private async extractAndInjectAuthWitnesses(executionPayload: any, from: any, feeGasSettings?: any) {
      const { Fr, getContractInstanceFromInstantiationParams } = await getAztecCore();

      // Step 1: Create a stub account that passes all auth checks unconditionally
      log.info('[offscreen] Step 1: Loading stub account module...');
      const realAccount = await this.getAccountFromAddress(from);
      const originalAddress = realAccount.getCompleteAddress();
      log.info('[offscreen] Got complete address:', originalAddress.address.toString());

      const { createStubAccount, getStubAccountContractArtifact } = await import('@aztec/accounts/stub/lazy');
      log.info('[offscreen] Loaded @aztec/accounts/stub/lazy');

      const stubArtifact = await getStubAccountContractArtifact();
      log.info('[offscreen] Loaded stub artifact:', stubArtifact.name);

      const stubAccount = createStubAccount(originalAddress);
      const stubInstance = await getContractInstanceFromInstantiationParams(stubArtifact, { salt: Fr.random() });
      log.info('[offscreen] Created stub account and instance');

      // Step 2: Simulate with the stub account swapped in via PXE overrides
      log.info('[offscreen] Step 2: Simulating tx with stub account...');
      const feeOptions = await this.completeFeeOptions(from, executionPayload.feePayer, feeGasSettings);
      const chainInfo = await this.getChainInfo();
      const txRequest = await stubAccount.createTxExecutionRequest(
        executionPayload,
        feeOptions.gasSettings,
        chainInfo,
        { txNonce: Fr.random(), cancellable: false, feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions },
      );
      log.info('[offscreen] Created tx execution request, simulating...');

      const simResult = await this.pxe.simulateTx(txRequest, {
        simulatePublic: true,
        skipTxValidation: true,
        skipFeeEnforcement: true,
        overrides: { contracts: { [from.toString()]: { instance: stubInstance, artifact: stubArtifact } } },
        scopes: [from],
      });
      log.info('[offscreen] Simulation succeeded');

      // Step 3: Extract auth witness requests from offchain effects
      log.info('[offscreen] Step 3: Extracting offchain effects...');
      const { collectOffchainEffects } = await import('@aztec/stdlib/tx');
      const { CallAuthorizationRequest } = await import('@aztec/aztec.js/authorization');

      if (!simResult.privateExecutionResult) {
        log.warn('[offscreen] No privateExecutionResult in simulation result');
        return;
      }

      const effects = collectOffchainEffects(simResult.privateExecutionResult);
      log.info(`[offscreen] Found ${effects.length} offchain effect(s)`);

      // Pre-filter by CallAuthorizationRequest selector (matching e2e test pattern)
      const callAuthSelector = await CallAuthorizationRequest.getSelector();
      const authEffects = effects.filter((e: any) =>
        e.data.length > 0 && e.data[0].equals(callAuthSelector.toField()),
      );
      log.info(`[offscreen] ${authEffects.length} are CallAuthorizationRequest(s)`);

      // Step 4: Create auth witnesses from parsed authorization requests
      let count = 0;
      for (const effect of authEffects) {
        const authRequest = await CallAuthorizationRequest.fromFields(effect.data);
        log.info(`[offscreen] Auth request: consumer=${effect.contractAddress.toString()}, innerHash=${authRequest.innerHash.toString()}`);
        const wit = await this.createAuthWit(from, {
          consumer: effect.contractAddress,
          innerHash: authRequest.innerHash,
        });
        executionPayload.authWitnesses.push(wit);
        count++;
        log.info(`[offscreen] Created auth witness #${count}: messageHash=${wit.requestHash.toString()}`);
      }

      log.info(`[offscreen] Auth witness extraction complete: ${count} witness(es) from ${effects.length} effect(s)`);
    }
  }

  walletInstance = new OffscreenWallet(pxe, node);
  return walletInstance;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L157-L369" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L157-L369</a></sub></sup>


### What You Must Implement

| Method | Purpose |
|--------|---------|
| `getAccountFromAddress(address)` | Look up an `Account` by its `AztecAddress` |
| `getAccounts()` | Return all accounts (with aliases) |

:::tip Custom Fee Payment
`completeFeeOptions` has a default implementation that uses the sender's fee juice balance. Override it to inject a custom fee payment strategy (e.g., `SponsoredFPC`). The tutorial wallet overrides this — see [`test-extension/src/offscreen/offscreen.ts`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts) for the implementation.
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

```typescript title="wallet-method-handler" showLineNumbers 
/**
 * Handles wallet method calls from the ExtensionWallet proxy via the SDK protocol.
 *
 * Serialization notes:
 * 1. ARGS: Arrive as plain JSON. We use WalletSchema to parse them back into
 *    proper Aztec types (AztecAddress, Fr, ExecutionPayload, etc.).
 * 2. RESULT: Contains class instances that lose prototypes through Chrome messaging.
 *    We serialize with jsonStringify before returning.
 */
async function handleWalletMethod(method: string, args: any[]): Promise<any> {
  log.debug('[offscreen] Handling wallet method:', method);

  const wallet = await getWallet();

  // Dynamic dispatch: the wallet protocol sends method names as strings.
  // Cast to Record for dynamic access since TypeScript can't know the method at compile time.
  const walletObj = wallet as unknown as Record<string, (...args: any[]) => any>;
  if (typeof walletObj[method] !== 'function') {
    throw new Error(`Unknown wallet method: ${method}`);
  }

  const { WalletSchema, jsonStringify, schemaHasMethod } = await getAztecWallet();

  // Parse args through WalletSchema to reconstruct proper Aztec types (Buffer, Fr, etc.)
  // from their JSON representations. The schema's .parameters() returns a zod tuple that
  // requires all positional elements even if some are optional. Pad with undefined so the
  // tuple length matches and the parse succeeds.
  let parsedArgs: any[] = args || [];
  if (schemaHasMethod(WalletSchema, method)) {
    const schema = WalletSchema[method as keyof typeof WalletSchema];
    const paramSchema = schema.parameters();
    const expectedLength = (paramSchema as any)?._def?.items?.length ?? 0;
    const paddedArgs = [...(args || [])];
    while (paddedArgs.length < expectedLength) {
      paddedArgs.push(undefined);
    }
    try {
      parsedArgs = await paramSchema.parseAsync(paddedArgs);
    } catch (parseErr: any) {
      log.warn('[offscreen] Args parse warning for', method, ':', parseErr.message);
      parsedArgs = args || [];
    }
  }

  // Report initial progress for long-running methods so the popup shows something
  // before the PXE log matchers kick in
  const longRunningMethods = ['sendTx', 'simulateTx', 'profileTx'];
  if (longRunningMethods.includes(method)) {
    reportProgress(`Starting ${method}...`);
  }

  const result = await walletObj[method](...parsedArgs);

  // Serialize to JSON-safe format before returning through Chrome messaging
  const jsonSafe = JSON.parse(jsonStringify(result));
  log.debug('[offscreen] Wallet method completed:', method);
  return jsonSafe;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L460-L519" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L460-L519</a></sub></sup>


## Session Lifecycle

### Trusted Origins

Store approved origins so returning users get auto-reconnected. When a trusted origin connects, the wallet:
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

Service workers restart frequently. Use `chrome.storage.session` to persist critical state (like trusted origins) — it survives service worker restarts but clears when the browser closes.

:::note
The `BackgroundConnectionHandler`'s internal state (active sessions, pending discoveries) is **not** persisted — sessions don't survive extension reloads. On restart, dApps will re-discover and reconnect. Trusted origin auto-approve makes this seamless.
:::

## Extension Lifecycle

On install/update, clear pending state since sessions don't survive reloads. On startup, restore persisted state and preload the offscreen document to warm up WASM. See the lifecycle handlers in [`test-extension/src/background.ts`](https://github.com/AztecProtocol/aztec-packages/tree/v5.0.0-rc.2/docs/examples/webapp-tutorial/test-extension/src/background.ts).

## Next steps

- [dApp Integration](./01-dapp-integration.md) — See how the other side connects to your wallet
- [Wallet Extension Tutorial](../../wallet-extension/index.md) — Full step-by-step guide to building a wallet extension, including accounts, transactions, and approval UIs
