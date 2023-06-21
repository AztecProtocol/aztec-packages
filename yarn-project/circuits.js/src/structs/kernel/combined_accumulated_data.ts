import { serializeToBuffer } from '../../utils/serialize.js';
import { AggregationObject } from '../aggregation_object.js';
import {
  KERNEL_NEW_L2_TO_L1_MSGS_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_CONTRACTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_DATA_READS_LENGTH,
  KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH,
  NEW_L2_TO_L1_MSGS_LENGTH,
  NUM_FIELDS_PER_SHA256,
} from '../constants.js';
import { FunctionData } from '../function_data.js';
import { BufferReader, Tuple } from '@aztec/foundation/serialize';
import { assertMemberLength, makeTuple } from '../../index.js';
import { EthAddress, AztecAddress, Fr } from '../index.js';

/**
 * The information assembled after the contract deployment was processed by the private kernel circuit.
 *
 * Note: Not to be confused with `ContractDeploymentData`.
 */
export class NewContractData {
  /**
   * Ethereum address of the portal contract on L1.
   */
  public portalContractAddress: EthAddress;
  constructor(
    /**
     * Aztec address of the contract.
     */
    public contractAddress: AztecAddress,
    /**
     * Ethereum address of the portal contract on L1.
     * TODO(AD): refactor this later
     * currently there is a kludge with circuits cpp as it emits an AztecAddress
     */
    portalContractAddress: EthAddress | AztecAddress,
    /**
     * Function tree root of the contract.
     */
    public functionTreeRoot: Fr,
  ) {
    // Handle circuits emitting this as an AztecAddress
    this.portalContractAddress = new EthAddress(portalContractAddress.toBuffer());
  }

  toBuffer() {
    return serializeToBuffer(this.contractAddress, this.portalContractAddress, this.functionTreeRoot);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized `NewContractData`.
   */
  static fromBuffer(buffer: Buffer | BufferReader): NewContractData {
    const reader = BufferReader.asReader(buffer);
    return new NewContractData(reader.readObject(AztecAddress), new EthAddress(reader.readBytes(32)), reader.readFr());
  }

  static empty() {
    return new NewContractData(AztecAddress.ZERO, EthAddress.ZERO, Fr.ZERO);
  }
}

/**
 * Info which a user might want to reveal to the world.
 * Note: Currently not used (2023-05-12).
 */
export class OptionallyRevealedData {
  /**
   * Address of the portal contract corresponding to the L2 contract on which the function above was invoked.
   *
   * TODO(AD): refactor this later
   * currently there is a kludge with circuits cpp as it emits an AztecAddress
   */
  public portalContractAddress: EthAddress;
  constructor(
    /**
     * Hash of the call stack item from which this info was originates.
     */
    public callStackItemHash: Fr,
    /**
     * Function data of a function call from which this info originates.
     */
    public functionData: FunctionData,
    /**
     * Verification key hash of the function call from which this info originates.
     */
    public vkHash: Fr,
    /**
     * Address of the portal contract corresponding to the L2 contract on which the function above was invoked.
     *
     * TODO(AD): refactor this later
     * currently there is a kludge with circuits cpp as it emits an AztecAddress
     */
    portalContractAddress: EthAddress | AztecAddress,
    /**
     * Whether the fee was paid from the L1 account of the user.
     */
    public payFeeFromL1: boolean,
    /**
     * Whether the fee was paid from a public account on L2.
     */
    public payFeeFromPublicL2: boolean,
    /**
     * Whether the function call was invoked from L1.
     */
    public calledFromL1: boolean,
    /**
     * Whether the function call was invoked from the public L2 account of the user.
     */
    public calledFromPublicL2: boolean,
  ) {
    // Handle circuits emitting this as an AztecAddress
    this.portalContractAddress = EthAddress.fromField(portalContractAddress.toField());
  }

