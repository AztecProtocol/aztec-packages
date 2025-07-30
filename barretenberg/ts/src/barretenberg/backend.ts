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
import { Fr } from '../types/fields.js';

export class AztecClientBackendError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Options for the UltraHonkBackend.
 */
export type UltraHonkBackendOptions = {
  oracleHash: 'poseidon2' | 'keccak' | 'starknet';
  disableZK: boolean;
};

export class UltraHonkBackend {
  protected api!: Barretenberg;
  protected acirUncompressedBytecode: Uint8Array;
  protected verificationKey: Uint8Array | null = null;

  private _proverInitialized: boolean = false;

  constructor(
    acirBytecode: string,
    protected ultraHonkOptions: UltraHonkBackendOptions = {
      oracleHash: 'poseidon2',
      disableZK: false,
    },
    protected backendOptions: BackendOptions = { threads: 1 },
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  private async _initialize(): Promise<void> {
    if (this.api) {
      return;
    }

    this.api = await Barretenberg.new(this.backendOptions);
  }

  private async _initializeVerificationKey() {
    if (this.verificationKey) {
      return;
    }

    if (this.ultraHonkOptions.oracleHash === 'poseidon2') {
      if (this.ultraHonkOptions.disableZK) {
        // TODO: Implement non-ZK flavor for poseidon2 (could be be useful for recursive proofs)
        throw new Error('Non-ZK flavor is not implemented for poseidon2');
      } else {
        this.verificationKey = await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);
      }
    }
    // Oracle hash is keccak
    else if (this.ultraHonkOptions.oracleHash === 'keccak') {
      if (this.ultraHonkOptions.disableZK) {
        this.verificationKey = await this.api.acirWriteVkUltraKeccakHonk(this.acirUncompressedBytecode);
      } else {
        this.verificationKey = await this.api.acirWriteVkUltraKeccakZkHonk(this.acirUncompressedBytecode);
      }
    }
    // Starknet
    else if (this.ultraHonkOptions.oracleHash === 'starknet') {
      if (this.ultraHonkOptions.disableZK) {
        this.verificationKey = await this.api.acirWriteVkUltraStarknetHonk(this.acirUncompressedBytecode);
      } else {
        this.verificationKey = await this.api.acirWriteVkUltraStarknetZkHonk(this.acirUncompressedBytecode);
      }
    }
  }

  /**
   * Initializes the prover - fetch the SRS, prepare verification key, etc.
   * This is called before generating a proof, but can be called in advance to optimize proving time.
   */
  async initializeProver() {
    if (this._proverInitialized) {
      return;
    }

    await this._initialize();
    await this.api.acirInitSRS(this.acirUncompressedBytecode, true, true);
    await this._initializeVerificationKey();

    this._proverInitialized = true;
  }

  async initializeVerifier(vk?: Uint8Array) {
    if (this.verificationKey) {
      return;
    }

    if (vk) {
      this.verificationKey = vk;
    } else {
      await this._initializeVerificationKey();
    }
  }

