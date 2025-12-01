import {
  FUNCTION_TREE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_CALL,
  MAX_ENQUEUED_CALLS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
  MAX_PRIVATE_LOGS_PER_CALL,
  PUBLIC_DATA_TREE_HEIGHT,
  TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL,
  UPDATES_VALUE_SIZE,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FieldsOf } from '@aztec/foundation/types';

import { DelayedPublicMutableValues } from '../delayed_public_mutable/delayed_public_mutable_values.js';
import { PublicKeys } from '../keys/public_keys.js';
import { PublicDataTreeLeafPreimage } from '../trees/index.js';
import type { UInt32 } from '../types/shared.js';
import { VerificationKeyAsFields } from '../vks/verification_key.js';
import { PrivateCircuitPublicInputs } from './private_circuit_public_inputs.js';

/**
 * Private call data.
 */
export class PrivateCallData {
  constructor(
    /**
     * Public inputs of the private function circuit.
     */
    public publicInputs: PrivateCircuitPublicInputs,

    /**
     * The verification key for the function being invoked.
     */
    public vk: VerificationKeyAsFields,

    /**
     * Hints for the validation of the vk
     */
    public verificationKeyHints: PrivateVerificationKeyHints,

    /**
     * Hints for validating the uniqueness of the side effects.
     */
    public sideEffectUniquenessHints: SideEffectUniquenessHints,
  ) {}

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PrivateCallData>) {
    return [fields.publicInputs, fields.vk, fields.verificationKeyHints, fields.sideEffectUniquenessHints] as const;
  }

  static from(fields: FieldsOf<PrivateCallData>): PrivateCallData {
    return new PrivateCallData(...PrivateCallData.getFields(fields));
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...PrivateCallData.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateCallData {
    const reader = BufferReader.asReader(buffer);
    return new PrivateCallData(
      reader.readObject(PrivateCircuitPublicInputs),
      reader.readObject(VerificationKeyAsFields),
      reader.readObject(PrivateVerificationKeyHints),
      reader.readObject(SideEffectUniquenessHints),
    );
  }
}

export class PrivateVerificationKeyHints {
  constructor(
    /**
     * Artifact hash of the contract class for this private call.
     */
    public contractClassArtifactHash: Fr,
    /**
     * Public bytecode commitment for the contract class for this private call.
     */
    public contractClassPublicBytecodeCommitment: Fr,
    /**
     * Public keys hash of the contract instance.
     */
    public publicKeys: PublicKeys,
    /**
     * Salted initialization hash of the contract instance.
     */
    public saltedInitializationHash: Fr,
    /**
     * The membership witness for the function leaf corresponding to the function being invoked.
     */
    public functionLeafMembershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>,

    public updatedClassIdHints: UpdatedClassIdHints,
  ) {}

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PrivateVerificationKeyHints>) {
    return [
      fields.contractClassArtifactHash,
      fields.contractClassPublicBytecodeCommitment,
      fields.publicKeys,
      fields.saltedInitializationHash,
      fields.functionLeafMembershipWitness,
      fields.updatedClassIdHints,
    ] as const;
  }

  static from(fields: FieldsOf<PrivateVerificationKeyHints>): PrivateVerificationKeyHints {
    return new PrivateVerificationKeyHints(...PrivateVerificationKeyHints.getFields(fields));
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...PrivateVerificationKeyHints.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateVerificationKeyHints {
    const reader = BufferReader.asReader(buffer);
    return new PrivateVerificationKeyHints(
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(PublicKeys),
      reader.readObject(Fr),
      reader.readObject(MembershipWitness.deserializer(FUNCTION_TREE_HEIGHT)),
      reader.readObject(UpdatedClassIdHints),
    );
  }
}

export class UpdatedClassIdHints {
  constructor(
    public updatedClassIdWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
    public updatedClassIdLeaf: PublicDataTreeLeafPreimage,
    public updatedClassIdValues: DelayedPublicMutableValues,
  ) {}

  static getFields(fields: FieldsOf<UpdatedClassIdHints>) {
    return [fields.updatedClassIdWitness, fields.updatedClassIdLeaf, fields.updatedClassIdValues] as const;
  }

