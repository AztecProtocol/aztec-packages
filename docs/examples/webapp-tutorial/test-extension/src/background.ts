/**
 * Background service worker for the Aztec Tutorial Wallet.
 *
 * Handles:
 * - Wallet SDK protocol (discovery, key exchange, encrypted wallet method calls)
 * - Offscreen document lifecycle management (with retry on teardown) (#15)
 * - Message routing between content scripts and offscreen document
 * - Background task tracking with push notifications to popup via ports
 * - State persistence via chrome.storage.session (survives SW restart) (#8)
 * - Auto-lock via chrome.alarms (#28)
 */

import {
  BackgroundConnectionHandler,
  type BackgroundTransport,
  type BackgroundConnectionCallbacks,
  type ActiveSession,
} from "@aztec/wallet-sdk/extension/handlers";

import {
  WALLET_CONFIG,
  MessageTarget,
  MessageTypes,
  AUTO_LOCK_MINUTES,
  log,
} from "./config";
import { getErrorMessage } from "./utils";
import { STORAGE_KEYS } from "./wallet/storage";
import type {
  PendingTransaction,
  PendingSessionVerification,
  PendingCapabilities,
  BackgroundTask,
} from "./shared-types";

// docs:start:offscreen-management
let offscreenCreating: Promise<void> | null = null;

/**
 * Ensures the offscreen document exists. Creates it if needed.
 * The offscreen document hosts the PXE and wallet implementation.
 */
async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  const offscreenUrl = chrome.runtime.getURL("dist/offscreen.html");
  log.debug("[background] Creating offscreen document:", offscreenUrl);

  offscreenCreating = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Aztec PXE requires long-running WASM operations",
  });

  await offscreenCreating;
  offscreenCreating = null;
  log.debug("[background] Offscreen document created");
}
// docs:end:offscreen-management

// docs:start:send-to-offscreen
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
// docs:end:send-to-offscreen

// Store pending transactions, session verifications, and capability requests.
// Discovery and session tracking uses only the SDK handler.
let pendingTransactions: PendingTransaction[] = [];
let pendingSessionVerifications: PendingSessionVerification[] = [];
let pendingCapabilities: PendingCapabilities[] = [];
let walletUnlocked = false;

/** Sessions that have had capabilities approved. Methods are blocked until this is set. */
const capabilitiesApprovedSessions = new Set<string>();

/**
 * Messages queued while awaiting emoji verification.
 * The extension must confirm the session before any wallet method calls are processed.
 * This prevents the dApp from bypassing verification by sending messages immediately.
 */
const queuedMessages: Map<string, { session: ActiveSession; message: any }[]> =
  new Map();

/**
 * Trusted origins persistence for auto-reconnect. (#30)
 *
 * When a user confirms emoji verification for a dApp, we remember the
 * origin+appId in chrome.storage.local. On subsequent page refreshes,
 * discovery and emoji verification are auto-approved (a fresh ECDH key
 * exchange still happens every time for security). Disconnecting a site
 * removes it from the trusted list.
 */
const TRUSTED_ORIGINS_KEY = "aztec_trusted_origins";

interface TrustedOrigin {
  origin: string;
  appId: string;
  trustedAt: number;
  grantedCapabilities?: Array<{ type: string; [key: string]: any }>;
}

async function getTrustedOrigins(): Promise<TrustedOrigin[]> {
  const data = await chrome.storage.local.get(TRUSTED_ORIGINS_KEY);
  return data[TRUSTED_ORIGINS_KEY] || [];
}

async function addTrustedOrigin(origin: string, appId: string): Promise<void> {
  const trusted = await getTrustedOrigins();
  if (!trusted.some((t) => t.origin === origin && t.appId === appId)) {
    trusted.push({ origin, appId, trustedAt: Date.now() });
    await chrome.storage.local.set({ [TRUSTED_ORIGINS_KEY]: trusted });
  }
}

async function removeTrustedOrigin(
  origin: string,
  appId: string,
): Promise<void> {
  const trusted = await getTrustedOrigins();
  const filtered = trusted.filter(
    (t) => !(t.origin === origin && t.appId === appId),
  );
  await chrome.storage.local.set({ [TRUSTED_ORIGINS_KEY]: filtered });
}

async function isTrustedOrigin(
  origin: string,
  appId: string,
): Promise<boolean> {
  const trusted = await getTrustedOrigins();
  return trusted.some((t) => t.origin === origin && t.appId === appId);
}

