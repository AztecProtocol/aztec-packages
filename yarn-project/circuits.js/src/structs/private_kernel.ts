import { CircuitsWasm, StateRead, StateTransition, getDummyPreviousKernelData } from '../index.js';
import { assertLength, FieldsOf } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';
import {
  CONTRACT_TREE_HEIGHT,
  EMITTED_EVENTS_LENGTH,
  FUNCTION_TREE_HEIGHT,
  KERNEL_L1_MSG_STACK_LENGTH,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_CONTRACTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  PRIVATE_CALL_STACK_LENGTH,
  STATE_READS_LENGTH,
  STATE_TRANSITIONS_LENGTH,
  VK_TREE_HEIGHT,
} from './constants.js';
import { FunctionData } from './function_data.js';
import { PrivateCallStackItem } from './private_call_stack_item.js';
import { AggregationObject, MembershipWitness, UInt32, UInt8Vector } from './shared.js';
import { ContractDeploymentData, SignedTxRequest, TxContext } from './tx.js';
import { VerificationKey } from './verification_key.js';
import { AztecAddress, EthAddress, Fr, BufferReader } from '@aztec/foundation';
import times from 'lodash.times';

export class PrivateOldTreeRoots {
  constructor(
    public privateDataTreeRoot: Fr,
    public nullifierTreeRoot: Fr,
    public contractTreeRoot: Fr,
    public privateKernelVkTreeRoot: Fr, // future enhancement
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.privateDataTreeRoot,
      this.nullifierTreeRoot,
      this.contractTreeRoot,
      this.privateKernelVkTreeRoot,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateOldTreeRoots {
    const reader = BufferReader.asReader(buffer);
    return new PrivateOldTreeRoots(reader.readFr(), reader.readFr(), reader.readFr(), reader.readFr());
  }

  static empty() {
    return new PrivateOldTreeRoots(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO);
  }
}

export class CombinedOldTreeRoots {
  constructor(public readonly privateOldTreeRoots: PrivateOldTreeRoots, public readonly publicDataTreeRoot: Fr) {}

  toBuffer() {
    return serializeToBuffer(this.privateOldTreeRoots, this.publicDataTreeRoot);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CombinedOldTreeRoots(reader.readObject(PrivateOldTreeRoots), reader.readFr());
  }

  static empty() {
    return new CombinedOldTreeRoots(PrivateOldTreeRoots.empty(), Fr.ZERO);
  }
}

export class CombinedConstantData {
  constructor(public oldTreeRoots: CombinedOldTreeRoots, public txContext: TxContext) {}

  toBuffer() {
    return serializeToBuffer(this.oldTreeRoots, this.txContext);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedConstantData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedConstantData(reader.readObject(CombinedOldTreeRoots), reader.readObject(TxContext));
  }

  static empty() {
    return new CombinedConstantData(CombinedOldTreeRoots.empty(), TxContext.empty());
  }
}

// Not to be confused with ContractDeploymentData (maybe think of better names)
export class NewContractData {
  constructor(
    public contractAddress: AztecAddress,
    public portalContractAddress: EthAddress,
    public functionTreeRoot: Fr,
  ) {}

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
  constructor(
    public callStackItemHash: Fr,
    public functionData: FunctionData,
    public emittedEvents: Fr[],
    public vkHash: Fr,
    public portalContractAddress: EthAddress,
    public payFeeFromL1: boolean,
    public payFeeFromPublicL2: boolean,
    public calledFromL1: boolean,
    public calledFromPublicL2: boolean,
  ) {
    assertLength(this, 'emittedEvents', EMITTED_EVENTS_LENGTH);
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
      times(EMITTED_EVENTS_LENGTH, Fr.zero),
      Fr.ZERO,
      EthAddress.ZERO,
      false,
      false,
      false,
      false,
    );
  }
}

