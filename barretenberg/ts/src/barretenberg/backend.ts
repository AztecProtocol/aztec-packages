import { Barretenberg } from './index.js';
import { ProofData, uint8ArrayToHex, hexToUint8Array } from '../proof/index.js';
import { fromChonkProof, toChonkProof, ChonkProof } from '../cbind/generated/api_types.js';
import { ungzip } from 'pako';
import { Decoder, Encoder } from 'msgpackr';

export class AztecClientBackendError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Target verification environment for proof generation.
 * This determines the hash function used and whether zero-knowledge is enabled.
 */
export type VerifierTarget =
  | 'evm' // Ethereum/Solidity verification (keccak, ZK enabled)
  | 'evm-no-zk' // Ethereum/Solidity without zero-knowledge
  | 'noir-recursive' // Recursive verification in Noir circuits (poseidon2, ZK enabled)
  | 'noir-recursive-no-zk' // Recursive verification without ZK
  | 'noir-rollup' // Rollup circuits with IPA accumulation (poseidon2, ZK enabled)
  | 'noir-rollup-no-zk' // Rollup circuits without ZK
  | 'starknet' // Starknet verification via Garaga (ZK enabled)
  | 'starknet-no-zk'; // Starknet without zero-knowledge

/**
 * Options for the UltraHonkBackend.
 */
export type UltraHonkBackendOptions = {
  /**
   * Target verification environment. Determines hash function and ZK settings.
   * This is the recommended way to configure proof generation.
   *
   * @example
   * // For EVM/Solidity verification
   * backend.generateProof(witness, { verifierTarget: 'evm' });
   *
   * // For recursive verification in Noir
   * backend.generateProof(witness, { verifierTarget: 'noir-recursive' });
   */
  verifierTarget?: VerifierTarget;

  // Legacy options - prefer using verifierTarget instead

  /** @deprecated Use verifierTarget: 'evm-no-zk' instead */
  keccak?: boolean;
  /** @deprecated Use verifierTarget: 'evm' instead */
  keccakZK?: boolean;
  /** @deprecated Use verifierTarget: 'starknet-no-zk' instead */
  starknet?: boolean;
  /** @deprecated Use verifierTarget: 'starknet' instead */
  starknetZK?: boolean;
};

