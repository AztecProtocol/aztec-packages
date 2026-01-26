import type { ChainInfo } from '@aztec/aztec.js/account';

import {
  type EncryptedPayload,
  decrypt,
  deriveSessionKeys,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
} from '../../crypto.js';
import {
  type DiscoveryRequest,
  type KeyExchangeRequest,
  type KeyExchangeResponse,
  type WalletInfo,
  type WalletMessage,
  WalletMessageType,
  type WalletResponse,
} from '../../types.js';
import {
  type BackgroundMessage,
  type ContentScriptMessage,
  InternalMessageType,
  MessageOrigin,
  type MessageSender,
} from './internal_message_types.js';

/**
 * Status of a pending discovery request.
 */
export type DiscoveryStatus = 'pending' | 'approved' | 'rejected';

/**
 * A pending discovery request from a dApp.
 */
export interface PendingDiscovery {
  /** Unique request identifier. */
  requestId: string;
  /** Application identifier. */
  appId: string;
  /** Optional application name. */
  appName?: string;
  /** Origin URL of the requesting page. */
  origin: string;
  /** Network information. */
  chainInfo: ChainInfo;
  /** Browser tab ID. */
  tabId: number;
  /** Request timestamp. */
  timestamp: number;
  /** Current status. */
  status: DiscoveryStatus;
}

/**
 * An active session with a connected dApp.
 * Created after key exchange completes.
 */
export interface ActiveSession {
  /** Unique session identifier. */
  sessionId: string;
  /** Derived AES-GCM encryption key. */
  sharedKey: CryptoKey;
  /** Hex-encoded verification hash for visual comparison. */
  verificationHash: string;
  /** Browser tab ID. */
  tabId: number;
  /** Origin URL of the connected app. */
  origin: string;
  /** Application identifier. */
  appId: string;
  /** Connection timestamp. */
  connectedAt: number;
  /** Network information. */
  chainInfo: ChainInfo;
}

/**
 * Transport interface for background script communication.
 */
export interface BackgroundTransport {
  /**
   * Send a message to a specific tab.
   * Typically `(tabId, message) => browser.tabs.sendMessage(tabId, message)`.
   */
  sendToTab: (tabId: number, message: BackgroundMessage) => void;

  /**
   * Register a listener for messages from content scripts.
   * Typically `browser.runtime.onMessage.addListener`.
   */
  addContentListener: (handler: (message: unknown, sender: MessageSender) => void) => void;
}

/**
 * Event callbacks for the background connection handler.
 * All callbacks are optional.
 */
export interface BackgroundConnectionCallbacks {
  /**
   * Called when a new discovery request is received and stored as pending.
   */
  onPendingDiscovery?: (discovery: PendingDiscovery) => void;

  /**
   * Called when a session is established (key exchange complete).
   */
  onSessionEstablished?: (session: ActiveSession) => void;

  /**
   * Called when a session is terminated.
   */
  onSessionTerminated?: (sessionId: string) => void;

  /**
   * Called when a decrypted wallet message is received.
   */
  onWalletMessage?: (session: ActiveSession, message: WalletMessage) => void;
}

/**
 * Configuration for the background connection handler.
 */
export interface BackgroundConnectionConfig {
  /** Unique wallet identifier. */
  walletId: string;
  /** Display name for the wallet. */
  walletName: string;
  /** Wallet version string. */
  walletVersion: string;
  /** Optional wallet icon URL. */
  walletIcon?: string;
}