export class CombinedAccumulatedData {
  constructor(
    public aggregationObject: AggregationObject, // Contains the aggregated proof of all previous kernel iterations

    public privateCallCount: Fr,
    public publicCallCount: Fr,

    public newCommitments: Fr[],
    public newNullifiers: Fr[],

    public privateCallStack: Fr[],
    public publicCallStack: Fr[],
    public l1MsgStack: Fr[],

    public newContracts: NewContractData[],

    public optionallyRevealedData: OptionallyRevealedData[],

    public stateTransitions: StateTransition[],
    public stateReads: StateRead[],
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
      reader.readArray(STATE_TRANSITIONS_LENGTH, StateTransition),
      reader.readArray(STATE_READS_LENGTH, StateRead),
    );
  }

  static empty() {
    return new CombinedAccumulatedData(
      AggregationObject.makeFake(),
      Fr.ZERO,
      Fr.ZERO,
      times(KERNEL_NEW_COMMITMENTS_LENGTH, Fr.zero),
      times(KERNEL_NEW_NULLIFIERS_LENGTH, Fr.zero),
      times(KERNEL_PRIVATE_CALL_STACK_LENGTH, Fr.zero),
      times(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr.zero),
      times(KERNEL_L1_MSG_STACK_LENGTH, Fr.zero),
      times(KERNEL_NEW_CONTRACTS_LENGTH, NewContractData.empty),
      times(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, OptionallyRevealedData.empty),
      times(STATE_TRANSITIONS_LENGTH, StateTransition.empty),
      times(STATE_READS_LENGTH, StateRead.empty),
    );
  }
}

/**
 * Public inputs of the public and private kernel circuits.
 * @see circuits/cpp/src/aztec3/circuits/abis/kernel_circuit_public_inputs.hpp
 */
export class KernelCircuitPublicInputs {
  constructor(
    public end: CombinedAccumulatedData,
    public constants: CombinedConstantData,
    public isPrivateKernel: boolean,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.end, this.constants, this.isPrivateKernel, this.isPrivateKernel);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): KernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new KernelCircuitPublicInputs(
      reader.readObject(CombinedAccumulatedData),
      reader.readObject(CombinedConstantData),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new KernelCircuitPublicInputs(CombinedAccumulatedData.empty(), CombinedConstantData.empty(), true);
  }
}

export class PreviousKernelData {
  constructor(
    public publicInputs: KernelCircuitPublicInputs,
    public proof: UInt8Vector,
    public vk: VerificationKey,
    public vkIndex: UInt32, // the index of the kernel circuit's vk in a big tree of kernel circuit vks
    public vkSiblingPath: Fr[],
  ) {
    assertLength(this, 'vkSiblingPath', VK_TREE_HEIGHT);
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkSiblingPath);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousKernelData {
    const reader = BufferReader.asReader(buffer);
    return new PreviousKernelData(
      reader.readObject(KernelCircuitPublicInputs),
      reader.readObject(UInt8Vector),
      reader.readObject(VerificationKey),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  /**
   * Creates an empty instance, valid enough to be accepted by circuits
   */
  static empty() {
    return new PreviousKernelData(
      KernelCircuitPublicInputs.empty(),
      makeEmptyProof(),
      VerificationKey.makeFake(),
      0,
      times(VK_TREE_HEIGHT, Fr.zero),
    );
  }
}

export class DummyPreviousKernelData {
  private static instance: DummyPreviousKernelData;

  private constructor(private data: PreviousKernelData) {}

  public static async getDummyPreviousKernelData(wasm: CircuitsWasm) {
    if (!DummyPreviousKernelData.instance) {
      const data = await getDummyPreviousKernelData(wasm);
      DummyPreviousKernelData.instance = new DummyPreviousKernelData(data);
    }

    return DummyPreviousKernelData.instance.getData();
  }

  public getData() {
    return this.data;
  }
}

/**
 * Private call data.
 * @see circuits/cpp/src/aztec3/circuits/abis/call_stack_item.hpp
 */
export class PrivateCallData {
  constructor(
    public callStackItem: PrivateCallStackItem,
    public privateCallStackPreimages: PrivateCallStackItem[],
    public proof: UInt8Vector,
    public vk: VerificationKey,
    public functionLeafMembershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>,
    public contractLeafMembershipWitness: MembershipWitness<typeof CONTRACT_TREE_HEIGHT>,
    public portalContractAddress: EthAddress,
    public acirHash: Fr,
  ) {
    assertLength(this, 'privateCallStackPreimages', PRIVATE_CALL_STACK_LENGTH);
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PrivateCallData>) {
    return [
      // NOTE: Must have same order as CPP.
      fields.callStackItem,
      fields.privateCallStackPreimages,
      fields.proof,
      fields.vk,
      fields.functionLeafMembershipWitness,
      fields.contractLeafMembershipWitness,
      fields.portalContractAddress,
      fields.acirHash,
    ] as const;
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
}

/**
 * Input to the private kernel circuit.
 */
export class PrivateKernelInputs {
  constructor(
    public signedTxRequest: SignedTxRequest,
    public previousKernel: PreviousKernelData,
    public privateCall: PrivateCallData,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.signedTxRequest, this.previousKernel, this.privateCall);
  }
}

export function makeEmptyProof() {
  return new UInt8Vector(Buffer.alloc(0));
}
