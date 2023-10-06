import { Fr } from '@aztec/foundation/fields';
import { BufferReader, Tuple } from '@aztec/foundation/serialize';

import { privateKernelDummyPreviousPrivateKernel } from '../../cbind/circuits.gen.js';
import { CircuitsWasm, VK_TREE_HEIGHT, makeTuple } from '../../index.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import { Proof, makeEmptyProof } from '../proof.js';
import { UInt32 } from '../shared.js';
import { VerificationKey } from '../verification_key.js';
import { PrivateKernelPublicInputs, PublicKernelPublicInputs } from './public_inputs.js';
import { PrivateKernelPublicInputsFinal } from './public_inputs_final.js';

/**
 * Data of the previous private kernel for the private (inner and ordering) kernel iteration.
 */
export class PreviousPrivateKernelData {
  constructor(
    /**
     * Public inputs of the previous private kernel.
     */
    public publicInputs: PrivateKernelPublicInputs,
    /**
     * Proof of the previous private kernel.
     */
    public proof: Proof,
    /**
     * Verification key of the previous private kernel.
     */
    public vk: VerificationKey,
    /**
     * Index of the previous private kernel's vk in a tree of vks.
     */
    public vkIndex: UInt32,
    /**
     * Sibling path of the previous private kernel's vk in a tree of vks.
     */
    public vkPath: Tuple<Fr, typeof VK_TREE_HEIGHT>,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkPath);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousPrivateKernelData {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(PrivateKernelPublicInputs),
      reader.readObject(Proof),
      reader.readObject(VerificationKey),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  /**
   * Creates an empty instance, valid enough to be accepted by circuits.
   * @returns The empty instance.
   */
  static empty(): PreviousPrivateKernelData {
    return new PreviousPrivateKernelData(
      PrivateKernelPublicInputs.empty(),
      makeEmptyProof(),
      VerificationKey.makeFake(),
      0,
      makeTuple(VK_TREE_HEIGHT, Fr.zero),
    );
  }
}

/**
 * Data of the previous private ordering kernel for the first public kernel iteration.
 */
export class PreviousPrivateKernelDataFinal {
  constructor(
    /**
     * Public inputs of the previous ordering private kernel.
     */
    public publicInputs: PrivateKernelPublicInputsFinal,
    /**
     * Proof of the previous private kernel.
     */
    public proof: Proof,
    /**
     * Verification key of the previous private kernel.
     */
    public vk: VerificationKey,
    /**
     * Index of the previous private kernel's vk in a tree of vks.
     */
    public vkIndex: UInt32,
    /**
     * Sibling path of the previous private kernel's vk in a tree of vks.
     */
    public vkPath: Tuple<Fr, typeof VK_TREE_HEIGHT>,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkPath);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousPrivateKernelDataFinal {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(PrivateKernelPublicInputsFinal),
      reader.readObject(Proof),
      reader.readObject(VerificationKey),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  /**
   * Creates an empty instance, valid enough to be accepted by circuits.
   * @returns The empty instance.
   */
  static empty(): PreviousPrivateKernelDataFinal {
    return new PreviousPrivateKernelDataFinal(
      PrivateKernelPublicInputsFinal.empty(),
      makeEmptyProof(),
      VerificationKey.makeFake(),
      0,
      makeTuple(VK_TREE_HEIGHT, Fr.zero),
    );
  }
}

/**
 * Data of the previous public kernel iteration in the chain of public kernels.
 */
export class PreviousPublicKernelData {
  constructor(
    /**
     * Public inputs of the previous public kernel.
     */
    public publicInputs: PublicKernelPublicInputs,
    /**
     * Proof of the previous public kernel.
     */
    public proof: Proof,
    /**
     * Verification key of the previous public kernel.
     */
    public vk: VerificationKey,
    /**
     * Index of the previous public kernel's vk in a tree of vks.
     */
    public vkIndex: UInt32,
    /**
     * Sibling path of the previous public kernel's vk in a tree of vks.
     */
    public vkPath: Tuple<Fr, typeof VK_TREE_HEIGHT>,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk, this.vkIndex, this.vkPath);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PreviousPublicKernelData {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(PublicKernelPublicInputs),
      reader.readObject(Proof),
      reader.readObject(VerificationKey),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  /**
   * Creates an empty instance, valid enough to be accepted by circuits.
   * @returns The empty instance.
   */
  static empty(): PreviousPublicKernelData {
    return new PreviousPublicKernelData(
      PublicKernelPublicInputs.empty(),
      makeEmptyProof(),
      VerificationKey.makeFake(),
      0,
      makeTuple(VK_TREE_HEIGHT, Fr.zero),
    );
  }
}

/**
 * Dummy data used in the first kernel in the chain of kernels.
 */
export class DummyPreviousPrivateKernelData {
  private static instance: DummyPreviousPrivateKernelData;

  private constructor(private data: PreviousPrivateKernelData) {}

  /**
   * Gets the dummy data.
   * @param wasm - The circuits wasm instance.
   * @returns The dummy previous private kernel data.
   */
  public static getDummyPreviousPrivateKernelData(wasm: CircuitsWasm): PreviousPrivateKernelData {
    if (!DummyPreviousPrivateKernelData.instance) {
      const data = privateKernelDummyPreviousPrivateKernel(wasm);
      DummyPreviousPrivateKernelData.instance = new DummyPreviousPrivateKernelData(data);
    }

    return DummyPreviousPrivateKernelData.instance.getData();
  }

  /**
   * Gets the the dummy data.
   * @returns The dummy previous private kernel data.
   */
  public getData(): PreviousPrivateKernelData {
    return this.data;
  }
}