  async generateProof(compressedWitness: Uint8Array): Promise<ProofData> {
    await this.initializeProver();

    let proofMethod: (acirVec: Uint8Array, witnessVec: Uint8Array, vkBuf: Uint8Array) => Promise<Uint8Array>;

    if (this.ultraHonkOptions.oracleHash === 'poseidon2') {
      if (this.ultraHonkOptions.disableZK) {
        throw new Error('Non-ZK flavor is not implemented for poseidon2');
      } else {
        proofMethod = this.api.acirProveUltraZKHonk.bind(this.api);
      }
    }
    // keccak
    else if (this.ultraHonkOptions.oracleHash === 'keccak') {
      if (this.ultraHonkOptions.disableZK) {
        proofMethod = this.api.acirProveUltraKeccakHonk.bind(this.api);
      } else {
        proofMethod = this.api.acirProveUltraKeccakZkHonk.bind(this.api);
      }
    }
    // starknet
    else if (this.ultraHonkOptions.oracleHash === 'starknet') {
      if (this.ultraHonkOptions.disableZK) {
        proofMethod = this.api.acirProveUltraStarknetHonk.bind(this.api);
      } else {
        proofMethod = this.api.acirProveUltraStarknetZkHonk.bind(this.api);
      }
    }

    const proofWithPublicInputs = await proofMethod!(this.acirUncompressedBytecode, ungzip(compressedWitness), this.verificationKey!);

    // Save VK as fields - this is used to find the number of public inputs
    // Once https://github.com/AztecProtocol/barretenberg/issues/1481 is fixed this can be done in JS instead of wasm
    const verificationKeyFields = await this.api.acirVkAsFieldsUltraHonk(new RawBuffer(this.verificationKey!));

    // Value at index 1 in VK is the number of public inputs (including the 16 pairing points)\
    const numPublicInputs = Number(verificationKeyFields[1].toString()) - PAIRING_POINTS_SIZE;

    // Split proof and public inputs (public inputs as fields)
    const { proof, publicInputs: publicInputsBytes } = splitHonkProof(proofWithPublicInputs, numPublicInputs);
    const publicInputs = deflattenFields(publicInputsBytes);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData): Promise<boolean> {
    await this.initializeVerifier();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);

    let verifyMethod: (proof: Uint8Array, vkBuf: Uint8Array) => Promise<boolean>;

    if (this.ultraHonkOptions.oracleHash === 'poseidon2') {
      if (this.ultraHonkOptions.disableZK) {
        throw new Error('Non-ZK flavor is not implemented for poseidon2');
      } else {
        verifyMethod = this.api.acirVerifyUltraZKHonk.bind(this.api);
      }
    }
    // keccak
    else if (this.ultraHonkOptions.oracleHash === 'keccak') {
      if (this.ultraHonkOptions.disableZK) {
        verifyMethod = this.api.acirVerifyUltraKeccakHonk.bind(this.api);
      } else {
        verifyMethod = this.api.acirVerifyUltraKeccakZkHonk.bind(this.api);
      }
    }
    // starknet
    else if (this.ultraHonkOptions.oracleHash === 'starknet') {
      if (this.ultraHonkOptions.disableZK) {
        verifyMethod = this.api.acirVerifyUltraStarknetHonk.bind(this.api);
      } else {
        verifyMethod = this.api.acirVerifyUltraStarknetZkHonk.bind(this.api);
      }
    }

    return await verifyMethod!(proof, new RawBuffer(this.verificationKey!));
  }

  async getVerificationKey(): Promise<Uint8Array> {
    await this._initializeVerificationKey();
    return this.verificationKey!;
  }

  async getSolidityVerifier(vk?: Uint8Array): Promise<string> {
    await this.initializeVerifier(vk);
    return await this.api.acirHonkSolidityVerifier(this.acirUncompressedBytecode, new RawBuffer(this.verificationKey!));
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
        },
      });

      // Accumulate with witness
      this.api.clientIvcAccumulate({
        witness: Buffer.from(witness),
      });
    }

    // Generate the proof (and wait for all previous steps to finish)
    const proveResult = await this.api.clientIvcProve({});

    // The API currently expects a msgpack-encoded API.
    const proof = new Encoder({ useRecords: false }).encode(fromClientIVCProof(proveResult.proof));
    // Generate the VK
    const vkResult = await this.api.clientIvcComputeIvcVk({
      circuit: {
        name: 'tail',
        bytecode: this.acirBuf[this.acirBuf.length - 1],
      },
    });

    // Note: Verification may not work correctly until we properly serialize the proof
    if (!(await this.verify(proof, vkResult.bytes))) {
      throw new AztecClientBackendError('Failed to verify the private (ClientIVC) transaction proof!');
    }
    return [proof, vkResult.bytes];
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    await this.instantiate();
    const result = await this.api.clientIvcVerify({
      proof: toClientIVCProof(new Decoder({ useRecords: false }).decode(proof)),
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
        includeGatesPerOpcode: false,
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
