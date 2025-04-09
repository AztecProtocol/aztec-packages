import type { AuthWitnessProvider, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';

// docs:start:account-interface

/**
 * Handler for interfacing with an account. Knows how to create transaction execution
 * requests and authorize actions for its corresponding account.
 */
export interface AccountInterface extends EntrypointInterface, AuthWitnessProvider {
  /** Returns the complete address for this account. */
  getCompleteAddress(): CompleteAddress;

  /** Returns the address for this account. */
  getAddress(): AztecAddress;

  /** Returns the chain id for this account */
  getChainId(): Fr;

  /** Returns the rollup version for this account */
  getVersion(): Fr;
}
// docs:end:account-interface
