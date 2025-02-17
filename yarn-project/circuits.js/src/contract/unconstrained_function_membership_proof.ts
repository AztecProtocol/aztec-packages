import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { computeRootFromSiblingPath } from '@aztec/foundation/trees';

import {
  computeArtifactFunctionTree,
  computeArtifactHash,
  computeArtifactHashPreimage,
  computeFunctionArtifactHash,
  computeFunctionMetadataHash,
  getArtifactMerkleTreeHasher,
} from './artifact_hash.js';
import {
  type ContractClassPublic,
  type UnconstrainedFunctionMembershipProof,
  type UnconstrainedFunctionWithMembershipProof,
} from './interfaces/index.js';

/**
 * Creates a membership proof for an unconstrained function in a contract class, to be verified via `isValidUnconstrainedFunctionMembershipProof`.
 * @param selector - Selector of the function to create the proof for.
 * @param artifact - Artifact of the contract class where the function is defined.
 */
export async function createUnconstrainedFunctionMembershipProof(
  selector: FunctionSelector,
  artifact: ContractArtifact,
): Promise<UnconstrainedFunctionMembershipProof> {
  const log = createLogger('circuits:function_membership_proof');

  // Locate function artifact
  const uncontrainedFunctions = artifact.functions.filter(fn => fn.functionType === FunctionType.UNCONSTRAINED);
  const unconstrainedFunctionsAndSelectors = await Promise.all(
    uncontrainedFunctions.map(async fn => ({ fn, selector: await FunctionSelector.fromNameAndParameters(fn) })),
  );
  const fn = unconstrainedFunctionsAndSelectors.find(fnAndSelector => selector.equals(fnAndSelector.selector))?.fn;
  if (!fn) {
    throw new Error(`Unconstrained function with selector ${selector.toString()} not found`);
  }
  // Compute preimage for the artifact hash
  const { privateFunctionRoot: privateFunctionsArtifactTreeRoot, metadataHash: artifactMetadataHash } =
    await computeArtifactHashPreimage(artifact);

  // Compute the sibling path for the "artifact tree"
  const functionMetadataHash = computeFunctionMetadataHash(fn);
  const functionArtifactHash = await computeFunctionArtifactHash({ ...fn, functionMetadataHash });
  const artifactTree = (await computeArtifactFunctionTree(artifact, FunctionType.UNCONSTRAINED))!;
  const artifactTreeLeafIndex = artifactTree.getIndex(functionArtifactHash.toBuffer());
  const artifactTreeSiblingPath = artifactTree.getSiblingPath(artifactTreeLeafIndex).map(Fr.fromBuffer);

  log.debug(`Computed proof for unconstrained function with selector ${selector.toString()}`, {
    functionArtifactHash,
    functionMetadataHash,
    artifactMetadataHash,
    artifactFunctionTreeSiblingPath: artifactTreeSiblingPath.map(fr => fr.toString()).join(','),
    privateFunctionsArtifactTreeRoot,
  });

  return {
    artifactTreeSiblingPath,
    artifactTreeLeafIndex,
    artifactMetadataHash,
    functionMetadataHash,
    privateFunctionsArtifactTreeRoot,
  };
}

/**
 * Verifies that an unconstrained function with a membership proof as emitted by the ClassRegisterer contract is valid,
 * as defined in the protocol specs at contract-deployment/classes:
 *
 * ```
 * // Load contract class from local db
 * contract_class = db.get_contract_class(contract_class_id)
 *
 * // Compute artifact leaf and assert it belongs to the artifact
 * artifact_function_leaf = sha256(selector, metadata_hash, sha256(bytecode))
 * computed_artifact_unconstrained_function_tree_root = compute_root(artifact_function_leaf, artifact_function_tree_sibling_path, artifact_function_tree_leaf_index)
 * computed_artifact_hash = sha256(private_functions_artifact_tree_root, computed_artifact_unconstrained_function_tree_root, artifact_metadata_hash)
 * assert computed_artifact_hash == contract_class.artifact_hash
 * ```
 * @param fn - Function to check membership proof for.
 * @param contractClass - In which contract class the function is expected to be.
 */
export async function isValidUnconstrainedFunctionMembershipProof(
  fn: UnconstrainedFunctionWithMembershipProof,
  contractClass: Pick<ContractClassPublic, 'artifactHash'>,
) {
  const log = createLogger('circuits:function_membership_proof');

  const functionArtifactHash = await computeFunctionArtifactHash(fn);
  const computedArtifactFunctionTreeRootBuffer = await computeRootFromSiblingPath(
    functionArtifactHash.toBuffer(),
    fn.artifactTreeSiblingPath.map(fr => fr.toBuffer()),
    fn.artifactTreeLeafIndex,
    getArtifactMerkleTreeHasher(),
  );
  const computedArtifactFunctionTreeRoot = Fr.fromBuffer(computedArtifactFunctionTreeRootBuffer);
  const computedArtifactHash = await computeArtifactHash({
    privateFunctionRoot: fn.privateFunctionsArtifactTreeRoot,
    unconstrainedFunctionRoot: computedArtifactFunctionTreeRoot,
    metadataHash: fn.artifactMetadataHash,
  });
  if (!contractClass.artifactHash.equals(computedArtifactHash)) {
    log.debug(`Artifact hash mismatch`, {
      expected: contractClass.artifactHash,
      computedArtifactHash,
      computedFunctionArtifactHash: functionArtifactHash,
      computedArtifactFunctionTreeRoot,
      privateFunctionsArtifactTreeRoot: fn.privateFunctionsArtifactTreeRoot,
      metadataHash: fn.artifactMetadataHash,
      artifactFunctionTreeSiblingPath: fn.artifactTreeSiblingPath.map(fr => fr.toString()).join(','),
    });
    return false;
  }

  return true;
}
