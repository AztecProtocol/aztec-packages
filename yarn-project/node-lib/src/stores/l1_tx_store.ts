import type { IL1TxStore, L1BlobInputs, L1TxConfig, L1TxState } from '@aztec/ethereum';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

import type { TransactionReceipt } from 'viem';

/**
 * Serializable version of L1TxRequest for storage.
 */
interface SerializableL1TxRequest {
  to: string | null;
  data?: string;
  value?: string;
}

/**
 * Serializable version of GasPrice for storage.
 */
interface SerializableGasPrice {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  maxFeePerBlobGas?: string;
}

/**
 * Serializable version of L1TxConfig for storage.
 */
interface SerializableL1TxConfig {
  gasLimit?: string;
  txTimeoutAt?: number;
  txTimeoutMs?: number;
  checkIntervalMs?: number;
  stallTimeMs?: number;
  priorityFeeRetryBumpPercentage?: number;
  maxSpeedUpAttempts?: number;
  cancelTxOnTimeout?: boolean;
  txCancellationFinalTimeoutMs?: number;
  txUnseenConsideredDroppedMs?: number;
}

/**
 * Serializable version of blob inputs for storage (without the actual blob data).
 */
interface SerializableBlobMetadata {
  maxFeePerBlobGas?: string;
}

/**
 * Serializable version of L1TxState for storage.
 * Dates and bigints are converted to strings/numbers for JSON serialization.
 * Blob data is NOT included here - it's stored separately.
 */
interface SerializableL1TxState {
  id: number;
  txHashes: string[];
  cancelTxHashes: string[];
  gasLimit: string;
  gasPrice: SerializableGasPrice;
  txConfigOverrides: SerializableL1TxConfig;
  request: SerializableL1TxRequest;
  status: number;
  nonce: number;
  sentAt: number;
  lastSentAt: number;
  receipt?: TransactionReceipt;
  hasBlobInputs: boolean;
  blobMetadata?: SerializableBlobMetadata;
}

/**
 * Serializable blob inputs for separate storage.
 */
interface SerializableBlobInputs {
  blobs: string[]; // base64 encoded
  kzg: string; // JSON stringified KZG instance
}

/**
 * Store for persisting L1 transaction states across all L1TxUtils instances.
 * Each state is stored individually with a unique ID, and blobs are stored separately.
 * @remarks This class lives in this package instead of `ethereum` because it depends on `kv-store`.
 */
export class L1TxStore implements IL1TxStore {
  public static readonly SCHEMA_VERSION = 2;

  private readonly states: AztecAsyncMap<string, string>; // key: "account-stateId", value: SerializableL1TxState
  private readonly blobs: AztecAsyncMap<string, string>; // key: "account-stateId", value: SerializableBlobInputs
  private readonly stateIdCounter: AztecAsyncMap<string, number>; // key: "account", value: next ID

  constructor(
    private readonly store: AztecAsyncKVStore,
    private readonly log: Logger = createLogger('l1-tx-utils:store'),
  ) {
    this.states = store.openMap<string, string>('l1_tx_states');
    this.blobs = store.openMap<string, string>('l1_tx_blobs');
    this.stateIdCounter = store.openMap<string, number>('l1_tx_state_id_counter');
  }

  /**
   * Gets the next available state ID for an account.
   */
  public consumeNextStateId(account: string): Promise<number> {
    return this.store.transactionAsync(async () => {
      const currentId = (await this.stateIdCounter.getAsync(account)) ?? 0;
      const nextId = currentId + 1;
      await this.stateIdCounter.set(account, nextId);
      return nextId;
    });
  }

  /**
   * Creates a storage key for state/blob data.
   */
  private makeKey(account: string, stateId: number): string {
    return `${account}-${stateId.toString().padStart(10, '0')}`;
  }

  /**
   * Saves a single transaction state for a specific account.
   * Blobs are not stored here, use saveBlobs instead.
   * @param account - The sender account address
   * @param state - Transaction state to save
   */
  public async saveState(account: string, state: L1TxState): Promise<L1TxState> {
    const key = this.makeKey(account, state.id);

    const serializable = this.serializeState(state);
    await this.states.set(key, jsonStringify(serializable));
    this.log.debug(`Saved tx state ${state.id} for account ${account} with nonce ${state.nonce}`);

    return state as L1TxState;
  }

