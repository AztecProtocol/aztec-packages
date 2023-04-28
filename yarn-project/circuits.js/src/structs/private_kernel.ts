import { INewContractData, privateKernelDummyPreviousKernel } from '../cbind/circuits.gen.js';
import { CircuitsWasm, Proof } from '../index.js';
import { assertLength, FieldsOf, times } from '../utils/jsUtils.js';
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
  VK_TREE_HEIGHT,
} from './constants.js';
import { FunctionData } from './function_data.js';
import { PrivateCallStackItem } from './private_call_stack_item.js';
import { AggregationObject, MembershipWitness, UInt32, UInt8Vector } from './shared.js';
import { ContractDeploymentData, SignedTxRequest, TxContext } from './tx.js';
import { VerificationKey } from './verification_key.js';
import { AztecAddress, EthAddress, Fr, BufferReader, TupleOf, toTupleOf } from '@aztec/foundation';

export class HistoricTreeRoots {
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
  static fromBuffer(buffer: Buffer | BufferReader): HistoricTreeRoots {
    const reader = BufferReader.asReader(buffer);
    return new HistoricTreeRoots(reader.readFr(), reader.readFr(), reader.readFr(), reader.readFr());
  }
}

export class ConstantData {
  constructor(public historicTreeRoots: HistoricTreeRoots, public txContext: TxContext) {}

  toBuffer() {
    return serializeToBuffer(this.historicTreeRoots, this.txContext);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): ConstantData {
    const reader = BufferReader.asReader(buffer);
    return new ConstantData(reader.readObject(HistoricTreeRoots), reader.readObject(TxContext));
  }
}

export class PreviousKernelData {
  constructor(
    public publicInputs: PrivateKernelPublicInputs,
    public proof: Proof,
    public vk: VerificationKey,
    public vkIndex: UInt32, // the index of the kernel circuit's vk in a big tree of kernel circuit vks
    public vkPath: TupleOf<Fr, typeof VK_TREE_HEIGHT>,
  ) {
    assertLength(this, 'vkPath', VK_TREE_HEIGHT);
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.publicInputs,
      new UInt8Vector(this.proof.toBuffer()),
      this.vk,
      this.vkIndex,
      this.vkPath,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousKernelData {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(PrivateKernelPublicInputs),
      new Proof(reader.readObject(UInt8Vector).buffer),
      reader.readObject(VerificationKey),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  /**
   * Creates an empty instance, valid enough to be accepted by circuits
   */
  static makeEmpty() {
    return new this(
      PrivateKernelPublicInputs.makeEmpty(),
      makeEmptyProof(),
      VerificationKey.makeFake(),
      0,
      toTupleOf(Array(VK_TREE_HEIGHT).fill(frZero()), VK_TREE_HEIGHT),
    );
  }
}

export class DummyPreviousKernelData {
  private static instance: PreviousKernelData;

  private constructor(private data: PreviousKernelData) {}

  public static async getDummyPreviousKernelData(wasm: CircuitsWasm): Promise<PreviousKernelData> {
    if (!DummyPreviousKernelData.instance) {
      const data = await privateKernelDummyPreviousKernel(wasm);
      DummyPreviousKernelData.instance = data;
    }

    return DummyPreviousKernelData.instance;
  }

  public getData() {
    return this.data;
  }
}

/**
 * Private call data.
 * @see cpp/src/aztec3/circuits/abis/call_stack_item.hpp.
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

// Helper functions for making empty structs (delete them eventually to use real data or factories instances)
// or move them somewhere generic, or within each struct

function frZero() {
  return Fr.fromBuffer(Buffer.alloc(32, 0));
}

function makeEmptyEthAddress() {
  return new EthAddress(Buffer.alloc(20, 0));
}

function makeEmptyNewContractData(): NewContractData {
  return new NewContractData(AztecAddress.ZERO, makeEmptyEthAddress(), frZero());
}

function makeEmptyTxContext(): TxContext {
  const deploymentData = new ContractDeploymentData(frZero(), frZero(), frZero(), makeEmptyEthAddress());
  return new TxContext(false, false, true, deploymentData);
}

function makeEmptyHistoricTreeRoots(): HistoricTreeRoots {
  return new HistoricTreeRoots(frZero(), frZero(), frZero(), frZero());
}

function makeEmptyConstantData(): ConstantData {
  return new ConstantData(makeEmptyHistoricTreeRoots(), makeEmptyTxContext());
}

function makeEmptyOptionallyRevealedData(): OptionallyRevealedData {
  return new OptionallyRevealedData(
    frZero(),
    new FunctionData(Buffer.alloc(4), true, true),
    times(EMITTED_EVENTS_LENGTH, frZero),
    frZero(),
    makeEmptyEthAddress(),
    false,
    false,
    false,
    false,
  );
}

function makeEmptyAccumulatedData(): AccumulatedData {
  return new AccumulatedData(
    AggregationObject.makeFake(),
    frZero(),
    times(KERNEL_NEW_COMMITMENTS_LENGTH, frZero),
    times(KERNEL_NEW_NULLIFIERS_LENGTH, frZero),
    times(KERNEL_PRIVATE_CALL_STACK_LENGTH, frZero),
    times(KERNEL_PUBLIC_CALL_STACK_LENGTH, frZero),
    times(KERNEL_L1_MSG_STACK_LENGTH, frZero),
    times(KERNEL_NEW_CONTRACTS_LENGTH, makeEmptyNewContractData),
    times(KERNEL_OPTIONALLY_REVEALED_DATA_LENGTH, makeEmptyOptionallyRevealedData),
  );
}

export function makeEmptyProof() {
  return new Proof(Buffer.alloc(0));
}
