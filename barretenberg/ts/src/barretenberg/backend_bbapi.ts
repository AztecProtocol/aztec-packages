import { BackendOptions, Barretenberg } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import {
  deflattenFields,
  flattenFieldsAsArray,
  ProofData,
  splitHonkProof,
  PAIRING_POINTS_SIZE,
} from '../proof/index.js';
import { ungzip } from 'pako';
import { Buffer } from 'buffer';
import { Encoder, Decoder } from 'msgpackr';
import type { ProofSystemSettings, Fr } from '../cbind/generated/api_types.js';
import { uint8ArrayToHexString } from '../serialize/index.js';

/**
 * Options for the BbApiUltraHonkBackend.
 */
export type BbApiUltraHonkBackendOptions = {
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

/**
 * A new UltraHonk backend that uses the bbapi commands instead of the old WASM API.
 * This allows for a more unified API across different languages and better code reuse.
 */
export class BbApiUltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;
  protected acirUncompressedBytecode: Uint8Array;

  constructor(
    acirBytecode: string,
    protected backendOptions: BackendOptions = { threads: 1 },
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  /** @ignore */
  private async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.backendOptions);
      // No need to initialize CRS for bbapi
      this.api = api;
    }
  }

  private getProofSystemSettings(options?: BbApiUltraHonkBackendOptions): ProofSystemSettings {
    let oracleHashType = 'poseidon2';
    let disableZk = false;

    if (options?.keccak) {
      oracleHashType = 'keccak';
      disableZk = true;
    } else if (options?.keccakZK) {
      oracleHashType = 'keccak';
      disableZk = false;
    } else if (options?.starknet) {
      oracleHashType = 'starknet';
      disableZk = true;
    } else if (options?.starknetZK) {
      oracleHashType = 'starknet';
      disableZk = false;
    }

    return {
      ipaAccumulation: false,
      oracleHashType,
      disableZk,
      honkRecursion: 1,
      recursive: false,
    };
  }

  async generateProof(compressedWitness: Uint8Array, options?: BbApiUltraHonkBackendOptions): Promise<ProofData> {
    await this.instantiate();

    const settings = this.getProofSystemSettings(options);

    // First compute the VK to get the number of public inputs
    const vkResponse = await this.api.getBbApi().circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings,
    });

    // Convert VK to fields to get the number of public inputs
    const vkAsFieldsResponse = await this.api.getBbApi().vkAsFields({
      verificationKey: vkResponse.bytes
    });

    // Item at index 1 in VK is the number of public inputs
    const publicInputsSizeIndex = 1;
    const numPublicInputs = Number(vkAsFieldsResponse.fields[publicInputsSizeIndex].toString()) - PAIRING_POINTS_SIZE;

    // Decode witness from msgpack format
    const witnessDecoder = new Decoder({ useRecords: false });
    const witnessData = witnessDecoder.decode(ungzip(compressedWitness));

    // Encode witness to bbapi format
    const witnessEncoder = new Encoder({ useRecords: false });
    const witness = witnessEncoder.encode(witnessData);

    // Generate the proof
    const proveResponse = await this.api.getBbApi().circuitProve({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
        verificationKey: vkResponse.bytes,
      },
      witness: Buffer.from(witness),
      settings,
    });

    // Convert Fr arrays to buffers and split the proof
    const publicInputsBuffer = Buffer.concat(proveResponse.publicInputs);
    const proofBuffer = Buffer.concat(proveResponse.proof);
    const proofWithPublicInputs = Buffer.concat([publicInputsBuffer, proofBuffer]);

    const { proof, publicInputs: publicInputsBytes } = splitHonkProof(proofWithPublicInputs, numPublicInputs);
    const publicInputs = deflattenFields(publicInputsBytes);

    return { proof, publicInputs };
  }

  async verifyProof(proofData: ProofData, options?: BbApiUltraHonkBackendOptions): Promise<boolean> {
    await this.instantiate();

    const settings = this.getProofSystemSettings(options);

    // Compute the VK
    const vkResponse = await this.api.getBbApi().circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings,
    });

    // Convert public inputs to field arrays (Fr[])
    const publicInputsFlat = flattenFieldsAsArray(proofData.publicInputs);
    const publicInputsFr: Fr[] = [];
    for (let i = 0; i < publicInputsFlat.length; i += 32) {
      publicInputsFr.push(publicInputsFlat.slice(i, i + 32));
    }

    // Convert proof to field arrays (Fr[])
    const proofFr: Fr[] = [];
    for (let i = 0; i < proofData.proof.length; i += 32) {
      proofFr.push(proofData.proof.slice(i, i + 32));
    }

    // Verify the proof
    const verifyResponse = await this.api.getBbApi().circuitVerify({
      verificationKey: vkResponse.bytes,
      publicInputs: publicInputsFr,
      proof: proofFr,
      settings,
    });

    return verifyResponse.verified;
  }

  async getVerificationKey(options?: BbApiUltraHonkBackendOptions): Promise<Uint8Array> {
    await this.instantiate();

    const settings = this.getProofSystemSettings(options);

    const vkResponse = await this.api.getBbApi().circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings,
    });

    return vkResponse.bytes;
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(vk?: Uint8Array): Promise<string> {
    await this.instantiate();

    let vkBuf = vk;
    if (!vkBuf) {
      // Default to keccak for Solidity verifier
      const settings = this.getProofSystemSettings({ keccak: true });
      const vkResponse = await this.api.getBbApi().circuitComputeVk({
        circuit: {
          name: 'circuit',
          bytecode: Buffer.from(this.acirUncompressedBytecode),
        },
        settings,
      });
      vkBuf = vkResponse.bytes;
    }

    const response = await this.api.getBbApi().circuitWriteSolidityVerifier({
      verificationKey: vkBuf,
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'keccak',
        disableZk: true,
        honkRecursion: 1,
        recursive: false,
      },
    });

    return response.solidityCode;
  }

  async generateRecursiveProofArtifacts(
    proof: Uint8Array,
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    await this.instantiate();

    // Get VK
    const settings = this.getProofSystemSettings();
    const vkResponse = await this.api.getBbApi().circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings,
    });

    // Convert VK to fields
    const vkAsFieldsResponse = await this.api.getBbApi().vkAsFields({
      verificationKey: vkResponse.bytes,
    });

    // Convert proof to fields
    const proofFr: Fr[] = [];
    for (let i = 0; i < proof.length; i += 32) {
      proofFr.push(proof.slice(i, i + 32));
    }
    
    const proofAsFieldsResponse = await this.api.getBbApi().proofAsFields({
      proof: proofFr,
    });

    return {
      proofAsFields: proofAsFieldsResponse.fields.map(f => '0x' + uint8ArrayToHexString(f)),
      vkAsFields: vkAsFieldsResponse.fields.map(f => '0x' + uint8ArrayToHexString(f)),
      vkHash: '', // Not needed for recursive artifacts
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
