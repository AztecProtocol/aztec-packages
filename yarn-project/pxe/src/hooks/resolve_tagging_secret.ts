import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AppTaggingSecretKind } from '@aztec/stdlib/logs';

import type { TaggingSecretSource } from '../contract_function_simulator/noir-structs/tagging_secret_source.js';

export type { TaggingSecretSource };

/** Information about the message delivery requesting a tagging secret source. */
export type TaggingSecretSourceRequest = {
  contractAddress: AztecAddress;
  /**
   * The contract class ID of the executing contract, so wallets can apply class-level (not just per-address) policy.
   */
  contractClassId: Fr;
  sender: AztecAddress;
  recipient: AztecAddress;
  deliveryMode: AppTaggingSecretKind;
};

/**
 * Hook returning the {@link TaggingSecretSource} for an outgoing message. Lets a wallet apply per-application or
 * per-recipient policy; when absent, PXE applies a privacy-safe default. See {@link TaggingSecretSource} for the
 * variants and trade-offs.
 */
export type ResolveTaggingSecret = (request: TaggingSecretSourceRequest) => Promise<TaggingSecretSource>;
