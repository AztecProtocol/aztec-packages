import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * A custom, caller-defined request resolved via the {@link ResolveCustomRequest} hook. It carries no fixed meaning:
 * `kind` selects the request type so one hook can serve many such types, and `payload` holds the opaque,
 * request-specific arguments. The resolver answers by whatever means it needs (local state, a third party,
 * offchain data).
 */
export type CustomRequest = {
  /** The address of the contract issuing the request. */
  contractAddress: AztecAddress;
  /** The issuing contract's class ID, so resolvers can apply class-level (not just per-address) policy. */
  contractClassId: Fr;
  /** Discriminates the request type, letting one hook serve many such types. */
  kind: Fr;
  /** Opaque, request-specific arguments. */
  payload: Fr[];
};

/**
 * Hook resolving a {@link CustomRequest}. The resolver produces the response however it needs to.
 */
export type ResolveCustomRequest = (request: CustomRequest) => Promise<Fr[]>;
