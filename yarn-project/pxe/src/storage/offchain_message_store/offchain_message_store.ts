import type { IncomingOffchainMessage } from '@aztec/aztec.js/wallet';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { type OffchainMessageStatus, StoredOffchainMessage } from './stored_offchain_message.js';

/**
 * Persistence layer for offchain messages ingested by the PXE.
 *
 * Ingesting messages (via `addIncomingMessages`) does not require staged writes or job coordination: messages are added before
 * `sync_state` runs, so there's no concurrency concern with discovery jobs.
 *
 * Status changes (processed, invalid, expired) are staged per-job and only committed when the job succeeds. This
 * ensures that if a job fails after the oracle fetches messages but before Noir finishes processing them, the messages
 * remain pending and are retried on the next sync.
 *
 * Reorgs do not require rollback: offchain messages are validated against the chain each time they're fetched by the
 * oracle, so a reorg just means the message stays pending until the tx reappears (or expires). If processing an
 * offline message results in notes or events being discovered, eventually a re-org will wipe out those, which doesn't
 * change the fact that said message was effectively processed.
 */
export class OffchainMessageStore implements StagedStore {
  readonly storeName = 'offchain_message_store';

  /** Main storage: key (contractAddress|appMessageId) -> serialized StoredOffchainMessage. */
  #messages: AztecAsyncMap<string, Buffer>;

  /** Index: contract address -> message key, for efficient lookup. */
  #messageIdsByContract: AztecAsyncMultiMap<string, string>;

  #store: AztecAsyncKVStore;

  /** Staged status changes per job: jobId -> (message id -> new status). */
  #stagedStatusChanges: Map<string, Map<string, OffchainMessageStatus>> = new Map();

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#messages = store.openMap('offchain_messages');
    this.#messageIdsByContract = store.openMultiMap('offchain_messages_by_contract');
  }

  /**
   * Stores offchain messages for subsequent processing.
   *
   * Deduplicates by key (contractAddress|appMessageId). Records ingestedAt timestamp for eventual expiration. If a
   * message with the same key already exists, it is not overwritten.
   *
   * Not staged: ingestion happens outside of job execution.
   */
  async addIncomingMessages(messages: IncomingOffchainMessage[]): Promise<void> {
    await this.#store.transactionAsync(async () => {
      for (const msg of messages) {
        const key = `${msg.offchainEffect.contractAddress}|${msg.appMessageId}`;
        const existing = await this.#messages.getAsync(key);
        if (existing) {
          // Skip if already stored
          continue;
        }

        const stored = StoredOffchainMessage.fromMessage(msg);
        await this.#messages.set(key, stored.toBuffer());
        await this.#messageIdsByContract.set(msg.offchainEffect.contractAddress.toString(), key);
      }
    });
  }

  /**
   * Returns all pending messages for a given contract address.
   *
   * When `jobId` is provided, also excludes messages that have been staged as non-pending for that job. This prevents
   * a message from being processed twice if the oracle is called multiple times within the same job.
   */
  async getPendingByContract(contractAddress: AztecAddress, jobId?: string): Promise<IncomingOffchainMessage[]> {
    const results: IncomingOffchainMessage[] = [];
    const stagedForJob = jobId ? this.#stagedStatusChanges.get(jobId) : undefined;
    const contractAddressStr = contractAddress.toString();
    const keyPrefix = `${contractAddressStr}|`;

    const keys: string[] = [];
    for await (const key of this.#messageIdsByContract.getValuesAsync(contractAddressStr)) {
      keys.push(key);
    }

    for (const key of keys) {
      const stagedStatus = stagedForJob?.get(key);
      if (stagedStatus && stagedStatus !== 'pending') {
        continue;
      }

      const buf = await this.#messages.getAsync(key);
      if (!buf) {
        continue;
      }

      const stored = StoredOffchainMessage.fromBuffer(buf);
      if (stored.status === 'pending') {
        const appMessageId = key.slice(keyPrefix.length);
        results.push({ ...stored.offchainMessage, appMessageId });
      }
    }

    return results;
  }

  markProcessed(keys: string[], jobId: string): void {
    this.#stageStatusChange(keys, 'processed', jobId);
  }

  markInvalid(keys: string[], jobId: string): void {
    this.#stageStatusChange(keys, 'invalid', jobId);
  }

  markExpired(keys: string[], jobId: string): void {
    this.#stageStatusChange(keys, 'expired', jobId);
  }

  /** Stages a message as expired if it was ingested more than `maxAgeMs` ago. Returns true if expired. */
  async markExpiredIfStale(key: string, maxAgeMs: number, jobId: string): Promise<boolean> {
    const buf = await this.#messages.getAsync(key);
    if (!buf) {
      return false;
    }
    const stored = StoredOffchainMessage.fromBuffer(buf);
    if (Date.now() - stored.ingestedAt > maxAgeMs) {
      this.#stageStatusChange([key], 'expired', jobId);
      return true;
    }
    return false;
  }

  #stageStatusChange(keys: string[], status: OffchainMessageStatus, jobId: string): void {
    let staged = this.#stagedStatusChanges.get(jobId);
    if (!staged) {
      staged = new Map();
      this.#stagedStatusChanges.set(jobId, staged);
    }
    for (const key of keys) {
      staged.set(key, status);
    }
  }

  /** Commits staged status changes to the DB. Called by JobCoordinator within a transaction. */
  async commit(jobId: string): Promise<void> {
    const staged = this.#stagedStatusChanges.get(jobId);
    if (!staged) {
      return;
    }

    for (const [key, status] of staged) {
      const buf = await this.#messages.getAsync(key);
      if (!buf) {
        continue;
      }

      const stored = StoredOffchainMessage.fromBuffer(buf);
      stored.status = status;
      await this.#messages.set(key, stored.toBuffer());
    }

    this.#stagedStatusChanges.delete(jobId);
  }

  /** Discards staged status changes for the given job. */
  discardStaged(jobId: string): Promise<void> {
    this.#stagedStatusChanges.delete(jobId);
    return Promise.resolve();
  }
}
