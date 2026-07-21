import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { PublicKeys } from '@aztec/stdlib/keys';

import type { ProtocolContract } from './protocol_contract.js';
import {
  ProtocolContractAddress,
  ProtocolContractClassId,
  ProtocolContractClassIdPreimage,
  ProtocolContractInitializationHash,
  type ProtocolContractName,
  ProtocolContractPrivateFunctions,
  ProtocolContractSalt,
} from './protocol_contract_data.js';

/**
 * Reconstructs a ProtocolContract from precomputed data without performing any hash computations.
 * Internal to the protocol-contracts package — not part of the public API.
 */
export function makeProtocolContract(name: ProtocolContractName, artifact: ContractArtifact): ProtocolContract {
  const address = ProtocolContractAddress[name];
  const salt = ProtocolContractSalt[name];
  const classId = ProtocolContractClassId[name];
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment } = ProtocolContractClassIdPreimage[name];
  const initializationHash = ProtocolContractInitializationHash[name];

  const contractClass = {
    id: classId,
    version: 1 as const,
    artifactHash,
    privateFunctionsRoot,
    publicBytecodeCommitment,
    packedBytecode: artifact.functions.find(f => f.name === 'public_dispatch')?.bytecode ?? Buffer.alloc(0),
    privateFunctions: ProtocolContractPrivateFunctions[name],
  };

  const instance = {
    version: 2 as const,
    currentContractClassId: classId,
    originalContractClassId: classId,
    initializationHash,
    immutablesHash: Fr.ZERO, // Protocol Contracts Have No Immutables
    publicKeys: PublicKeys.default(),
    salt,
    deployer: address,
    address,
  };

  return { instance, contractClass, artifact, address };
}
