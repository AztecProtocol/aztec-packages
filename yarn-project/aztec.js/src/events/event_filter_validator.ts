import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TxHash } from '@aztec/stdlib/tx';

import type { EventFilter, PrivateEventFilter } from './events.js';

/**
 * To be documented...
 */
type SanitizedEventFilter = {
  /** tbd */
  contractAddress?: AztecAddress;
  /** tbd */
  txHash?: TxHash;
  /** tbd */
  toBlock?: BlockNumber;
  /** tbd */
  fromBlock?: BlockNumber;
};

/**
 * To be documented...
 */
type SanitizedPrivateEventFilter = SanitizedEventFilter & {
  /** tbd */
  contractAddress: AztecAddress;
  /** tbd */
  toBlock: BlockNumber;
  /** tbd */
  scopes: AztecAddress[];
};

/**
 * To be documented...
 */
export function sanitizeEventFilter(filter: EventFilter): SanitizedEventFilter {
  let fromBlock = filter.fromBlock;

  // Block range filters in Aztec Node are defined as closed-open intervals [fromBlock, toBlock), so
  // we respect that convention here for consistency.
  // We then default to [INITIAL_L2_BLOCK_NUM, maxToBlock + 1), ie: by default make the range span from
  // the first block to the latest known block.
  if (!fromBlock) {
    fromBlock = fromBlock ?? BlockNumber(INITIAL_L2_BLOCK_NUM);
  }

  if (fromBlock < 1) {
    throw new Error('fromBlock must be greater than or equal to 1');
  }

  if (filter.toBlock) {
    if (filter.toBlock < 1) {
      throw new Error('toBlock must be greater than or equal to 1');
    }

    if (fromBlock >= filter.toBlock) {
      throw new Error('toBlock must be strictly greater than fromBlock');
    }
  }

  return {
    contractAddress: filter.contractAddress,
    txHash: filter.txHash,
    toBlock: filter.toBlock,
    fromBlock,
  };
}

/**
 * tbd
 */
export function sanitizePrivateEventFilter(
  filter: PrivateEventFilter,
  lastKnownBlock: BlockNumber,
): SanitizedPrivateEventFilter {
  if (filter.scopes.length === 0) {
    throw new Error('At least one scope is required to get private events');
  }

  const sanitized = sanitizeEventFilter(filter);

  return {
    ...sanitized,
    contractAddress: sanitized.contractAddress ?? filter.contractAddress,
    toBlock: filter.toBlock ?? BlockNumber(lastKnownBlock + 1),
    scopes: filter.scopes,
  };
}
