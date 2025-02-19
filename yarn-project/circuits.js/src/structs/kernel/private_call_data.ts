import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import {
  FUNCTION_TREE_HEIGHT,
  PROTOCOL_CONTRACT_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  UPDATES_VALUE_SIZE,
} from '../../constants.gen.js';
import { PublicKeys } from '../../types/public_keys.js';
import { MembershipWitness } from '../membership_witness.js';
import { PrivateCircuitPublicInputs } from '../private_circuit_public_inputs.js';
import { ScheduledDelayChange } from '../shared_mutable/scheduled_delay_change.js';
import { ScheduledValueChange } from '../shared_mutable/scheduled_value_change.js';
import { ProtocolContractLeafPreimage, PublicDataTreeLeafPreimage } from '../trees/index.js';
import { VerificationKeyAsFields } from '../verification_key.js';

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
  ) {}

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PrivateCallData>) {
    return [fields.publicInputs, fields.vk, fields.verificationKeyHints] as const;
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
    /**
     * The membership witness for the protocolContractLeaf.
     */
    public protocolContractMembershipWitness: MembershipWitness<typeof PROTOCOL_CONTRACT_TREE_HEIGHT>,
    /**
     * The leaf of the protocol contract tree, of either:
     *  The protocol contract being called.
     *  The low leaf showing that the address of the contract being called is not in the tree.
     */
    public protocolContractLeaf: ProtocolContractLeafPreimage,
    /**
     * The hash of the ACIR of the function being invoked.
     */
    public acirHash: Fr,

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
      fields.protocolContractMembershipWitness,
      fields.protocolContractLeaf,
      fields.acirHash,
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
      reader.readObject(MembershipWitness.deserializer(PROTOCOL_CONTRACT_TREE_HEIGHT)),
      reader.readObject(ProtocolContractLeafPreimage),
      reader.readObject(Fr),
      reader.readObject(UpdatedClassIdHints),
    );
  }
}

export class UpdatedClassIdHints {
  constructor(
    public updatedClassIdWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
    public updatedClassIdLeaf: PublicDataTreeLeafPreimage,
    public updatedClassIdValueChange: ScheduledValueChange,
    public updatedClassIdDelayChange: ScheduledDelayChange,
  ) {}

  static getFields(fields: FieldsOf<UpdatedClassIdHints>) {
    return [
      fields.updatedClassIdWitness,
      fields.updatedClassIdLeaf,
      fields.updatedClassIdValueChange,
      fields.updatedClassIdDelayChange,
    ] as const;
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
          return ScheduledValueChange.fromBuffer(reader, UPDATES_VALUE_SIZE);
        },
      }),
      reader.readObject(ScheduledDelayChange),
    );
  }
}