async function getStoredCapabilities(
  origin: string,
  appId: string,
): Promise<Array<{ type: string; [key: string]: any }> | null> {
  const trusted = await getTrustedOrigins();
  const entry = trusted.find((t) => t.origin === origin && t.appId === appId);
  return entry?.grantedCapabilities ?? null;
}

/**
 * Persists critical state to chrome.storage.session. (#8)
 *
 * chrome.storage.session is:
 * - Encrypted at rest
 * - Scoped to the browser session (cleared when browser closes)
 * - Survives service worker restarts (unlike in-memory variables)
 *
 * We persist: walletUnlocked, pendingTransactions.
 * We do NOT persist: CryptoKey (lives in offscreen), active SDK sessions
 * (the SDK handler can't be serialized; dApps must reconnect after SW restart).
 */
async function persistState(): Promise<void> {
  try {
    await chrome.storage.session.set({
      sw_walletUnlocked: walletUnlocked,
      sw_pendingTransactions: pendingTransactions,
    });
  } catch (err) {
    log.warn("[background] Failed to persist state:", err);
  }
}

async function restoreState(): Promise<void> {
  try {
    const data = await chrome.storage.session.get([
      "sw_walletUnlocked",
      "sw_pendingTransactions",
    ]);
    walletUnlocked = data.sw_walletUnlocked ?? false;
    pendingTransactions = data.sw_pendingTransactions ?? [];
    log.debug(
      "[background] Restored state: unlocked =",
      walletUnlocked,
      ", pendingTx =",
      pendingTransactions.length,
    );

    // Validate: if the offscreen document was torn down, the cached master key is gone.
    // Probe offscreen to confirm — if it fails, the wallet needs re-unlock.
    if (walletUnlocked) {
      try {
        await sendToOffscreen({ type: MessageTypes.GET_ACCOUNTS });
      } catch {
        log.warn(
          "[background] Offscreen unreachable after restore — marking wallet as locked",
        );
        walletUnlocked = false;
        await persistState();
      }
    }
  } catch (err) {
    log.warn("[background] Failed to restore state:", err);
  }
}

/**
 * Background task tracker for long-running operations.
 * Tasks survive popup close/reopen. The popup receives real-time updates
 * via a persistent port connection.
 */
let backgroundTasks: BackgroundTask[] = [];

function startBackgroundTask(type: string, promise: Promise<any>): string {
  const id = `${type}-${Date.now()}`;
  const task: BackgroundTask = {
    id,
    type,
    status: "running",
    startedAt: Date.now(),
  };
  backgroundTasks.push(task);

  promise
    .then((result) => {
      task.status = "success";
      task.result = result;
      notifyPopup({ type: "task-update", task: { ...task } });
    })
    .catch((error) => {
      task.status = "error";
      task.error = getErrorMessage(error);
      notifyPopup({ type: "task-update", task: { ...task } });
    });

  notifyPopup({ type: "task-update", task: { ...task } });
  return id;
}

/**
 * Cleans up completed tasks after 5 minutes. (#13)
 * 5 minutes gives the popup time to see completed tasks even if it was closed briefly.
 */
function cleanupTasks() {
  const FIVE_MINUTES = 5 * 60 * 1000;
  const cutoff = Date.now() - FIVE_MINUTES;
  backgroundTasks = backgroundTasks.filter(
    (t) => t.status === "running" || t.startedAt > cutoff,
  );
}

/**
 * Persistent port connection to the popup.
 * Allows the background to push real-time updates without polling.
 * The port disconnects automatically when the popup closes.
 */
let popupPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;

  log.debug("[background] Popup connected");
  popupPort = port;

  port.onDisconnect.addListener(() => {
    log.debug("[background] Popup disconnected");
    popupPort = null;
  });

  // Send current state immediately on connect
  pushStateToPopup();
});

function notifyPopup(message: any) {
  if (popupPort) {
    try {
      popupPort.postMessage(message);
    } catch {
      popupPort = null;
    }
  }
}

function pushStateToPopup() {
  notifyPopup({ type: "state", data: getFullState() });
}

/**
 * Opens the popup via chrome.windows.create() — works without a user gesture.
 * Used for discovery requests which are triggered by content script messages
 * where chrome.action.openPopup() silently no-ops.
 */
function openPopupWindow() {
  if (popupPort) {
    pushStateToPopup();
    return;
  }
  chrome.windows
    .create({
      url: chrome.runtime.getURL("popup/popup.html"),
      type: "popup",
      width: 400,
      height: 600,
      focused: true,
    })
    .catch((err) => {
      log.error("[background] Failed to create popup window:", err);
    });
}

