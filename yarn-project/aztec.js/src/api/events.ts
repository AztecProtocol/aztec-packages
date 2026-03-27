import { DomainSeparator } from '@aztec/constants';
import { type EventMetadataDefinition, decodeFromAbi } from '@aztec/stdlib/abi';
import { computeLogTag } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PublicEvent, PublicEventFilter } from '../wallet/wallet.js';

/** Result of a paginated public event query. */
export type GetPublicEventsResult<T> = {
  /** The decoded events with metadata. */
  events: PublicEvent<T>[];
  /** Whether the log limit was reached, indicating more results may be available. */
  maxLogsHit: boolean;
};

/**
 * Returns decoded public events given search parameters.
 * @param node - The node to request events from
 * @param eventMetadataDef - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
 * @param filter - Filter options for the event query:
 *   - `contractAddress`: The address of the contract that emitted the events.
 *   - `txHash`: Transaction in which the events were emitted.
 *   - `fromBlock`: The block number from which to start fetching events (inclusive). Defaults to 1.
 *   - `toBlock`: The block number until which to fetch events (not inclusive). Defaults to latest + 1.
 *   - `afterLog`: Log id after which to start fetching logs. Used for pagination.
 * @returns The decoded events with metadata and a flag indicating if more results are available.
 */
export async function getPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  filter: PublicEventFilter,
): Promise<GetPublicEventsResult<T>> {
  // Public events are tagged with a domain-separated hash of their event type ID, so we compute
  // the same hash here to filter for logs of the requested event type.
  const logTag = await computeLogTag(eventMetadataDef.eventSelector.toField(), DomainSeparator.EVENT_LOG_TAG);

  const { logs, maxLogsHit } = await node.getPublicLogs({
    fromBlock: filter.fromBlock ? Number(filter.fromBlock) : undefined,
    toBlock: filter.toBlock ? Number(filter.toBlock) : undefined,
    txHash: filter.txHash,
    contractAddress: filter.contractAddress,
    afterLog: filter.afterLog,
    tag: logTag,
  });

  const events: PublicEvent<T>[] = [];

  for (const log of logs) {
    const logFieldsWithoutTag = log.log.getEmittedFieldsWithoutTag();

    events.push({
      event: decodeFromAbi([eventMetadataDef.abiType], logFieldsWithoutTag) as T,
      metadata: {
        l2BlockNumber: log.id.blockNumber,
        l2BlockHash: log.id.blockHash,
        txHash: log.id.txHash,
        contractAddress: log.log.contractAddress,
      },
    });
  }

  return { events, maxLogsHit };
}
