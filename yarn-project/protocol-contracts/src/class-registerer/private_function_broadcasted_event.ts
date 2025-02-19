import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  type ExecutablePrivateFunctionWithMembershipProof,
  FUNCTION_TREE_HEIGHT,
  MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  type PrivateFunction,
  REGISTERER_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS,
} from '@aztec/circuits.js';
import { FunctionSelector, bufferFromFields } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple } from '@aztec/foundation/serialize';

import chunk from 'lodash.chunk';

import { REGISTERER_PRIVATE_FUNCTION_BROADCASTED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegisterer. */
export class PrivateFunctionBroadcastedEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly artifactMetadataHash: Fr,
    public readonly unconstrainedFunctionsArtifactTreeRoot: Fr,
    public readonly privateFunctionTreeSiblingPath: Tuple<Fr, typeof FUNCTION_TREE_HEIGHT>,
    public readonly privateFunctionTreeLeafIndex: number,
    public readonly artifactFunctionTreeSiblingPath: Tuple<Fr, typeof ARTIFACT_FUNCTION_TREE_MAX_HEIGHT>,
    public readonly artifactFunctionTreeLeafIndex: number,
    public readonly privateFunction: BroadcastedPrivateFunction,
  ) {}

  static isPrivateFunctionBroadcastedEvent(log: Buffer) {
    return log.subarray(0, 32).equals(REGISTERER_PRIVATE_FUNCTION_BROADCASTED_TAG.toBuffer());
  }

  static fromLog(log: Buffer) {
    const expectedLength =
      32 *
      (MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS +
        REGISTERER_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS);
    if (log.length !== expectedLength) {
      throw new Error(
        `Unexpected PrivateFunctionBroadcastedEvent log length: got ${log.length} but expected ${expectedLength}`,
      );
    }

    const reader = new BufferReader(log.subarray(32));
    const event = PrivateFunctionBroadcastedEvent.fromBuffer(reader);
    if (!reader.isEmpty()) {
      throw new Error(
        `Unexpected data after parsing PrivateFunctionBroadcastedEvent: ${reader.readToEnd().toString('hex')}`,
      );
    }

    return event;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const contractClassId = reader.readObject(Fr);
    const artifactMetadataHash = reader.readObject(Fr);
    const unconstrainedFunctionsArtifactTreeRoot = reader.readObject(Fr);
    const privateFunctionTreeSiblingPath = reader.readArray(FUNCTION_TREE_HEIGHT, Fr);
    const privateFunctionTreeLeafIndex = reader.readObject(Fr).toNumber();
    const artifactFunctionTreeSiblingPath = reader.readArray(ARTIFACT_FUNCTION_TREE_MAX_HEIGHT, Fr);
    const artifactFunctionTreeLeafIndex = reader.readObject(Fr).toNumber();
    const privateFunction = BroadcastedPrivateFunction.fromBuffer(reader);

    return new PrivateFunctionBroadcastedEvent(
      contractClassId,
      artifactMetadataHash,
      unconstrainedFunctionsArtifactTreeRoot,
      privateFunctionTreeSiblingPath,
      privateFunctionTreeLeafIndex,
      artifactFunctionTreeSiblingPath,
      artifactFunctionTreeLeafIndex,
      privateFunction,
    );
  }

  toFunctionWithMembershipProof(): ExecutablePrivateFunctionWithMembershipProof {
    return {
      ...this.privateFunction,
      bytecode: this.privateFunction.bytecode,
      functionMetadataHash: this.privateFunction.metadataHash,
      artifactMetadataHash: this.artifactMetadataHash,
      unconstrainedFunctionsArtifactTreeRoot: this.unconstrainedFunctionsArtifactTreeRoot,
      privateFunctionTreeSiblingPath: this.privateFunctionTreeSiblingPath,
      privateFunctionTreeLeafIndex: this.privateFunctionTreeLeafIndex,
      artifactTreeSiblingPath: this.artifactFunctionTreeSiblingPath.filter(fr => !fr.isZero()),
      artifactTreeLeafIndex: this.artifactFunctionTreeLeafIndex,
    };
  }
}

export class BroadcastedPrivateFunction implements PrivateFunction {
  constructor(
    /** Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol. */
    public readonly selector: FunctionSelector,
    /** Artifact metadata hash */
    public readonly metadataHash: Fr,
    /** Hash of the verification key associated to this private function. */
    public readonly vkHash: Fr,
    /** ACIR and Brillig bytecode */
    public readonly bytecode: Buffer,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const selector = FunctionSelector.fromField(reader.readObject(Fr));
    const metadataHash = reader.readObject(Fr);
    const vkHash = reader.readObject(Fr);
    const encodedBytecode = reader.readBytes(MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS * 32);
    const bytecode = bufferFromFields(chunk(encodedBytecode, Fr.SIZE_IN_BYTES).map(Buffer.from).map(Fr.fromBuffer));
    return new BroadcastedPrivateFunction(selector, metadataHash, vkHash, bytecode);
  }
}
