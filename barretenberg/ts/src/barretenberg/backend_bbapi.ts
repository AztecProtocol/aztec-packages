import { ungzip } from 'pako';
import { BackendOptions, Barretenberg } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { ProofSystemSettings, Fr } from '../cbind/generated/api_types.js';
import { type Ptr } from '../types/index.js';
import { deflattenFields, PAIRING_POINTS_SIZE, splitHonkProof } from '../proof/index.js';

/**
 * BbApiUltraHonkBackend
 * Barretenberg backend that uses bbapi functions
 */
export class BbApiUltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` and `acirBuf` in the constructor.
  // These are initialized asynchronously in the `instantiate` function,
  // constructors cannot be asynchronous which is why we do this.

  protected api!: Barretenberg;
  protected acirUncompressedBytecode: Uint8Array;

  constructor(
    protected acirBytecode: string,
    protected options: BackendOptions = { threads: 1 },
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);

      const [_, __] = await api.acirGetCircuitSizes(this.acirUncompressedBytecode, false, true);
      await api.acirInitSRS(this.acirUncompressedBytecode, false, true);

      this.api = api;
    }
  }

  /**
   * Generate a proof using bbapi CircuitProve
   */
  async prove(witnessBuf: Uint8Array): Promise<Uint8Array> {
    await this.instantiate();

    const proveResult = await this.api.circuitProve({
      witness: Buffer.from(witnessBuf),
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
        verificationKey: Buffer.from([]), // Empty VK for now
      },
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: false,
      },
    });

    // Convert Fr[] to Uint8Array
    const proofBuffer = new Uint8Array(proveResult.proof.length * 32);
    proveResult.proof.forEach((fr, i) => {
      proofBuffer.set(fr, i * 32);
    });
    return proofBuffer;
  }

  /**
   * Verify a proof using bbapi CircuitVerify
   */
  async verify(proof: Uint8Array): Promise<boolean> {
    await this.instantiate();

    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: false,
      },
    });

    // Item at index 1 in VK is the number of public inputs
    const publicInputsSizeIndex = 1; // index into VK for numPublicInputs
    const numPublicInputs = Number(vkResult.fields[publicInputsSizeIndex].toString()) - PAIRING_POINTS_SIZE;

    const splitProof = splitHonkProof(proof, numPublicInputs);
    // Convert Uint8Array proof and public inputs to a pair of Fr[]
    const publicInputs: Fr[] = [];
    for (let i = 0; i < splitProof.publicInputs.length; i += 32) {
      publicInputs.push(splitProof.publicInputs.slice(i, i + 32) as Fr);
    }
    const proofFrs: Fr[] = [];
    for (let i = 0; i < splitProof.proof.length; i += 32) {
      proofFrs.push(splitProof.proof.slice(i, i + 32) as Fr);
    }

    const verifyResult = await this.api.circuitVerify({
      verificationKey: vkResult.bytes,
      publicInputs,
      proof: proofFrs,
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: false,
      },
    });

    return verifyResult.verified;
  }

  /**
   * Get the verification key using bbapi CircuitComputeVk
   */
  async getVerificationKey(): Promise<Uint8Array> {
    await this.instantiate();

    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: false,
      },
    });

    return vkResult.bytes;
  }

  // NOTE(AD): previous issue comment below - this looks like it was never completed?
  // TODO(https://github.com/noir-lang/noir/issues/5661): Update this to handle Honk recursive aggregation in the browser once it is ready in the backend itself
  async generateRecursiveProofArtifacts(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _proof: Uint8Array,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _numOfPublicInputs: number,
  ): Promise<{ vkAsFields: string[]; vkHash: string }> {
    await this.instantiate();

    // Get the VK with fields using CircuitComputeVk
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: Buffer.from(this.acirUncompressedBytecode),
      },
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: false,
      },
    });

    // Convert Fr[] to string[]
    const vkAsFields = vkResult.fields.map(fr => fr.toString());

    // Convert hash to hex string
    const vkHash = '0x' + Buffer.from(vkResult.hash).toString('hex');

    return {
      vkAsFields,
      vkHash,
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
  const compressedByteCode = Buffer.from(base64EncodedBytecode, 'base64');
  return ungzip(compressedByteCode);
}
