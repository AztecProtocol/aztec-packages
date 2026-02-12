import { type EventMetadataDefinition, EventSelector, decodeFromAbi } from '@aztec/stdlib/abi';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { PublicEvent, PublicEventFilter } from '../wallet/wallet.js';

/**
 * Returns decoded public events given search parameters.
 * @param node - The node to request events from
 * @param eventMetadataDef - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
 * @param filter - Filter options for the event query:
 *   - `contractAddress`: The address of the contract that emitted the events.
 *   - `txHash`: Transaction in which the events were emitted.
 *   - `fromBlock`: The block number from which to start fetching events (inclusive). Defaults to 1.
 *   - `toBlock`: The block number until which to fetch events (not inclusive). Defaults to latest + 1.
 * @returns - The decoded events with metadata.
 */
export async function getPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  filter: PublicEventFilter,
): Promise<PublicEvent<T>[]> {
  const { logs } = await node.getPublicLogs({
    fromBlock: filter.fromBlock ? Number(filter.fromBlock) : undefined,
    toBlock: filter.toBlock ? Number(filter.toBlock) : undefined,
    txHash: filter.txHash,
    contractAddress: filter.contractAddress,
  });

  const decodedEvents: PublicEvent<T>[] = [];

  for (const log of logs) {
    const logFields = log.log.getEmittedFields();
    // Event selector is at the last position of the emitted fields
    const logEventSelector = EventSelector.fromField(logFields[logFields.length - 1]);

    if (!logEventSelector.equals(eventMetadataDef.eventSelector)) {
      continue;
    }

    decodedEvents.push({
      event: decodeFromAbi([eventMetadataDef.abiType], log.log.fields) as T,
      metadata: {
        l2BlockNumber: log.id.blockNumber,
        l2BlockHash: log.id.blockHash,
        txHash: log.id.txHash,
        contractAddress: log.log.contractAddress,
      },
    });
  }

  return decodedEvents;
}
