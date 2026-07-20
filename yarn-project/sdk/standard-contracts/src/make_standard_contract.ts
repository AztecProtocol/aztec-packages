import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';

import type { StandardContract } from './standard_contract.js';
import {
  StandardContractAddress,
  StandardContractClassId,
  StandardContractClassIdPreimage,
  StandardContractInitializationHash,
  type StandardContractName,
  StandardContractPrivateFunctions,
  StandardContractSalt,
} from './standard_contract_data.js';

/**
 * Reconstructs a StandardContract from precomputed data without performing any hash computations.
 * Internal to the standard-contracts package — not part of the public API.
 */
export function makeStandardContract(name: StandardContractName, artifact: ContractArtifact): StandardContract {
  const address = StandardContractAddress[name];
  const salt = StandardContractSalt[name];
  const classId = StandardContractClassId[name];
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment } = StandardContractClassIdPreimage[name];
  const initializationHash = StandardContractInitializationHash[name];

  const contractClass = {
    id: classId,
    version: 1 as const,
    artifactHash,
    privateFunctionsRoot,
    publicBytecodeCommitment,
    packedBytecode: artifact.functions.find(f => f.name === 'public_dispatch')?.bytecode ?? Buffer.alloc(0),
    privateFunctions: StandardContractPrivateFunctions[name],
  };

  const instance = {
    version: 2 as const,
    currentContractClassId: classId,
    originalContractClassId: classId,
    initializationHash,
    immutablesHash: Fr.ZERO,
    publicKeys: PublicKeys.default(),
    salt,
    deployer: AztecAddress.ZERO,
    address,
  };

  return { instance, contractClass, artifact, address };
}
