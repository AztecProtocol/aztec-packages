import { type FunctionAbi, FunctionSelector, encodeArguments } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash, poseidon2Hash, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type ContractInstance } from '@aztec/types/contracts';

import { Grumpkin } from '../barretenberg/crypto/grumpkin/index.js';
import { GeneratorIndex } from '../constants.gen.js';
import { computeVarArgsHash } from '../hash/hash.js';

// TODO(@spalladino): Review all generator indices in this file

/**
 * Returns the deployment address for a given contract instance as defined on the [Protocol Specs](../../../../docs/docs/protocol-specs/addresses-and-keys/specification.md).
 * ```
 * salted_initialization_hash = pedersen([salt, initialization_hash, deployer, portal_contract_address as Field], GENERATOR__SALTED_INITIALIZATION_HASH)
 * partial_address = pedersen([contract_class_id, salted_initialization_hash], GENERATOR__CONTRACT_PARTIAL_ADDRESS_V1)
 * address = pedersen([public_keys_hash, partial_address], GENERATOR__CONTRACT_ADDRESS_V1)
 * ```
 * @param instance - A contract instance for which to calculate the deployment address.
 */
export function computeContractAddressFromInstance(
  instance:
    | ContractInstance
    | ({ contractClassId: Fr; saltedInitializationHash: Fr } & Pick<ContractInstance, 'publicKeysHash'>),
): AztecAddress {
  const partialAddress = computePartialAddress(instance);
  const publicKeyHash = instance.publicKeysHash;
  return computeContractAddressFromPartial({ partialAddress, publicKeyHash });
}

/**
 * Computes the partial address defined as the hash of the contract class id and salted initialization hash.
 * @param instance - Contract instance for which to calculate the partial address.
 */
export function computePartialAddress(
  instance:
    | Pick<ContractInstance, 'contractClassId' | 'initializationHash' | 'salt' | 'portalContractAddress' | 'deployer'>
    | { contractClassId: Fr; saltedInitializationHash: Fr },
): Fr {
  const saltedInitializationHash =
    'saltedInitializationHash' in instance
      ? instance.saltedInitializationHash
      : computeSaltedInitializationHash(instance);

  return pedersenHash([instance.contractClassId, saltedInitializationHash], GeneratorIndex.PARTIAL_ADDRESS);
}

/**
 * Computes the salted initialization hash for an address, defined as the hash of the salt, initialization hash, and portal address.
 * @param instance - Contract instance for which to compute the salted initialization hash.
 */
export function computeSaltedInitializationHash(
  instance: Pick<ContractInstance, 'initializationHash' | 'salt' | 'portalContractAddress' | 'deployer'>,
): Fr {
  return pedersenHash(
    [instance.salt, instance.initializationHash, instance.deployer, instance.portalContractAddress],
    GeneratorIndex.PARTIAL_ADDRESS,
  );
}

/**
 * Computes a contract address from its partial address and the pubkeys hash.
 * @param args - The hash of the public keys or the plain public key to be hashed, along with the partial address.
 * @returns The partially constructed contract address.
 */
export function computeContractAddressFromPartial(
  args: ({ publicKeyHash: Fr } | { secretKey: Fr }) & { partialAddress: Fr },
): AztecAddress {
  const publicKeyHash = 'secretKey' in args ? deriveKeys(args.secretKey).publicKeysHash : args.publicKeyHash;
  const result = pedersenHash([publicKeyHash, args.partialAddress], GeneratorIndex.CONTRACT_ADDRESS);
  return AztecAddress.fromField(result);
}

/**
 * Computes the hash of a set of public keys to be used for computing the deployment address of a contract.
 * @param publicKey - Single public key (for now!).
 * @returns The hash of the public keys.
 */
// TODO(benesjan): this copied out of key store, should be moved to a shared location
export function deriveKeys(sk: Fr) {
  const curve = new Grumpkin();
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = sha512ToGrumpkinScalar([sk, GeneratorIndex.NSK_M]);
  const masterIncomingViewingSecretKey = sha512ToGrumpkinScalar([sk, GeneratorIndex.IVSK_M]);
  const masterOutgoingViewingSecretKey = sha512ToGrumpkinScalar([sk, GeneratorIndex.OVSK_M]);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([sk, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const masterNullifierPublicKey = curve.mul(curve.generator(), masterNullifierSecretKey);
  const masterIncomingViewingPublicKey = curve.mul(curve.generator(), masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = curve.mul(curve.generator(), masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = curve.mul(curve.generator(), masterTaggingSecretKey);

  // We hash the public keys to get the public keys hash
  const publicKeysHash = poseidon2Hash([
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
    GeneratorIndex.PUBLIC_KEYS_HASH,
  ]);

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
    publicKeysHash,
  };
}

/**
 * Computes the initialization hash for an instance given its constructor function and arguments.
 * @param initFn - Constructor function or empty if no initialization is expected.
 * @param args - Unencoded arguments, will be encoded as fields according to the constructor function abi.
 * @returns The hash, or zero if no initialization function is provided.
 */
export function computeInitializationHash(initFn: FunctionAbi | undefined, args: any[]): Fr {
  if (!initFn) {
    return Fr.ZERO;
  }
  const selector = FunctionSelector.fromNameAndParameters(initFn.name, initFn.parameters);
  const flatArgs = encodeArguments(initFn, args);
  return computeInitializationHashFromEncodedArgs(selector, flatArgs);
}

/**
 * Computes the initialization hash for an instance given its constructor function selector and encoded arguments.
 * @param initFn - Constructor function selector.
 * @param args - Encoded arguments.
 * @returns The hash.
 */
export function computeInitializationHashFromEncodedArgs(initFn: FunctionSelector, encodedArgs: Fr[]): Fr {
  const argsHash = computeVarArgsHash(encodedArgs);
  return pedersenHash([initFn, argsHash], GeneratorIndex.CONSTRUCTOR);
}
