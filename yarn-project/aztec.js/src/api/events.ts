import { DomainSeparator } from '@aztec/constants';
import { type EventMetadataDefinition, decodeFromAbi } from '@aztec/stdlib/abi';
import { computeLogTag } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { type PublicLogsQuery, Tag, queryAllPublicLogsByTags } from '@aztec/stdlib/logs';

import type { PublicEvent, PublicEventFilter } from '../wallet/wallet.js';

/** Result of a public event query. */
export type GetPublicEventsResult<T> = {
  /** The decoded events with metadata. */
  events: PublicEvent<T>[];
  /** Currently unused, always `false`. Retained for API stability. */
  maxLogsHit: boolean;
};

/**
 * Returns decoded public events given search parameters.
 * @param node - The node to request events from.
 * @param eventMetadataDef - Metadata of the event. This should be the class generated from the contract.
 *   e.g. `Contract.events.Event`.
 * @param filter - Filter options for the event query:
 *   - `contractAddress`: The address of the contract that emitted the events. Required.
 *   - `txHash`: Transaction in which the events were emitted (mutually exclusive with `fromBlock`/`toBlock`).
 *   - `fromBlock`: The block number from which to start fetching events (inclusive). Optional.
 *   - `toBlock`: The block number until which to fetch events (not inclusive). Optional.
 *   - `afterLog`: Log cursor to resume strictly after. Optional. When set, only events after this cursor
 *     are returned.
 * @returns All decoded events with metadata, plus `maxLogsHit=false` (retained for backwards compatibility).
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

  const query: PublicLogsQuery = {
    contractAddress: filter.contractAddress,
    tags: [filter.afterLog !== undefined ? { tag: logTag, afterLog: filter.afterLog } : logTag],
    fromBlock: filter.fromBlock,
    toBlock: filter.toBlock,
    txHash: filter.txHash,
  };

  const [logsForTag] = await queryAllPublicLogsByTags(node, query);
  const events: PublicEvent<T>[] = logsForTag.map(log => ({
    event: decodeFromAbi([eventMetadataDef.abiType], log.logData.slice(1)) as T,
    metadata: {
      l2BlockNumber: log.blockNumber,
      l2BlockHash: log.blockHash,
      txHash: log.txHash,
      contractAddress: filter.contractAddress,
    },
  }));

  // Note we use `queryAllPublicLogsByTags`, so there will never be logs pending pagination, hence `maxLogsHit` is set
  // to `false`. We keep the return shape for backwards compatibility.
  return { events, maxLogsHit: false };
}
