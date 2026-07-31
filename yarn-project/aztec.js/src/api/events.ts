import { DomainSeparator } from '@aztec/constants';
import { type EventMetadataDefinition, decodeFromAbi } from '@aztec/stdlib/abi';
import { computeLogTag } from '@aztec/stdlib/hash';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { LogCursor, type PublicLogsQuery, Tag } from '@aztec/stdlib/logs';

import type { PublicEvent, PublicEventFilter } from '../wallet/wallet.js';
import { EventCursor } from './event_cursor.js';

export { EventCursor };

/** Result of a single page of a public event query. */
export type GetPublicEventsResult<T> = {
  /** The decoded events with metadata. At most `MAX_LOGS_PER_TAG` (the node's per-tag page size). */
  events: PublicEvent<T>[];
  /**
   * If present, use it to fetch the next page by setting `afterEvent` to it. Absent when all events in the range have
   * been returned.
   */
  nextCursor?: EventCursor;
};

/**
 * Returns a page of decoded public events given search parameters.
 *
 * A single call returns at most `MAX_LOGS_PER_TAG` events (the node's per-tag page size). When more events exist,
 * `nextCursor` points past the last returned event. Pass it as `afterEvent` to fetch the next page. When `nextCursor`
 * is absent, all events in the range have been returned.
 *
 * @param node - The node to request events from.
 * @param eventMetadataDef - Metadata of the event. This should be the class generated from the contract.
 *   e.g. `Contract.events.Event`.
 * @param filter - Filter options for the event query:
 *   - `contractAddress`: The address of the contract that emitted the events. Required.
 *   - `txHash`: Transaction in which the events were emitted (mutually exclusive with `fromBlock`/`toBlock`).
 *   - `fromBlock`: The block number from which to start fetching events (inclusive). Optional.
 *   - `toBlock`: The block number until which to fetch events (not inclusive). Optional.
 *   - `afterEvent`: Cursor to resume strictly after. Optional. When set, only events after this cursor
 *     are returned.
 * @returns A page of decoded events with metadata, plus a `nextCursor` to continue (absent when done).
 */
export async function getPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  filter: PublicEventFilter,
): Promise<GetPublicEventsResult<T>> {
  // Public events are tagged with a domain-separated hash of their event type ID, so we compute
  // the same hash here to filter for logs of the requested event type.
  const logTagField = await computeLogTag(eventMetadataDef.eventSelector.toField(), DomainSeparator.EVENT_LOG_TAG);
  const logTag = new Tag(logTagField);

  const afterLog = filter.afterEvent?.toLogCursor();
  const query: PublicLogsQuery = {
    contractAddress: filter.contractAddress,
    tags: [afterLog !== undefined ? { tag: logTag, afterLog } : logTag],
    fromBlock: filter.fromBlock,
    toBlock: filter.toBlock,
    txHash: filter.txHash,
  };

  const [logsForTag] = await node.getPublicLogsByTags(query);
  const events: PublicEvent<T>[] = logsForTag.map(log => ({
    event: decodeFromAbi(eventMetadataDef.abiType, log.logData.slice(1)) as T,
    metadata: {
      l2BlockNumber: log.blockNumber,
      l2BlockHash: log.blockHash,
      txHash: log.txHash,
      contractAddress: filter.contractAddress,
    },
  }));

  const nextCursor =
    logsForTag.length === MAX_LOGS_PER_TAG
      ? EventCursor.fromLogCursor(LogCursor.fromLog(logsForTag[logsForTag.length - 1]))
      : undefined;

  return { events, nextCursor };
}
