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
  /** Session disconnected notification (unencrypted control message) */
  SESSION_DISCONNECTED = 'aztec-wallet-session-disconnected',
  /** Explicit disconnect request from dApp */
  DISCONNECT = 'aztec-wallet-disconnect',
}

/**
 * Information about an installed Aztec wallet
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
  /** Wallet's ECDH public key for secure channel establishment */
  publicKey: ExportedPublicKey;
  /**
   * Hash of the shared secret for anti-MITM verification.
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
 * Discovery message for finding installed wallets (public, unencrypted)
 */
export interface DiscoveryRequest {
  /** Message type for discovery */
  type: WalletMessageType.DISCOVERY;
  /** Request ID */
  requestId: string;
  /** Chain information to check if wallet supports this network */
  chainInfo: ChainInfo;
  /** dApp's ECDH public key for deriving shared secret */
  publicKey: ExportedPublicKey;
}

/**
 * Discovery response from a wallet (public, unencrypted)
 */
export interface DiscoveryResponse {
  /** Message type for discovery response */
  type: WalletMessageType.DISCOVERY_RESPONSE;
  /** Request ID matching the discovery request */
  requestId: string;
  /** Wallet information */
  walletInfo: WalletInfo;
}
