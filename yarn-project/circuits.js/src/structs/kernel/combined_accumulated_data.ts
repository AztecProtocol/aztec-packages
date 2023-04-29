import { AztecAddress, BufferReader, EthAddress, Fr, TupleOf } from '@aztec/foundation';
import { assertLength, tupleTimes } from '../../utils/jsUtils.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import { AggregationObject } from '../aggregation_object.js';
import {
  EMITTED_EVENTS_LENGTH,
  KERNEL_L1_MSG_STACK_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_CONTRACTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  STATE_READS_LENGTH,
  STATE_TRANSITIONS_LENGTH,
} from '../constants.js';
import { FunctionData } from '../function_data.js';

// Not to be confused with ContractDeploymentData (maybe think of better names)

export class NewContractData {
  public portalContractAddress: EthAddress;
  constructor(
    public contractAddress: AztecAddress,
    // TODO(AD): refactor this later
    // currently there is a kludge with circuits cpp as it emits an AztecAddress
    portalContractAddress: EthAddress | AztecAddress,
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
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): NewContractData {
    const reader = BufferReader.asReader(buffer);
    return new NewContractData(reader.readObject(AztecAddress), new EthAddress(reader.readBytes(32)), reader.readFr());
  }

  static empty() {
    return new NewContractData(AztecAddress.ZERO, EthAddress.ZERO, Fr.ZERO);
  }
}

export class OptionallyRevealedData {
  public portalContractAddress: EthAddress;
  constructor(
    public callStackItemHash: Fr,
    public functionData: FunctionData,
    public emittedEvents: TupleOf<Fr, typeof EMITTED_EVENTS_LENGTH>,
    public vkHash: Fr,
    // TODO(AD): refactor this later
    // currently there is a kludge with circuits cpp as it emits an AztecAddress
    portalContractAddress: EthAddress | AztecAddress,
    public payFeeFromL1: boolean,
    public payFeeFromPublicL2: boolean,
    public calledFromL1: boolean,
    public calledFromPublicL2: boolean,
  ) {
    assertLength(this, 'emittedEvents', EMITTED_EVENTS_LENGTH);
    // Handle circuits emitting this as an AztecAddress
    this.portalContractAddress = new EthAddress(portalContractAddress.toBuffer());
  }

