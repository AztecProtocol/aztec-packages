import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { type ContractClass, type ContractClassWithId } from '@aztec/types/contracts';

import { computeArtifactHash } from './artifact_hash.js';
import { type ContractClassIdPreimage, computeContractClassIdWithPreimage } from './contract_class_id.js';

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
    .filter(f => f.functionType === FunctionType.PUBLIC)
    .filter(f => f.name === 'public_dispatch')
    .map(f => ({
      selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      bytecode: f.bytecode,
    }))
    .sort(cmpFunctionArtifacts);

  let packedBytecode = Buffer.alloc(0);
  if (publicFunctions.length > 0) {
    const dispatchFunction = publicFunctions.find(f =>
      f.selector.equals(FunctionSelector.fromSignature('public_dispatch(Field)')),
    );
    if (!dispatchFunction) {
      throw new Error(
        'A contract with public functions should define a public_dispatch(Field) function as its public entrypoint.',
      );
    }
    packedBytecode = dispatchFunction.bytecode;
  }

  const privateFunctions: ContractClass['privateFunctions'] = artifact.functions
    .filter(f => f.functionType === FunctionType.PRIVATE)
    .map(getContractClassPrivateFunctionFromArtifact)
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

export function getContractClassPrivateFunctionFromArtifact(
  f: FunctionArtifact,
): ContractClass['privateFunctions'][number] {
  return {
    selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
    vkHash: computeVerificationKeyHash(f.verificationKey!),
  };
}

/**
 * Calculates the hash of a verification key.
 * Returns zero for consistency with Noir.
 */
export function computeVerificationKeyHash(_verificationKeyInBase64: string) {
  // return Fr.fromBuffer(hashVK(Buffer.from(verificationKeyInBase64, 'hex')));
  return Fr.ZERO;
}