/**
 * Handles wallet session flow in the extension background script.
 *
 * This class manages:
 * - Pending discovery requests (before user approval)
 * - Active sessions (after key exchange)
 * - Per-session ECDH key exchange
 * - Message encryption/decryption
 *
 * @example
 * ```typescript
 * const handler = new BackgroundConnectionHandler(
 *   {
 *     walletId: 'my-wallet',
 *     walletName: 'My Wallet',
 *     walletVersion: '1.0.0',
 *   },
 *   {
 *     sendToTab: (tabId, message) => browser.tabs.sendMessage(tabId, message),
 *     addContentListener: (handler) => browser.runtime.onMessage.addListener(handler),
 *   },
 *   {
 *     onPendingDiscovery: (discovery) => updateBadge(),
 *     onSessionEstablished: (session) => console.log('Connected:', session.sessionId),
 *     onWalletMessage: (session, message) => nativePort.postMessage(message),
 *   }
 * );
 *
 * handler.initialize();
 * ```
 */
export class BackgroundConnectionHandler {
  private pendingDiscoveries = new Map<string, PendingDiscovery>();
  private activeSessions = new Map<string, ActiveSession>();

  constructor(
    private config: BackgroundConnectionConfig,
    private transport: BackgroundTransport,
    private callbacks: BackgroundConnectionCallbacks = {},
  ) {}

  initialize(): void {
    this.transport.addContentListener(this.handleMessage);
  }

  private handleMessage = (message: unknown, sender: MessageSender): void => {
    const msg = message as ContentScriptMessage;
    if (msg.origin !== MessageOrigin.CONTENT_SCRIPT) {
      return;
    }

    const tabId = sender.tab?.id;
    const tabOrigin = sender.tab?.url ? new URL(sender.tab.url).origin : 'unknown';
    if (!tabId) {
      return;
    }

    const { type, sessionId, content } = msg;

    switch (type) {
      case InternalMessageType.DISCOVERY_REQUEST:
        this.handleDiscoveryRequest(content as DiscoveryRequest, tabId, tabOrigin);
        break;
      case InternalMessageType.KEY_EXCHANGE_REQUEST:
        if (sessionId) {
          this.handleKeyExchangeRequest(sessionId, content as KeyExchangeRequest).catch(() => {
            // Key exchange failed - session won't be established
          });
        }
        break;
      case InternalMessageType.DISCONNECT_REQUEST:
        if (sessionId) {
          this.terminateSession(sessionId);
        }
        break;
      case InternalMessageType.SECURE_MESSAGE:
        if (sessionId) {
          void this.handleEncryptedMessage(sessionId, content as EncryptedPayload);
        }
        break;
    }
  };

  getWalletInfo(): WalletInfo {
    return {
      id: this.config.walletId,
      name: this.config.walletName,
      version: this.config.walletVersion,
      icon: this.config.walletIcon,
    };
  }