  /**
   * Saves blobs for a given state.
   * @param account - The sender account address
   * @param stateId - The state ID
   * @param blobInputs - Blob inputs to save
   */
  public async saveBlobs(account: string, stateId: number, blobInputs: L1BlobInputs | undefined): Promise<void> {
    if (!blobInputs) {
      return;
    }
    const key = this.makeKey(account, stateId);
    const blobData = this.serializeBlobInputs(blobInputs);
    await this.blobs.set(key, jsonStringify(blobData));
    this.log.debug(`Saved blobs for state ${stateId} of account ${account}`);
  }

  /**
   * Loads all transaction states for a specific account.
   * @param account - The sender account address
   * @returns Array of transaction states with their IDs
   */
  public async loadStates(account: string): Promise<L1TxState[]> {
    const states: L1TxState[] = [];
    const prefix = `${account}-`;

    for await (const [key, stateJson] of this.states.entriesAsync({ start: prefix, end: `${prefix}Z` })) {
      const [keyAccount, stateIdStr] = key.split('-');
      if (keyAccount !== account) {
        throw new Error(`Mismatched account in key: expected ${account} but got ${keyAccount}`);
      }

      const stateId = parseInt(stateIdStr, 10);

      try {
        const serialized: SerializableL1TxState = JSON.parse(stateJson);

        // Load blobs if they exist
        let blobInputs: L1BlobInputs | undefined;
        if (serialized.hasBlobInputs) {
          const blobJson = await this.blobs.getAsync(key);
          if (blobJson) {
            blobInputs = this.deserializeBlobInputs(JSON.parse(blobJson), serialized.blobMetadata);
          }
        }

        const state = this.deserializeState(serialized, blobInputs);
        states.push({ ...state, id: stateId });
      } catch (err) {
        this.log.error(`Failed to deserialize state ${key}`, err);
      }
    }

    // Sort by ID
    states.sort((a, b) => a.id - b.id);

    this.log.debug(`Loaded ${states.length} tx states for account ${account}`);
    return states;
  }

  /**
   * Loads a single state by ID.
   * @param account - The sender account address
   * @param stateId - The state ID
   * @returns The transaction state or undefined if not found
   */
  public async loadState(account: string, stateId: number): Promise<L1TxState | undefined> {
    const key = this.makeKey(account, stateId);
    const stateJson = await this.states.getAsync(key);

    if (!stateJson) {
      return undefined;
    }

    try {
      const serialized: SerializableL1TxState = JSON.parse(stateJson);

      // Load blobs if they exist
      let blobInputs: L1BlobInputs | undefined;
      if (serialized.hasBlobInputs) {
        const blobJson = await this.blobs.getAsync(key);
        if (blobJson) {
          blobInputs = this.deserializeBlobInputs(JSON.parse(blobJson), serialized.blobMetadata);
        }
      }

      const state = this.deserializeState(serialized, blobInputs);
      return { ...state, id: stateId };
    } catch (err) {
      this.log.error(`Failed to deserialize state ${key}`, err);
      return undefined;
    }
  }

  /**
   * Deletes a specific state and its associated blobs.
   * @param account - The sender account address
   * @param stateId - The state ID to delete
   */
  public async deleteState(account: string, stateId: number): Promise<void> {
    const key = this.makeKey(account, stateId);
    await this.states.delete(key);
    await this.blobs.delete(key);
    this.log.debug(`Deleted state ${stateId} for account ${account}`);
  }

  /**
   * Clears all transaction states for a specific account.
   * @param account - The sender account address
   */
  public async clearStates(account: string): Promise<void> {
    const states = await this.loadStates(account);

    for (const state of states) {
      await this.deleteState(account, state.id);
    }

    await this.stateIdCounter.delete(account);
    this.log.info(`Cleared all tx states for account ${account}`);
  }

  /**
   * Gets all accounts that have stored states.
   * @returns Array of account addresses
   */
  public async getAllAccounts(): Promise<string[]> {
    const accounts = new Set<string>();

    for await (const [key] of this.states.entriesAsync()) {
      const account = key.substring(0, key.lastIndexOf('-'));
      accounts.add(account);
    }

    return Array.from(accounts);
  }

  /**
   * Closes the store.
   */
  public async close(): Promise<void> {
    await this.store.close();
    this.log.info('Closed L1 tx state store');
  }

