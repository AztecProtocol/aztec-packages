import { GeneratorIndex } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { type FunctionAbi, FunctionSelector, encodeArguments } from '../abi/index.js';
import type { AztecAddress } from '../aztec-address/index.js';
import { computeVarArgsHash } from '../hash/hash.js';
import { computeAddress } from '../keys/index.js';
import type { ContractInstance } from './interfaces/contract_instance.js';

// TODO(@spalladino): Review all generator indices in this file

/**
 * Returns the deployment address for a given contract instance as defined on the [Protocol Specs](../../../../docs/docs/protocol-specs/addresses-and-keys/specification.md).
 * ```
 * salted_initialization_hash = pedersen([salt, initialization_hash, deployer], GENERATOR__SALTED_INITIALIZATION_HASH)
 * partial_address = pedersen([contract_class_id, salted_initialization_hash], GENERATOR__CONTRACT_PARTIAL_ADDRESS_V1)
 * address = ((poseidon2Hash([public_keys_hash, partial_address, GENERATOR__CONTRACT_ADDRESS_V1]) * G) + ivpk_m).x <- the x-coordinate of the address point
 * ```
 * @param instance - A contract instance for which to calculate the deployment address.
 */
export async function computeContractAddressFromInstance(
  instance:
    | ContractInstance
    | ({ originalContractClassId: Fr; saltedInitializationHash: Fr } & Pick<ContractInstance, 'publicKeys'>),
): Promise<AztecAddress> {
  const partialAddress = await computePartialAddress(instance);
  return computeAddress(instance.publicKeys, partialAddress);
}

/**
 * Computes the partial address defined as the hash of the contract class id and salted initialization hash.
 * @param instance - Contract instance for which to calculate the partial address.
 */
export async function computePartialAddress(
  instance:
    | Pick<ContractInstance, 'originalContractClassId' | 'initializationHash' | 'salt' | 'deployer'>
    | { originalContractClassId: Fr; saltedInitializationHash: Fr },
): Promise<Fr> {
  const saltedInitializationHash =
    'saltedInitializationHash' in instance
      ? instance.saltedInitializationHash
      : await computeSaltedInitializationHash(instance);

  return poseidon2HashWithSeparator(
    [instance.originalContractClassId, saltedInitializationHash],
    GeneratorIndex.PARTIAL_ADDRESS,
  );
}

/**
 * Computes the salted initialization hash for an address, defined as the hash of the salt and initialization hash.
 * @param instance - Contract instance for which to compute the salted initialization hash.
 */
export function computeSaltedInitializationHash(
  instance: Pick<ContractInstance, 'initializationHash' | 'salt' | 'deployer'>,
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [instance.salt, instance.initializationHash, instance.deployer],
    GeneratorIndex.PARTIAL_ADDRESS,
  );
}

/**
 * Computes the initialization hash for an instance given its constructor function and arguments.
 * @param initFn - Constructor function or empty if no initialization is expected.
 * @param args - Unencoded arguments, will be encoded as fields according to the constructor function abi.
 * @returns The hash, or zero if no initialization function is provided.
 */
export async function computeInitializationHash(initFn: FunctionAbi | undefined, args: any[]): Promise<Fr> {
  if (!initFn) {
    return Fr.ZERO;
  }
  const selector = await FunctionSelector.fromNameAndParameters(initFn.name, initFn.parameters);
  const flatArgs = encodeArguments(initFn, args);
  return computeInitializationHashFromEncodedArgs(selector, flatArgs);
}

/**
 * Computes the initialization hash for an instance given its constructor function selector and encoded arguments.
 * @param initFn - Constructor function selector.
 * @param args - Encoded arguments.
 * @returns The hash.
 */
export async function computeInitializationHashFromEncodedArgs(
  initFn: FunctionSelector,
  encodedArgs: Fr[],
): Promise<Fr> {
  const argsHash = await computeVarArgsHash(encodedArgs);
  return poseidon2HashWithSeparator([initFn, argsHash], GeneratorIndex.CONSTRUCTOR);
}
