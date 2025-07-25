import { BackendOptions, Barretenberg, CircuitOptions } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import {
  deflattenFields,
  flattenFieldsAsArray,
  ProofData,
  reconstructHonkProof,
  splitHonkProof,
  PAIRING_POINTS_SIZE,
} from '../proof/index.js';
import { fromClientIVCProof, toClientIVCProof } from '../cbind/generated/api_types.js';
import { ungzip } from 'pako';
import { Buffer } from 'buffer';
import { Decoder, Encoder } from 'msgpackr';

export class AztecClientBackendError extends Error {
  constructor(message: string) {
    super(message);
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
  /** Selecting this option will use the keccak hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an EVM chain.
   */
  keccakZK?: boolean;
  /** Selecting this option will use the poseidon/stark252 hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an Starknet chain with Garaga.
   */
  starknet?: boolean;
  /** Selecting this option will use the poseidon/stark252 hash function instead of poseidon
   * when generating challenges in the proof.
   * Use this when you want to verify the created proof on an Starknet chain with Garaga.
   */
  starknetZK?: boolean;
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

    // Write VK to get the number of public inputs
    const writeVKUltraHonk = options?.keccak
      ? this.api.acirWriteVkUltraKeccakHonk.bind(this.api)
      : options?.keccakZK
        ? this.api.acirWriteVkUltraKeccakZkHonk.bind(this.api)
        : options?.starknet
          ? this.api.acirWriteVkUltraStarknetHonk.bind(this.api)
          : options?.starknetZK
            ? this.api.acirWriteVkUltraStarknetZkHonk.bind(this.api)
            : this.api.acirWriteVkUltraHonk.bind(this.api);

    const vkBuf = await writeVKUltraHonk(this.acirUncompressedBytecode);
    const vkAsFields = await this.api.acirVkAsFieldsUltraHonk(new RawBuffer(vkBuf));

    const proveUltraHonk = options?.keccak
      ? this.api.acirProveUltraKeccakHonk.bind(this.api)
      : options?.keccakZK
        ? this.api.acirProveUltraKeccakZkHonk.bind(this.api)
        : options?.starknet
          ? this.api.acirProveUltraStarknetHonk.bind(this.api)
          : options?.starknetZK
            ? this.api.acirProveUltraStarknetZkHonk.bind(this.api)
            : this.api.acirProveUltraZKHonk.bind(this.api);

    const proofWithPublicInputs = await proveUltraHonk(
      this.acirUncompressedBytecode,
      ungzip(compressedWitness),
      new RawBuffer(vkBuf),
    );

    // Item at index 1 in VK is the number of public inputs
    const publicInputsSizeIndex = 1; // index into VK for numPublicInputs
    const numPublicInputs = Number(vkAsFields[publicInputsSizeIndex].toString()) - PAIRING_POINTS_SIZE;

    const { proof, publicInputs: publicInputsBytes } = splitHonkProof(proofWithPublicInputs, numPublicInputs);
    const publicInputs = deflattenFields(publicInputsBytes);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData, options?: UltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);

    const writeVkUltraHonk = options?.keccak
      ? this.api.acirWriteVkUltraKeccakHonk.bind(this.api)
      : options?.keccakZK
        ? this.api.acirWriteVkUltraKeccakZkHonk.bind(this.api)
        : options?.starknet
          ? this.api.acirWriteVkUltraStarknetHonk.bind(this.api)
          : options?.starknetZK
            ? this.api.acirWriteVkUltraStarknetZkHonk.bind(this.api)
            : this.api.acirWriteVkUltraHonk.bind(this.api);
    const verifyUltraHonk = options?.keccak
      ? this.api.acirVerifyUltraKeccakHonk.bind(this.api)
      : options?.keccakZK
        ? this.api.acirVerifyUltraKeccakZkHonk.bind(this.api)
        : options?.starknet
          ? this.api.acirVerifyUltraStarknetHonk.bind(this.api)
          : options?.starknetZK
            ? this.api.acirVerifyUltraStarknetZkHonk.bind(this.api)
            : this.api.acirVerifyUltraZKHonk.bind(this.api);

    const vkBuf = await writeVkUltraHonk(this.acirUncompressedBytecode);
    return await verifyUltraHonk(proof, new RawBuffer(vkBuf));
  }

  async getVerificationKey(options?: UltraHonkBackendOptions): Promise<Uint8Array> {
    await this.instantiate();
    return options?.keccak
      ? await this.api.acirWriteVkUltraKeccakHonk(this.acirUncompressedBytecode)
      : options?.keccakZK
        ? await this.api.acirWriteVkUltraKeccakZkHonk(this.acirUncompressedBytecode)
        : options?.starknet
          ? await this.api.acirWriteVkUltraStarknetHonk(this.acirUncompressedBytecode)
          : options?.starknetZK
            ? await this.api.acirWriteVkUltraStarknetZkHonk(this.acirUncompressedBytecode)
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

export class AztecClientBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;

  constructor(
    protected acirBuf: Uint8Array[],
    protected options: BackendOptions = { threads: 1 },
  ) {}

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

    // Queue IVC start with the number of circuits
    this.api.clientIvcStart({ numCircuits: this.acirBuf.length });

    // Queue load and accumulate for each circuit
    for (let i = 0; i < this.acirBuf.length; i++) {
      const bytecode = this.acirBuf[i];
      const witness = witnessBuf[i] || Buffer.from([]);
      const vk = vksBuf[i] || Buffer.from([]);
      const functionName = `unknown_wasm_${i}`;

      // Load the circuit
      this.api.clientIvcLoad({
        circuit: {
          name: functionName,
          bytecode: Buffer.from(bytecode),
          verificationKey: Buffer.from(vk),
        }
      });

      // Accumulate with witness
      this.api.clientIvcAccumulate({
        witness: Buffer.from(witness),
      });
    }

    // Generate the proof (and wait for all previous steps to finish)
    const proveResult = await this.api.clientIvcProve({});

    // The API currently expects a msgpack-encoded API.
    const proof = new Encoder({useRecords: false}).encode(fromClientIVCProof(proveResult.proof));
    // Generate the VK
    const vkResult = await this.api.clientIvcComputeIvcVk({ circuit: {
      name: 'tail',
      bytecode: this.acirBuf[this.acirBuf.length - 1],
    } });

    // Note: Verification may not work correctly until we properly serialize the proof
    if (!(await this.verify(proof, vkResult.bytes))) {
      throw new AztecClientBackendError('Failed to verify the private (ClientIVC) transaction proof!');
    }
    return [proof, vkResult.bytes];
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    await this.instantiate();
    const result = await this.api.clientIvcVerify({
      proof: toClientIVCProof(new Decoder({useRecords: false}).decode(proof)),
      vk: Buffer.from(vk),
    });
    return result.valid;
  }

  async gates(): Promise<number[]> {
    await this.instantiate();
    const circuitSizes: number[] = [];
    for (const buf of this.acirBuf) {
      const gates = await this.api.clientIvcGates({
        circuit: {
          name: 'circuit',
          bytecode: buf,
        },
        includeGatesPerOpcode: false
      });
      circuitSizes.push(gates.circuitSize);
    }
    return circuitSizes;
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
  return ungzip(compressedByteCode);
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
