import { type BlockNumber, BlockNumberPositiveSchema } from '@aztec/foundation/branded-types';
import { type AbiDecoded, type EventMetadataDefinition, EventSelector, decodeFromAbi } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { AbiDecodedSchema, type ZodFor, schemas } from '@aztec/stdlib/schemas';
import { type InTx, TxHash, inTxSchema } from '@aztec/stdlib/tx';

import { optional, z } from 'zod';

import { sanitizeEventFilter } from './event_filter_validator.js';

/**
 * Filter options when querying events.
 */
export type EventFilter = {
  /** The address of the contract that emitted the events. */
  contractAddress?: AztecAddress;
  /** Transaction in which the events were emitted. */
  txHash?: TxHash;
  /** The block number from which to start fetching events (inclusive).
   * Optional. If provided, it must be greater or equal than 1.
   * Defaults to the initial L2 block number (INITIAL_L2_BLOCK_NUM).
   * */
  fromBlock?: BlockNumber;
  /** The block number until which to fetch logs (not inclusive).
   * Optional. If provided, it must be greater than fromBlock.
   * Defaults to the latest known block to PXE + 1.
   */
  toBlock?: BlockNumber;
};

export const EventFilterSchema = z.object({
  contractAddress: schemas.AztecAddress,
  txHash: optional(TxHash.schema),
  fromBlock: optional(BlockNumberPositiveSchema),
  toBlock: optional(BlockNumberPositiveSchema),
});

/**
 * Filter options when querying private events.
 */
export type PrivateEventFilter = EventFilter & {
  /** The address of the contract that emitted the events. */
  contractAddress: AztecAddress;
  /** Addresses of accounts that are in scope for this filter. */
  scopes: AztecAddress[];
};

export const PrivateEventFilterSchema = EventFilterSchema.extend({
  scopes: z.array(schemas.AztecAddress),
});

/**
 * An ABI decoded event with associated metadata.
 */
export type Event<T> = {
  /** The ABI decoded event */
  event: T;
  /** Metadata describing event context information such as tx and block */
  metadata: InTx;
};

export const EventSchema: ZodFor<Event<AbiDecoded>> = z.object({
  event: AbiDecodedSchema,
  metadata: inTxSchema(),
});

/**
 * Returns decoded public events given search parameters.
 * @param node - The node to request events from
 * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
 * @param filter -
 *  contractAddress - The address of the contract to get events from. Optional.
 *  fromBlock - The block number to search from (inclusive). Optional. If provided, it must be greater than or equal to 1.
 *    Defaults to .
 *    If toBlock is defined but fromBlock is not, fromBlock defaults to toBlock - 1.
 *  toBlock - The block number to search up to (exclusive). Optional. If provided, it must be greater than or equal to 1.
 *    Defaults to the latest known block to PXE + 1.
 * @returns - The deserialized events with block and tx metadata.
 */
export async function getDecodedPublicEvents<T>(
  node: AztecNode,
  eventMetadataDef: EventMetadataDefinition,
  filter: EventFilter = {},
): Promise<T[]> {
  const sanitizedFilter = sanitizeEventFilter(filter);

  const { logs } = await node.getPublicLogs({
    fromBlock: sanitizedFilter.fromBlock,
    toBlock: sanitizedFilter.toBlock,
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
