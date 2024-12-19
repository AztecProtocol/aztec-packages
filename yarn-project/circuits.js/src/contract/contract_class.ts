import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { PUBLIC_DISPATCH_SELECTOR } from '../constants.gen.js';
import { hashVK } from '../hash/hash.js';
import { computeArtifactHash } from './artifact_hash.js';
import { type ContractClassIdPreimage, computeContractClassIdWithPreimage } from './contract_class_id.js';
import { type ContractClass, type ContractClassWithId, type PublicFunction } from './interfaces/index.js';

/** Contract artifact including its artifact hash */
type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr };

const cmpFunctionArtifacts = <T extends { selector: FunctionSelector }>(a: T, b: T) =>
  a.selector.toField().cmp(b.selector.toField());

/** Creates a ContractClass from a contract compilation artifact. */
export function getContractClassFromArtifact(
  artifact: ContractArtifact | ContractArtifactWithHash,
): ContractClassWithId & ContractClassIdPreimage {
  const artifactHash = 'artifactHash' in artifact ? artifact.artifactHash : computeArtifactHash(artifact);
  const artifactPublicFunctions: ContractClass['publicFunctions'] = artifact.functions
    .filter(f => f.functionType === FunctionType.PUBLIC)
    .map(f => ({
      selector: FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      bytecode: f.bytecode,
    }))
    .sort(cmpFunctionArtifacts);

  let packedBytecode = Buffer.alloc(0);
  let dispatchFunction: PublicFunction | undefined = undefined;
  if (artifactPublicFunctions.length > 0) {
    dispatchFunction = artifactPublicFunctions.find(f =>
      f.selector.equals(FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR))),
    );
    if (!dispatchFunction) {
      throw new Error(
        `A contract with public functions should define a public_dispatch(Field) function as its public entrypoint. Contract: ${artifact.name}`,
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
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Remove public functions.
    publicFunctions: dispatchFunction ? [dispatchFunction] : [],
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
    vkHash: computeVerificationKeyHash(f),
  };
}

/**
 * For a given private function, computes the hash of its vk.
 */
export function computeVerificationKeyHash(f: FunctionArtifact) {
  if (!f.verificationKey) {
    throw new Error(`Private function ${f.name} must have a verification key`);
  }
  return hashVK(vkAsFieldsMegaHonk(Buffer.from(f.verificationKey, 'base64')));
}
