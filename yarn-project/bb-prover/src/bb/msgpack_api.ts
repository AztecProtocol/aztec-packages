import type { Barretenberg } from '@aztec/bb.js';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { Proof, RecursiveProof } from '@aztec/stdlib/proofs';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import type { UltraHonkFlavor } from '../honk.js';

/**
 * Converts UltraHonkFlavor to proof settings for msgpack API
 */
function getProofSettingsFromFlavor(flavor: UltraHonkFlavor): {
  ipaAccumulation: boolean;
  oracleHashType: string;
  disableZk: boolean;
  optimizedSolidityVerifier: boolean;
} {
  switch (flavor) {
    case 'ultra_honk':
      return {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: true,
        optimizedSolidityVerifier: false,
      };
    case 'ultra_keccak_honk':
      return {
        ipaAccumulation: false,
        oracleHashType: 'keccak',
        disableZk: true,
        optimizedSolidityVerifier: false,
      };
    case 'ultra_starknet_honk':
      return {
        ipaAccumulation: false,
        oracleHashType: 'starknet',
        disableZk: true,
        optimizedSolidityVerifier: false,
      };
    case 'ultra_rollup_honk':
      return {
        ipaAccumulation: true,
        oracleHashType: 'poseidon2',
        disableZk: true,
        optimizedSolidityVerifier: false,
      };
  }
}

/**
 * Wrapper around bb.js msgpack API for Aztec protocol circuit proving.
 * Handles buffer conversions and proof format translations.
 * Eliminates all file I/O - operates entirely on in-memory buffers.
 */
export class BBMsgpackProver {
  constructor(
    private api: Barretenberg,
    private logger: Logger,
  ) {}

  /**
   * Generates a proof for a circuit using the msgpack API.
   * All operations happen in memory - no file I/O.
   *
   * @param witness - Witness data as buffer (from ACVM)
   * @param bytecode - Circuit bytecode
   * @param verificationKey - Verification key bytes
   * @param circuitName - Name of the circuit for logging
   * @param flavor - UltraHonk flavor for proof settings
   * @param proofLength - Expected proof length for validation
   * @param vkData - Verification key metadata (for public inputs count)
   * @returns Recursive proof in Aztec format
   */
  async proveCircuit<PROOF_LENGTH extends number>(
    witness: Uint8Array,
    bytecode: Uint8Array,
    verificationKey: Uint8Array,
    circuitName: string,
    flavor: UltraHonkFlavor,
    proofLength: PROOF_LENGTH,
    vkData: VerificationKeyData,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    this.logger.debug(`Proving ${circuitName} via msgpack API...`);

    // Call msgpack API - all in memory!
    const { proof, publicInputs } = await this.api.circuitProve({
      witness,
      circuit: {
        name: circuitName,
        bytecode: Buffer.from(bytecode),
        verificationKey: Buffer.from(verificationKey),
      },
      settings: getProofSettingsFromFlavor(flavor),
    });

    this.logger.debug(
      `Proof generated via msgpack: ${proof.length} proof fields, ${publicInputs.length} public inputs`,
    );

    // Convert msgpack format to Aztec format
    return this.fromMsgpackProof(proof, publicInputs, proofLength, vkData);
  }

  /**
   * Verifies a proof using the msgpack API.
   * All operations happen in memory - no file I/O.
   *
   * @param proof - Proof in Aztec format
   * @param verificationKey - Verification key bytes
   * @param flavor - UltraHonk flavor for proof settings
   * @throws Error if verification fails
   */
  async verifyCircuit(proof: Proof, verificationKey: Uint8Array, flavor: UltraHonkFlavor): Promise<void> {
    this.logger.debug(`Verifying proof via msgpack API...`);

    // Convert Aztec proof format to msgpack format
    const { proofFields, publicInputFields } = this.toMsgpackProof(proof);

    // Call msgpack API - all in memory!
    const { verified } = await this.api.circuitVerify({
      verificationKey: Buffer.from(verificationKey),
      publicInputs: publicInputFields,
      proof: proofFields,
      settings: getProofSettingsFromFlavor(flavor),
    });

    if (!verified) {
      throw new Error('Proof verification failed via msgpack API');
    }

    this.logger.debug(`Proof verified successfully via msgpack API`);
  }

  /**
   * Converts Aztec Proof format to msgpack format.
   * Msgpack expects proof and public inputs as separate arrays of 32-byte field elements.
   *
   * @param proof - Proof in Aztec format (binary buffer with embedded public inputs)
   * @returns Proof and public inputs as arrays of Uint8Array (32-byte chunks)
   */
  private toMsgpackProof(proof: Proof): {
    proofFields: Uint8Array[];
    publicInputFields: Uint8Array[];
  } {
    // Aztec Proof format: [public_inputs (numPublicInputs * 32 bytes), proof]
    const publicInputsSize = proof.numPublicInputs * 32;
    const publicInputsBuffer = proof.buffer.subarray(0, publicInputsSize);
    const proofBuffer = proof.buffer.subarray(publicInputsSize);

    // Convert to arrays of 32-byte field elements
    const publicInputFields: Uint8Array[] = [];
    for (let i = 0; i < publicInputsBuffer.length; i += 32) {
      publicInputFields.push(new Uint8Array(publicInputsBuffer.subarray(i, i + 32)));
    }

    const proofFields: Uint8Array[] = [];
    for (let i = 0; i < proofBuffer.length; i += 32) {
      proofFields.push(new Uint8Array(proofBuffer.subarray(i, i + 32)));
    }

    return { proofFields, publicInputFields };
  }

  /**
   * Converts msgpack proof format to Aztec RecursiveProof format.
   * Msgpack returns proof and public inputs as separate arrays of 32-byte field elements.
   *
   * @param proofFields - Proof as array of 32-byte field elements
   * @param publicInputFields - Public inputs as array of 32-byte field elements
   * @param proofLength - Expected number of proof fields
   * @param vkData - Verification key metadata (for public inputs count)
   * @returns RecursiveProof in Aztec format
   */
  private fromMsgpackProof<PROOF_LENGTH extends number>(
    proofFields: Uint8Array[],
    publicInputFields: Uint8Array[],
    proofLength: PROOF_LENGTH,
    vkData: VerificationKeyData,
  ): RecursiveProof<PROOF_LENGTH> {
    // Convert field arrays to Fr arrays for RecursiveProof
    const proofFrs: Fr[] = [];
    for (const field of proofFields) {
      proofFrs.push(Fr.fromBuffer(Buffer.from(field)));
    }

    // Validate proof length
    if (proofFrs.length !== proofLength) {
      throw new Error(`Proof length mismatch: expected ${proofLength}, got ${proofFrs.length}`);
    }

    // Create binary proof in Aztec format: [public_inputs, proof]
    const publicInputsBuffer = Buffer.concat(publicInputFields.map(f => Buffer.from(f)));
    const proofBuffer = Buffer.concat(proofFields.map(f => Buffer.from(f)));
    const binaryProofWithPublicInputs = Buffer.concat([publicInputsBuffer, proofBuffer]);

    const binaryProof = new Proof(binaryProofWithPublicInputs, publicInputFields.length);

    return new RecursiveProof(proofFrs, binaryProof, true, proofLength);
  }
}
