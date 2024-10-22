import { BackendOptions, Barretenberg } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { decompressSync as gunzip } from 'fflate';
import {
  deflattenFields,
  flattenFieldsAsArray,
  ProofData,
  reconstructHonkProof,
  reconstructUltraPlonkProof,
} from '../proof/index.js';

export class UltraPlonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` and `acirComposer` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  protected acirComposer: any;

  protected acirUncompressedBytecode: Uint8Array;

  constructor(acirBytecode: string, protected options: BackendOptions = { threads: 1 }) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);

      const honkRecursion = false;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_total, subgroupSize] = await api.acirGetCircuitSizes(this.acirUncompressedBytecode, honkRecursion);

      await api.initSRSForCircuitSize(subgroupSize);
      this.acirComposer = await api.acirNewAcirComposer(subgroupSize);
      await api.acirInitProvingKey(this.acirComposer, this.acirUncompressedBytecode);
      this.api = api;
    }
  }

  /** @description Generates a proof */
  async generateProof(compressedWitness: Uint8Array): Promise<ProofData> {
    await this.instantiate();
    const proofWithPublicInputs = await this.api.acirCreateProof(
      this.acirComposer,
      this.acirUncompressedBytecode,
      gunzip(compressedWitness),
    );

    // This is the number of bytes in a UltraPlonk proof
    // minus the public inputs.
    const numBytesInProofWithoutPublicInputs = 2144;

    const splitIndex = proofWithPublicInputs.length - numBytesInProofWithoutPublicInputs;

    const publicInputsConcatenated = proofWithPublicInputs.slice(0, splitIndex);
    const proof = proofWithPublicInputs.slice(splitIndex);
    const publicInputs = deflattenFields(publicInputsConcatenated);

    return { proof, publicInputs };
  }

  /**
   * Generates artifacts that will be passed to a circuit that will verify this proof.
   *
   * Instead of passing the proof and verification key as a byte array, we pass them
   * as fields which makes it cheaper to verify in a circuit.
   *
   * The proof that is passed here will have been created using a circuit
   * that has the #[recursive] attribute on its `main` method.
   *
   * The number of public inputs denotes how many public inputs are in the inner proof.
   *
   * @example
   * ```typescript
   * const artifacts = await backend.generateRecursiveProofArtifacts(proof, numOfPublicInputs);
   * ```
   */
  async generateRecursiveProofArtifacts(
    proofData: ProofData,
    numOfPublicInputs = 0,
  ): Promise<{
    proofAsFields: string[];
    vkAsFields: string[];
    vkHash: string;
  }> {
    await this.instantiate();

    const proof = reconstructUltraPlonkProof(proofData);
    const proofAsFields = (
      await this.api.acirSerializeProofIntoFields(this.acirComposer, proof, numOfPublicInputs)
    ).slice(numOfPublicInputs);

    // TODO: perhaps we should put this in the init function. Need to benchmark
    // TODO how long it takes.
    await this.api.acirInitVerificationKey(this.acirComposer);

    // Note: If you don't init verification key, `acirSerializeVerificationKeyIntoFields`` will just hang on serialization
    const vk = await this.api.acirSerializeVerificationKeyIntoFields(this.acirComposer);

    return {
      proofAsFields: proofAsFields.map(p => p.toString()),
      vkAsFields: vk[0].map(vk => vk.toString()),
      vkHash: vk[1].toString(),
    };
  }

  /** @description Verifies a proof */
  async verifyProof(proofData: ProofData): Promise<boolean> {
    await this.instantiate();
    await this.api.acirInitVerificationKey(this.acirComposer);
    const proof = reconstructUltraPlonkProof(proofData);
    return await this.api.acirVerifyProof(this.acirComposer, proof);
  }

  async getVerificationKey(): Promise<Uint8Array> {
    await this.instantiate();
    await this.api.acirInitVerificationKey(this.acirComposer);
    return await this.api.acirGetVerificationKey(this.acirComposer);
  }

  async destroy(): Promise<void> {
    if (!this.api) {
      return;
    }
    await this.api.destroy();
  }
}

// Buffers are prepended with their size. The size takes 4 bytes.
const serializedBufferSize = 4;
const fieldByteSize = 32;
const publicInputOffset = 3;
const publicInputsOffsetBytes = publicInputOffset * fieldByteSize;

