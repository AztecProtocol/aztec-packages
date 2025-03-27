import { sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { DataProvider } from '../data_provider.js';

interface PrivateEventEntry {
  logContent: Buffer;
  blockNumber: number;
}

/**
 * Stores decrypted private event logs.
 */
export class PrivateEventDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_recipient_eventSelector to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /**
   * Map from tag to array of event log hashes.
   * @dev A single tag can map to multiple hashes because we don't have a guarantee that tags won't be reused.
   */
  #tagToLogHashes: AztecAsyncMap<string, Buffer[]>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#tagToLogHashes = this.#store.openMap('tag_to_log_hashes');
  }

  /**
   * Store a private event log.
   * @param tag - The tag of the event log.
   * @param contractAddress - The address of the contract that emitted the event.
   * @param recipient - The recipient of the event.
   * @param eventSelector - The event selector of the event.
   * @param logContent - The content of the event.
   * @param blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    tag: Fr,
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    eventSelector: EventSelector,
    logContent: Fr[],
    blockNumber: number,
  ): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;

      // Since we don't have a guarantee that the event log will be processed only once, we need to check whether
      // the log has already been stored under the same tag to not have duplicate entries. It could also happen that
      // there is a different log under the same tag, so we need to check for that as well.
      const tagStr = tag.toString();
      const logHash = sha256(serializeToBuffer([eventSelector.toField(), ...logContent]));

      // Check if events with this tag already exist
      const existingHashes = (await this.#tagToLogHashes.getAsync(tagStr)) || [];
      const isDuplicate = existingHashes.some(hash => hash.equals(logHash));

      if (isDuplicate) {
        // Duplicate events are expected since the tagging scheme looks back through tag indices,
        // which can result in the same event being processed multiple times
        this.logger.verbose('Ignoring duplicate event with same tag and content', { tag: tagStr });
        return;
      } else if (existingHashes.length > 0) {
        // We've stumbled upon a tag which already has a content stored for it but the content is different.
        // This can also occur because we don't have a guarantee that indexes won't be re-used.
        this.logger.verbose('Event with same tag but different content detected', { tag: tagStr });
      }

      this.logger.verbose('storing private event log', { contractAddress, recipient, logContent, blockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({ logContent: serializeToBuffer(logContent), blockNumber });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Store tag->content hash mapping
      await this.#tagToLogHashes.set(tagStr, [...existingHashes, logHash]);
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param contractAddress - The address of the contract to get events from.
   * @param from - The block number to search from.
   * @param numBlocks - The amount of blocks to search.
   * @param recipients - The addresses that decrypted the logs.
   * @param eventSelector - The event selector to filter by.
   * @returns - The event log contents.
   */
  public async getPrivateEvents(
    contractAddress: AztecAddress,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
    eventSelector: EventSelector,
  ): Promise<Fr[][]> {
    const events: Fr[][] = [];

    for (const recipient of recipients) {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || entry.blockNumber < from || entry.blockNumber >= from + numBlocks) {
          continue;
        }

        // Convert buffer back to Fr array
        const reader = BufferReader.asReader(entry.logContent);
        const numFields = entry.logContent.length / Fr.SIZE_IN_BYTES;
        const logContent = reader.readArray(numFields, Fr);

        events.push(logContent);
      }
    }

    return events;
  }

  getSize(): Promise<number> {
    return this.#eventLogs.lengthAsync();
  }
}
