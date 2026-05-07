import type { EncryptedPayload, ExportedPublicKey } from '../../crypto.js';
import { type DiscoveryRequest, type DiscoveryResponse, type WalletInfo, WalletMessageType } from '../../types.js';
import {
  type BackgroundMessage,
  type ContentScriptMessage,
  InternalMessageType,
  MessageOrigin,
} from './internal_message_types.js';

/**
 * Key exchange request sent over MessageChannel.
 */
interface KeyExchangeRequest {
  /** Message type identifier. */
  type: typeof WalletMessageType.KEY_EXCHANGE_REQUEST;
  /** Request identifier for correlation. */
  requestId: string;
  /** ECDH public key in JWK format. */
  publicKey: ExportedPublicKey;
}

/**
 * Key exchange response sent over MessageChannel.
 */
interface KeyExchangeResponse {
  /** Message type identifier. */
  type: typeof WalletMessageType.KEY_EXCHANGE_RESPONSE;
  /** Request identifier for correlation. */
  requestId: string;
  /** ECDH public key in JWK format. */
  publicKey: ExportedPublicKey;
}

/**
 * Port connection stored by the content script.
 */
interface PortConnection {
  /** MessagePort for communication with page. */
  port: MessagePort;
  /** Session identifier. */
  sessionId: string;
}

/**
 * Transport interface for content script communication.
 */
export interface ContentScriptTransport {
  /**
   * Send a message to the background script.
   * Typically `browser.runtime.sendMessage`.
   */
  sendToBackground: (message: ContentScriptMessage) => void;

  /**
   * Register a listener for messages from the background script.
   * Typically `browser.runtime.onMessage.addListener`.
   */
  addBackgroundListener: (handler: (message: BackgroundMessage) => void) => void;
}

/**
 * Handles wallet connection flow in the extension content script.
 *
 * This class manages:
 * - Listening for discovery requests from the page
 * - Creating MessageChannels after discovery approval
 * - Relaying key exchange messages between page and background
 * - Relaying encrypted messages between page and background
 *
 * The content script acts as a pure relay - it never has access to
 * private keys or shared secrets.
 *
 * @example
 * ```typescript
 * const handler = new ContentScriptConnectionHandler({
 *   sendToBackground: (message) => browser.runtime.sendMessage(message),
 *   addBackgroundListener: (handler) => browser.runtime.onMessage.addListener(handler),
 * });
 *
 * handler.start();
 * ```
 */
export class ContentScriptConnectionHandler {
  private ports = new Map<string, PortConnection>();
  private listening = false;
  private pageMessageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(private transport: ContentScriptTransport) {}

  start(): void {
    if (this.listening) {
      return;
    }

    this.transport.addBackgroundListener(this.handleBackgroundMessage);

    this.pageMessageHandler = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      let data: DiscoveryRequest;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!data?.type) {
        return;
      }

      if (data.type === WalletMessageType.DISCOVERY) {
        this.handleDiscoveryRequest(data);
      }
    };

    window.addEventListener('message', this.pageMessageHandler);
    this.listening = true;
  }

  private handleBackgroundMessage = (message: BackgroundMessage): void => {
    if (message.origin !== MessageOrigin.BACKGROUND) {
      return;
    }

    const { type, sessionId, content } = message;

    switch (type) {
      case InternalMessageType.DISCOVERY_APPROVED:
        this.handleDiscoveryApproved(sessionId, content as WalletInfo);
        break;
      case InternalMessageType.KEY_EXCHANGE_RESPONSE:
        this.handleKeyExchangeResponse(sessionId, content as KeyExchangeResponse);
        break;
      case InternalMessageType.SECURE_RESPONSE:
        this.handleSecureResponse(sessionId, content as EncryptedPayload);
        break;
      case InternalMessageType.SESSION_DISCONNECTED:
        this.handleSessionDisconnected(sessionId);
        break;
      case InternalMessageType.PONG:
        this.handlePong(sessionId);
        break;
    }
  };

  private handlePong(sessionId: string): void {
    const connection = this.ports.get(sessionId);
    if (!connection) {
      return;
    }
    connection.port.postMessage({ type: WalletMessageType.PONG });
  }

  private handleDiscoveryRequest(request: DiscoveryRequest): void {
    this.transport.sendToBackground({
      origin: MessageOrigin.CONTENT_SCRIPT,
      type: InternalMessageType.DISCOVERY_REQUEST,
      content: request,
    });
  }

  private handleDiscoveryApproved(sessionId: string, walletInfo: WalletInfo): void {
    const channel = new MessageChannel();

    this.ports.set(sessionId, {
      port: channel.port1,
      sessionId,
    });

    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data;

      switch (data?.type) {
        case WalletMessageType.KEY_EXCHANGE_REQUEST:
          this.transport.sendToBackground({
            origin: MessageOrigin.CONTENT_SCRIPT,
            type: InternalMessageType.KEY_EXCHANGE_REQUEST,
            sessionId,
            content: data as KeyExchangeRequest,
          });
          break;
        case WalletMessageType.DISCONNECT:
          this.transport.sendToBackground({
            origin: MessageOrigin.CONTENT_SCRIPT,
            type: InternalMessageType.DISCONNECT_REQUEST,
            sessionId,
            content: data,
          });
          break;
        case WalletMessageType.PING:
          this.transport.sendToBackground({
            origin: MessageOrigin.CONTENT_SCRIPT,
            type: InternalMessageType.PING,
            sessionId,
          });
          break;
        default:
          this.transport.sendToBackground({
            origin: MessageOrigin.CONTENT_SCRIPT,
            type: InternalMessageType.SECURE_MESSAGE,
            sessionId,
            content: data as EncryptedPayload,
          });
          break;
      }
    };

    channel.port1.start();

    const response: DiscoveryResponse = {
      type: WalletMessageType.DISCOVERY_RESPONSE,
      requestId: sessionId,
      walletInfo,
    };
    window.postMessage(JSON.stringify(response), '*', [channel.port2]);
  }

  private handleKeyExchangeResponse(sessionId: string, response: KeyExchangeResponse): void {
    const connection = this.ports.get(sessionId);
    if (!connection) {
      return;
    }
    connection.port.postMessage(response);
  }

  private handleSecureResponse(sessionId: string, content: EncryptedPayload): void {
    const connection = this.ports.get(sessionId);
    if (!connection) {
      return;
    }
    connection.port.postMessage(content);
  }

  private handleSessionDisconnected(sessionId: string): void {
    const connection = this.ports.get(sessionId);
    if (!connection) {
      return;
    }
    connection.port.postMessage({ type: WalletMessageType.DISCONNECT });
    connection.port.close();
    this.ports.delete(sessionId);
  }

  closeConnection(sessionId: string): void {
    const connection = this.ports.get(sessionId);
    if (connection) {
      connection.port.close();
      this.ports.delete(sessionId);
    }
  }

  closeAllConnections(): void {
    for (const [sessionId, connection] of this.ports) {
      connection.port.close();
      this.ports.delete(sessionId);
    }
  }

  getConnectionCount(): number {
    return this.ports.size;
  }
}