  handleDiscoveryRequest(request: DiscoveryRequest, tabId: number, origin: string): void {
    const discovery: PendingDiscovery = {
      requestId: request.requestId,
      appId: request.appId,
      origin,
      chainInfo: request.chainInfo,
      tabId,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.pendingDiscoveries.set(request.requestId, discovery);
    this.callbacks.onPendingDiscovery?.(discovery);
  }

  approveDiscovery(requestId: string): boolean {
    const discovery = this.pendingDiscoveries.get(requestId);
    if (!discovery || discovery.status !== 'pending') {
      return false;
    }

    // The discovery requestId becomes our sessionId
    // This is what will be used internally to correlate
    // content<->background messages
    const sessionId = requestId;

    discovery.status = 'approved';
    this.transport.sendToTab(discovery.tabId, {
      origin: MessageOrigin.BACKGROUND,
      type: InternalMessageType.DISCOVERY_APPROVED,
      sessionId,
      content: this.getWalletInfo(),
    });

    return true;
  }

  rejectDiscovery(requestId: string): boolean {
    const discovery = this.pendingDiscoveries.get(requestId);
    if (!discovery || discovery.status !== 'pending') {
      return false;
    }

    discovery.status = 'rejected';
    this.pendingDiscoveries.delete(requestId);

    return true;
  }

  async handleKeyExchangeRequest(sessionId: string, request: KeyExchangeRequest): Promise<void> {
    const discovery = this.pendingDiscoveries.get(sessionId);
    if (!discovery || discovery.status !== 'approved') {
      return;
    }

    try {
      const keyPair = await generateKeyPair();
      const publicKey = await exportPublicKey(keyPair.publicKey);

      const appPublicKey = await importPublicKey(request.publicKey);
      const sessionKeys = await deriveSessionKeys(keyPair, appPublicKey, false);

      const session: ActiveSession = {
        sessionId,
        sharedKey: sessionKeys.encryptionKey,
        verificationHash: sessionKeys.verificationHash,
        tabId: discovery.tabId,
        origin: discovery.origin,
        appId: discovery.appId,
        connectedAt: Date.now(),
        chainInfo: discovery.chainInfo,
      };

      this.activeSessions.set(sessionId, session);
      this.pendingDiscoveries.delete(sessionId);

      const response: KeyExchangeResponse = {
        type: WalletMessageType.KEY_EXCHANGE_RESPONSE,
        requestId: sessionId, // Public protocol uses requestId
        publicKey,
      };

      this.transport.sendToTab(discovery.tabId, {
        origin: MessageOrigin.BACKGROUND,
        type: InternalMessageType.KEY_EXCHANGE_RESPONSE,
        sessionId,
        content: response,
      });

      this.callbacks.onSessionEstablished?.(session);
    } catch {
      // Key exchange failed silently - session won't be established
    }
  }

  async handleEncryptedMessage(sessionId: string, encrypted: EncryptedPayload): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      const message = await decrypt<WalletMessage>(session.sharedKey, encrypted);
      this.callbacks.onWalletMessage?.(session, message);
    } catch {
      // Decryption failed - ignore malformed message
    }
  }

  async sendResponse(sessionId: string, response: WalletResponse): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      const encrypted = await encrypt(session.sharedKey, JSON.stringify(response));
      this.transport.sendToTab(session.tabId, {
        origin: MessageOrigin.BACKGROUND,
        type: InternalMessageType.SECURE_RESPONSE,
        sessionId,
        content: encrypted,
      });
    } catch {
      // Encryption failed - response won't be sent
    }
  }

  terminateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Notify the content script (and ultimately the dApp) that the session is disconnected
      this.transport.sendToTab(session.tabId, {
        origin: MessageOrigin.BACKGROUND,
        type: InternalMessageType.SESSION_DISCONNECTED,
        sessionId,
      });

      this.activeSessions.delete(sessionId);
      this.callbacks.onSessionTerminated?.(sessionId);

      // Restore discovery to approved state so user can retry key exchange
      const discovery: PendingDiscovery = {
        requestId: sessionId,
        appId: session.appId,
        origin: session.origin,
        chainInfo: session.chainInfo,
        tabId: session.tabId,
        timestamp: Date.now(),
        status: 'approved',
      };
      this.pendingDiscoveries.set(sessionId, discovery);
    }
  }

  terminateForTab(tabId: number): void {
    for (const [sessionId, session] of this.activeSessions) {
      if (session.tabId === tabId) {
        this.terminateSession(sessionId);
      }
    }
    for (const [requestId, discovery] of this.pendingDiscoveries) {
      if (discovery.tabId === tabId) {
        this.pendingDiscoveries.delete(requestId);
      }
    }
  }

  clearAll(): void {
    for (const sessionId of this.activeSessions.keys()) {
      this.callbacks.onSessionTerminated?.(sessionId);
    }
    this.activeSessions.clear();
    this.pendingDiscoveries.clear();
  }

  getPendingDiscoveries(): PendingDiscovery[] {
    return Array.from(this.pendingDiscoveries.values()).filter(d => d.status === 'pending');
  }

  getPendingDiscoveryCount(): number {
    return this.getPendingDiscoveries().length;
  }

  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getPendingDiscovery(requestId: string): PendingDiscovery | undefined {
    return this.pendingDiscoveries.get(requestId);
  }
}