  /**
   * Serializes an L1TxState for storage.
   */
  private serializeState(state: L1TxState): SerializableL1TxState {
    const txConfigOverrides: SerializableL1TxConfig = {
      ...state.txConfigOverrides,
      gasLimit: state.txConfigOverrides.gasLimit?.toString(),
      txTimeoutAt: state.txConfigOverrides.txTimeoutAt?.getTime(),
    };

    return {
      id: state.id,
      txHashes: state.txHashes,
      cancelTxHashes: state.cancelTxHashes,
      gasLimit: state.gasLimit.toString(),
      gasPrice: {
        maxFeePerGas: state.gasPrice.maxFeePerGas.toString(),
        maxPriorityFeePerGas: state.gasPrice.maxPriorityFeePerGas.toString(),
        maxFeePerBlobGas: state.gasPrice.maxFeePerBlobGas?.toString(),
      },
      txConfigOverrides,
      request: {
        ...state.request,
        value: state.request.value?.toString(),
      },
      status: state.status,
      nonce: state.nonce,
      sentAt: state.sentAtL1Ts.getTime(),
      lastSentAt: state.lastSentAtL1Ts.getTime(),
      receipt: state.receipt,
      hasBlobInputs: state.blobInputs !== undefined,
      blobMetadata: state.blobInputs?.maxFeePerBlobGas
        ? { maxFeePerBlobGas: state.blobInputs.maxFeePerBlobGas.toString() }
        : undefined,
    };
  }

  /**
   * Deserializes a stored state back to L1TxState.
   */
  private deserializeState(stored: SerializableL1TxState, blobInputs?: L1BlobInputs): L1TxState {
    const txConfigOverrides: L1TxConfig = {
      ...stored.txConfigOverrides,
      gasLimit: stored.txConfigOverrides.gasLimit !== undefined ? BigInt(stored.txConfigOverrides.gasLimit) : undefined,
      txTimeoutAt:
        stored.txConfigOverrides.txTimeoutAt !== undefined ? new Date(stored.txConfigOverrides.txTimeoutAt) : undefined,
    };

    const receipt = stored.receipt
      ? {
          ...stored.receipt,
          blockNumber: BigInt(stored.receipt.blockNumber),
          cumulativeGasUsed: BigInt(stored.receipt.cumulativeGasUsed),
          effectiveGasPrice: BigInt(stored.receipt.effectiveGasPrice),
          gasUsed: BigInt(stored.receipt.gasUsed),
        }
      : undefined;

    return {
      id: stored.id,
      txHashes: stored.txHashes as `0x${string}`[],
      cancelTxHashes: stored.cancelTxHashes as `0x${string}`[],
      gasLimit: BigInt(stored.gasLimit),
      gasPrice: {
        maxFeePerGas: BigInt(stored.gasPrice.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(stored.gasPrice.maxPriorityFeePerGas),
        maxFeePerBlobGas: stored.gasPrice.maxFeePerBlobGas ? BigInt(stored.gasPrice.maxFeePerBlobGas) : undefined,
      },
      txConfigOverrides,
      request: {
        to: stored.request.to as `0x${string}` | null,
        data: stored.request.data as `0x${string}` | undefined,
        value: stored.request.value ? BigInt(stored.request.value) : undefined,
      },
      status: stored.status,
      nonce: stored.nonce,
      sentAtL1Ts: new Date(stored.sentAt),
      lastSentAtL1Ts: new Date(stored.lastSentAt),
      receipt,
      blobInputs,
    };
  }

  /**
   * Serializes blob inputs for separate storage.
   */
  private serializeBlobInputs(blobInputs: L1BlobInputs): SerializableBlobInputs {
    return {
      blobs: blobInputs.blobs.map(b => Buffer.from(b).toString('base64')),
      kzg: jsonStringify(blobInputs.kzg),
    };
  }

  /**
   * Deserializes blob inputs from storage, combining blob data with metadata.
   */
  private deserializeBlobInputs(stored: SerializableBlobInputs, metadata?: SerializableBlobMetadata): L1BlobInputs {
    const blobInputs: L1BlobInputs = {
      blobs: stored.blobs.map(b => new Uint8Array(Buffer.from(b, 'base64'))),
      kzg: JSON.parse(stored.kzg),
    };

    if (metadata?.maxFeePerBlobGas) {
      blobInputs.maxFeePerBlobGas = BigInt(metadata.maxFeePerBlobGas);
    }

    return blobInputs;
  }
}
