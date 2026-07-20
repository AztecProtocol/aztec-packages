import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader } from '@aztec/stdlib/tx';

/**
 * TypeScript counterpart of utility_context.nr. Used only as a return value for the utilityGetUtilityContext oracle.
 */
export type UtilityContext = {
  blockHeader: BlockHeader;
  contractAddress: AztecAddress;
  msgSender: AztecAddress;
};
