import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/** Information about a cross-contract utility call that requires authorization. */
export type UtilityCallAuthorizationRequest = {
  /** The contract requesting the cross-contract call. */
  caller: AztecAddress;
  /** The target contract being called. */
  target: AztecAddress;
  /** The function selector being invoked on the target. */
  functionSelector: FunctionSelector;
  /** The name of the function being called, if known from the contract artifact. */
  functionName?: string;
  /** The serialized arguments passed to the function. */
  args: Fr[];
  /** Whether the call originates from a private or utility execution context. */
  callerContext: 'private' | 'utility';
};

/** Authorization was granted. */
type Authorized = { authorized: true };

/** Authorization was denied. */
type Denied = {
  authorized: false;
  /** Reason for denial, included in the error message. */
  reason?: string;
};

/** Result of an authorization hook evaluation. */
export type UtilityCallAuthorizationResponse = Authorized | Denied;

/**
 * Hook called when a utility function attempts a cross-contract call.
 * Returns a response indicating whether the call is authorized and an optional denial reason.
 */
export type AuthorizeUtilityCall = (
  request: UtilityCallAuthorizationRequest,
) => Promise<UtilityCallAuthorizationResponse>;
