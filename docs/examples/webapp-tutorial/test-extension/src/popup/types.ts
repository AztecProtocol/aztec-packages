/**
 * Re-export shared types for the popup.
 * The canonical definitions live in shared-types.ts — import from there
 * or from this module (which re-exports everything the popup needs).
 */
export type {
  PublicAccountInfo,
  PendingTransaction,
  PendingSessionVerification,
  PendingCapabilities,
  ConnectedSite,
  BackgroundTask,
  WalletExportData,
  View,
} from '../shared-types';

/** Alias for popup components that display account info. */
export type { PublicAccountInfo as StoredAccount } from '../shared-types';
