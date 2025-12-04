import { EthAddress } from '@aztec/foundation/eth-address';

import type { Hex } from 'viem';

/**
 * Information about a matching CALL
 */
export interface CallInfo {
  from: EthAddress;
  gasUsed: bigint;
  input: Hex;
  value: bigint;
}
