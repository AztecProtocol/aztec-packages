---
title: "2. Wallet Protocol"
description: Implementing the Aztec wallet SDK protocol - discovery, ECDH key exchange, and secure messaging
sidebar_position: 2
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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/test-extension/src/background.ts#L744-L884" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L744-L884</a></sub></sup>


Key points:
- Each discovery becomes a "pending discovery" awaiting user approval
- The `BackgroundConnectionHandler` from wallet SDK manages the protocol state
- `onPendingDiscovery` callback lets us show the connection request to users

## Connection Approval

When the user clicks "Connect" in the popup:

```typescript title="popup-messages" showLineNumbers 
/**
 * Handle messages from popup and offscreen for approvals and account management.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /**
   * Storage proxy for the offscreen document. (#7)
   * Validates that the request comes from the extension itself (not content scripts or external).
   */
  if (message.type === "storage-get" || message.type === "storage-set") {
    // Security: only allow storage proxy from extension pages (offscreen, popup) (#7)
    // Content scripts have sender.tab set; extension pages (offscreen, popup) do not.
    if (sender.tab) {
      log.warn(
        "[background] Rejected storage proxy from content script, tab:",
        sender.tab.id,
      );
      sendResponse({
        success: false,
        error: "Storage proxy not allowed from content scripts",
      });
      return false;
    }

    if (message.type === "storage-get") {
      chrome.storage.local
        .get(message.key)
        .then((result) => {
          sendResponse({ success: true, result: result[message.key] });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
    } else {
      chrome.storage.local
        .set(message.data)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
    }
    return true; // async response (#23)
  }

  if (message.target !== MessageTarget.BACKGROUND) {
    return false;
  }

  log.debug("[background] Popup message:", message.type);

  // Reset auto-lock on any popup interaction (#28)
  resetAutoLockTimer();

  switch (message.type) {
    case MessageTypes.APPROVE_CONNECTION: {
      handler.approveDiscovery(message.requestId);
      updateBadge();
      sendResponse({ success: true });
      return false; // sync response (#23)
    }

    case MessageTypes.REJECT_CONNECTION: {
      handler.rejectDiscovery(message.requestId);
      updateBadge();
      sendResponse({ success: true });
      return false;
    }

    case MessageTypes.APPROVE_TRANSACTION: {
      const pending = pendingTransactions.find(
        (t) => t.messageId === message.messageId,
      );
      if (pending) {
        pendingTransactions = pendingTransactions.filter(
          (t) => t.messageId !== message.messageId,
        );
        updateBadge();

        const taskId = startBackgroundTask(
          `tx:${pending.method}`,
          handleTransactionApproval(pending),
        );
        sendResponse({ success: true, result: { taskId } });
      } else {
        sendResponse({ success: false, error: "Transaction not found" });
      }
      return false;
    }

    case MessageTypes.REJECT_TRANSACTION: {
      const pending = pendingTransactions.find(
        (t) => t.messageId === message.messageId,
      );
      if (pending) {
        handler.sendResponse(pending.sessionId, {
          messageId: pending.messageId,
          error: "Transaction rejected by user",
          walletId: WALLET_CONFIG.walletId,
        });

        pendingTransactions = pendingTransactions.filter(
          (t) => t.messageId !== message.messageId,
        );
        updateBadge();
      }
      sendResponse({ success: true });
      return false;
    }

    case MessageTypes.APPROVE_CAPABILITIES: {
      const pending = pendingCapabilities.find(
        (c) => c.messageId === message.messageId,
      );
      if (pending) {
        pendingCapabilities = pendingCapabilities.filter(
          (c) => c.messageId !== message.messageId,
        );

        // Build granted capabilities using the shared active-account helper
        getGrantableAccounts()
          .then((grantedAccounts) => {
            const granted = pending.capabilities.map((cap: any) => {
              if (cap.type === "accounts") {
                return { ...cap, accounts: grantedAccounts };
              }
              return { ...cap };
            });

            return handler.sendResponse(pending.sessionId, {
              messageId: pending.messageId,
              result: {
                version: "1.0",
                granted,
                wallet: {
                  name: WALLET_CONFIG.walletName,
                  version: WALLET_CONFIG.walletVersion,
                },
              },
              walletId: WALLET_CONFIG.walletId,
            });
          })
          .then(async () => {
            capabilitiesApprovedSessions.add(pending.sessionId);

            // Persist granted capabilities for auto-reconnect
            const approvedSession = handler.getSession(pending.sessionId);
            if (approvedSession) {
              const trusted = await getTrustedOrigins();
              const entry = trusted.find(
                (t) =>
                  t.origin === approvedSession.origin &&
                  t.appId === approvedSession.appId,
              );
              if (entry) {
                entry.grantedCapabilities = pending.capabilities.map(
                  (cap: any) => ({ ...cap }),
                );
                await chrome.storage.local.set({
                  [TRUSTED_ORIGINS_KEY]: trusted,
                });
              }
            }

            updateBadge();
            sendResponse({ success: true });
          })
          .catch((err) => {
            log.error("[background] Failed to approve capabilities:", err);
            sendResponse({ success: false, error: getErrorMessage(err) });
          });
      } else {
        sendResponse({ success: false, error: "Capability request not found" });
        return false;
      }
      return true;
    }

    case MessageTypes.REJECT_CAPABILITIES: {
      const pending = pendingCapabilities.find(
        (c) => c.messageId === message.messageId,
      );
      if (pending) {
        pendingCapabilities = pendingCapabilities.filter(
          (c) => c.messageId !== message.messageId,
        );

        handler.sendResponse(pending.sessionId, {
          messageId: pending.messageId,
          result: {
            version: "1.0",
            granted: [],
            wallet: {
              name: WALLET_CONFIG.walletName,
              version: WALLET_CONFIG.walletVersion,
            },
          },
          walletId: WALLET_CONFIG.walletId,
        });

        updateBadge();
      }
      sendResponse({ success: true });
      return false;
    }

    case MessageTypes.CONFIRM_SESSION: {
      // User confirmed emojis match — session is now fully active.
      // Flush any wallet messages that were queued while awaiting verification.
      pendingSessionVerifications = pendingSessionVerifications.filter(
        (v) => v.sessionId !== message.sessionId,
      );
      const queued = queuedMessages.get(message.sessionId) ?? [];
      queuedMessages.delete(message.sessionId);
      for (const { session, message: msg } of queued) {
        log.debug("[background] Flushing queued message:", msg.type);
        processWalletMessage(session, msg);
      }

      // Remember this origin as trusted for future reconnections (#30)
      const confirmedSession = handler.getSession(message.sessionId);
      if (confirmedSession) {
        addTrustedOrigin(confirmedSession.origin, confirmedSession.appId);
      }

      updateBadge();
      sendResponse({ success: true });
      return false;
    }

    case MessageTypes.REJECT_SESSION: {
      // User rejected emoji verification — reject queued messages and terminate the session.
      pendingSessionVerifications = pendingSessionVerifications.filter(
        (v) => v.sessionId !== message.sessionId,
      );
      const rejected = queuedMessages.get(message.sessionId) ?? [];
      queuedMessages.delete(message.sessionId);
      for (const { session, message: msg } of rejected) {
        handler.sendResponse(session.sessionId, {
          messageId: msg.messageId,
          error: "Session verification rejected by user",
          walletId: WALLET_CONFIG.walletId,
        });
      }
      handler.terminateSession(message.sessionId);
      updateBadge();
      sendResponse({ success: true });
      return false;
    }

    case MessageTypes.DISCONNECT_SESSION: {
      // (#29) Allow users to disconnect a specific dApp session
      // Remove from trusted origins so next connection requires full approval (#30)
      const disconnectedSession = handler.getSession(message.sessionId);
      if (disconnectedSession) {
        removeTrustedOrigin(
          disconnectedSession.origin,
          disconnectedSession.appId,
        );
      }
      capabilitiesApprovedSessions.delete(message.sessionId);
      handler.terminateSession(message.sessionId);
      pushStateToPopup();
      sendResponse({ success: true });
      return false;
    }

    case "getPendingItems": {
      sendResponse({
        success: true,
        result: getFullState(),
      });
      return false;
    }

    case MessageTypes.GET_ACCOUNTS: {
      chrome.storage.local
        .get(STORAGE_KEYS.ACCOUNTS)
        .then((data) => {
          const accounts = (data[STORAGE_KEYS.ACCOUNTS] || []).map(
            (acc: any) => ({
              address: acc.address,
              alias: acc.alias,
              isDeployed: acc.isDeployed,
            }),
          );
          sendResponse({ success: true, result: accounts });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true; // async (#23)
    }

    case MessageTypes.GET_ACTIVE_ACCOUNT: {
      chrome.storage.local
        .get(STORAGE_KEYS.ACTIVE_ACCOUNT)
        .then((data) => {
          sendResponse({
            success: true,
            result: data[STORAGE_KEYS.ACTIVE_ACCOUNT] || null,
          });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    case MessageTypes.SET_ACTIVE_ACCOUNT: {
      chrome.storage.local
        .set({ [STORAGE_KEYS.ACTIVE_ACCOUNT]: message.address })
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    case MessageTypes.UNLOCK_WALLET: {
      const taskId = startBackgroundTask(
        "unlock",
        sendToOffscreen({
          type: MessageTypes.UNLOCK_WALLET,
          password: message.password,
        }).then((result) => {
          walletUnlocked = true;
          persistState();
          resetAutoLockTimer();
          return result;
        }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    case MessageTypes.GET_WALLET_STATUS: {
      chrome.storage.local
        .get(STORAGE_KEYS.PASSWORD_DATA)
        .then((data) => {
          sendResponse({
            success: true,
            result: {
              unlocked: walletUnlocked,
              hasPassword: !!data[STORAGE_KEYS.PASSWORD_DATA],
            },
          });
        })
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    case MessageTypes.SETUP_PASSWORD: {
      const taskId = startBackgroundTask(
        "setup-password",
        sendToOffscreen({
          type: MessageTypes.SETUP_PASSWORD,
          password: message.password,
        }).then((result) => {
          walletUnlocked = true;
          persistState();
          resetAutoLockTimer();
          return result;
        }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    case MessageTypes.MARK_DEPLOYED: {
      chrome.storage.local
        .get(STORAGE_KEYS.ACCOUNTS)
        .then((data) => {
          const accounts = data[STORAGE_KEYS.ACCOUNTS] || [];
          const account = accounts.find(
            (a: any) => a.address === message.address,
          );
          if (account) {
            account.isDeployed = true;
            return chrome.storage.local.set({
              [STORAGE_KEYS.ACCOUNTS]: accounts,
            });
          }
        })
        .then(() => sendResponse({ success: true, result: { success: true } }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message }),
        );
      return true;
    }

    case MessageTypes.CREATE_ACCOUNT: {
      const taskId = startBackgroundTask(
        "create-account",
        sendToOffscreen({
          type: MessageTypes.CREATE_ACCOUNT,
          alias: message.alias,
        }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    case MessageTypes.DEPLOY_ACCOUNT: {
      const taskId = startBackgroundTask(
        "deploy-account",
        sendToOffscreen({
          type: MessageTypes.DEPLOY_ACCOUNT,
          address: message.address,
        }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    case MessageTypes.EXPORT_WALLET: {
      const taskId = startBackgroundTask(
        "export-wallet",
        sendToOffscreen({ type: MessageTypes.EXPORT_WALLET }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    case MessageTypes.IMPORT_WALLET: {
      // Wipe wallet data from chrome.storage.local and lock the wallet
      chrome.storage.local.remove([
        STORAGE_KEYS.ACCOUNTS,
        STORAGE_KEYS.PASSWORD_DATA,
        STORAGE_KEYS.ACTIVE_ACCOUNT,
      ]);
      walletUnlocked = false;
      persistState();
      // Tell offscreen to clear cached key
      sendToOffscreen({ type: MessageTypes.LOCK_WALLET }).catch(() => {});
      sendResponse({ success: true, result: { success: true } });
      return false;
    }

    case MessageTypes.IMPORT_WALLET_ACCOUNTS: {
      const taskId = startBackgroundTask(
        "import-wallet-accounts",
        sendToOffscreen({
          type: MessageTypes.IMPORT_WALLET_ACCOUNTS,
          accounts: message.accounts,
          activeAccount: message.activeAccount,
        }).then((result) => {
          walletUnlocked = true;
          persistState();
          resetAutoLockTimer();
          return result;
        }),
      );
      sendResponse({ success: true, result: { taskId } });
      return false;
    }

    default: {
      log.warn("[background] Unknown message type:", message.type);
      return false;
    }
  }
});

async function handleTransactionApproval(
  pending: PendingTransaction,
): Promise<any> {
  try {
    const result = await sendToOffscreen({
      type: MessageTypes.WALLET_METHOD,
      method: pending.method,
      args: pending.args,
    });

    await handler.sendResponse(pending.sessionId, {
      messageId: pending.messageId,
      result,
      walletId: WALLET_CONFIG.walletId,
    });

    return result;
  } catch (error: any) {
    log.error(
      "[background] Transaction approval failed:",
      pending.method,
      error,
    );
    await handler.sendResponse(pending.sessionId, {
      messageId: pending.messageId,
      error: error.message,
      walletId: WALLET_CONFIG.walletId,
    });
    throw error;
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/test-extension/src/background.ts#L904-L1402" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L904-L1402</a></sub></sup>


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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/test-extension/src/background.ts#L72-L176" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L72-L176</a></sub></sup>


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

```typescript title="transport" showLineNumbers 
const transport: BackgroundTransport = {
  sendToTab: (tabId, message) => {
    log.debug(
      "[background] sendToTab:",
      tabId,
      message.type,
      message.sessionId,
    );
    chrome.tabs.sendMessage(tabId, message);
  },
  addContentListener: (handler) => {
    chrome.runtime.onMessage.addListener((message, sender) => {
      // Skip targeted messages (popup, offscreen), storage proxy, and progress updates
      if (message.target) return;
      if (message.type === "storage-get" || message.type === "storage-set")
        return;

      log.debug(
        "[background] Content message received:",
        message.origin,
        message.type,
        "from tab:",
        sender.tab?.id,
      );
      handler(message, {
        tab: sender.tab
          ? { id: sender.tab.id, url: sender.tab.url }
          : undefined,
      });
    });
  },
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/webapp-tutorial/test-extension/src/background.ts#L499-L532" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L499-L532</a></sub></sup>


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
