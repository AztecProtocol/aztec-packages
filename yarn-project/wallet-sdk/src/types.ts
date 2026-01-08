import type { ChainInfo } from '@aztec/aztec.js/account';

import type { ExportedPublicKey } from './crypto.js';

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
  type: 'aztec-wallet-discovery';
  /** Request ID */
  requestId: string;
  /** Chain information to check if wallet supports this network */
  chainInfo: ChainInfo;
}

/**
 * Discovery response from a wallet (public, unencrypted)
 */
export interface DiscoveryResponse {
  /** Message type for discovery response */
  type: 'aztec-wallet-discovery-response';
  /** Request ID matching the discovery request */
  requestId: string;
  /** Wallet information */
  walletInfo: WalletInfo;
}

/**
 * Connection request to establish secure channel
 */
export interface ConnectRequest {
  /** Message type for connection */
  type: 'aztec-wallet-connect';
  /** Target wallet ID */
  walletId: string;
  /** Application ID */
  appId: string;
  /** dApp's ECDH public key for deriving shared secret */
  publicKey: ExportedPublicKey;
}