export class UltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;
  protected acirUncompressedBytecode: Uint8Array;

  constructor(acirBytecode: string, protected options: BackendOptions = { threads: 1 }) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }
  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);
      const honkRecursion = true;
      await api.acirInitSRS(this.acirUncompressedBytecode, honkRecursion);

      // We don't init a proving key here in the Honk API
      // await api.acirInitProvingKey(this.acirComposer, this.acirUncompressedBytecode);
      this.api = api;
    }
  }

  async generateProof(compressedWitness: Uint8Array): Promise<ProofData> {
    await this.instantiate();
    const proofWithPublicInputs = await this.api.acirProveUltraHonk(
      this.acirUncompressedBytecode,
      gunzip(compressedWitness),
    );

    const proofAsStrings = deflattenFields(proofWithPublicInputs.slice(4));

    const numPublicInputs = Number(proofAsStrings[1]);

    // Account for the serialized buffer size at start
    const publicInputsOffset = publicInputsOffsetBytes + serializedBufferSize;
    // Get the part before and after the public inputs
    const proofStart = proofWithPublicInputs.slice(0, publicInputsOffset);
    const publicInputsSplitIndex = numPublicInputs * fieldByteSize;
    const proofEnd = proofWithPublicInputs.slice(publicInputsOffset + publicInputsSplitIndex);
    // Construct the proof without the public inputs
    const proof = new Uint8Array([...proofStart, ...proofEnd]);

    // Fetch the number of public inputs out of the proof string
    const publicInputsConcatenated = proofWithPublicInputs.slice(
      publicInputsOffset,
      publicInputsOffset + publicInputsSplitIndex,
    );
    const publicInputs = deflattenFields(publicInputsConcatenated);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData): Promise<boolean> {
    await this.instantiate();
    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);
    const vkBuf = await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);

    return await this.api.acirVerifyUltraHonk(proof, new RawBuffer(vkBuf));
  }

  async getVerificationKey(): Promise<Uint8Array> {
    await this.instantiate();
    return await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);
  }

  // TODO(https://github.com/noir-lang/noir/issues/5661): Update this to handle Honk recursive aggregation in the browser once it is ready in the backend itself
  async generateRecursiveProofArtifacts(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _proof: Uint8Array,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _numOfPublicInputs: number,
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    await this.instantiate();
    // TODO(https://github.com/noir-lang/noir/issues/5661): This needs to be updated to handle recursive aggregation.
    // There is still a proofAsFields method but we could consider getting rid of it as the proof itself
    // is a list of field elements.
    // UltraHonk also does not have public inputs directly prepended to the proof and they are still instead
    // inserted at an offset.
    // const proof = reconstructProofWithPublicInputs(proofData);
    // const proofAsFields = (await this.api.acirProofAsFieldsUltraHonk(proof)).slice(numOfPublicInputs);

    // TODO: perhaps we should put this in the init function. Need to benchmark
    // TODO how long it takes.
    const vkBuf = await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);
    const vk = await this.api.acirVkAsFieldsUltraHonk(vkBuf);

    return {
      // TODO(https://github.com/noir-lang/noir/issues/5661)
      proofAsFields: [],
      vkAsFields: vk.map(vk => vk.toString()),
      // We use an empty string for the vk hash here as it is unneeded as part of the recursive artifacts
      // The user can be expected to hash the vk inside their circuit to check whether the vk is the circuit
      // they expect
      vkHash: '',
    };
  }

  async destroy(): Promise<void> {
    if (!this.api) {
      return;
    }
    await this.api.destroy();
  }
}

// Converts bytecode from a base64 string to a Uint8Array
function acirToUint8Array(base64EncodedBytecode: string): Uint8Array {
  const compressedByteCode = base64Decode(base64EncodedBytecode);
  return gunzip(compressedByteCode);
}

// Since this is a simple function, we can use feature detection to
// see if we are in the nodeJs environment or the browser environment.
function base64Decode(input: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    const b = Buffer.from(input, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  } else if (typeof atob === 'function') {
    // Browser environment
    return Uint8Array.from(atob(input), c => c.charCodeAt(0));
  } else {
    throw new Error('No implementation found for base64 decoding.');
  }
}
