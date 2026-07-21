import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Tag } from '@aztec/stdlib/logs';

import type { Option } from './option.js';

/** Discriminant for which log source to query. */
export enum LogSource {
  PRIVATE = 0,
  PUBLIC = 1,
  PUBLIC_AND_PRIVATE = 2,
}

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle expects values of this
 * type to be stored in a `EphemeralArray`.
 */
export type LogRetrievalRequest = {
  contractAddress: AztecAddress;
  tag: Tag;
  source: LogSource;
  fromBlock: Option<BlockNumber>;
  toBlock: Option<BlockNumber>;
};

/** Parses a `LogSource` from its wire field, throwing on an out-of-range value. */
export function logSourceFromField(field: Fr): LogSource {
  const sourceNum = field.toNumber();
  if (!(sourceNum in LogSource)) {
    const validNames = Object.keys(LogSource).filter(k => isNaN(Number(k)));
    throw new Error(`Invalid LogSource value ${sourceNum}, expected one of ${validNames.join(', ')}`);
  }
  return sourceNum as LogSource;
}
