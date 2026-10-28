// docs:start:wallet-config
/**
 * Configuration for the Aztec Tutorial Wallet extension.
 * Uses SponsoredFPC for fee payment.
 */

/** Aztec node URL — defaults to a local sandbox. */
export const NODE_URL = 'http://localhost:8080';

/** Current @aztec/* package version, injected at build time by Vite. */
declare const __AZTEC_PACKAGES_VERSION__: string;
export const AZTEC_PACKAGES_VERSION: string =
  typeof __AZTEC_PACKAGES_VERSION__ !== 'undefined' ? __AZTEC_PACKAGES_VERSION__ : 'unknown';

/** Wallet identification for the SDK protocol */
export const WALLET_CONFIG = {
  walletId: 'aztec-tutorial-wallet',
  walletName: 'Aztec Tutorial Wallet',
  walletVersion: '1.0.0',
  walletIcon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔮</text></svg>',
};

/** Auto-lock timeout in minutes. The wallet locks after this period of inactivity. (#28) */
export const AUTO_LOCK_MINUTES = 15;

/** Message types for internal extension communication */
export const MessageTypes = {
  // Account management
  GET_ACCOUNTS: 'get-accounts',
  MARK_DEPLOYED: 'mark-deployed',

  // Full account creation in extension (uses Barretenberg)
  CREATE_ACCOUNT: 'create-account',
  DEPLOY_ACCOUNT: 'deploy-account',

  // Master password + wallet unlock
  SETUP_PASSWORD: 'setup-password',
  UNLOCK_WALLET: 'unlock-wallet',
  GET_WALLET_STATUS: 'get-wallet-status',

  // PXE operations
  INIT_PXE: 'init-pxe',
  REGISTER_ACCOUNT: 'register-account',

  // Active account management
  GET_ACTIVE_ACCOUNT: 'get-active-account',
  SET_ACTIVE_ACCOUNT: 'set-active-account',

  // Wallet export/import
  EXPORT_WALLET: 'export-wallet',
  IMPORT_WALLET: 'import-wallet',
  IMPORT_WALLET_ACCOUNTS: 'import-wallet-accounts',

  // Wallet SDK protocol — dispatches to BaseWallet
  WALLET_METHOD: 'wallet-method',

  // Auto-lock
  LOCK_WALLET: 'lock-wallet',

  // Popup -> Background
  APPROVE_CONNECTION: 'approve-connection',
  REJECT_CONNECTION: 'reject-connection',
  APPROVE_TRANSACTION: 'approve-transaction',
  REJECT_TRANSACTION: 'reject-transaction',
  CONFIRM_SESSION: 'confirm-session',
  REJECT_SESSION: 'reject-session',
  DISCONNECT_SESSION: 'disconnect-session',
  APPROVE_CAPABILITIES: 'approve-capabilities',
  REJECT_CAPABILITIES: 'reject-capabilities',
} as const;

/** Union type of all message type values — use for exhaustive checking. */
export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

/** Targets for chrome.runtime messages */
export const MessageTarget = {
  OFFSCREEN: 'offscreen',
  POPUP: 'popup',
  BACKGROUND: 'background',
} as const;


/**
 * Conditional logging. (#26)
 * Strips verbose logs in production while keeping errors visible.
 * Set DEBUG=true in the build to enable verbose logging.
 */
const DEBUG = process.env.NODE_ENV !== 'production'; // Toggle via build environment

export const log = {
  debug: (...args: unknown[]) => { if (DEBUG) console.log(...args); },
  info: (...args: unknown[]) => { if (DEBUG) console.info(...args); },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
// docs:end:wallet-config
