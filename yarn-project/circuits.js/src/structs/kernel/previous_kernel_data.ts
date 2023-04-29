import { BufferReader, Fr, TupleOf } from '@aztec/foundation';
import { CircuitsWasm, Proof } from '../../index.js';
import { assertLength, tupleTimes } from '../../utils/jsUtils.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import { VK_TREE_HEIGHT } from '../constants.js';
import { UInt32, UInt8Vector } from '../shared.js';
import { VerificationKey } from '../verification_key.js';
import { KernelCircuitPublicInputs } from './public_inputs.js';
import { makeEmptyProof } from './private_kernel.js';
import { privateKernelDummyPreviousKernel } from '../../cbind/circuits.gen.js';

export class PreviousKernelData {
  constructor(
    public publicInputs: KernelCircuitPublicInputs,
    public proof: Proof,
    public vk: VerificationKey,
    public vkIndex: UInt32,
    public vkPath: TupleOf<Fr, typeof VK_TREE_HEIGHT>,
  ) {
    assertLength(this, 'vkPath', VK_TREE_HEIGHT);
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkPath);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousKernelData {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(KernelCircuitPublicInputs),
      new Proof(reader.readObject(UInt8Vector).buffer),
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
      tupleTimes(VK_TREE_HEIGHT, Fr.zero),
    );
  }
}

export class DummyPreviousKernelData {
  private static instance: DummyPreviousKernelData;

  private constructor(private data: PreviousKernelData) {}

  public static async getDummyPreviousKernelData(wasm: CircuitsWasm) {
    if (!DummyPreviousKernelData.instance) {
      const data = await privateKernelDummyPreviousKernel(wasm);
      DummyPreviousKernelData.instance = new DummyPreviousKernelData(data);
    }

    return DummyPreviousKernelData.instance.getData();
  }

  public getData() {
    return this.data;
  }
}
