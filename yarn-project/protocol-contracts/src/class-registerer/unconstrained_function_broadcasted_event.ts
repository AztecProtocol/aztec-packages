import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS,
  REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS,
  type UnconstrainedFunction,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/circuits.js';
import { FunctionSelector, bufferFromFields } from '@aztec/foundation/abi';
import { removeArrayPaddingEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple } from '@aztec/foundation/serialize';

import chunk from 'lodash.chunk';

import { REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegisterer. */
export class UnconstrainedFunctionBroadcastedEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly artifactMetadataHash: Fr,
    public readonly privateFunctionsArtifactTreeRoot: Fr,
    public readonly artifactFunctionTreeSiblingPath: Tuple<Fr, typeof ARTIFACT_FUNCTION_TREE_MAX_HEIGHT>,
    public readonly artifactFunctionTreeLeafIndex: number,
    public readonly unconstrainedFunction: BroadcastedUnconstrainedFunction,
  ) {}

  static isUnconstrainedFunctionBroadcastedEvent(log: Buffer) {
    return log.subarray(0, 32).equals(REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_TAG.toBuffer());
  }

  static fromLog(log: Buffer) {
    const expectedLength =
      32 *
      (MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS +
        REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS);
    if (log.length !== expectedLength) {
      throw new Error(
        `Unexpected UnconstrainedFunctionBroadcastedEvent log length: got ${log.length} but expected ${expectedLength}`,
      );
    }

    const reader = new BufferReader(log.subarray(32));
    const event = UnconstrainedFunctionBroadcastedEvent.fromBuffer(reader);
    if (!reader.isEmpty()) {
      throw new Error(
        `Unexpected data after parsing UnconstrainedFunctionBroadcastedEvent: ${reader.readToEnd().toString('hex')}`,
      );
    }

    return event;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const contractClassId = reader.readObject(Fr);
    const artifactMetadataHash = reader.readObject(Fr);
    const privateFunctionsArtifactTreeRoot = reader.readObject(Fr);
    const artifactFunctionTreeSiblingPath = reader.readArray(ARTIFACT_FUNCTION_TREE_MAX_HEIGHT, Fr);
    const artifactFunctionTreeLeafIndex = reader.readObject(Fr).toNumber();
    const unconstrainedFunction = BroadcastedUnconstrainedFunction.fromBuffer(reader);

    return new UnconstrainedFunctionBroadcastedEvent(
      contractClassId,
      artifactMetadataHash,
      privateFunctionsArtifactTreeRoot,
      artifactFunctionTreeSiblingPath,
      artifactFunctionTreeLeafIndex,
      unconstrainedFunction,
    );
  }

  toFunctionWithMembershipProof(): UnconstrainedFunctionWithMembershipProof {
    // We should be able to safely remove the zero elements that pad the variable-length sibling path,
    // since a sibling with value zero can only occur on the tree leaves, so the sibling path will never end
    // in a zero. The only exception is a tree with depth 2 with one non-zero leaf, where the sibling path would
    // be a single zero element, but in that case the artifact tree should be just the single leaf.
    const artifactTreeSiblingPath = removeArrayPaddingEnd(this.artifactFunctionTreeSiblingPath, Fr.isZero);
    return {
      ...this.unconstrainedFunction,
      bytecode: this.unconstrainedFunction.bytecode,
      functionMetadataHash: this.unconstrainedFunction.metadataHash,
      artifactMetadataHash: this.artifactMetadataHash,
      privateFunctionsArtifactTreeRoot: this.privateFunctionsArtifactTreeRoot,
      artifactTreeSiblingPath,
      artifactTreeLeafIndex: this.artifactFunctionTreeLeafIndex,
    };
  }
}

export class BroadcastedUnconstrainedFunction implements UnconstrainedFunction {
  constructor(
    /** Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol. */
    public readonly selector: FunctionSelector,
    /** Artifact metadata hash */
    public readonly metadataHash: Fr,
    /** Brillig bytecode */
    public readonly bytecode: Buffer,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const selector = FunctionSelector.fromField(reader.readObject(Fr));
    const metadataHash = reader.readObject(Fr);
    const encodedBytecode = reader.readBytes(MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS * 32);
    const bytecode = bufferFromFields(chunk(encodedBytecode, Fr.SIZE_IN_BYTES).map(Buffer.from).map(Fr.fromBuffer));
    return new BroadcastedUnconstrainedFunction(selector, metadataHash, bytecode);
  }
}
