import { MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, getContractClassFromArtifact } from '@aztec/circuits.js';
import { ContractArtifact, bufferAsFields } from '@aztec/foundation/abi';
import { getCanonicalClassRegisterer } from '@aztec/protocol-contracts/class-registerer';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { UnsafeContract } from '../contract/unsafe_contract.js';
import { Wallet } from '../wallet/index.js';

/** Sets up a call to register a contract class given its artifact. */
export function registerContractClass(wallet: Wallet, artifact: ContractArtifact): ContractFunctionInteraction {
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode } =
    getContractClassFromArtifact(artifact);
  const encodedBytecode = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  const registerer = getRegistererContract(wallet);
  return registerer.methods.register(artifactHash, privateFunctionsRoot, publicBytecodeCommitment, encodedBytecode);
}

/** Returns a Contract wrapper for the class registerer. */
function getRegistererContract(wallet: Wallet) {
  const { artifact, instance } = getCanonicalClassRegisterer();
  return new UnsafeContract(instance, artifact, wallet);
}
