import { ContractArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { ContractClass, ContractClassWithId } from '@aztec/types/contracts';

import { computeArtifactHash } from './artifact_hash.js';
import { ContractClassIdPreimage, computeContractClassIdWithPreimage } from './contract_class_id.js';
import { packBytecode } from './public_bytecode.js';

/** Contract artifact including its artifact hash */
type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr };

const cmpFunctionArtifacts = <T extends { selector: FunctionSelector }>(a: T, b: T) =>
  a.selector.toField().cmp(b.selector.toField());

/** Creates a ContractClass from a contract compilation artifact. */
export function getContractClassFromArtifact(
  artifact: ContractArtifact | ContractArtifactWithHash,
): ContractClassWithId & ContractClassIdPreimage {
  const artifactHash = 'artifactHash' in artifact ? artifact.artifactHash : computeArtifactHash(artifact);
  const publicFunctions: ContractClass['publicFunctions'] = artifact.functions
    .filter(f => f.functionType === FunctionType.OPEN)
    .map(f => ({
      selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      bytecode: Buffer.from(f.bytecode, 'base64'),
      isInternal: f.isInternal,
    }))
    .sort(cmpFunctionArtifacts);

  const packedBytecode = packBytecode(publicFunctions);

  const privateFunctions: ContractClass['privateFunctions'] = artifact.functions
    .filter(f => f.functionType === FunctionType.SECRET)
    .map(f => ({
      selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      vkHash: getVerificationKeyHash(f.verificationKey!),
      isInternal: f.isInternal,
    }))
    .sort(cmpFunctionArtifacts);

  const contractClass: ContractClass = {
    version: 1,
    artifactHash,
    publicFunctions,
    packedBytecode,
    privateFunctions,
  };
  return { ...contractClass, ...computeContractClassIdWithPreimage(contractClass) };
}

/**
 * Calculates the hash of a verification key.
 * Returns zero for consistency with Noir.
 */
function getVerificationKeyHash(_verificationKeyInBase64: string) {
  // return Fr.fromBuffer(hashVKStr(verificationKeyInBase64));
  return Fr.ZERO;
}
