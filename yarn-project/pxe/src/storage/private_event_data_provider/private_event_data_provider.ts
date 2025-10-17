import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TxHash } from '@aztec/stdlib/tx';

/**
 * Internal storage format for a private event log entry.
 *
 * @remarks
 * Private event entries are stored with their content serialized to a buffer for efficient
 * storage, along with metadata for ordering and deduplication.
 */
interface PrivateEventEntry {
  /** The serialized event content (array of field elements) */
  msgContent: Buffer;
  /** The block number in which this event was emitted */
  blockNumber: number;
  /** Unique index in the event commitment tree, used for deduplication and ordering */
  eventCommitmentIndex: number;
}

/**
 * Manages storage and retrieval of decrypted private event logs for the PXE.
 *
 * @remarks
 * PrivateEventDataProvider stores private events that have been successfully decrypted
 * by the PXE. Unlike notes (which represent transferable value), events are informational
 * logs emitted by contracts during execution.
 *
 * Key features:
 * - **Deduplication**: Uses event commitment index to prevent storing duplicate events
 * - **Efficient indexing**: Multi-dimensional index by contract, recipient, and event selector
 * - **Ordered retrieval**: Events are returned in commitment index order for consistency
 * - **Scoped queries**: Supports filtering by multiple recipients and block ranges
 *
 * The provider uses a three-tier storage architecture:
 * 1. Main event storage (array of events)
 * 2. Lookup index (contract_recipient_selector → array of event indices)
 * 3. Seen log tracking (eventCommitmentIndex → boolean) for deduplication
 *
 * This design optimizes for the common query pattern: "get all events of type X for
 * recipients Y from contract Z in block range [A, B]".
 */
export class PrivateEventDataProvider {
  /** The underlying key-value store for persistence */
  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /**
   * Index mapping query keys to event array indices.
   * @remarks
   * Key format: `${contractAddress}_${recipient}_${eventSelector}`
   * Value: Array of indices into the #eventLogs array
   * This enables efficient lookup of all events matching a specific contract/recipient/selector combination.
   */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /**
   * Deduplication tracking using event commitment indices.
   * @remarks
   * The event commitment index is globally unique and serves as an idempotency key.
   * Before storing an event, we check this map to avoid duplicate storage.
   */
  #seenLogs: AztecAsyncMap<number, boolean>;

  /** Logger instance for debugging and monitoring */
  logger = createLogger('private_event_data_provider');

  /**
   * Creates a new PrivateEventDataProvider.
   *
   * @param store - The key-value store for persistent storage
   */
  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#seenLogs = this.#store.openMap('seen_logs');
  }

  /**
   * Stores a decrypted private event log.
   *
   * @param contractAddress - The address of the contract that emitted the event
   * @param recipient - The account that decrypted this event (the intended recipient)
   * @param eventSelector - The event type identifier
   * @param msgContent - The event content as an array of field elements
   * @param txHash - The transaction hash containing this event (used for logging only)
   * @param eventCommitmentIndex - Unique index in the event commitment tree
   * @param blockNumber - The block number in which the event was emitted
   * @remarks
   * This method implements idempotent storage using the eventCommitmentIndex as a unique key.
   * If an event with the same commitment index has already been stored, the duplicate is
   * silently ignored.
   *
   * The storage process:
   * 1. Check if this event has been seen before (by commitment index)
   * 2. If not seen, append to the event log array
   * 3. Add the array index to the lookup index under the key (contract, recipient, selector)
   * 4. Mark the commitment index as seen
   *
   * All operations are atomic - if the transaction fails, no partial state is persisted.
   *
   * The event content is serialized to a buffer for efficient storage, and will be
   * deserialized back to field elements when retrieved.
   */
  storePrivateEventLog(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    eventSelector: EventSelector,
    msgContent: Fr[],
    txHash: TxHash,
    eventCommitmentIndex: number,
    blockNumber: number,
  ): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;

      // Check if this exact log has already been stored using eventCommitmentIndex as unique identifier
      const hasBeenSeen = await this.#seenLogs.getAsync(eventCommitmentIndex);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, recipient, msgContent, blockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({
        msgContent: serializeToBuffer(msgContent),
        blockNumber,
        eventCommitmentIndex,
      });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Mark this log as seen using eventCommitmentIndex
      await this.#seenLogs.set(eventCommitmentIndex, true);
    });
  }

  /**
   * Retrieves private events matching the specified criteria.
   *
   * @param contractAddress - The contract address to query events from
   * @param from - Starting block number (inclusive)
   * @param numBlocks - Number of blocks to search (creates range [from, from + numBlocks))
   * @param recipients - Array of recipient addresses (events decrypted by any of these)
   * @param eventSelector - The event type to filter by
   * @returns Array of event contents, each represented as an array of field elements
   * @remarks
   * This method queries events across multiple recipients efficiently by:
   * 1. For each recipient, using the index to find matching events
   * 2. Filtering by the specified block range
   * 3. Combining and deduplicating results across recipients
   * 4. Sorting by event commitment index for consistent ordering
   *
   * The block range is half-open: [from, from + numBlocks), meaning events in block
   * `from + numBlocks` are excluded.
   *
   * Events are returned in commitment index order, which corresponds to their creation
   * order in the blockchain. This ensures deterministic and reproducible results.
   *
   * If a recipient has no events matching the criteria, it contributes nothing to the
   * result set (no error is thrown).
   */
  public async getPrivateEvents(
    contractAddress: AztecAddress,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
    eventSelector: EventSelector,
  ): Promise<Fr[][]> {
    const events: Array<{ msgContent: Fr[]; blockNumber: number; eventCommitmentIndex: number }> = [];

    for (const recipient of recipients) {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || entry.blockNumber < from || entry.blockNumber >= from + numBlocks) {
          continue;
        }

        // Convert buffer back to Fr array
        const reader = BufferReader.asReader(entry.msgContent);
        const numFields = entry.msgContent.length / Fr.SIZE_IN_BYTES;
        const msgContent = reader.readArray(numFields, Fr);

        events.push({
          msgContent,
          blockNumber: entry.blockNumber,
          eventCommitmentIndex: entry.eventCommitmentIndex,
        });
      }
    }

    // Sort by eventCommitmentIndex only
    events.sort((a, b) => a.eventCommitmentIndex - b.eventCommitmentIndex);

    return events.map(e => e.msgContent);
  }
}
