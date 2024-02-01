import { ContractArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { ContractClass, ContractClassWithId } from '@aztec/types/contracts';

import { getArtifactHash } from './artifact_hash.js';
import { computeContractClassId } from './contract_class_id.js';

/** Contract artifact including its artifact hash */
type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr };

/** Creates a ContractClass from a contract compilation artifact. */
export function getContractClassFromArtifact(
  artifact: ContractArtifact | ContractArtifactWithHash,
): ContractClassWithId {
  const artifactHash = (artifact as ContractArtifactWithHash).artifactHash ?? getArtifactHash(artifact);
  const contractClass: ContractClass = {
    version: 1,
    artifactHash: artifactHash,
    publicFunctions: artifact.functions
      .filter(f => f.functionType === FunctionType.OPEN)
      .map(f => ({
        selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
        bytecode: Buffer.from(f.bytecode, 'base64'),
        isInternal: f.isInternal,
      })),
    privateFunctions: artifact.functions
      .filter(f => f.functionType === FunctionType.SECRET)
      .map(f => ({
        selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
        vkHash: getVerificationKeyHash(f.verificationKey!),
        isInternal: f.isInternal,
      })),
    packedBytecode: Buffer.alloc(0),
  };
  const id = computeContractClassId(contractClass);
  return { ...contractClass, id };
}

/**
 * Calculates the hash of a verification key.
 * Returns zero for consistency with Noir.
 */
function getVerificationKeyHash(_verificationKeyInBase64: string) {
  // return Fr.fromBuffer(hashVKStr(verificationKeyInBase64));
  return Fr.ZERO;
}
