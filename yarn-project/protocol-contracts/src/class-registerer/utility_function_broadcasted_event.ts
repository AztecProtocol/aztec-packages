import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS,
} from '@aztec/constants';
import { removeArrayPaddingEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { FieldReader } from '@aztec/foundation/serialize';
import { FunctionSelector, bufferFromFields } from '@aztec/stdlib/abi';
import type { UtilityFunction, UtilityFunctionWithMembershipProof } from '@aztec/stdlib/contract';
import type { ContractClassLog } from '@aztec/stdlib/logs';

import { REGISTERER_UTILITY_FUNCTION_BROADCASTED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegisterer. */
export class UtilityFunctionBroadcastedEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly artifactMetadataHash: Fr,
    public readonly privateFunctionsArtifactTreeRoot: Fr,
    public readonly artifactFunctionTreeSiblingPath: Tuple<Fr, typeof ARTIFACT_FUNCTION_TREE_MAX_HEIGHT>,
    public readonly artifactFunctionTreeLeafIndex: number,
    public readonly utilityFunction: BroadcastedUtilityFunction,
  ) {}

  static isUtilityFunctionBroadcastedEvent(log: ContractClassLog) {
    return log.fields.fields[0].equals(REGISTERER_UTILITY_FUNCTION_BROADCASTED_TAG);
  }

  static fromLog(log: ContractClassLog) {
    const reader = new FieldReader(log.fields.fields.slice(1));
    const event = UtilityFunctionBroadcastedEvent.fromFields(reader);
    while (!reader.isFinished()) {
      const field = reader.readField();
      if (!field.isZero()) {
        throw new Error(`Unexpected data after parsing UtilityFunctionBroadcastedEvent: ${field.toString()}`);
      }
    }

    return event;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const contractClassId = reader.readField();
    const artifactMetadataHash = reader.readField();
    const privateFunctionsArtifactTreeRoot = reader.readField();
    const artifactFunctionTreeSiblingPath = reader.readFieldArray(ARTIFACT_FUNCTION_TREE_MAX_HEIGHT);
    const artifactFunctionTreeLeafIndex = reader.readField().toNumber();
    const utilityFunction = BroadcastedUtilityFunction.fromFields(reader);

    return new UtilityFunctionBroadcastedEvent(
      contractClassId,
      artifactMetadataHash,
      privateFunctionsArtifactTreeRoot,
      artifactFunctionTreeSiblingPath,
      artifactFunctionTreeLeafIndex,
      utilityFunction,
    );
  }

  toFunctionWithMembershipProof(): UtilityFunctionWithMembershipProof {
    // We should be able to safely remove the zero elements that pad the variable-length sibling path,
    // since a sibling with value zero can only occur on the tree leaves, so the sibling path will never end
    // in a zero. The only exception is a tree with depth 2 with one non-zero leaf, where the sibling path would
    // be a single zero element, but in that case the artifact tree should be just the single leaf.
    const artifactTreeSiblingPath = removeArrayPaddingEnd(this.artifactFunctionTreeSiblingPath, Fr.isZero);
    return {
      ...this.utilityFunction,
      bytecode: this.utilityFunction.bytecode,
      functionMetadataHash: this.utilityFunction.metadataHash,
      artifactMetadataHash: this.artifactMetadataHash,
      privateFunctionsArtifactTreeRoot: this.privateFunctionsArtifactTreeRoot,
      artifactTreeSiblingPath,
      artifactTreeLeafIndex: this.artifactFunctionTreeLeafIndex,
    };
  }
}

export class BroadcastedUtilityFunction implements UtilityFunction {
  constructor(
    /** Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol. */
    public readonly selector: FunctionSelector,
    /** Artifact metadata hash */
    public readonly metadataHash: Fr,
    /** Brillig bytecode */
    public readonly bytecode: Buffer,
  ) {}

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const selector = FunctionSelector.fromField(reader.readField());
    const metadataHash = reader.readField();
    // The '* 1' removes the 'Type instantiation is excessively deep and possibly infinite. ts(2589)' err
    const encodedBytecode = reader.readFieldArray(MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS * 1);
    const bytecode = bufferFromFields(encodedBytecode);
    return new BroadcastedUtilityFunction(selector, metadataHash, bytecode);
  }
}
