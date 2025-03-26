import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '../abi/index.js';
import { hashVK } from '../hash/hash.js';
import { computeArtifactHash } from './artifact_hash.js';
import { type ContractClassIdPreimage, computeContractClassIdWithPreimage } from './contract_class_id.js';
import type { ContractClass, ContractClassWithId } from './interfaces/index.js';

/** Contract artifact including its artifact hash */
type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr };

const cmpFunctionArtifacts = <T extends { selector: FunctionSelector }>(a: T, b: T) =>
  a.selector.toField().cmp(b.selector.toField());

/** Creates a ContractClass from a contract compilation artifact. */
export async function getContractClassFromArtifact(
  artifact: ContractArtifact | ContractArtifactWithHash,
): Promise<ContractClassWithId & ContractClassIdPreimage> {
  const artifactHash = 'artifactHash' in artifact ? artifact.artifactHash : await computeArtifactHash(artifact);

  const publicFunctions = artifact.functions.filter(f => f.functionType === FunctionType.PUBLIC);
  if (publicFunctions.length > 1) {
    throw new Error(
      `Contract should contain at most one public function artifact. Received ${publicFunctions.length}.`,
    );
  }

  const packedBytecode = publicFunctions[0]?.bytecode ?? Buffer.alloc(0);

  const privateFunctions = artifact.functions.filter(f => f.functionType === FunctionType.PRIVATE);
  const privateArtifactFunctions: ContractClass['privateFunctions'] = await Promise.all(
    privateFunctions.map(getContractClassPrivateFunctionFromArtifact),
  );

  privateArtifactFunctions.sort(cmpFunctionArtifacts);

  const contractClass: ContractClass = {
    version: 1,
    artifactHash,
    packedBytecode,
    privateFunctions: privateArtifactFunctions,
  };
  return { ...contractClass, ...(await computeContractClassIdWithPreimage(contractClass)) };
}

export async function getContractClassPrivateFunctionFromArtifact(
  f: FunctionArtifact,
): Promise<ContractClass['privateFunctions'][number]> {
  return {
    selector: await FunctionSelector.fromNameAndParameters(f.name, f.parameters),
    vkHash: await computeVerificationKeyHash(f),
  };
}

/**
 * For a given private function, computes the hash of its vk.
 */
export async function computeVerificationKeyHash(f: FunctionArtifact) {
  if (!f.verificationKey) {
    throw new Error(`Private function ${f.name} must have a verification key`);
  }
  return hashVK(await vkAsFieldsMegaHonk(Buffer.from(f.verificationKey, 'base64')));
}