/**
 * Opens the popup via chrome.action.openPopup() with windows.create() fallback.
 * Used for flows that originate from a user gesture in the popup (tx approval,
 * session verification) where openPopup() works reliably.
 */
function openPopupWithFallback() {
  if (popupPort) {
    pushStateToPopup();
    return;
  }
  chrome.action.openPopup().catch(() => {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup/popup.html"),
      type: "popup",
      width: 400,
      height: 600,
      focused: true,
    });
  });
}

function getFullState() {
  cleanupTasks();
  const connectedSites = handler.getActiveSessions().map((s) => ({
    sessionId: s.sessionId,
    origin: s.origin,
    appId: s.appId,
    connectedAt: s.connectedAt,
  }));

  return {
    discoveries: handler.getPendingDiscoveries(),
    transactions: pendingTransactions,
    pendingSessionVerifications,
    pendingCapabilities,
    connectedSites,
    tasks: backgroundTasks,
  };
}

/**
 * Auto-lock via chrome.alarms. (#28)
 * Resets the timer on every popup interaction.
 */
const AUTO_LOCK_ALARM = "aztec-auto-lock";

function resetAutoLockTimer() {
  if (walletUnlocked) {
    chrome.alarms.create(AUTO_LOCK_ALARM, {
      delayInMinutes: AUTO_LOCK_MINUTES,
    });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    log.debug("[background] Auto-lock triggered");
    walletUnlocked = false;
    await persistState();
    // Tell offscreen to clear the cached CryptoKey
    try {
      await sendToOffscreen({ type: MessageTypes.LOCK_WALLET });
    } catch {
      // Offscreen may not exist yet
    }
    pushStateToPopup();
  }
});

/**
 * Updates the extension badge to show pending items count.
 */
function updateBadge() {
  const count =
    pendingTransactions.length +
    handler.getPendingDiscoveryCount() +
    pendingSessionVerifications.length +
    pendingCapabilities.length;
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#FF6B00" });
  pushStateToPopup();
  persistState();
}

// docs:start:transport
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
// docs:end:transport

/**
 * Returns the list of accounts grantable to dApps — only the active account,
 * or the first account as fallback. Used by both processWalletMessage (for
 * getAccounts/getRegisteredAccounts filtering) and APPROVE_CAPABILITIES.
 */
async function getGrantableAccounts(): Promise<
  Array<{ alias: string; item: string }>
> {
  const [accountsData, activeData] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.ACCOUNTS),
    chrome.storage.local.get(STORAGE_KEYS.ACTIVE_ACCOUNT),
  ]);
  const allAccounts = accountsData[STORAGE_KEYS.ACCOUNTS] || [];
  const activeAddress = activeData[STORAGE_KEYS.ACTIVE_ACCOUNT];
  const activeAccount = allAccounts.find(
    (a: any) => a.address === activeAddress,
  );
  if (activeAccount) {
    return [{ alias: activeAccount.alias, item: activeAccount.address }];
  }
  return allAccounts
    .slice(0, 1)
    .map((a: any) => ({ alias: a.alias, item: a.address }));
}

/**
 * Processes a wallet method call from the ExtensionWallet proxy.
 * Extracted so it can be called from onWalletMessage and when flushing the queue.
 */
