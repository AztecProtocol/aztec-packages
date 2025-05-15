import { sha256 } from '@aztec/foundation/crypto';
import { Fr, reduceFn } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { numToUInt8 } from '@aztec/foundation/serialize';
import { MerkleTree, MerkleTreeCalculator } from '@aztec/foundation/trees';

import deterministicStringify from 'json-stringify-deterministic';

import { type ContractArtifact, type FunctionArtifact, FunctionSelector, FunctionType } from '../abi/index.js';

const VERSION = 1;

// TODO(miranda): Artifact and artifact metadata hashes are currently the only SHAs not truncated by a byte.
// They are never recalculated in the circuit or L1 contract, but they are input to circuits, so perhaps modding here is preferable?
// TODO(@spalladino) Reducing sha256 to a field may have security implications. Validate this with crypto team.
const sha256Fr = reduceFn(sha256, Fr);

/**
 * Returns the artifact hash of a given compiled contract artifact.
 *
 * ```
 * private_functions_artifact_leaves = artifact.private_functions.map fn =>
 *   sha256(fn.selector, fn.metadata_hash, sha256(fn.bytecode))
 * private_functions_artifact_tree_root = merkleize(private_functions_artifact_leaves)
 *
 * utility_functions_artifact_leaves = artifact.utility_functions.map fn =>
 *   sha256(fn.selector, fn.metadata_hash, sha256(fn.bytecode))
 * utility_functions_artifact_tree_root = merkleize(utility_functions_artifact_leaves)
 *
 * version = 1
 * artifact_hash = sha256(
 *   version,
 *   private_functions_artifact_tree_root,
 *   utility_functions_artifact_tree_root,
 *   artifact_metadata,
 * )
 * ```
 * @param artifact - Artifact to calculate the hash for.
 */
export async function computeArtifactHash(
  artifact: ContractArtifact | { privateFunctionRoot: Fr; utilityFunctionRoot: Fr; metadataHash: Fr },
): Promise<Fr> {
  if ('privateFunctionRoot' in artifact && 'utilityFunctionRoot' in artifact && 'metadataHash' in artifact) {
    const { privateFunctionRoot, utilityFunctionRoot, metadataHash } = artifact;
    const preimage = [privateFunctionRoot, utilityFunctionRoot, metadataHash].map(x => x.toBuffer());
    return sha256Fr(Buffer.concat([numToUInt8(VERSION), ...preimage]));
  }

  const preimage = await computeArtifactHashPreimage(artifact);
  const artifactHash = computeArtifactHash(preimage);
  getLogger().trace('Computed artifact hash', { artifactHash, ...preimage });
  return artifactHash;
}

export async function computeArtifactHashPreimage(artifact: ContractArtifact) {
  const privateFunctionRoot = await computeArtifactFunctionTreeRoot(artifact, FunctionType.PRIVATE);
  const utilityFunctionRoot = await computeArtifactFunctionTreeRoot(artifact, FunctionType.UTILITY);
  const metadataHash = computeArtifactMetadataHash(artifact);
  return { privateFunctionRoot, utilityFunctionRoot, metadataHash };
}

export function computeArtifactMetadataHash(artifact: ContractArtifact) {
  return sha256Fr(Buffer.from(deterministicStringify({ name: artifact.name, outputs: artifact.outputs }), 'utf-8'));
}

export async function computeArtifactFunctionTreeRoot(artifact: ContractArtifact, fnType: FunctionType) {
  const tree = await computeArtifactFunctionTree(artifact, fnType);
  return tree?.root ? Fr.fromBuffer(tree.root) : Fr.ZERO;
}

export async function computeArtifactFunctionTree(
  artifact: ContractArtifact,
  fnType: FunctionType,
): Promise<MerkleTree | undefined> {
  const leaves = await computeFunctionLeaves(artifact, fnType);
  // TODO(@spalladino) Consider implementing a null-object for empty trees
  if (leaves.length === 0) {
    return undefined;
  }
  const height = Math.ceil(Math.log2(leaves.length));
  const calculator = await MerkleTreeCalculator.create(height, Buffer.alloc(32), getArtifactMerkleTreeHasher());
  return calculator.computeTree(leaves.map(x => x.toBuffer()));
}

async function computeFunctionLeaves(artifact: ContractArtifact, fnType: FunctionType) {
  const selectors = await Promise.all(
    artifact.functions
      .filter(f => f.functionType === fnType)
      .map(async f => ({ ...f, selector: await FunctionSelector.fromNameAndParameters(f.name, f.parameters) })),
  );
  selectors.sort((a, b) => a.selector.value - b.selector.value);
  return await Promise.all(selectors.map(computeFunctionArtifactHash));
}

export async function computeFunctionArtifactHash(
  fn:
    | FunctionArtifact
    | (Pick<FunctionArtifact, 'bytecode'> & { functionMetadataHash: Fr; selector: FunctionSelector }),
) {
  const selector = 'selector' in fn ? fn.selector : await FunctionSelector.fromNameAndParameters(fn);

  const bytecodeHash = sha256Fr(fn.bytecode).toBuffer();
  const metadataHash = 'functionMetadataHash' in fn ? fn.functionMetadataHash : computeFunctionMetadataHash(fn);
  return sha256Fr(Buffer.concat([numToUInt8(VERSION), selector.toBuffer(), metadataHash.toBuffer(), bytecodeHash]));
}

export function computeFunctionMetadataHash(fn: FunctionArtifact) {
  return sha256Fr(Buffer.from(deterministicStringify(fn.returnTypes), 'utf8'));
}

function getLogger() {
  return createLogger('circuits:artifact_hash');
}

export function getArtifactMerkleTreeHasher() {
  return (l: Buffer, r: Buffer) => Promise.resolve(sha256Fr(Buffer.concat([l, r])).toBuffer() as Buffer<ArrayBuffer>);
}
