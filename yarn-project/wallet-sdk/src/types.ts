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