  toBuffer() {
    return serializeToBuffer(
      this.callStackItemHash,
      this.functionData,
      this.vkHash,
      this.portalContractAddress,
      this.payFeeFromL1,
      this.payFeeFromPublicL2,
      this.calledFromL1,
      this.calledFromPublicL2,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized OptionallyRevealedData.
   */
  static fromBuffer(buffer: Buffer | BufferReader): OptionallyRevealedData {
    const reader = BufferReader.asReader(buffer);
    return new OptionallyRevealedData(
      reader.readFr(),
      reader.readObject(FunctionData),
      reader.readFr(),
      new EthAddress(reader.readBytes(32)),
      reader.readBoolean(),
      reader.readBoolean(),
      reader.readBoolean(),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new OptionallyRevealedData(
      Fr.ZERO,
      FunctionData.empty(),
      Fr.ZERO,
      EthAddress.ZERO,
      false,
      false,
      false,
      false,
    );
  }
}

/**
 * Read operations from the public state tree.
 */
export class PublicDataRead {
  constructor(
    /**
     * Index of the leaf in the public data tree.
     */
    public readonly leafIndex: Fr,
    /**
     * Returned value from the public data tree.
     */
    public readonly value: Fr,
  ) {}

  static from(args: {
    /**
     * Index of the leaf in the public data tree.
     */
    leafIndex: Fr;
    /**
     * Returned value from the public data tree.
     */
    value: Fr;
  }) {
    return new PublicDataRead(args.leafIndex, args.value);
  }

  toBuffer() {
    return serializeToBuffer(this.leafIndex, this.value);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataRead(reader.readFr(), reader.readFr());
  }

  static empty() {
    return new PublicDataRead(Fr.ZERO, Fr.ZERO);
  }

  toFriendlyJSON() {
    return `Leaf=${this.leafIndex.toFriendlyJSON()}: ${this.value.toFriendlyJSON()}`;
  }
}

/**
 * Write operations on the public data tree including the previous value.
 */
export class PublicDataUpdateRequest {
  constructor(
    /**
     * Index of the leaf in the public data tree which is to be updated.
     */
    public readonly leafIndex: Fr,
    /**
     * Old value of the leaf.
     */
    public readonly oldValue: Fr,
    /**
     * New value of the leaf.
     */
    public readonly newValue: Fr,
  ) {}

  static from(args: {
    /**
     * Index of the leaf in the public data tree which is to be updated.
     */
    leafIndex: Fr;
    /**
     * Old value of the leaf.
     */
    oldValue: Fr;
    /**
     * New value of the leaf.
     */
    newValue: Fr;
  }) {
    return new PublicDataUpdateRequest(args.leafIndex, args.oldValue, args.newValue);
  }

  toBuffer() {
    return serializeToBuffer(this.leafIndex, this.oldValue, this.newValue);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataUpdateRequest(reader.readFr(), reader.readFr(), reader.readFr());
  }

  static empty() {
    return new PublicDataUpdateRequest(Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }

  toFriendlyJSON() {
    return `Leaf=${this.leafIndex.toFriendlyJSON()}: ${this.oldValue.toFriendlyJSON()} => ${this.newValue.toFriendlyJSON()}`;
  }
}

/**
 * Data that is accumulated during the execution of the transaction.
 */
export class CombinedAccumulatedData {
  constructor(
    /**
     * Aggregated proof of all the previous kernel iterations.
     */
    public aggregationObject: AggregationObject, // Contains the aggregated proof of all previous kernel iterations
    /**
     * The number of new commitments made in this transaction.
     */
    public newCommitments: Tuple<Fr, typeof KERNEL_NEW_COMMITMENTS_LENGTH>,
    /**
     * The number of new nullifiers made in this transaction.
     */
    public newNullifiers: Tuple<Fr, typeof KERNEL_NEW_NULLIFIERS_LENGTH>,
    /**
     * Current private call stack.
     */
    public privateCallStack: Tuple<Fr, typeof KERNEL_PRIVATE_CALL_STACK_LENGTH>,
    /**
     * Current public call stack.
     */
    public publicCallStack: Tuple<Fr, typeof KERNEL_PUBLIC_CALL_STACK_LENGTH>,
    /**
     * All the new L2 to L1 messages created in this transaction.
     */
    public newL2ToL1Msgs: Tuple<Fr, typeof NEW_L2_TO_L1_MSGS_LENGTH>,
    /**
     * Accumulated encrypted logs hash from all the previous kernel iterations.
     * Note: Represented as a tuple of 2 fields in order to fit in all of the 256 bits of sha256 hash.
     */
    public encryptedLogsHash: Tuple<Fr, typeof NUM_FIELDS_PER_SHA256>,
    /**
     * Accumulated unencrypted logs hash from all the previous kernel iterations.
     * Note: Represented as a tuple of 2 fields in order to fit in all of the 256 bits of sha256 hash.
     */
    public unencryptedLogsHash: Tuple<Fr, typeof NUM_FIELDS_PER_SHA256>,
    /**
     * Total accumulated length of the encrypted log preimages emitted in all the previous kernel iterations
     */
    public encryptedLogPreimagesLength: Fr,
    /**
     * Total accumulated length of the unencrypted log preimages emitted in all the previous kernel iterations
     */
    public unencryptedLogPreimagesLength: Fr,
    /**
     * All the new contracts deployed in this transaction.
     */
    public newContracts: Tuple<NewContractData, typeof KERNEL_NEW_CONTRACTS_LENGTH>,
    /**
     * All the optionally revealed data in this transaction.
     */
    public optionallyRevealedData: Tuple<OptionallyRevealedData, typeof KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH>,
    /**
     * All the public data update requests made in this transaction.
     */
    public publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH>,
    /**
     * All the public data reads made in this transaction.
     */
    public publicDataReads: Tuple<PublicDataRead, typeof KERNEL_PUBLIC_DATA_READS_LENGTH>,
  ) {
    assertMemberLength(this, 'newCommitments', KERNEL_NEW_COMMITMENTS_LENGTH);
    assertMemberLength(this, 'newNullifiers', KERNEL_NEW_NULLIFIERS_LENGTH);
    assertMemberLength(this, 'privateCallStack', KERNEL_PRIVATE_CALL_STACK_LENGTH);
    assertMemberLength(this, 'publicCallStack', KERNEL_PUBLIC_CALL_STACK_LENGTH);
    assertMemberLength(this, 'newL2ToL1Msgs', KERNEL_NEW_L2_TO_L1_MSGS_LENGTH);
    assertMemberLength(this, 'encryptedLogsHash', NUM_FIELDS_PER_SHA256);
    assertMemberLength(this, 'unencryptedLogsHash', NUM_FIELDS_PER_SHA256);
    assertMemberLength(this, 'newContracts', KERNEL_NEW_CONTRACTS_LENGTH);
    assertMemberLength(this, 'optionallyRevealedData', KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH);
    assertMemberLength(this, 'publicDataUpdateRequests', KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH);
    assertMemberLength(this, 'publicDataReads', KERNEL_PUBLIC_DATA_READS_LENGTH);
  }

  toBuffer() {
    return serializeToBuffer(
      this.aggregationObject,
      this.newCommitments,
      this.newNullifiers,
      this.privateCallStack,
      this.publicCallStack,
      this.newL2ToL1Msgs,
      this.encryptedLogsHash,
      this.unencryptedLogsHash,
      this.encryptedLogPreimagesLength,
      this.unencryptedLogPreimagesLength,
      this.newContracts,
      this.optionallyRevealedData,
      this.publicDataUpdateRequests,
      this.publicDataReads,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedAccumulatedData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedAccumulatedData(
      reader.readObject(AggregationObject),
      reader.readArray(KERNEL_NEW_COMMITMENTS_LENGTH, Fr),
      reader.readArray(KERNEL_NEW_NULLIFIERS_LENGTH, Fr),
      reader.readArray(KERNEL_PRIVATE_CALL_STACK_LENGTH, Fr),
      reader.readArray(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr),
      reader.readArray(KERNEL_NEW_L2_TO_L1_MSGS_LENGTH, Fr),
      reader.readArray(2, Fr),
      reader.readArray(2, Fr),
      reader.readFr(),
      reader.readFr(),
      reader.readArray(KERNEL_NEW_CONTRACTS_LENGTH, NewContractData),
      reader.readArray(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, OptionallyRevealedData),
      reader.readArray(KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH, PublicDataUpdateRequest),
      reader.readArray(KERNEL_PUBLIC_DATA_READS_LENGTH, PublicDataRead),
    );
  }

  static empty() {
    return new CombinedAccumulatedData(
      AggregationObject.makeFake(),
      makeTuple(KERNEL_NEW_COMMITMENTS_LENGTH, Fr.zero),
      makeTuple(KERNEL_NEW_NULLIFIERS_LENGTH, Fr.zero),
      makeTuple(KERNEL_PRIVATE_CALL_STACK_LENGTH, Fr.zero),
      makeTuple(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr.zero),
      makeTuple(KERNEL_NEW_L2_TO_L1_MSGS_LENGTH, Fr.zero),
      makeTuple(2, Fr.zero),
      makeTuple(2, Fr.zero),
      Fr.zero(),
      Fr.zero(),
      makeTuple(KERNEL_NEW_CONTRACTS_LENGTH, NewContractData.empty),
      makeTuple(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, OptionallyRevealedData.empty),
      makeTuple(KERNEL_PUBLIC_DATA_UPDATE_REQUESTS_LENGTH, PublicDataUpdateRequest.empty),
      makeTuple(KERNEL_PUBLIC_DATA_READS_LENGTH, PublicDataRead.empty),
    );
  }
}
