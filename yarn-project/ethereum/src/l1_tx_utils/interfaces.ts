import type { L1BlobInputs, L1TxState } from './types.js';

/**
 * Interface for L1 transaction state storage.
 * Implementations handle persistence of transaction states across restarts.
 */
export interface IL1TxStore {
  /**
   * Gets the next available state ID for an account.
   */
  consumeNextStateId(account: string): Promise<number>;

  /**
   * Saves a single transaction state for a specific account.
   * Does not save blob data (see saveBlobs).
   * @param account - The sender account address
   * @param state - Transaction state to save
   */
  saveState(account: string, state: L1TxState): Promise<L1TxState>;

  /**
   * Saves blobs for a given state.
   * @param account - The sender account address
   * @param stateId - The state ID
   * @param blobInputs - Blob inputs to save
   */
  saveBlobs(account: string, stateId: number, blobInputs: L1BlobInputs | undefined): Promise<void>;

  /**
   * Loads all transaction states for a specific account.
   * @param account - The sender account address
   * @returns Array of transaction states with their IDs
   */
  loadStates(account: string): Promise<L1TxState[]>;

  /**
   * Loads a single state by ID.
   * @param account - The sender account address
   * @param stateId - The state ID
   * @returns The transaction state or undefined if not found
   */
  loadState(account: string, stateId: number): Promise<L1TxState | undefined>;

  /**
   * Deletes a specific state and its associated blobs.
   * @param account - The sender account address
   * @param stateId - The state ID to delete
   */
  deleteState(account: string, stateId: number): Promise<void>;

  /**
   * Clears all transaction states for a specific account.
   * @param account - The sender account address
   */
  clearStates(account: string): Promise<void>;

  /**
   * Gets all accounts that have stored states.
   * @returns Array of account addresses
   */
  getAllAccounts(): Promise<string[]>;

  /**
   * Closes the store.
   */
  close(): Promise<void>;
}

/**
 * Interface for L1 transaction metrics recording.
 * Implementations handle tracking of transaction lifecycle and gas costs.
 */
export interface IL1TxMetrics {
  /**
   * Records metrics when a transaction is mined
   * @param state - The L1 transaction state
   * @param l1Timestamp - The current L1 timestamp
   */
  recordMinedTx(state: L1TxState, l1Timestamp: Date): void;

  /**
   * Records metrics when a transaction is dropped
   * @param state - The L1 transaction state
   */
  recordDroppedTx(state: L1TxState): void;
}
