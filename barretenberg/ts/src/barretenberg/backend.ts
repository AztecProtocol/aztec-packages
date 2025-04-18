import { BackendOptions, Barretenberg, CircuitOptions } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { decompressSync as gunzip } from 'fflate';
import {
  deflattenFields,
  flattenFieldsAsArray,
  ProofData,
  reconstructHonkProof,
  reconstructUltraPlonkProof,
  splitHonkProof,
  AGGREGATION_OBJECT_LENGTH,
} from '../proof/index.js';
import { Encoder } from 'msgpackr/pack';

export class AztecClientBackendError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// Utility for parsing gate counts from buffer
// TODO: Where should this logic live? Should go away with move to msgpack.
function parseBigEndianU32Array(buffer: Uint8Array): number[] {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  const count = buffer.byteLength >>> 2; // default is entire buffer length / 4
  console.log(buffer);

  const out: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = dv.getUint32(offset, false);
    offset += 4;
  }

  return out;
}

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

/**
 * Options for the UltraHonkBackend.
 */
export type UltraHonkBackendOptions = {
  /** Selecting this option will use the keccak hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an EVM chain.
   */
  keccak?: boolean;
  /**S electing this option will use the poseidon/stark252 hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an Starknet chain with Garaga.
   */
  starknet?: boolean;
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
  private async instantiate(): Promise<void> {
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
      : options?.starknet
        ? this.api.acirProveUltraStarknetHonk.bind(this.api)
        : this.api.acirProveUltraHonk.bind(this.api);

    const proofWithPublicInputs = await proveUltraHonk(this.acirUncompressedBytecode, gunzip(compressedWitness));

    // Write VK to get the number of public inputs
    const writeVKUltraHonk = options?.keccak
      ? this.api.acirWriteVkUltraKeccakHonk.bind(this.api)
      : options?.starknet
        ? this.api.acirWriteVkUltraStarknetHonk.bind(this.api)
        : this.api.acirWriteVkUltraHonk.bind(this.api);

    const vk = await writeVKUltraHonk(this.acirUncompressedBytecode);
    const vkAsFields = await this.api.acirVkAsFieldsUltraHonk(new RawBuffer(vk));

    // Item at index 1 in VK is the number of public inputs
    const publicInputsSizeIndex = 1; // index into VK for numPublicInputs
    const numPublicInputs = Number(vkAsFields[publicInputsSizeIndex].toString()) - AGGREGATION_OBJECT_LENGTH;

    const { proof, publicInputs: publicInputsBytes } = splitHonkProof(proofWithPublicInputs, numPublicInputs);
    const publicInputs = deflattenFields(publicInputsBytes);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData, options?: UltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);

    const writeVkUltraHonk = options?.keccak
      ? this.api.acirWriteVkUltraKeccakHonk.bind(this.api)
      : options?.starknet
        ? this.api.acirWriteVkUltraStarknetHonk.bind(this.api)
        : this.api.acirWriteVkUltraHonk.bind(this.api);
    const verifyUltraHonk = options?.keccak
      ? this.api.acirVerifyUltraKeccakHonk.bind(this.api)
      : options?.starknet
        ? this.api.acirVerifyUltraStarknetHonk.bind(this.api)
        : this.api.acirVerifyUltraHonk.bind(this.api);

    const vkBuf = await writeVkUltraHonk(this.acirUncompressedBytecode);
    return await verifyUltraHonk(proof, new RawBuffer(vkBuf));
  }

  async getVerificationKey(options?: UltraHonkBackendOptions): Promise<Uint8Array> {
    await this.instantiate();
    return options?.keccak
      ? await this.api.acirWriteVkUltraKeccakHonk(this.acirUncompressedBytecode)
      : options?.starknet
        ? await this.api.acirWriteVkUltraStarknetHonk(this.acirUncompressedBytecode)
        : await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(vk?: Uint8Array): Promise<string> {
    await this.instantiate();
    const vkBuf = vk ?? (await this.api.acirWriteVkUltraKeccakHonk(this.acirUncompressedBytecode));
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
interface AztecClientExecutionStep {
  functionName: string;
  gateCount?: number;
  // Note: not gzipped like in native code
  bytecode: Uint8Array;
  // Note: not gzipped like in native code. Already bincoded.
  witness: Uint8Array;
  /* TODO(https://github.com/AztecProtocol/barretenberg/issues/1328) this should get its own proper class. */
  vk: Uint8Array;
}

function serializeAztecClientExecutionSteps(acirBuf: Uint8Array[], witnessBuf: Uint8Array[], vksBuf: Uint8Array[]): Uint8Array {
  const steps: AztecClientExecutionStep[] = [];
  for (let i = 0; i < acirBuf.length; i++) {
    const bytecode = acirBuf[i];
    // Witnesses are not provided at all for gates info.
    const witness = witnessBuf[i] || Buffer.from([]);
    // VKs are optional for proving (deprecated feature) or not provided at all for gates info.
    const vk = vksBuf[i] || Buffer.from([]);
    const functionName = `unknown_wasm_${i}`;
    steps.push({
      bytecode,
      witness,
      vk,
      functionName,
    });
  }
  return new Encoder({ useRecords: false }).pack(steps);
}

export class AztecClientBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;

  constructor(protected acirBuf: Uint8Array[], protected options: BackendOptions = { threads: 1 }) {}

  /** @ignore */
  private async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);
      await api.initSRSClientIVC();
      this.api = api;
    }
  }

  async prove(witnessBuf: Uint8Array[], vksBuf: Uint8Array[] = []): Promise<[Uint8Array, Uint8Array]> {
    if (vksBuf.length !== 0 && this.acirBuf.length !== witnessBuf.length) {
      throw new AztecClientBackendError('Witness and bytecodes must have the same stack depth!');
    }
    if (vksBuf.length !== 0 && vksBuf.length !== witnessBuf.length) {
      // NOTE: we allow 0 as an explicit 'I have no VKs'. This is a deprecated feature.
      throw new AztecClientBackendError('Witness and VKs must have the same stack depth!');
    }
    await this.instantiate();
    const ivcInputsBuf = serializeAztecClientExecutionSteps(this.acirBuf, witnessBuf, vksBuf);
    const proofAndVk = await this.api.acirProveAztecClient(ivcInputsBuf);
    const [proof, vk] = proofAndVk;
    if (!(await this.verify(proof, vk))) {
      throw new AztecClientBackendError('Failed to verify the private (ClientIVC) transaction proof!');
    }
    return proofAndVk;
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    await this.instantiate();
    return this.api.acirVerifyAztecClient(proof, vk);
  }

  async gates(): Promise<number[]> {
    // call function on API
    await this.instantiate();
    const ivcInputsBuf = serializeAztecClientExecutionSteps(this.acirBuf, [], []);
    const resultBuffer = await this.api.acirGatesAztecClient(ivcInputsBuf);
    return parseBigEndianU32Array(resultBuffer);
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
