/**
 * Shared type definitions for the Aztec Tutorial Wallet extension.
 * Single source of truth for types used across background, offscreen, and popup.
 */

/**
 * Public account info — the subset of account data safe to expose to the UI.
 * Does NOT include encrypted secrets, IVs, or contract salts.
 */
export interface PublicAccountInfo {
  address: string;
  alias: string;
  isDeployed: boolean;
}

/**
 * Pending transaction awaiting user approval.
 */
export interface PendingTransaction {
  sessionId: string;
  messageId: string;
  method: string;
  args: any;
  from: string;
  origin: string;
  timestamp: number;
}

/**
 * Session pending emoji verification.
 * After key exchange completes, we hold the session here until
 * the user confirms the verification emojis match.
 */
export interface PendingSessionVerification {
  sessionId: string;
  origin: string;
  appId: string;
  verificationHash: string;
  timestamp: number;
}

/**
 * Pending capability request awaiting user approval.
 */
export interface PendingCapabilities {
  sessionId: string;
  messageId: string;
  origin: string;
  /** App metadata from the capability manifest */
  appMetadata: {
    name: string;
    version: string;
    description?: string;
    url?: string;
    icon?: string;
  };
  /** Raw requested capabilities array */
  capabilities: Array<{ type: string; [key: string]: any }>;
  timestamp: number;
}

/** Connected site info for display in the popup. */
export interface ConnectedSite {
  sessionId: string;
  origin: string;
  appId: string;
  connectedAt: number;
}

/** Background task for long-running operations. */
export interface BackgroundTask {
  id: string;
  type: string;
  status: 'running' | 'success' | 'error';
  progress?: string;
  result?: any;
  error?: string;
  startedAt: number;
}

/** Wallet export data format for backup/restore. */
export interface WalletExportData {
  version: 1;
  aztecPackagesVersion: string;
  exportedAt: string;
  accounts: Array<{
    address: string;
    secret: string;
    salt: string;
    alias: string;
    isDeployed: boolean;
  }>;
  activeAccount: string | null;
}

/** Popup view state. */
export type View = 'loading' | 'setup' | 'lock' | 'main' | 'switcher' | 'createAccount' | 'approvals' | 'verifySession' | 'settings';
