import { Fr } from '@aztec/foundation/fields';
import type { FunctionCall } from '@aztec/stdlib/abi';
import { computeInnerAuthWitHash, computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeVarArgsHash } from '@aztec/stdlib/hash';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';

/** Metadata for the intent */
export type IntentMetadata = {
  /** The chain id to approve */
  chainId: Fr;
  /** The version to approve  */
  version: Fr;
};

/** Intent with an inner hash */
export type IntentInnerHash = {
  /** The consumer   */
  consumer: AztecAddress;
  /** The action to approve */
  innerHash: Buffer | Fr;
};

/** Intent with an action */
export type IntentAction = {
  /** The caller to approve  */
  caller: AztecAddress;
  /** The action to approve */
  action: ContractFunctionInteraction | FunctionCall;
};

// docs:start:authwit_computeAuthWitMessageHash
/**
 * Compute an authentication witness message hash from an intent and metadata
 *
 * If using the `IntentInnerHash`, the consumer is the address that can "consume" the authwit, for token approvals it is the token contract itself.
 * The `innerHash` itself will be the message that a contract is allowed to execute.
 * At the point of "approval checking", the validating contract (account for private and registry for public) will be computing the message hash
 * (`H(consumer, chainid, version, inner_hash)`) where the all but the `inner_hash` is injected from the context (consumer = msg_sender),
 * and use it for the authentication check.
 * Therefore, any allowed `innerHash` will therefore also have information around where it can be spent (version, chainId) and who can spend it (consumer).
 *
 * If using the `IntentAction`, the caller is the address that is making the call, for a token approval from Alice to Bob, this would be Bob.
 * The action is then used along with the `caller` to compute the `innerHash` and the consumer.
 *
 *
 * @param intent - The intent to approve (consumer and innerHash or caller and action)
 *                 The consumer is the address that can "consume" the authwit, for token approvals it is the token contract itself.
 *                 The caller is the address that is making the call, for a token approval from Alice to Bob, this would be Bob.
 *                 The caller becomes part of the `inner_hash` and is dealt with entirely in application logic.
 * @param metadata - The metadata for the intent (chainId, version)
 * @returns The message hash for the action
 */
export const computeAuthWitMessageHash = async (intent: IntentInnerHash | IntentAction, metadata: IntentMetadata) => {
  const chainId = metadata.chainId;
  const version = metadata.version;

  if ('caller' in intent) {
    const fnCall =
      intent.action instanceof ContractFunctionInteraction ? (await intent.action.request()).calls[0] : intent.action;
    return computeOuterAuthWitHash(
      fnCall.to,
      chainId,
      version,
      await computeInnerAuthWitHashFromFunctionCall(intent.caller, fnCall),
    );
  } else {
    const inner = Buffer.isBuffer(intent.innerHash) ? Fr.fromBuffer(intent.innerHash) : intent.innerHash;
    return computeOuterAuthWitHash(intent.consumer, chainId, version, inner);
  }
};
// docs:end:authwit_computeAuthWitMessageHash

/**
 * Computes the inner authwitness hash for a function call, for it to later be combined with the metadata
 * required for the outer hash and eventually the full AuthWitness.
 * @param caller - Who is going to be calling the function
 * @param fnCall - The function call to compute the inner hash from
 * @returns The inner hash for the function call
 **/
export const computeInnerAuthWitHashFromFunctionCall = async (caller: AztecAddress, fnCall: FunctionCall) => {
  return computeInnerAuthWitHash([caller.toField(), fnCall.selector.toField(), await computeVarArgsHash(fnCall.args)]);
};

/**
 * Computes the inner authwitness hash for an action, that can either be a ContractFunctionInteraction
 * or an isolated FunctionCall. Since the former is just a wrapper around the latter, we can just extract
 * the first (and only) call from the ContractFunctionInteraction and use it to compute the inner hash.
 * @param caller - Who is going to be performing the action
 * @param action - The ContractFunctionInteraction or FunctionCall to compute the inner hash for
 * @returns The inner hash for the action
 **/
export const computeInnerAuthWitHashFromAction = async (
  caller: AztecAddress,
  action: FunctionCall | ContractFunctionInteraction,
) => {
  action = action instanceof ContractFunctionInteraction ? (await action.request()).calls[0] : action;
  return computeInnerAuthWitHash([caller.toField(), action.selector.toField(), await computeVarArgsHash(action.args)]);
};
