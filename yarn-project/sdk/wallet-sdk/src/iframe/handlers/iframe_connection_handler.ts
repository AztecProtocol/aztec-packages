/**
 * IframeConnectionHandler — wallet-side of the cross-origin iframe protocol.
 *
 * This mirrors {@link BackgroundConnectionHandler} from `@aztec/wallet-sdk/extension/handlers`
 * but uses `window.postMessage` instead of browser.runtime messaging.
 *
 * Message flow (wallet receives):
 *   parent → DISCOVERY            → show approval UI → send DISCOVERY_RESPONSE
 *   parent → KEY_EXCHANGE_REQUEST → ECDH             → send KEY_EXCHANGE_RESPONSE
 *   parent → SECURE_MESSAGE       → decrypt → Wallet → encrypt → SECURE_RESPONSE
 *   parent → DISCONNECT           → terminate session
 *
 * The wallet announces itself by posting WALLET_READY as soon as the handler starts,
 * so the dApp knows it can send a discovery request.
 */
import type { ChainInfo } from '@aztec/aztec.js/account';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { getSchemaParameters, parseWithOptionals, schemaHasMethod } from '@aztec/foundation/schemas';

import {
  type EncryptedPayload,
  decrypt,
  deriveSessionKeys,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
} from '../../crypto.js';
import { type WalletMessage, WalletMessageType, type WalletResponse, type WalletSdkLogger } from '../../types.js';

/**
 * A pending discovery request from a dApp (before user approval).
 */
export interface PendingSession {
  /** Unique request identifier */
  requestId: string;
  /** Application identifier */
  appId: string;
  /** Origin URL of the requesting page */
  origin: string;
  /** Approval status */
  status: 'pending' | 'approved';
}

/**
 * An active session (after key exchange).
 */
export interface ActiveSession {
  /** Session identifier (same as the discovery requestId) */
  sessionId: string;
  /** AES-256-GCM shared key for this session */
  sharedKey: CryptoKey;
  /** Verification hash for emoji display */
  verificationHash: string;
  /** Origin URL of the connected dApp */
  origin: string;
  /** Application identifier */
  appId: string;
}

/**
 * Configuration for the iframe connection handler.
 */
export interface IframeConnectionConfig {
  /** Unique wallet identifier */
  walletId: string;
  /** Display name for the wallet */
  walletName: string;
  /** Wallet version string */
  walletVersion: string;
  /** Optional wallet icon URL */
  walletIcon?: string;
  /** Origins allowed to connect. If empty or undefined, all origins are allowed (dev mode). */
  allowedOrigins?: string[];
  /** Logger used for diagnostics. */
  logger: WalletSdkLogger;
}

/**
 * Event callbacks for the iframe connection handler.
 */
export interface IframeConnectionCallbacks {
  /** Called when a new discovery request arrives — wallet can show approval UI */
  onPendingDiscovery?: (session: PendingSession) => void;
  /** Called when a session is established (key exchange complete) */
  onSessionEstablished?: (session: ActiveSession) => void;
  /** Called when a session is terminated */
  onSessionTerminated?: (sessionId: string) => void;
  /** Called when a key exchange completes — show verificationHash as emojis to the user */
  onVerificationHash?: (verificationHash: string) => void;
  /**
   * Resolves the Wallet instance to use for a given dApp and chain.
   * Called when an encrypted message arrives and needs to be dispatched.
   */
  getWallet: (appId: string, chainInfo: ChainInfo) => Promise<Wallet>;
}

/**
 * Handles the wallet side of the cross-origin iframe protocol.
 *
 * Manages the full lifecycle: discovery, ECDH key exchange, encrypted message
 * dispatch to a {@link Wallet} instance, and session termination.
 *
 * @example
 * ```typescript
 * const handler = new IframeConnectionHandler(
 *   { walletId: 'my-wallet', walletName: 'My Wallet', walletVersion: '1.0.0', logger: console },
 *   {
 *     onPendingDiscovery: (session) => showApprovalUI(session),
 *     getWallet: (appId, chainInfo) => createWalletForApp(appId, chainInfo),
 *   },
 * );
 * handler.start();
 * ```
 */
export class IframeConnectionHandler {
  private pendingSessions = new Map<string, PendingSession>();
  private activeSessions = new Map<string, ActiveSession>();
  private log: WalletSdkLogger;

  constructor(
    private config: IframeConnectionConfig,
    private callbacks: IframeConnectionCallbacks,
  ) {
    this.log = config.logger;
  }

  start(): void {
    window.addEventListener('message', this.handleMessage);
    this.postToParent({ type: WalletMessageType.WALLET_READY });
    this.log.info('IframeConnectionHandler started, posted WALLET_READY');
  }

  stop(): void {
    window.removeEventListener('message', this.handleMessage);
  }

  approveDiscovery(requestId: string): void {
    const pending = this.pendingSessions.get(requestId);
    if (!pending || pending.status !== 'pending') {
      return;
    }

    pending.status = 'approved';
    this.postToOrigin(pending.origin, {
      type: WalletMessageType.DISCOVERY_RESPONSE,
      requestId,
      walletInfo: {
        id: this.config.walletId,
        name: this.config.walletName,
        version: this.config.walletVersion,
        icon: this.config.walletIcon,
      },
    });
    this.log.info(`Discovery approved for requestId=${requestId}`);
  }

  rejectDiscovery(requestId: string): void {
    this.pendingSessions.delete(requestId);
  }

  terminateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.postToOrigin(session.origin, {
        type: WalletMessageType.SESSION_DISCONNECTED,
        sessionId,
      });
      this.activeSessions.delete(sessionId);
      this.callbacks.onSessionTerminated?.(sessionId);
    }
  }

  getPendingSessions(): PendingSession[] {
    return Array.from(this.pendingSessions.values()).filter(s => s.status === 'pending');
  }

  private handleMessage = (event: MessageEvent): void => {
    void this.handleMessageAsync(event);
  };

  private async handleMessageAsync(event: MessageEvent): Promise<void> {
    if (this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
      if (!this.config.allowedOrigins.includes(event.origin)) {
        return;
      }
    }

    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !msg.type) {
      return;
    }

    switch (msg.type) {
      case WalletMessageType.DISCOVERY:
        this.handleDiscoveryRequest(msg, event.origin);
        break;
      case WalletMessageType.KEY_EXCHANGE_REQUEST:
        await this.handleKeyExchangeRequest(msg, event.origin);
        break;
      case WalletMessageType.SECURE_MESSAGE:
        await this.handleSecureMessage(msg);
        break;
      case WalletMessageType.DISCONNECT:
        this.terminateSession(msg.sessionId);
        break;
      case WalletMessageType.PING:
        this.handlePing(msg.sessionId);
        break;
    }
  }

  private handlePing(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    this.postToOrigin(session.origin, { type: WalletMessageType.PONG, sessionId });
  }

  private handleDiscoveryRequest(msg: Record<string, unknown>, origin: string): void {
    // eslint-disable-next-line jsdoc/require-jsdoc
    const { requestId, appId } = msg as { requestId: string; appId: string };
    const pending: PendingSession = { requestId, appId, origin, status: 'pending' };
    this.pendingSessions.set(requestId, pending);
    this.log.info(`Discovery request from appId=${appId} origin=${origin}`);
    this.callbacks.onPendingDiscovery?.(pending);
  }

  private async handleKeyExchangeRequest(msg: Record<string, unknown>, origin: string): Promise<void> {
    const { requestId, publicKey: appPublicKeyRaw } = msg as {
      // eslint-disable-next-line jsdoc/require-jsdoc
      requestId: string;
      // eslint-disable-next-line jsdoc/require-jsdoc
      publicKey: { kty: string; crv: string; x: string; y: string };
    };
    const pending = this.pendingSessions.get(requestId);
    if (!pending || pending.status !== 'approved') {
      this.log.warn(`Key exchange for unknown/unapproved requestId=${requestId}`);
      return;
    }

    try {
      const keyPair = await generateKeyPair();
      const walletPublicKey = await exportPublicKey(keyPair.publicKey);
      const appPublicKey = await importPublicKey(appPublicKeyRaw);
      const sessionKeys = await deriveSessionKeys(keyPair, appPublicKey, false);

      const session: ActiveSession = {
        sessionId: requestId,
        sharedKey: sessionKeys.encryptionKey,
        verificationHash: sessionKeys.verificationHash,
        origin: pending.origin,
        appId: pending.appId,
      };

      this.activeSessions.set(requestId, session);
      this.pendingSessions.delete(requestId);

      this.postToOrigin(origin, {
        type: WalletMessageType.KEY_EXCHANGE_RESPONSE,
        requestId,
        publicKey: walletPublicKey,
        verificationHash: sessionKeys.verificationHash,
      });

      this.callbacks.onVerificationHash?.(sessionKeys.verificationHash);
      this.callbacks.onSessionEstablished?.(session);
      this.log.info(`Key exchange complete, sessionId=${requestId}`);
    } catch (err) {
      this.log.error(`Key exchange failed: ${err}`);
    }
  }

  private async handleSecureMessage(msg: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line jsdoc/require-jsdoc
    const { sessionId, encrypted } = msg as { sessionId: string; encrypted: EncryptedPayload };
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    let walletMessage: WalletMessage;
    try {
      walletMessage = await decrypt<WalletMessage>(session.sharedKey, encrypted);
    } catch {
      this.log.warn(`Decryption failed for sessionId=${sessionId}`);
      return;
    }

    const { messageId, type, args, chainInfo, appId } = walletMessage;

    let result: unknown;
    let error: string | undefined;

    try {
      const wallet = await this.callbacks.getWallet(appId, chainInfo);

      if (!schemaHasMethod(WalletSchema, type)) {
        throw new Error(`Unknown wallet method: ${type}`);
      }
      const sanitizedArgs = await parseWithOptionals(args, getSchemaParameters(WalletSchema[type]));
      result = await (wallet as Record<string, (...a: unknown[]) => Promise<unknown>>)[type](...sanitizedArgs);
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
      this.log.error(`Error handling ${type}: ${error}`);
    }

    const response: WalletResponse = {
      messageId,
      walletId: this.config.walletId,
      result,
      error,
    };

    try {
      const encryptedResponse = await encrypt(session.sharedKey, jsonStringify(response));
      this.postToOrigin(session.origin, {
        type: WalletMessageType.SECURE_RESPONSE,
        sessionId,
        encrypted: encryptedResponse,
      });
    } catch (err) {
      this.log.error(`Encryption of response failed: ${err}`);
    }
  }

  private postToParent(msg: object): void {
    if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  private postToOrigin(origin: string, msg: object): void {
    if (window.parent !== window) {
      window.parent.postMessage(msg, origin);
    }
  }
}
