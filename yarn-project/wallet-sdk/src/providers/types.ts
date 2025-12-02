import type { ChainInfo } from '@aztec/aztec.js/account';

/**
 * Information about an installed Aztec wallet wallet
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
 * Message format for wallet communication
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
 * Discovery message for finding installed wallets
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
 * Discovery response from an wallet
 */
export interface DiscoveryResponse {
  /** Message type for discovery response */
  type: 'aztec-wallet-discovery-response';
  /** Request ID matching the discovery request */
  requestId: string;
  /** Wallet information */
  walletInfo: WalletInfo;
}