async function processWalletMessage(session: ActiveSession, message: any) {
  // Allow requestCapabilities to pass through (it's the mechanism for getting approved).
  // Block all other wallet methods until capabilities have been approved for this session.
  if (
    message.type !== "requestCapabilities" &&
    !capabilitiesApprovedSessions.has(session.sessionId)
  ) {
    log.warn(
      "[background] Rejecting wallet method before capabilities approved:",
      message.type,
    );
    await handler.sendResponse(session.sessionId, {
      messageId: message.messageId,
      error: "Capabilities not yet approved. Call requestCapabilities() first.",
      walletId: WALLET_CONFIG.walletId,
    });
    return;
  }

  // docs:start:approval-check
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
  // docs:end:approval-check

  // Capability requests require user approval — push to pending state.
  if (message.type === "requestCapabilities") {
    // Auto-approve for trusted origins if the requested capabilities match what was previously granted
    const requestedManifest = message.args?.[0];
    const requestedCaps: any[] = requestedManifest?.capabilities || [];
    if (await isTrustedOrigin(session.origin, session.appId)) {
      const savedCaps = await getStoredCapabilities(
        session.origin,
        session.appId,
      );
      if (savedCaps) {
        // Verify the requested capability types match the previously approved set
        const requestedTypes = requestedCaps.map((c: any) => c.type).sort();
        const savedTypes = savedCaps.map((c: any) => c.type).sort();
        const capsMatch =
          requestedTypes.length === savedTypes.length &&
          requestedTypes.every((t: string, i: number) => t === savedTypes[i]);

        if (capsMatch) {
          const grantedAccounts = await getGrantableAccounts();
          const granted = savedCaps.map((cap: any) => {
            if (cap.type === "accounts") {
              return { ...cap, accounts: grantedAccounts };
            }
            return { ...cap };
          });

          await handler.sendResponse(session.sessionId, {
            messageId: message.messageId,
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
          capabilitiesApprovedSessions.add(session.sessionId);
          log.debug(
            "[background] Auto-approved capabilities for trusted origin:",
            session.origin,
          );
          return;
        }
        log.debug(
          "[background] Requested capabilities differ from saved — requiring approval",
        );
      }
    }

    // Not trusted, no saved caps, or requested caps differ — require user approval
    const manifest = requestedManifest;
    const pending: PendingCapabilities = {
      sessionId: session.sessionId,
      messageId: message.messageId,
      origin: session.origin,
      appMetadata: manifest?.metadata || {
        name: "Unknown App",
        version: "0.0.0",
      },
      capabilities: requestedCaps,
      timestamp: Date.now(),
    };
    pendingCapabilities.push(pending);
    updateBadge();
    openPopupWithFallback();
    return;
  }

  // All other wallet methods — execute silently (no task banner).
  // These are read-only or background calls (executeUtility, simulateTx, batch
  // without sendTx, getAccounts, etc.) that don't need user visibility.
  (async () => {
    let result = await sendToOffscreen({
      type: MessageTypes.WALLET_METHOD,
      method: message.type,
      args: message.args,
    });

    // MetaMask-like behavior: return only the active account for getAccounts
    if (
      message.type === "getAccounts" ||
      message.type === "getRegisteredAccounts"
    ) {
      const activeData = await chrome.storage.local.get(
        STORAGE_KEYS.ACTIVE_ACCOUNT,
      );
      const activeAddress = activeData[STORAGE_KEYS.ACTIVE_ACCOUNT];
      if (activeAddress && Array.isArray(result)) {
        const activeAccount = result.find(
          (acc: any) =>
            acc.item === activeAddress ||
            acc.item?.toString() === activeAddress,
        );
        result = activeAccount ? [activeAccount] : result;
      }
    }

    await handler.sendResponse(session.sessionId, {
      messageId: message.messageId,
      result,
      walletId: WALLET_CONFIG.walletId,
    });
  })().catch(async (error: any) => {
    log.error(
      "[background] Error handling wallet message:",
      message.type,
      error,
    );
    await handler.sendResponse(session.sessionId, {
      messageId: message.messageId,
      error: error.message,
      walletId: WALLET_CONFIG.walletId,
    });
  });
}

// docs:start:callbacks
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

  // docs:start:on-wallet-message
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
  // docs:end:on-wallet-message
};
// docs:end:callbacks

const handler = new BackgroundConnectionHandler(
  { ...WALLET_CONFIG, logger: log },
  transport,
  callbacks,
);
handler.initialize();

// Clean up sessions when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const sessions = handler.getActiveSessions().filter((s) => s.tabId === tabId);
  for (const session of sessions) {
    capabilitiesApprovedSessions.delete(session.sessionId);
    queuedMessages.delete(session.sessionId);
  }
  handler.terminateForTab(tabId);
  pushStateToPopup();
});

// docs:start:popup-messages
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
// docs:end:popup-messages

/**
 * Extension lifecycle handlers. (#17)
 */
chrome.runtime.onInstalled.addListener((details) => {
  log.debug("[background] Extension installed/updated:", details.reason);

  // Clear stale pending state — sessions don't survive extension reload
  pendingTransactions = [];
  pendingSessionVerifications = [];
  pendingCapabilities = [];
  queuedMessages.clear();
  capabilitiesApprovedSessions.clear();
  persistState();

  if (details.reason === "install") {
    // First install — nothing to migrate
    log.debug("[background] First install, no migration needed");
  } else if (details.reason === "update") {
    // Version update — could add migration logic here
    log.debug("[background] Updated from", details.previousVersion);
  }
});

// Restore state on service worker startup (#8)
restoreState().then(() => {
  log.debug("[background] Service worker initialized");
});

// Eagerly preload the offscreen document so WASM and PXE deps are warm
ensureOffscreenDocument()
  .then(() => {
    log.debug("[background] Offscreen document preloaded");
  })
  .catch((err) => {
    log.error(
      "[background] Offscreen preload failed (will retry on demand):",
      err,
    );
  });
