import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { type ContractClassIdPreimage } from '../../contract/contract_class_id.js';
import { PublicKeys } from '../../types/public_keys.js';
import { Gas } from '../gas.js';
import { PublicCircuitPublicInputs } from '../public_circuit_public_inputs.js';
import { Vector } from '../shared.js';

// TODO: Consider just using Tuple.
export class AvmKeyValueHint {
  constructor(public readonly key: Fr, public readonly value: Fr) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmKeyValueHint.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return this.key.isEmpty() && this.value.isEmpty();
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmKeyValueHint>): AvmKeyValueHint {
    return new AvmKeyValueHint(...AvmKeyValueHint.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmKeyValueHint>) {
    return [fields.key, fields.value] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buff);
    return new AvmKeyValueHint(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmKeyValueHint {
    return AvmKeyValueHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmExternalCallHint {
  public readonly returnData: Vector<Fr>;

  /**
   * Creates a new instance.
   * @param success whether the external call was successful (= did NOT revert).
   * @param returnData the data returned by the external call.
   * @param gasUsed gas used by the external call (not including the cost of the CALL opcode itself).
   * @param endSideEffectCounter value of side effect counter at the end of the external call.
   */
  constructor(
    public readonly success: Fr,
    returnData: Fr[],
    public readonly gasUsed: Gas,
    public readonly endSideEffectCounter: Fr,
    public readonly contractAddress: AztecAddress,
  ) {
    this.returnData = new Vector(returnData);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmExternalCallHint.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return (
      this.success.isZero() &&
      this.returnData.items.length == 0 &&
      this.gasUsed.isEmpty() &&
      this.endSideEffectCounter.isZero() &&
      this.contractAddress.isZero()
    );
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmExternalCallHint>): AvmExternalCallHint {
    return new AvmExternalCallHint(
      fields.success,
      fields.returnData.items,
      fields.gasUsed,
      fields.endSideEffectCounter,
      fields.contractAddress,
    );
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmExternalCallHint>) {
    return [fields.success, fields.returnData, fields.gasUsed, fields.endSideEffectCounter, fields.contractAddress];
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmExternalCallHint {
    const reader = BufferReader.asReader(buff);
    return new AvmExternalCallHint(
      Fr.fromBuffer(reader),
      reader.readVector(Fr),
      reader.readObject<Gas>(Gas),
      Fr.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmExternalCallHint {
    return AvmExternalCallHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmContractInstanceHint {
  constructor(
    public readonly address: Fr,
    public readonly exists: boolean,
    public readonly salt: Fr,
    public readonly deployer: Fr,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
  ) {}
  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmContractInstanceHint.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return (
      this.address.isZero() &&
      !this.exists &&
      this.salt.isZero() &&
      this.deployer.isZero() &&
      this.contractClassId.isZero() &&
      this.initializationHash.isZero() &&
      this.publicKeys.isEmpty()
    );
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmContractInstanceHint>): AvmContractInstanceHint {
    return new AvmContractInstanceHint(...AvmContractInstanceHint.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmContractInstanceHint>) {
    return [
      fields.address,
      fields.exists,
      fields.salt,
      fields.deployer,
      fields.contractClassId,
      fields.initializationHash,
      fields.publicKeys,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmContractInstanceHint {
    const reader = BufferReader.asReader(buff);
    return new AvmContractInstanceHint(
      Fr.fromBuffer(reader),
      reader.readBoolean(),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      PublicKeys.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmContractInstanceHint {
    return AvmContractInstanceHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmContractBytecodeHints {
  /*
   * @param bytecode currently the bytecode of the nested call function, will be changed to the contract bytecode (via the dispatch function) of the nested call
   * @param contractInstance the contract instance of the nested call, used to derive the contract address
   * @param contractClassPreimage the contract class preimage of the nested call, used to derive the class id
   * */
  constructor(
    public readonly bytecode: Buffer,
    public contractInstanceHint: AvmContractInstanceHint,
    public contractClassHint: ContractClassIdPreimage,
  ) {}
  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmContractBytecodeHints.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return this.bytecode.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmContractBytecodeHints>): AvmContractBytecodeHints {
    return new AvmContractBytecodeHints(fields.bytecode, fields.contractInstanceHint, fields.contractClassHint);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmContractBytecodeHints>) {
    // Buffers aren't serialised the same way as they are read (lenth prefixed), so we need to do this manually.
    const lengthPrefixedBytecode = Buffer.alloc(fields.bytecode.length + 4);
    // Add a 4-byte length prefix to the bytecode.
    lengthPrefixedBytecode.writeUInt32BE(fields.bytecode.length);
    fields.bytecode.copy(lengthPrefixedBytecode, 4);
    return [
      lengthPrefixedBytecode,
      /* Contract Instance - exclude version */
      fields.contractInstanceHint,
      /* Contract Class */
      fields.contractClassHint.artifactHash,
      fields.contractClassHint.privateFunctionsRoot,
      fields.contractClassHint.publicBytecodeCommitment,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmContractBytecodeHints {
    const reader = BufferReader.asReader(buff);
    const bytecode = reader.readBuffer();
    const contractInstanceHint = AvmContractInstanceHint.fromBuffer(reader);
    const contractClassHint = {
      artifactHash: Fr.fromBuffer(reader),
      privateFunctionsRoot: Fr.fromBuffer(reader),
      publicBytecodeCommitment: Fr.fromBuffer(reader),
    };
    return new AvmContractBytecodeHints(bytecode, contractInstanceHint, contractClassHint);
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmContractBytecodeHints {
    return AvmContractBytecodeHints.fromBuffer(Buffer.from(str, 'hex'));
  }
}

// TODO(dbanks12): rename AvmCircuitHints
export class AvmExecutionHints {
  public readonly storageValues: Vector<AvmKeyValueHint>;
  public readonly noteHashExists: Vector<AvmKeyValueHint>;
  public readonly nullifierExists: Vector<AvmKeyValueHint>;
  public readonly l1ToL2MessageExists: Vector<AvmKeyValueHint>;
  public readonly externalCalls: Vector<AvmExternalCallHint>;
  public readonly contractInstances: Vector<AvmContractInstanceHint>;
  public readonly contractBytecodeHints: Vector<AvmContractBytecodeHints>;

  constructor(
    storageValues: AvmKeyValueHint[],
    noteHashExists: AvmKeyValueHint[],
    nullifierExists: AvmKeyValueHint[],
    l1ToL2MessageExists: AvmKeyValueHint[],
    externalCalls: AvmExternalCallHint[],
    contractInstances: AvmContractInstanceHint[],
    contractBytecodeHints: AvmContractBytecodeHints[],
  ) {
    this.storageValues = new Vector(storageValues);
    this.noteHashExists = new Vector(noteHashExists);
    this.nullifierExists = new Vector(nullifierExists);
    this.l1ToL2MessageExists = new Vector(l1ToL2MessageExists);
    this.externalCalls = new Vector(externalCalls);
    this.contractInstances = new Vector(contractInstances);
    this.contractBytecodeHints = new Vector(contractBytecodeHints);
  }

  /**
   * Return an empty instance.
   * @returns an empty instance.
   */
  empty() {
    return new AvmExecutionHints([], [], [], [], [], [], []);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmExecutionHints.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return (
      this.storageValues.items.length == 0 &&
      this.noteHashExists.items.length == 0 &&
      this.nullifierExists.items.length == 0 &&
      this.l1ToL2MessageExists.items.length == 0 &&
      this.externalCalls.items.length == 0 &&
      this.contractInstances.items.length == 0 &&
      this.contractBytecodeHints.items.length == 0
    );
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmExecutionHints instance.
   */
  static from(fields: FieldsOf<AvmExecutionHints>): AvmExecutionHints {
    return new AvmExecutionHints(
      fields.storageValues.items,
      fields.noteHashExists.items,
      fields.nullifierExists.items,
      fields.l1ToL2MessageExists.items,
      fields.externalCalls.items,
      fields.contractInstances.items,
      fields.contractBytecodeHints.items,
    );
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmExecutionHints>) {
    return [
      fields.storageValues,
      fields.noteHashExists,
      fields.nullifierExists,
      fields.l1ToL2MessageExists,
      fields.externalCalls,
      fields.contractInstances,
      fields.contractBytecodeHints,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmExecutionHints {
    const reader = BufferReader.asReader(buff);
    return new AvmExecutionHints(
      reader.readVector(AvmKeyValueHint),
      reader.readVector(AvmKeyValueHint),
      reader.readVector(AvmKeyValueHint),
      reader.readVector(AvmKeyValueHint),
      reader.readVector(AvmExternalCallHint),
      reader.readVector(AvmContractInstanceHint),
      reader.readVector(AvmContractBytecodeHints),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmCircuitInputs {
    return AvmCircuitInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Construct an empty instance.
   * @returns The empty instance.
   */
  static empty() {
    return new AvmExecutionHints([], [], [], [], [], [], []);
  }
}

export class AvmCircuitInputs {
  constructor(
    public readonly functionName: string, // only informational
    public readonly calldata: Fr[],
    public readonly publicInputs: PublicCircuitPublicInputs,
    public readonly avmHints: AvmExecutionHints,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    const functionNameBuffer = Buffer.from(this.functionName);
    return serializeToBuffer(
      functionNameBuffer.length,
      functionNameBuffer,
      this.calldata.length,
      this.calldata,
      this.publicInputs.toBuffer(),
      this.avmHints.toBuffer(),
    );
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return (
      this.functionName.length == 0 &&
      this.calldata.length == 0 &&
      this.publicInputs.isEmpty() &&
      this.avmHints.isEmpty()
    );
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
    return [fields.functionName, fields.calldata, fields.publicInputs, fields.avmHints] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmCircuitInputs {
    const reader = BufferReader.asReader(buff);
    return new AvmCircuitInputs(
      /*functionName=*/ reader.readBuffer().toString(),
      /*calldata=*/ reader.readVector(Fr),
      PublicCircuitPublicInputs.fromBuffer(reader),
      AvmExecutionHints.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmCircuitInputs {
    return AvmCircuitInputs.fromBuffer(Buffer.from(str, 'hex'));
  }
}
