import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
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
  /** Map from contract_address_recipient to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /**
   * Map from tag to array of event log contents.
   * @dev A single tag can map to multiple contents because we don't have a guarantee that tag indices won't be reused.
   */
  #tagToContent: AztecAsyncMap<string, Buffer[]>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#tagToContent = this.#store.openMap('tag_to_content');
  }

  /**
   * Store a private event log.
   * @param tag - The tag of the event log.
   * @param contractAddress - The address of the contract that emitted the event.
   * @param recipient - The recipient of the event.
   * @param logContent - The content of the event.
   * @param blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    tag: Fr,
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    logContent: Fr[],
    blockNumber: number,
  ): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}`;
      const logContentBuffer = serializeToBuffer(logContent);
      const tagStr = tag.toString();

      // Check if events with this tag already exist
      const existingContents = (await this.#tagToContent.getAsync(tagStr)) || [];
      const isDuplicate = existingContents.some(content => content.equals(logContentBuffer));

      if (isDuplicate) {
        // Duplicate events are expected since the tagging scheme looks back through tag indices,
        // which can result in the same event being processed multiple times
        this.logger.verbose('Ignoring duplicate event with same tag and content', { tag: tagStr });
        return;
      } else if (existingContents.length > 0) {
        // We've stumbled upon a tag which already has a content stored for it but the content is different.
        // This can also occur because we don't have a guarantee that indexes won't be re-used.
        this.logger.verbose('Event with same tag but different content detected', { tag: tagStr });
      }

      this.logger.verbose('storing private event log', { contractAddress, recipient, logContent, blockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({ logContent: logContentBuffer, blockNumber });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Store tag->content mapping
      await this.#tagToContent.set(tagStr, [...existingContents, logContentBuffer]);
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param contractAddress - The address of the contract to get events from.
   * @param from - The block number to search from.
   * @param numBlocks - The amount of blocks to search.
   * @param recipients - The addresses that decrypted the logs.
   * @returns - The event log contents.
   */
  public async getPrivateEvents(
    contractAddress: AztecAddress,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
  ): Promise<Fr[][]> {
    const events: Fr[][] = [];

    for (const recipient of recipients) {
      const key = `${contractAddress.toString()}_${recipient.toString()}`;
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
