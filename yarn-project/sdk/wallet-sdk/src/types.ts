import type { ChainInfo } from '@aztec/aztec.js/account';

import type { ExportedPublicKey } from './crypto.js';

/**
 * Message types for wallet SDK communication.
 * All types are prefixed with 'aztec-wallet-' for namespacing.
 */
export enum WalletMessageType {
  /** Discovery request to find installed wallets */
  DISCOVERY = 'aztec-wallet-discovery',
  /** Discovery response from a wallet */
  DISCOVERY_RESPONSE = 'aztec-wallet-discovery-response',
  /** Disconnect message (unencrypted control message, bidirectional) */
  DISCONNECT = 'aztec-wallet-disconnect',
  /** Key exchange request sent over MessageChannel */
  KEY_EXCHANGE_REQUEST = 'aztec-wallet-key-exchange-request',
  /** Key exchange response sent over MessageChannel */
  KEY_EXCHANGE_RESPONSE = 'aztec-wallet-key-exchange-response',
  /** Wallet ready signal */
  WALLET_READY = 'aztec-wallet-ready',
  /** Encrypted wallet message wrapper */
  SECURE_MESSAGE = 'aztec-wallet-secure-message',
  /** Encrypted wallet response wrapper */
  SECURE_RESPONSE = 'aztec-wallet-secure-response',
  /** Session disconnected notification */
  SESSION_DISCONNECTED = 'aztec-wallet-session-disconnected',
  /** Liveness probe sent by the dApp while a request is in flight */
  PING = 'aztec-wallet-ping',
  /** Liveness response from the wallet. Any inbound message (including a regular
   * encrypted response) is treated as proof of liveness, so a missing PONG alone
   * never trips disconnect — the dApp also resets its liveness timer on traffic.
   */
  PONG = 'aztec-wallet-pong',
}

/**
 * Information about an installed Aztec wallet.
 * Used during discovery phase before key exchange.
 */
export interface WalletInfo {
  /** Unique identifier for the wallet */
  id: string;
  /** Display name of the wallet */
  name: string;
  /** URL to the wallet's icon */
  icon?: string;
  /** Wallet version */
  version: string;
}

/**
 * Full information about a connected Aztec wallet including crypto material.
 * Available after key exchange completes.
 */
export interface ConnectedWalletInfo extends WalletInfo {
  /** Wallet's ECDH public key for secure channel establishment */
  publicKey: ExportedPublicKey;
  /**
   * Verification hash for verification.
   * Both dApp and wallet independently compute this from the ECDH shared secret.
   * Use {@link hashToEmoji} to convert to a visual representation for user verification.
   */
  verificationHash?: string;
}

/**
 * Message format for wallet communication (internal, before encryption)
 */
export interface WalletMessage {
  /** Unique message ID for tracking responses */
  messageId: string;
  /** The wallet method to call */
  type: string;
  /** Arguments for the method */
  args: unknown[];
  /** Chain information */
  chainInfo: ChainInfo;
  /** Application ID making the request */
  appId: string;
  /** Wallet ID to target a specific wallet */
  walletId: string;
}

/**
 * Response message from wallet
 */
export interface WalletResponse {
  /** Message ID matching the request */
  messageId: string;
  /** Result data (if successful) */
  result?: unknown;
  /** Error data (if failed) */
  error?: unknown;
  /** Wallet ID that sent the response */
  walletId: string;
}

/**
 * Discovery message for finding installed wallets (public, unencrypted).
 */
export interface DiscoveryRequest {
  /** Message type for discovery */
  type: WalletMessageType.DISCOVERY;
  /** Request ID */
  requestId: string;
  /** Application ID making the request */
  appId: string;
  /** Chain information to check if wallet supports this network */
  chainInfo: ChainInfo;
}

/**
 * Discovery response from a wallet (public, unencrypted).
 */
export interface DiscoveryResponse {
  /** Message type for discovery response */
  type: WalletMessageType.DISCOVERY_RESPONSE;
  /** Request ID matching the discovery request */
  requestId: string;
  /** Basic wallet information */
  walletInfo: WalletInfo;
}

/**
 * Key exchange request sent over MessageChannel after discovery approval.
 */
export interface KeyExchangeRequest {
  /** Message type */
  type: WalletMessageType.KEY_EXCHANGE_REQUEST;
  /** Request ID matching the discovery request */
  requestId: string;
  /** dApp's ECDH public key for deriving shared secret */
  publicKey: ExportedPublicKey;
}

/**
 * Key exchange response sent over MessageChannel.
 */
export interface KeyExchangeResponse {
  /** Message type */
  type: WalletMessageType.KEY_EXCHANGE_RESPONSE;
  /** Request ID matching the discovery request */
  requestId: string;
  /** Wallet's ECDH public key for deriving shared secret */
  publicKey: ExportedPublicKey;
}

/**
 * Callback invoked when a wallet connection is disconnected.
 */
export type DisconnectCallback = () => void;

/**
 * Default heartbeat tuning shared by both transports.
 *
 * - `intervalMs`: how often the dApp sends PING probes while a request is in flight.
 * - `deadAfterMs`: how long the channel can stay silent (no PONG, no encrypted
 *   response, no DISCONNECT) before the dApp declares the wallet unreachable
 *   and rejects all in-flight requests. Generous enough that long-running
 *   operations (proveTx, sendTx) on legacy wallets that don't reply to PING
 *   still succeed — any inbound traffic resets the timer.
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
export const DEFAULT_HEARTBEAT_DEAD_AFTER_MS = 300_000;

/** Override knobs for the heartbeat — mostly useful for tests. */
export interface HeartbeatOptions {
  /** How often to send PING probes while a request is in flight (ms). */
  intervalMs?: number;
  /** Idle ceiling before declaring disconnect (ms). */
  deadAfterMs?: number;
}

/**
 * Minimal logger surface used by the wallet SDK.
 *
 * Defined locally so that wallet hosts (browser extensions, iframe wallet pages)
 * can pass a simple `console`-backed logger without pulling in the full
 * `@aztec/foundation` logging runtime, which is non-trivial to bundle in those
 * contexts. Structurally compatible with `Logger` from `@aztec/foundation/log`,
 * so dApp-side callers can pass that type directly.
 */
export interface WalletSdkLogger {
  /** Diagnostic messages — typically discarded in production. */
  debug: (message: string, data?: unknown) => void;
  /** Informational messages — significant lifecycle events. */
  info: (message: string, data?: unknown) => void;
  /** Recoverable problems — channel decryption failure, missed heartbeats, etc. */
  warn: (message: string, data?: unknown) => void;
  /** Errors that prevent normal operation. */
  error: (message: string, errOrData?: unknown, data?: unknown) => void;
}

/**
 * No-op logger used as the default when callers don't provide one. Discards all
 * messages — wallet hosts that want diagnostics should pass their own logger.
 */
export const NOOP_LOGGER: WalletSdkLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
