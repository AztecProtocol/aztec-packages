import { PublicDataTreeLeafPreimage } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { type ContractClassIdPreimage } from '../../contract/contract_class_id.js';
import { PublicKeys } from '../../types/public_keys.js';
import { PublicCircuitPublicInputs } from '../public_circuit_public_inputs.js';
import { Vector } from '../shared.js';
import { NullifierLeafPreimage } from '../trees/nullifier_leaf.js';
import { AvmCircuitPublicInputs } from './avm_circuit_public_inputs.js';

export class AvmEnqueuedCallHint {
  public readonly contractAddress: AztecAddress;
  public readonly calldata: Vector<Fr>;

  constructor(contractAddress: AztecAddress, calldata: Fr[]) {
    this.contractAddress = contractAddress;
    this.calldata = new Vector(calldata);
  }

  /* Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmEnqueuedCallHint.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return this.contractAddress.isZero() && this.calldata.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmExecutionHints instance.
   */
  static from(fields: FieldsOf<AvmEnqueuedCallHint>): AvmEnqueuedCallHint {
    return new AvmEnqueuedCallHint(fields.contractAddress, fields.calldata.items);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmEnqueuedCallHint>) {
    return [fields.contractAddress, fields.calldata] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buff);
    return new AvmEnqueuedCallHint(AztecAddress.fromBuffer(reader), reader.readVector(Fr));
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmEnqueuedCallHint {
    return AvmEnqueuedCallHint.fromBuffer(hexToBuffer(str));
  }
}

