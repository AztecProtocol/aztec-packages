import { type Fr } from '@aztec/foundation/fields';
import { serializeArrayOfBufferableToVector, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { type PublicCircuitPublicInputs } from '../public_circuit_public_inputs.js';

export class AvmHint {
  constructor(public readonly key: Fr, public readonly value: Fr) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmHint.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmHint>) {
    return [fields.key, fields.value] as const;
  }
}

export class AvmExecutionHints {
  constructor(
    public readonly storageValues: AvmHint[],
    public readonly noteHashExists: AvmHint[],
    public readonly nullifierExists: AvmHint[],
    public readonly l1ToL2MessageExists: AvmHint[],
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    // Flatten to a single array before serializing
    // Need to use serializeArrayOfBufferableToVector here to include array length in serialization
    return serializeArrayOfBufferableToVector(AvmExecutionHints.getFields(this).flat());
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmExecutionHints>) {
    return [fields.storageValues, fields.noteHashExists, fields.nullifierExists, fields.l1ToL2MessageExists] as const;
  }

  static empty() {
    return new AvmExecutionHints([], [], [], []);
  }
}

export class AvmCircuitInputs {
  constructor(
    public readonly bytecode: Buffer,
    public readonly calldata: Fr[],
    public readonly publicInputs: PublicCircuitPublicInputs,
    public readonly avmHints: AvmExecutionHints,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmCircuitInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmCircuitInputs instance.
   */
  static from(fields: FieldsOf<AvmCircuitInputs>): AvmCircuitInputs {
    return new AvmCircuitInputs(...AvmCircuitInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmCircuitInputs>) {
    return [fields.bytecode, fields.calldata, fields.publicInputs, fields.avmHints] as const;
  }
}
