import { BackendOptions, Barretenberg, CircuitOptions } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { decompressSync as gunzip } from 'fflate';
import {
  deflattenFields,
  flattenFieldsAsArray,
  ProofData,
  ProofDataForRecursion,
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

  constructor(
    acirBytecode: string,
    protected backendOptions: BackendOptions = { threads: 1 },
    protected circuitOptions: CircuitOptions = { recursive: false },
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.backendOptions);

      const honkRecursion = false;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_total, subgroupSize] = await api.acirGetCircuitSizes(
        this.acirUncompressedBytecode,
        this.circuitOptions.recursive,
        honkRecursion,
      );

      await api.initSRSForCircuitSize(subgroupSize);
      this.acirComposer = await api.acirNewAcirComposer(subgroupSize);
      await api.acirInitProvingKey(this.acirComposer, this.acirUncompressedBytecode, this.circuitOptions.recursive);
      this.api = api;
    }
  }

  /** @description Generates a proof */
  async generateProof(compressedWitness: Uint8Array): Promise<ProofData> {
    await this.instantiate();
    const proofWithPublicInputs = await this.api.acirCreateProof(
      this.acirComposer,
      this.acirUncompressedBytecode,
      this.circuitOptions.recursive,
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
   * The proof that is passed here will have been created by passing the `recursive`
   * parameter to a backend.
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

  /** @description Returns the verification key */
  async getVerificationKey(): Promise<Uint8Array> {
    await this.instantiate();
    await this.api.acirInitVerificationKey(this.acirComposer);
    return await this.api.acirGetVerificationKey(this.acirComposer);
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(): Promise<string> {
    await this.instantiate();
    await this.api.acirInitVerificationKey(this.acirComposer);
    return await this.api.acirGetSolidityVerifier(this.acirComposer);
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

/**
 * Options for the UltraHonkBackend.
 */
export type UltraHonkBackendOptions = {
  /**Selecting this option will use the keccak hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an EVM chain.
   */
  keccak: boolean;
};

export class UltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;
  protected acirUncompressedBytecode: Uint8Array;

  constructor(
    acirBytecode: string,
    protected backendOptions: BackendOptions = { threads: 1 },
    protected circuitOptions: CircuitOptions = { recursive: false },
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }
  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.backendOptions);
      const honkRecursion = true;
      await api.acirInitSRS(this.acirUncompressedBytecode, this.circuitOptions.recursive, honkRecursion);

      // We don't init a proving key here in the Honk API
      // await api.acirInitProvingKey(this.acirComposer, this.acirUncompressedBytecode);
      this.api = api;
    }
  }

  async generateProof(compressedWitness: Uint8Array, options?: UltraHonkBackendOptions): Promise<ProofData> {
    await this.instantiate();

    const proveUltraHonk = options?.keccak
      ? this.api.acirProveUltraKeccakHonk.bind(this.api)
      : this.api.acirProveUltraHonk.bind(this.api);

    const proofWithPublicInputs = await proveUltraHonk(
      this.acirUncompressedBytecode,
      this.circuitOptions.recursive,
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

  async generateProofForRecursiveAggregation(
    compressedWitness: Uint8Array,
    options?: UltraHonkBackendOptions,
  ): Promise<ProofDataForRecursion> {
    await this.instantiate();

    const proveUltraHonk = options?.keccak
      ? this.api.acirProveUltraKeccakHonk.bind(this.api)
      : this.api.acirProveUltraHonk.bind(this.api);

    const proofWithPublicInputs = await proveUltraHonk(
      this.acirUncompressedBytecode,
      this.circuitOptions.recursive,
      gunzip(compressedWitness),
    );

    // proofWithPublicInputs starts with a four-byte size
    const numSerdeHeaderBytes = 4;
    // some public inputs are handled specially
    const numKZGAccumulatorFieldElements = 16;
    // proof begins with: size, num public inputs, public input offset
    const numProofPreambleElements = 3;
    const publicInputsSizeIndex = 1;

    // Slice serde header and convert to fields
    const proofAsStrings = deflattenFields(proofWithPublicInputs.slice(numSerdeHeaderBytes));
    const numPublicInputs = Number(proofAsStrings[publicInputsSizeIndex]) - numKZGAccumulatorFieldElements;

    // Account for the serialized buffer size at start
    const publicInputsOffset = publicInputsOffsetBytes + serializedBufferSize;
    const publicInputsSplitIndex = numPublicInputs * fieldByteSize;

    // Construct the proof without the public inputs
    const numPublicInputsBytes = numPublicInputs * fieldByteSize;
    const numHeaderPlusPreambleBytes = numSerdeHeaderBytes + numProofPreambleElements * fieldByteSize;
    const proofNoPIs = new Uint8Array(proofWithPublicInputs.length - numPublicInputsBytes);
    // copy the elements before the public inputs
    proofNoPIs.set(proofWithPublicInputs.subarray(0, numHeaderPlusPreambleBytes), 0);
    // copy the elements after the public inputs
    proofNoPIs.set(
      proofWithPublicInputs.subarray(numHeaderPlusPreambleBytes + numPublicInputsBytes),
      numHeaderPlusPreambleBytes,
    );
    const proof: string[] = deflattenFields(proofNoPIs.slice(numSerdeHeaderBytes));

    // Fetch the number of public inputs out of the proof string
    const publicInputsConcatenated = proofWithPublicInputs.slice(
      publicInputsOffset,
      publicInputsOffset + publicInputsSplitIndex,
    );
    const publicInputs = deflattenFields(publicInputsConcatenated);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData, options?: UltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);

    const writeVkUltraHonk = options?.keccak
      ? this.api.acirWriteVkUltraKeccakHonk.bind(this.api)
      : this.api.acirWriteVkUltraHonk.bind(this.api);
    const verifyUltraHonk = options?.keccak
      ? this.api.acirVerifyUltraKeccakHonk.bind(this.api)
      : this.api.acirVerifyUltraHonk.bind(this.api);

    const vkBuf = await writeVkUltraHonk(this.acirUncompressedBytecode, this.circuitOptions.recursive);
    return await verifyUltraHonk(proof, new RawBuffer(vkBuf));
  }

  async getVerificationKey(): Promise<Uint8Array> {
    await this.instantiate();
    return await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode, this.circuitOptions.recursive);
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(vk?: Uint8Array): Promise<string> {
    await this.instantiate();
    const vkBuf =
      vk ?? (await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode, this.circuitOptions.recursive));
    return await this.api.acirHonkSolidityVerifier(this.acirUncompressedBytecode, new RawBuffer(vkBuf));
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
    const vkBuf = await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode, this.circuitOptions.recursive);
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

export class AztecClientBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;

  constructor(protected acirMsgpack: Uint8Array[], protected options: BackendOptions = { threads: 1 }) {}

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);
      await api.initSRSClientIVC();
      this.api = api;
    }
  }

  async prove(witnessMsgpack: Uint8Array[]): Promise<[Uint8Array, Uint8Array]> {
    await this.instantiate();
    return this.api.acirProveAztecClient(this.acirMsgpack, witnessMsgpack);
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    await this.instantiate();
    return this.api.acirVerifyAztecClient(proof, vk);
  }

  async proveAndVerify(witnessMsgpack: Uint8Array[]): Promise<boolean> {
    await this.instantiate();
    return this.api.acirProveAndVerifyAztecClient(this.acirMsgpack, witnessMsgpack);
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