export class AvmContractInstanceHint {
  constructor(
    public readonly address: AztecAddress,
    public readonly exists: boolean,
    public readonly salt: Fr,
    public readonly deployer: AztecAddress,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
    public readonly membershipHint: AvmNullifierReadTreeHint = AvmNullifierReadTreeHint.empty(),
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
    return bufferToHex(this.toBuffer());
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
      this.publicKeys.isEmpty() &&
      this.membershipHint.isEmpty()
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
      fields.membershipHint,
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
      AztecAddress.fromBuffer(reader),
      reader.readBoolean(),
      Fr.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      PublicKeys.fromBuffer(reader),
      AvmNullifierReadTreeHint.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmContractInstanceHint {
    return AvmContractInstanceHint.fromBuffer(hexToBuffer(str));
  }
}

export class AvmContractBytecodeHints {
  /*
   * @param bytecode the contract bytecode
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
    return bufferToHex(this.toBuffer());
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
    // Buffers aren't serialised the same way as they are read (length prefixed), so we need to do this manually.
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
    return AvmContractBytecodeHints.fromBuffer(hexToBuffer(str));
  }
}

export class AvmAppendTreeHint {
  readonly siblingPath: Vector<Fr>;
  /*
   * @param bytecode the contract bytecode
   * @param contractInstance the contract instance of the nested call, used to derive the contract address
   * @param contractClassPreimage the contract class preimage of the nested call, used to derive the class id
   * */
  constructor(public readonly leafIndex: Fr, public readonly value: Fr, readonly _siblingPath: Fr[]) {
    this.siblingPath = new Vector(_siblingPath);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmAppendTreeHint.getFields(this));
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
    return this.value.isZero() && this.siblingPath.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmAppendTreeHint>): AvmAppendTreeHint {
    return new AvmAppendTreeHint(fields.leafIndex, fields.value, fields.siblingPath.items);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmAppendTreeHint>) {
    return [fields.leafIndex, fields.value, fields.siblingPath] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmAppendTreeHint {
    return new AvmAppendTreeHint(Fr.fromBuffer(buff), Fr.fromBuffer(buff), BufferReader.asReader(buff).readVector(Fr));
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmAppendTreeHint {
    return AvmAppendTreeHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmNullifierWriteTreeHint {
  readonly insertionPath: Vector<Fr>;
  /*
   * @param bytecode the contract bytecode
   * @param contractInstance the contract instance of the nested call, used to derive the contract address
   * @param contractClassPreimage the contract class preimage of the nested call, used to derive the class id
   * */
  constructor(public lowLeafRead: AvmNullifierReadTreeHint, public _insertionPath: Fr[]) {
    this.insertionPath = new Vector(_insertionPath);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmNullifierWriteTreeHint.getFields(this));
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
    return this.insertionPath.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmNullifierWriteTreeHint>): AvmNullifierWriteTreeHint {
    return new AvmNullifierWriteTreeHint(fields.lowLeafRead, fields.insertionPath.items);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmNullifierWriteTreeHint>) {
    return [...AvmNullifierReadTreeHint.getFields(fields.lowLeafRead), fields.insertionPath] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmNullifierWriteTreeHint {
    const reader = BufferReader.asReader(buff);
    const lowLeafRead = AvmNullifierReadTreeHint.fromBuffer(reader);
    const insertionPath = reader.readVector(Fr);
    return new AvmNullifierWriteTreeHint(lowLeafRead, insertionPath);
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmNullifierWriteTreeHint {
    return AvmNullifierWriteTreeHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmNullifierReadTreeHint {
  readonly lowLeafSiblingPath: Vector<Fr>;

  constructor(
    public readonly lowLeafPreimage: NullifierLeafPreimage,
    public readonly lowLeafIndex: Fr,
    public _lowLeafSiblingPath: Fr[],
  ) {
    this.lowLeafSiblingPath = new Vector(_lowLeafSiblingPath);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmNullifierReadTreeHint.getFields(this));
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
    return this.lowLeafSiblingPath.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmNullifierReadTreeHint>): AvmNullifierReadTreeHint {
    return new AvmNullifierReadTreeHint(fields.lowLeafPreimage, fields.lowLeafIndex, fields.lowLeafSiblingPath.items);
  }

  static empty(): AvmNullifierReadTreeHint {
    return new AvmNullifierReadTreeHint(NullifierLeafPreimage.empty(), Fr.ZERO, []);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmNullifierReadTreeHint>) {
    return [
      fields.lowLeafPreimage.nullifier,
      fields.lowLeafPreimage.nextNullifier,
      new Fr(fields.lowLeafPreimage.nextIndex),
      fields.lowLeafIndex,
      fields.lowLeafSiblingPath,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmNullifierReadTreeHint {
    const reader = BufferReader.asReader(buff);
    const lowLeafPreimage = reader.readObject<NullifierLeafPreimage>(NullifierLeafPreimage);
    const lowLeafIndex = Fr.fromBuffer(reader);
    const lowSiblingPath = reader.readVector(Fr);

    return new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowSiblingPath);
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmNullifierReadTreeHint {
    return AvmNullifierReadTreeHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmPublicDataReadTreeHint {
  siblingPath: Vector<Fr>;

  constructor(
    public readonly leafPreimage: PublicDataTreeLeafPreimage,
    public readonly leafIndex: Fr,
    public readonly _siblingPath: Fr[],
  ) {
    this.siblingPath = new Vector(_siblingPath);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmPublicDataReadTreeHint.getFields(this));
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
    return this.siblingPath.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmPublicDataReadTreeHint>): AvmPublicDataReadTreeHint {
    return new AvmPublicDataReadTreeHint(fields.leafPreimage, fields.leafIndex, fields.siblingPath.items);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmPublicDataReadTreeHint>) {
    return [
      fields.leafPreimage.slot,
      fields.leafPreimage.value,
      new Fr(fields.leafPreimage.nextIndex),
      fields.leafPreimage.nextSlot,
      fields.leafIndex,
      fields.siblingPath,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmPublicDataReadTreeHint {
    const reader = BufferReader.asReader(buff);
    const lowLeafPreimage = reader.readObject<PublicDataTreeLeafPreimage>(PublicDataTreeLeafPreimage);
    const lowLeafIndex = Fr.fromBuffer(reader);
    const lowSiblingPath = reader.readVector(Fr);

    return new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowSiblingPath);
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmPublicDataReadTreeHint {
    return AvmPublicDataReadTreeHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmPublicDataWriteTreeHint {
  insertionPath: Vector<Fr>;

  constructor(
    // To check the current slot has been written to
    public readonly lowLeafRead: AvmPublicDataReadTreeHint,
    public readonly newLeafPreimage: PublicDataTreeLeafPreimage,
    public readonly _insertionPath: Fr[],
  ) {
    this.insertionPath = new Vector(_insertionPath);
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...AvmPublicDataWriteTreeHint.getFields(this));
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
    return this.insertionPath.items.length == 0;
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmHint instance.
   */
  static from(fields: FieldsOf<AvmPublicDataWriteTreeHint>): AvmPublicDataWriteTreeHint {
    return new AvmPublicDataWriteTreeHint(fields.lowLeafRead, fields.newLeafPreimage, fields.insertionPath.items);
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmPublicDataWriteTreeHint>) {
    return [
      ...AvmPublicDataReadTreeHint.getFields(fields.lowLeafRead),
      fields.newLeafPreimage.slot,
      fields.newLeafPreimage.value,
      new Fr(fields.newLeafPreimage.nextIndex),
      fields.newLeafPreimage.nextSlot,
      fields.insertionPath,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmPublicDataWriteTreeHint {
    const reader = BufferReader.asReader(buff);
    const lowLeafPreimage = reader.readObject<AvmPublicDataReadTreeHint>(AvmPublicDataReadTreeHint);
    const newLeafPreimage = reader.readObject<PublicDataTreeLeafPreimage>(PublicDataTreeLeafPreimage);
    const lowSiblingPath = reader.readVector(Fr);

    return new AvmPublicDataWriteTreeHint(lowLeafPreimage, newLeafPreimage, lowSiblingPath);
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmPublicDataWriteTreeHint {
    return AvmPublicDataWriteTreeHint.fromBuffer(Buffer.from(str, 'hex'));
  }
}

export class AvmExecutionHints {
  public readonly enqueuedCalls: Vector<AvmEnqueuedCallHint>;

  public readonly contractInstances: Vector<AvmContractInstanceHint>;

  public readonly publicDataReads: Vector<AvmPublicDataReadTreeHint>;
  public readonly publicDataWrites: Vector<AvmPublicDataWriteTreeHint>;
  public readonly nullifierReads: Vector<AvmNullifierReadTreeHint>;
  public readonly nullifierWrites: Vector<AvmNullifierWriteTreeHint>;
  public readonly noteHashReads: Vector<AvmAppendTreeHint>;
  public readonly noteHashWrites: Vector<AvmAppendTreeHint>;
  public readonly l1ToL2MessageReads: Vector<AvmAppendTreeHint>;

  constructor(
    enqueuedCalls: AvmEnqueuedCallHint[],
    contractInstances: AvmContractInstanceHint[],
    // string here is the contract class id
    public contractBytecodeHints: Map<string, AvmContractBytecodeHints>,
    publicDataReads: AvmPublicDataReadTreeHint[],
    publicDataWrites: AvmPublicDataWriteTreeHint[],
    nullifierReads: AvmNullifierReadTreeHint[],
    nullifierWrites: AvmNullifierWriteTreeHint[],
    noteHashReads: AvmAppendTreeHint[],
    noteHashWrites: AvmAppendTreeHint[],
    l1ToL2MessageReads: AvmAppendTreeHint[],
  ) {
    this.enqueuedCalls = new Vector(enqueuedCalls);
    this.contractInstances = new Vector(contractInstances);
    this.publicDataReads = new Vector(publicDataReads);
    this.publicDataWrites = new Vector(publicDataWrites);
    this.nullifierReads = new Vector(nullifierReads);
    this.nullifierWrites = new Vector(nullifierWrites);
    this.noteHashReads = new Vector(noteHashReads);
    this.noteHashWrites = new Vector(noteHashWrites);
    this.l1ToL2MessageReads = new Vector(l1ToL2MessageReads);
  }

  /**
   * Return an empty instance.
   * @returns an empty instance.
   */
  static empty() {
    return new AvmExecutionHints([], [], new Map(), [], [], [], [], [], [], []);
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
    return bufferToHex(this.toBuffer());
  }

  /**
   * Is the struct empty?
   * @returns whether all members are empty.
   */
  isEmpty(): boolean {
    return (
      this.enqueuedCalls.items.length == 0 &&
      this.contractInstances.items.length == 0 &&
      this.contractBytecodeHints.size == 0 &&
      this.publicDataReads.items.length == 0 &&
      this.publicDataWrites.items.length == 0 &&
      this.nullifierReads.items.length == 0 &&
      this.nullifierWrites.items.length == 0 &&
      this.noteHashReads.items.length == 0 &&
      this.noteHashWrites.items.length == 0 &&
      this.l1ToL2MessageReads.items.length == 0
    );
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new AvmExecutionHints instance.
   */
  static from(fields: FieldsOf<AvmExecutionHints>): AvmExecutionHints {
    return new AvmExecutionHints(
      fields.enqueuedCalls.items,
      fields.contractInstances.items,
      fields.contractBytecodeHints,
      fields.publicDataReads.items,
      fields.publicDataWrites.items,
      fields.nullifierReads.items,
      fields.nullifierWrites.items,
      fields.noteHashReads.items,
      fields.noteHashWrites.items,
      fields.l1ToL2MessageReads.items,
    );
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<AvmExecutionHints>) {
    return [
      fields.enqueuedCalls,
      fields.contractInstances,
      new Vector(Array.from(fields.contractBytecodeHints.values())),
      fields.publicDataReads,
      fields.publicDataWrites,
      fields.nullifierReads,
      fields.nullifierWrites,
      fields.noteHashReads,
      fields.noteHashWrites,
      fields.l1ToL2MessageReads,
    ] as const;
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buff: Buffer | BufferReader): AvmExecutionHints {
    const reader = BufferReader.asReader(buff);

    const readMap = (r: BufferReader) => {
      const map = new Map();
      const values = r.readVector(AvmContractBytecodeHints);
      for (const value of values) {
        map.set(value.contractInstanceHint.address.toString(), value);
      }
      return map;
    };

    return new AvmExecutionHints(
      reader.readVector(AvmEnqueuedCallHint),
      reader.readVector(AvmContractInstanceHint),
      readMap(reader),
      reader.readVector(AvmPublicDataReadTreeHint),
      reader.readVector(AvmPublicDataWriteTreeHint),
      reader.readVector(AvmNullifierReadTreeHint),
      reader.readVector(AvmNullifierWriteTreeHint),
      reader.readVector(AvmAppendTreeHint),
      reader.readVector(AvmAppendTreeHint),
      reader.readVector(AvmAppendTreeHint),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmCircuitInputs {
    return AvmCircuitInputs.fromBuffer(hexToBuffer(str));
  }
}

export class AvmCircuitInputs {
  constructor(
    public readonly functionName: string, // only informational
    public readonly calldata: Fr[],
    public readonly publicInputs: PublicCircuitPublicInputs,
    public readonly avmHints: AvmExecutionHints,
    public output: AvmCircuitPublicInputs, // This should replace the above `publicInputs` eventually.
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
      this.output,
    );
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty(): AvmCircuitInputs {
    return new AvmCircuitInputs(
      '',
      [],
      PublicCircuitPublicInputs.empty(),
      AvmExecutionHints.empty(),
      AvmCircuitPublicInputs.empty(),
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
    return [fields.functionName, fields.calldata, fields.publicInputs, fields.avmHints, fields.output] as const;
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
      AvmCircuitPublicInputs.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a hex string.
   * @param str - Hex string to read from.
   * @returns The deserialized instance.
   */
  static fromString(str: string): AvmCircuitInputs {
    return AvmCircuitInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(AvmCircuitInputs);
  }
}
