import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';

import type { ContractData } from './contract_data.js';
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

/** Precomputed deployment values of a standard contract, enough to reconstruct it without any hash computations. */
export type StandardContractData = ContractData & { salt: Fr };

/**
 * Reconstructs a StandardContract from precomputed data without performing any hash computations.
 * Internal to the standard-contracts package — not part of the public API.
 */
export function makeStandardContract(name: StandardContractName, artifact: ContractArtifact): StandardContract {
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment } = StandardContractClassIdPreimage[name];
  return makeStandardContractFromData(
    {
      address: StandardContractAddress[name],
      salt: StandardContractSalt[name],
      classId: StandardContractClassId[name],
      artifactHash,
      privateFunctionsRoot,
      publicBytecodeCommitment,
      initializationHash: StandardContractInitializationHash[name],
      privateFunctions: StandardContractPrivateFunctions[name],
    },
    artifact,
  );
}

/**
 * Reconstructs a StandardContract from explicit precomputed data, for deployments not covered by the generated
 * `standard_contract_data.ts` records (namely historical deployments from previous releases).
 * Internal to the standard-contracts package, not part of the public API.
 */
export function makeStandardContractFromData(data: StandardContractData, artifact: ContractArtifact): StandardContract {
  const { address, salt, classId, artifactHash, privateFunctionsRoot, publicBytecodeCommitment, initializationHash } =
    data;

  const contractClass = {
    id: classId,
    version: 1 as const,
    artifactHash,
    privateFunctionsRoot,
    publicBytecodeCommitment,
    packedBytecode: artifact.functions.find(f => f.name === 'public_dispatch')?.bytecode ?? Buffer.alloc(0),
    privateFunctions: data.privateFunctions,
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