  toBuffer() {
    return serializeToBuffer(
      this.callStackItemHash,
      this.functionData,
      this.emittedEvents,
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
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): OptionallyRevealedData {
    const reader = BufferReader.asReader(buffer);
    return new OptionallyRevealedData(
      reader.readFr(),
      reader.readObject(FunctionData),
      reader.readArray(EMITTED_EVENTS_LENGTH, Fr),
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
      tupleTimes(EMITTED_EVENTS_LENGTH, Fr.zero),
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
  constructor(public readonly leafIndex: Fr, public readonly value: Fr) {}

  static from(args: { leafIndex: Fr; value: Fr }) {
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
}

/**
 * Write operations on the public state tree including the previous value.
 */
export class PublicDataTransition {
  constructor(public readonly leafIndex: Fr, public readonly oldValue: Fr, public readonly newValue: Fr) {}

  static from(args: { leafIndex: Fr; oldValue: Fr; newValue: Fr }) {
    return new PublicDataTransition(args.leafIndex, args.oldValue, args.newValue);
  }

  toBuffer() {
    return serializeToBuffer(this.leafIndex, this.oldValue, this.newValue);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataTransition(reader.readFr(), reader.readFr(), reader.readFr());
  }

  static empty() {
    return new PublicDataTransition(Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}

export class CombinedAccumulatedData {
  constructor(
    public aggregationObject: AggregationObject, // Contains the aggregated proof of all previous kernel iterations
    public privateCallCount: Fr,
    public publicCallCount: Fr,
    public newCommitments: TupleOf<Fr, typeof KERNEL_NEW_COMMITMENTS_LENGTH>,
    public newNullifiers: TupleOf<Fr, typeof KERNEL_NEW_NULLIFIERS_LENGTH>,
    public privateCallStack: TupleOf<Fr, typeof KERNEL_PRIVATE_CALL_STACK_LENGTH>,
    public publicCallStack: TupleOf<Fr, typeof KERNEL_PUBLIC_CALL_STACK_LENGTH>,
    public l1MsgStack: TupleOf<Fr, typeof KERNEL_L1_MSG_STACK_LENGTH>,
    public newContracts: TupleOf<NewContractData, typeof KERNEL_NEW_CONTRACTS_LENGTH>,
    public optionallyRevealedData: TupleOf<OptionallyRevealedData, typeof KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH>,
    public stateTransitions: PublicDataTransition[],
    public stateReads: PublicDataRead[],
  ) {
    assertLength(this, 'newCommitments', KERNEL_NEW_COMMITMENTS_LENGTH);
    assertLength(this, 'newNullifiers', KERNEL_NEW_NULLIFIERS_LENGTH);
    assertLength(this, 'privateCallStack', KERNEL_PRIVATE_CALL_STACK_LENGTH);
    assertLength(this, 'publicCallStack', KERNEL_PUBLIC_CALL_STACK_LENGTH);
    assertLength(this, 'l1MsgStack', KERNEL_L1_MSG_STACK_LENGTH);
    assertLength(this, 'newContracts', KERNEL_NEW_CONTRACTS_LENGTH);
    assertLength(this, 'optionallyRevealedData', KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH);
    assertLength(this, 'stateTransitions', STATE_TRANSITIONS_LENGTH);
    assertLength(this, 'stateReads', STATE_READS_LENGTH);
  }

  toBuffer() {
    return serializeToBuffer(
      this.aggregationObject,
      this.privateCallCount,
      this.publicCallCount,
      this.newCommitments,
      this.newNullifiers,
      this.privateCallStack,
      this.publicCallStack,
      this.l1MsgStack,
      this.newContracts,
      this.optionallyRevealedData,
      this.stateTransitions,
      this.stateReads,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedAccumulatedData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedAccumulatedData(
      reader.readObject(AggregationObject),
      reader.readFr(),
      reader.readFr(),
      reader.readArray(KERNEL_NEW_COMMITMENTS_LENGTH, Fr),
      reader.readArray(KERNEL_NEW_NULLIFIERS_LENGTH, Fr),
      reader.readArray(KERNEL_PRIVATE_CALL_STACK_LENGTH, Fr),
      reader.readArray(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr),
      reader.readArray(KERNEL_L1_MSG_STACK_LENGTH, Fr),
      reader.readArray(KERNEL_NEW_CONTRACTS_LENGTH, NewContractData),
      reader.readArray(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, OptionallyRevealedData),
      reader.readArray(STATE_TRANSITIONS_LENGTH, PublicDataTransition),
      reader.readArray(STATE_READS_LENGTH, PublicDataRead),
    );
  }

  static empty() {
    return new CombinedAccumulatedData(
      AggregationObject.makeFake(),
      Fr.ZERO,
      Fr.ZERO,
      tupleTimes(KERNEL_NEW_COMMITMENTS_LENGTH, Fr.zero),
      tupleTimes(KERNEL_NEW_NULLIFIERS_LENGTH, Fr.zero),
      tupleTimes(KERNEL_PRIVATE_CALL_STACK_LENGTH, Fr.zero),
      tupleTimes(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr.zero),
      tupleTimes(KERNEL_L1_MSG_STACK_LENGTH, Fr.zero),
      tupleTimes(KERNEL_NEW_CONTRACTS_LENGTH, NewContractData.empty),
      tupleTimes(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, OptionallyRevealedData.empty),
      tupleTimes(STATE_TRANSITIONS_LENGTH, PublicDataTransition.empty),
      tupleTimes(STATE_READS_LENGTH, PublicDataRead.empty),
    );
  }
}