function getProofSettingsFromOptions(options?: UltraHonkBackendOptions): {
  ipaAccumulation: boolean;
  oracleHashType: string;
  disableZk: boolean;
  optimizedSolidityVerifier: boolean;
} {
  // Check for conflicting options - verifierTarget should not be combined with legacy options
  if (options?.verifierTarget) {
    const legacyOptions = [options.keccak, options.keccakZK, options.starknet, options.starknetZK].filter(Boolean);
    if (legacyOptions.length > 0) {
      throw new Error(
        'Cannot use verifierTarget with legacy options (keccak, keccakZK, starknet, starknetZK). ' +
          'Use verifierTarget alone.',
      );
    }

    switch (options.verifierTarget) {
      case 'evm':
        return { ipaAccumulation: false, oracleHashType: 'keccak', disableZk: false, optimizedSolidityVerifier: false };
      case 'evm-no-zk':
        return { ipaAccumulation: false, oracleHashType: 'keccak', disableZk: true, optimizedSolidityVerifier: false };
      case 'noir-recursive':
        return {
          ipaAccumulation: false,
          oracleHashType: 'poseidon2',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'noir-recursive-no-zk':
        return {
          ipaAccumulation: false,
          oracleHashType: 'poseidon2',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
      case 'noir-rollup':
        return {
          ipaAccumulation: true,
          oracleHashType: 'poseidon2',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'noir-rollup-no-zk':
        return {
          ipaAccumulation: true,
          oracleHashType: 'poseidon2',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
      case 'starknet':
        return {
          ipaAccumulation: false,
          oracleHashType: 'starknet',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'starknet-no-zk':
        return {
          ipaAccumulation: false,
          oracleHashType: 'starknet',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
    }
  }

  // Legacy options support (deprecated)
  return {
    ipaAccumulation: false,
    oracleHashType:
      options?.keccak || options?.keccakZK
        ? 'keccak'
        : options?.starknet || options?.starknetZK
          ? 'starknet'
          : 'poseidon2',
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
    options?: UltraHonkBackendOptions,
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    // TODO(https://github.com/noir-lang/noir/issues/5661): This needs to be updated to handle recursive aggregation.
    // There is still a proofAsFields method but we could consider getting rid of it as the proof itself
    // is a list of field elements.
    // UltraHonk also does not have public inputs directly prepended to the proof and they are still instead
    // inserted at an offset.
    // const proof = reconstructProofWithPublicInputs(proofData);
    // const proofAsFields = (await this.api.acirProofAsFieldsUltraHonk(proof)).slice(numOfPublicInputs);

    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
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
    private circuitNames: string[] = [],
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
      const functionName = this.circuitNames[i] || `circuit_${i}`;

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
    const lastIdx = this.acirBuf.length - 1;
    const vkResult = await this.api.chonkComputeVk({
      circuit: {
        name: this.circuitNames[lastIdx] || 'circuit',
        bytecode: this.acirBuf[lastIdx],
      },
    });

    const proofFields = [
      proveResult.proof.megaProof,
      proveResult.proof.goblinProof.mergeProof,
      proveResult.proof.goblinProof.eccvmProof,
      proveResult.proof.goblinProof.ipaProof,
      proveResult.proof.goblinProof.translatorProof,
    ].flat();

    // Verify using native proof directly to avoid redundant encode/decode cycle
    if (!(await this.verifyNative(proveResult.proof, vkResult.bytes))) {
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

  /**
   * Internal verification using native ChonkProof type.
   * Avoids encode/decode cycle when called from prove().
   */
  private async verifyNative(proof: ChonkProof, vk: Uint8Array): Promise<boolean> {
    const result = await this.api.chonkVerify({
      proof,
      vk,
    });
    return result.valid;
  }

  async gates(): Promise<number[]> {
    const circuitSizes: number[] = [];
    for (let i = 0; i < this.acirBuf.length; i++) {
      const gates = await this.api.chonkStats({
        circuit: {
          name: this.circuitNames[i] || `circuit_${i}`,
          bytecode: this.acirBuf[i],
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

/**
 * Convert a field element (32-byte Uint8Array) to a string.
 *
 * @param field - A 32-byte field element
 * @param radix - The radix for string conversion (2-36), defaults to 10 (decimal)
 * @returns The field value as a string in the specified radix
 *
 * @example
 * const decimal = fieldToString(field);        // "12345678"
 * const hex = fieldToString(field, 16);        // "bc614e"
 */
export function fieldToString(field: Uint8Array, radix: number = 10): string {
  let result = 0n;
  for (const byte of field) {
    result <<= 8n;
    result += BigInt(byte);
  }
  return result.toString(radix);
}

/**
 * Convert an array of field elements to an array of strings.
 * Useful for passing VK fields to Noir circuits.
 *
 * @param fields - Array of 32-byte field elements
 * @param radix - The radix for string conversion (2-36), defaults to 10 (decimal)
 * @returns Array of strings in the specified radix
 *
 * @example
 * const vkAsFields = await barretenbergAPI.vkAsFields({ verificationKey: vk });
 * const vkDecimalStrings = fieldsToStrings(vkAsFields.fields);      // ["12345678", "87654321", ...]
 * const vkHexStrings = fieldsToStrings(vkAsFields.fields, 16);      // ["bc614e", "5397fb1", ...]
 */
export function fieldsToStrings(fields: Uint8Array[], radix: number = 10): string[] {
  return fields.map(field => fieldToString(field, radix));
}

