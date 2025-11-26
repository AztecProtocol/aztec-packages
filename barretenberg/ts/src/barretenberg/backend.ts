import { Barretenberg } from './index.js';
import { ProofData, uint8ArrayToHex, hexToUint8Array } from '../proof/index.js';
import { fromChonkProof, toChonkProof } from '../cbind/generated/api_types.js';
import { ungzip } from 'pako';
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

function getProofSettingsFromOptions(options?: UltraHonkBackendOptions): {
  ipaAccumulation: boolean;
  oracleHashType: string;
  disableZk: boolean;
  optimizedSolidityVerifier: boolean;
} {
  return {
    ipaAccumulation: false,
    oracleHashType:
      options?.keccak || options?.keccakZK
        ? 'keccak'
        : options?.starknet || options?.starknetZK
          ? 'starknet'
          : 'poseidon2',
    // TODO no current way to target non-zk poseidon2 hash
    disableZk: options?.keccak || options?.starknet ? true : false,
    optimizedSolidityVerifier: false,
  };
}

export class UltraHonkVerifierBackend {
  constructor(private api: Barretenberg) {}

  async verifyProof(
    proofData: ProofData & { verificationKey: Uint8Array },
    options?: UltraHonkBackendOptions,
  ): Promise<boolean> {
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
}

export class UltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  private acirUncompressedBytecode: Uint8Array;

  constructor(
    acirBytecode: string,
    private api: Barretenberg,
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  async generateProof(compressedWitness: Uint8Array, options?: UltraHonkBackendOptions): Promise<ProofData> {
    const witness = ungzip(compressedWitness);
    const { proof, publicInputs } = await this.api.circuitProve({
      witness,
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
        verificationKey: new Uint8Array(0), // Empty VK - lower performance.
      },
      settings: getProofSettingsFromOptions(options),
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
    const { verified } = await this.api.circuitVerify({
      verificationKey: vkResult.bytes,
      publicInputs: proofData.publicInputs.map(hexToUint8Array),
      proof: proofFrs,
      settings: getProofSettingsFromOptions(options),
    });
    return verified;
  }

  async getVerificationKey(options?: UltraHonkBackendOptions): Promise<Uint8Array> {
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
    });
    return vkResult.bytes;
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(vk: Uint8Array, options?: UltraHonkBackendOptions): Promise<string> {
    const result = await this.api.circuitWriteSolidityVerifier({
      verificationKey: vk,
      settings: getProofSettingsFromOptions(options),
    });
    return result.solidityCode;
  }

  // TODO(https://github.com/noir-lang/noir/issues/5661): Update this to handle Honk recursive aggregation in the browser once it is ready in the backend itself
  async generateRecursiveProofArtifacts(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _proof: Uint8Array,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _numOfPublicInputs: number,
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
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
        bytecode: this.acirUncompressedBytecode,
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
      vkHash: uint8ArrayToHex(vkResult.hash),
    };
  }
}

export class AztecClientBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  constructor(
    private acirBuf: Uint8Array[],
    private api: Barretenberg,
  ) {}

  async prove(witnessBuf: Uint8Array[], vksBuf: Uint8Array[] = []): Promise<[Uint8Array[], Uint8Array, Uint8Array]> {
    if (vksBuf.length !== 0 && this.acirBuf.length !== witnessBuf.length) {
      throw new AztecClientBackendError('Witness and bytecodes must have the same stack depth!');
    }
    if (vksBuf.length !== 0 && vksBuf.length !== witnessBuf.length) {
      // NOTE: we allow 0 as an explicit 'I have no VKs'. This is a deprecated feature.
      throw new AztecClientBackendError('Witness and VKs must have the same stack depth!');
    }

    // Queue IVC start with the number of circuits
    this.api.chonkStart({ numCircuits: this.acirBuf.length });

    // Queue load and accumulate for each circuit
    for (let i = 0; i < this.acirBuf.length; i++) {
      const bytecode = this.acirBuf[i];
      const witness = witnessBuf[i] || new Uint8Array(0);
      const vk = vksBuf[i] || new Uint8Array(0);
      const functionName = `unknown_wasm_${i}`;

      // Load the circuit
      this.api.chonkLoad({
        circuit: {
          name: functionName,
          bytecode: bytecode,
          verificationKey: vk,
        },
      });

      // Accumulate with witness
      this.api.chonkAccumulate({
        witness,
      });
    }

    // Generate the proof (and wait for all previous steps to finish)
    const proveResult = await this.api.chonkProve({});
    // The API currently expects a msgpack-encoded API.
    const proof = new Encoder({ useRecords: false }).encode(fromChonkProof(proveResult.proof));
    // Generate the VK
    const vkResult = await this.api.chonkComputeIvcVk({
      circuit: {
        name: 'hiding',
        bytecode: this.acirBuf[this.acirBuf.length - 1],
      },
    });

    const proofFields = [
      proveResult.proof.megaProof,
      proveResult.proof.goblinProof.mergeProof,
      proveResult.proof.goblinProof.eccvmProof.preIpaProof,
      proveResult.proof.goblinProof.eccvmProof.ipaProof,
      proveResult.proof.goblinProof.translatorProof,
    ].flat();

    // Note: Verification may not work correctly until we properly serialize the proof
    if (!(await this.verify(proof, vkResult.bytes))) {
      throw new AztecClientBackendError('Failed to verify the private (Chonk) transaction proof!');
    }
    return [proofFields, proof, vkResult.bytes];
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    const result = await this.api.chonkVerify({
      proof: toChonkProof(new Decoder({ useRecords: false }).decode(proof)),
      vk,
    });
    return result.valid;
  }

  async gates(): Promise<number[]> {
    const circuitSizes: number[] = [];
    for (const buf of this.acirBuf) {
      const gates = await this.api.chonkStats({
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
}

// Converts bytecode from a base64 string to a Uint8Array
function acirToUint8Array(base64EncodedBytecode: string): Uint8Array {
  const compressedByteCode = base64Decode(base64EncodedBytecode);
  return ungzip(compressedByteCode);
}

// Base64 decode using atob (works in both browser and Node.js 18+)
function base64Decode(input: string): Uint8Array {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(input), c => c.charCodeAt(0));
  } else {
    throw new Error('atob is not available. Node.js 18+ or browser required.');
  }
}
