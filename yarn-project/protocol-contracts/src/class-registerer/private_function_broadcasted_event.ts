import {
  ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
  FUNCTION_TREE_HEIGHT,
  MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
  REGISTERER_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { FieldReader } from '@aztec/foundation/serialize';
import { FunctionSelector, bufferFromFields } from '@aztec/stdlib/abi';
import type { ExecutablePrivateFunctionWithMembershipProof, PrivateFunction } from '@aztec/stdlib/contract';
import type { ContractClassLog } from '@aztec/stdlib/logs';

import { ProtocolContractAddress } from '../protocol_contract_data.js';

/** Event emitted from the ContractClassRegisterer. */
export class PrivateFunctionBroadcastedEvent {
  constructor(
    public readonly contractClassId: Fr,
    public readonly artifactMetadataHash: Fr,
    public readonly utilityFunctionsTreeRoot: Fr,
    public readonly privateFunctionTreeSiblingPath: Tuple<Fr, typeof FUNCTION_TREE_HEIGHT>,
    public readonly privateFunctionTreeLeafIndex: number,
    public readonly artifactFunctionTreeSiblingPath: Tuple<Fr, typeof ARTIFACT_FUNCTION_TREE_MAX_HEIGHT>,
    public readonly artifactFunctionTreeLeafIndex: number,
    public readonly privateFunction: BroadcastedPrivateFunction,
  ) {}

  static isPrivateFunctionBroadcastedEvent(log: ContractClassLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractClassRegisterer) &&
      log.fields.fields[0].toBigInt() === REGISTERER_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE
    );
  }

  static fromLog(log: ContractClassLog) {
    const reader = new FieldReader(log.fields.fields.slice(1));
    const event = PrivateFunctionBroadcastedEvent.fromFields(reader);
    while (!reader.isFinished()) {
      const field = reader.readField();
      if (!field.isZero()) {
        throw new Error(`Unexpected data after parsing PrivateFunctionBroadcastedEvent: ${field.toString()}`);
      }
    }

    return event;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const contractClassId = reader.readField();
    const artifactMetadataHash = reader.readField();
    const utilityFunctionsTreeRoot = reader.readField();
    const privateFunctionTreeSiblingPath = reader.readFieldArray(FUNCTION_TREE_HEIGHT);
    const privateFunctionTreeLeafIndex = reader.readField().toNumber();
    const artifactFunctionTreeSiblingPath = reader.readFieldArray(ARTIFACT_FUNCTION_TREE_MAX_HEIGHT);
    const artifactFunctionTreeLeafIndex = reader.readField().toNumber();
    const privateFunction = BroadcastedPrivateFunction.fromFields(reader);

    return new PrivateFunctionBroadcastedEvent(
      contractClassId,
      artifactMetadataHash,
      utilityFunctionsTreeRoot,
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
      utilityFunctionsTreeRoot: this.utilityFunctionsTreeRoot,
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

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const selector = FunctionSelector.fromField(reader.readField());
    const metadataHash = reader.readField();
    const vkHash = reader.readField();
    // The '* 1' removes the 'Type instantiation is excessively deep and possibly infinite. ts(2589)' err
    const encodedBytecode = reader.readFieldArray(MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS * 1);
    const bytecode = bufferFromFields(encodedBytecode);
    return new BroadcastedPrivateFunction(selector, metadataHash, vkHash, bytecode);
  }
}
