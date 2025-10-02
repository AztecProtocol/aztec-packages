import { BackendOptions, Barretenberg, CircuitOptions } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import {
  ProofData,
  reconstructHonkProof,
  splitHonkProof,
  PAIRING_POINTS_SIZE,
  uint8ArrayToHex,
  hexToUint8Array,
} from '../proof/index.js';
import { ClientIVCProof, fromClientIVCProof, toClientIVCProof } from '../cbind/generated/api_types.js';
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

function getProofSettingsFromOptions(
  options?: UltraHonkBackendOptions,
): { ipaAccumulation: boolean; oracleHashType: string; disableZk: boolean, optimizedSolidityVerifier: boolean } {
  return {
    ipaAccumulation: false,
    oracleHashType: options?.keccak || options?.keccakZK ? 'keccak' : (options?.starknet || options?.starknetZK ? 'starknet' : 'poseidon2'),
    // TODO no current way to target non-zk poseidon2 hash
    disableZk: options?.keccak || options?.starknet ? true : false,
    optimizedSolidityVerifier: false,
  };
}

export class UltraHonkVerifierBackend {
  protected api!: Barretenberg;

  constructor(
    protected backendOptions: BackendOptions = { threads: 1 },
    protected circuitOptions: CircuitOptions = { recursive: false },
  ) {}
  /** @ignore */
  private async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.backendOptions);
      const honkRecursion = true;
      await api.initSRSForCircuitSize(0);

      this.api = api;
    }
  }

  async verifyProof(proofData: ProofData & { verificationKey: Uint8Array }, options?: UltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const proofFrs: Uint8Array[] = [];
    for (let i = 0; i < proofData.proof.length; i += 32) {
      proofFrs.push(proofData.proof.slice(i, i + 32));
    }
    const { verified } = await this.api.circuitVerify({
      verificationKey: proofData.verificationKey,
      publicInputs: proofData.publicInputs.map(hexToUint8Array),
      proof: proofFrs,
      settings: getProofSettingsFromOptions(options),
    });
    return verified;
  }
  destroy(): Promise<void> {
    if (!this.api) {
      return Promise.resolve();
    }
    return this.api.destroy();
  }
}

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

      this.api = api;
    }
  }

  async generateProof(compressedWitness: Uint8Array, options?: UltraHonkBackendOptions): Promise<ProofData> {
    await this.instantiate();

    const witness = ungzip(compressedWitness);
    const { proof, publicInputs } = await this.api.circuitProve({
      witness,
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
        verificationKey: Buffer.from([]), // Empty VK - lower performance.
      },
      settings: getProofSettingsFromOptions(options)
    });
    console.log(`Generated proof for circuit with ${publicInputs.length} public inputs and ${proof.length} fields.`);

    // We return ProofData as a flat buffer and an array of strings to match the current ProofData class.
    const flatProof = new Uint8Array(proof.length * 32);
    proof.forEach((fr, i) => {
      flatProof.set(fr, i * 32);
    });

    return { proof: flatProof, publicInputs: publicInputs.map(uint8ArrayToHex) };
  }

  async verifyProof(proofData: ProofData, options?: UltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const proofFrs: Uint8Array[] = [];
    for (let i = 0; i < proofData.proof.length; i += 32) {
      proofFrs.push(proofData.proof.slice(i, i + 32));
    }
    // TODO reconsider API - computing the VK at this point is not optimal
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
    });
    const {verified} = await this.api.circuitVerify({
      verificationKey: vkResult.bytes,
      publicInputs: proofData.publicInputs.map(hexToUint8Array),
      proof: proofFrs,
      settings: getProofSettingsFromOptions(options),
    });
    return verified;
  }

  async getVerificationKey(options?: UltraHonkBackendOptions): Promise<Uint8Array> {
    await this.instantiate();

    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings: getProofSettingsFromOptions(options),
    });
    return vkResult.bytes;
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
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings: getProofSettingsFromOptions({}),
    });

    // Convert VK bytes to field elements (32-byte chunks)
    const vkAsFields: string[] = [];
    for (let i = 0; i < vkResult.bytes.length; i += 32) {
      const chunk = vkResult.bytes.slice(i, i + 32);
      vkAsFields.push(uint8ArrayToHex(chunk));
    }

    return {
      // TODO(https://github.com/noir-lang/noir/issues/5661)
      proofAsFields: [],
      vkAsFields,
      // We use an empty string for the vk hash here as it is unneeded as part of the recursive artifacts
      // The user can be expected to hash the vk inside their circuit to check whether the vk is the circuit
      // they expect
      vkHash: uint8ArrayToHex(vkResult.hash)
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

  async prove(witnessBuf: Uint8Array[], vksBuf: Uint8Array[] = []): Promise<[Uint8Array[], Uint8Array, Uint8Array]> {
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
      name: 'hiding',
      bytecode: this.acirBuf[this.acirBuf.length - 1],
    } });

    const proofFields = [
      proveResult.proof.megaProof,
      proveResult.proof.goblinProof.mergeProof,
      proveResult.proof.goblinProof.eccvmProof.preIpaProof,
      proveResult.proof.goblinProof.eccvmProof.ipaProof,
      proveResult.proof.goblinProof.translatorProof,
    ].flat();

    // Note: Verification may not work correctly until we properly serialize the proof
    if (!(await this.verify(proof, vkResult.bytes))) {
      throw new AztecClientBackendError('Failed to verify the private (ClientIVC) transaction proof!');
    }
    return [proofFields, proof, vkResult.bytes];
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
      const gates = await this.api.clientIvcStats({
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
