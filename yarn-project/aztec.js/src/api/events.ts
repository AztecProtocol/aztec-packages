import { type EventMetadataDefinition, EventSelector, decodeFromAbi } from '@aztec/stdlib/abi';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Returns decoded public events given search parameters.
 * @param node - The node to request events from
 * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
 * @param from - The block number to search from.
 * @param limit - The amount of blocks to search.
 * @returns - The deserialized events.
 */
export async function getDecodedPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  from: number,
  limit: number,
): Promise<T[]> {
  const { logs } = await node.getPublicLogs({
    fromBlock: from,
    toBlock: from + limit,
  });

  const decodedEvents = logs
    .map(log => {
      // +1 for the event selector
      const expectedLength = eventMetadataDef.fieldNames.length + 1;
      if (log.log.fields.length !== expectedLength) {
        throw new Error(
          `Something is weird here, we have matching EventSelectors, but the actual payload has mismatched length. Expected ${expectedLength}. Got ${log.log.fields.length}.`,
        );
      }

      const logFields = log.log.getEmittedFields();
      // We are assuming here that event logs are the last 4 bytes of the event. This is not enshrined but is a function of aztec.nr raw log emission.
      if (!EventSelector.fromField(logFields[logFields.length - 1]).equals(eventMetadataDef.eventSelector)) {
        return undefined;
      }

      return decodeFromAbi([eventMetadataDef.abiType], log.log.fields) as T;
    })
    .filter(log => log !== undefined) as T[];

  return decodedEvents;
}
