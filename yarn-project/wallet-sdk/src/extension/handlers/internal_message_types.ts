/**
 * Internal message types for content script ↔ background communication.
 * These are NOT part of the public wallet protocol - they are implementation
 * details for coordinating between extension components.
 */
export const InternalMessageType = {
  // Content script → Background
  DISCOVERY_REQUEST: 'discovery-request',
  KEY_EXCHANGE_REQUEST: 'key-exchange-request',
  SECURE_MESSAGE: 'secure-message',
  DISCONNECT_REQUEST: 'disconnect-request',
  // Background → Content script
  DISCOVERY_APPROVED: 'discovery-approved',
  KEY_EXCHANGE_RESPONSE: 'key-exchange-response',
  SECURE_RESPONSE: 'secure-response',
  SESSION_DISCONNECTED: 'session-disconnected',
} as const;

/**
 * Message origins for internal extension communication.
 */
export const MessageOrigin = {
  BACKGROUND: 'background',
  CONTENT_SCRIPT: 'content-script',
} as const;

/** Union type of message origins. */
export type MessageOriginType = (typeof MessageOrigin)[keyof typeof MessageOrigin];

/**
 * Message sent from content script to background.
 */
export interface ContentScriptMessage {
  /** Message source identifier. */
  origin: typeof MessageOrigin.CONTENT_SCRIPT;
  /** Message type. */
  type: string;
  /** Optional session identifier. */
  sessionId?: string;
  /** Optional message payload. */
  content?: unknown;
}

/**
 * Message sent from background to content script.
 */
export interface BackgroundMessage {
  /** Message source identifier. */
  origin: typeof MessageOrigin.BACKGROUND;
  /** Message type. */
  type: string;
  /** Session identifier. */
  sessionId: string;
  /** Optional message payload. */
  content?: unknown;
}

/**
 * Sender information for messages from browser runtime.
 */
export interface MessageSender {
  /** Tab information if available. */
  tab?: {
    /** Tab identifier. */
    id?: number;
    /** Tab URL. */
    url?: string;
  };
}
