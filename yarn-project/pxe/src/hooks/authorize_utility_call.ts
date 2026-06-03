import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/** Information about a cross-contract utility call that requires authorization. */
export type UtilityCallAuthorizationRequest = {
  /** The contract requesting the cross-contract call. */
  caller: AztecAddress;
  /** The contract class ID of the calling contract. */
  callerClassId: Fr;
  /** The target contract being called. */
  target: AztecAddress;
  /** The contract class ID of the target contract. */
  targetClassId: Fr;
  /** The function selector being invoked on the target. */
  functionSelector: FunctionSelector;
  /** The name of the function being called, from the contract artifact. */
  functionName: string;
  /** The serialized arguments passed to the function. */
  args: Fr[];
  /** The execution context from which the call originates. */
  callerContext: 'private' | 'private view' | 'utility';
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