  static from(fields: FieldsOf<UpdatedClassIdHints>): UpdatedClassIdHints {
    return new UpdatedClassIdHints(...UpdatedClassIdHints.getFields(fields));
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...UpdatedClassIdHints.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): UpdatedClassIdHints {
    const reader = BufferReader.asReader(buffer);
    return new UpdatedClassIdHints(
      reader.readObject(MembershipWitness.deserializer(PUBLIC_DATA_TREE_HEIGHT)),
      reader.readObject(PublicDataTreeLeafPreimage),
      reader.readObject({
        fromBuffer(reader) {
          return DelayedPublicMutableValues.fromBuffer(reader, UPDATES_VALUE_SIZE);
        },
      }),
    );
  }
}

export class SideEffectUniquenessHints {
  constructor(
    public sideEffectRanges: Tuple<SideEffectCounterRange, typeof TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL>,
    public noteHashReadRequestIndices: Tuple<UInt32, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    public nullifierReadRequestIndices: Tuple<UInt32, typeof MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    public noteHashesIndices: Tuple<UInt32, typeof MAX_NOTE_HASHES_PER_CALL>,
    public nullifiersIndices: Tuple<UInt32, typeof MAX_NULLIFIERS_PER_CALL>,
    public privateCallRequestsIndices: Tuple<UInt32, typeof MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    public publicCallRequestsIndices: Tuple<UInt32, typeof MAX_ENQUEUED_CALLS_PER_CALL>,
    public l2ToL1MsgsIndices: Tuple<UInt32, typeof MAX_L2_TO_L1_MSGS_PER_CALL>,
    public privateLogsIndices: Tuple<UInt32, typeof MAX_PRIVATE_LOGS_PER_CALL>,
    public contractClassLogsHashesIndices: Tuple<UInt32, typeof MAX_CONTRACT_CLASS_LOGS_PER_CALL>,
  ) {}

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<SideEffectUniquenessHints>) {
    return [
      fields.sideEffectRanges,
      fields.noteHashReadRequestIndices,
      fields.nullifierReadRequestIndices,
      fields.noteHashesIndices,
      fields.nullifiersIndices,
      fields.privateCallRequestsIndices,
      fields.publicCallRequestsIndices,
      fields.l2ToL1MsgsIndices,
      fields.privateLogsIndices,
      fields.contractClassLogsHashesIndices,
    ] as const;
  }

  static from(fields: FieldsOf<SideEffectUniquenessHints>): SideEffectUniquenessHints {
    return new SideEffectUniquenessHints(...SideEffectUniquenessHints.getFields(fields));
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...SideEffectUniquenessHints.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SideEffectUniquenessHints {
    const reader = BufferReader.asReader(buffer);
    return new SideEffectUniquenessHints(
      reader.readArray(TOTAL_COUNTED_SIDE_EFFECTS_PER_CALL, SideEffectCounterRange),
      reader.readNumbers(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL),
      reader.readNumbers(MAX_NULLIFIER_READ_REQUESTS_PER_CALL),
      reader.readNumbers(MAX_NOTE_HASHES_PER_CALL),
      reader.readNumbers(MAX_NULLIFIERS_PER_CALL),
      reader.readNumbers(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL),
      reader.readNumbers(MAX_ENQUEUED_CALLS_PER_CALL),
      reader.readNumbers(MAX_L2_TO_L1_MSGS_PER_CALL),
      reader.readNumbers(MAX_PRIVATE_LOGS_PER_CALL),
      reader.readNumbers(MAX_CONTRACT_CLASS_LOGS_PER_CALL),
    );
  }
}

export class SideEffectCounterRange {
  constructor(
    public start: UInt32,
    public end: UInt32,
    public sideEffectGlobalIndex: UInt32,
  ) {}

  static getFields(fields: FieldsOf<SideEffectCounterRange>) {
    return [fields.start, fields.end, fields.sideEffectGlobalIndex] as const;
  }

  static from(fields: FieldsOf<SideEffectCounterRange>): SideEffectCounterRange {
    return new SideEffectCounterRange(...SideEffectCounterRange.getFields(fields));
  }

  static empty(): SideEffectCounterRange {
    return new SideEffectCounterRange(0, 0, 0);
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(...SideEffectCounterRange.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SideEffectCounterRange {
    const reader = BufferReader.asReader(buffer);
    return new SideEffectCounterRange(reader.readNumber(), reader.readNumber(), reader.readNumber());
  }
}
