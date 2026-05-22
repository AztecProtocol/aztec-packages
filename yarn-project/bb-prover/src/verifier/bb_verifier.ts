import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import {
  type ClientProtocolArtifact,
  type ProtocolArtifact,
  type ServerProtocolArtifact,
  mapProtocolArtifactNameToCircuitName,
} from '@aztec/noir-protocol-circuits-types/types';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import type { CircuitVerificationStats } from '@aztec/stdlib/stats';
import { Tx } from '@aztec/stdlib/tx';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import { promises as fs } from 'fs';

import { BBJsFactory } from '../bb/bb_js_backend.js';
import type { BBConfig } from '../config.js';
import { getUltraHonkFlavorForCircuit } from '../honk.js';

export class BBCircuitVerifier implements ClientProtocolCircuitVerifier {
  private bbJsFactory: BBJsFactory;

  private constructor(
    private config: BBConfig,
    private logger: Logger,
  ) {
    // BB_NUM_IVC_VERIFIERS bounds the number of long-lived bb processes the pool keeps alive.
    // If 0, fall back to spawning a fresh bb per verification.
    this.bbJsFactory = new BBJsFactory(config.bbBinaryPath, {
      poolSize: config.numConcurrentIVCVerifiers > 0 ? config.numConcurrentIVCVerifiers : undefined,
      logger,
      debugDir: config.bbDebugOutputDir,
    });
  }

  public stop(): Promise<void> {
    return this.bbJsFactory.destroy();
  }

  public static async new(config: BBConfig, logger = createLogger('bb-prover:verifier')) {
    if (!config.bbWorkingDirectory) {
      throw new Error(`Barretenberg working directory (BB_WORKING_DIRECTORY) is not set`);
    }
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    return new BBCircuitVerifier(config, logger);
  }

  public getVerificationKeyData(circuit: ProtocolArtifact): VerificationKeyData {
    const vk = ProtocolCircuitVks[circuit];
    if (vk === undefined) {
      throw new Error(`Could not find VK for artifact ${circuit}`);
    }
    return vk;
  }

  /** Verify an UltraHonk proof via bb.js API (no temp files). */
  public async verifyProofForCircuit(circuit: ServerProtocolArtifact, proof: Proof) {
    const verificationKey = this.getVerificationKeyData(circuit);
    const flavor = getUltraHonkFlavorForCircuit(circuit);

    this.logger.debug(`${circuit} Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

    // Split proof buffer into public input fields and proof fields (32-byte each)
    const publicInputFields = splitBufferToFieldArrays(proof.buffer.subarray(0, proof.numPublicInputs * 32));
    const proofFields = splitBufferToFieldArrays(proof.buffer.subarray(proof.numPublicInputs * 32));

    await using instance = await this.bbJsFactory.getInstance();
    const { verified, durationMs } = await instance.verifyProof(
      proofFields,
      verificationKey.keyAsBytes,
      publicInputFields,
      flavor,
    );

    if (!verified) {
      throw new Error(`Failed to verify ${circuit} proof!`);
    }

    this.logger.debug(`${circuit} verification successful`, {
      circuitName: mapProtocolArtifactNameToCircuitName(circuit),
      duration: durationMs,
      eventName: 'circuit-verification',
      proofType: 'ultra-honk',
    } satisfies CircuitVerificationStats);
  }

  /** Verify a Chonk (IVC) proof from a transaction via bb.js API. */
  public async verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    const proofType = 'Chonk';
    try {
      const totalTimer = new Timer();

      const circuit: ClientProtocolArtifact = tx.data.forPublic ? 'HidingKernelToPublic' : 'HidingKernelToRollup';
      const verificationKey = this.getVerificationKeyData(circuit);

      // Reconstruct the full proof with public inputs prepended, then convert Fr[] to Uint8Array[]
      const proofWithPubInputs = tx.chonkProof.attachPublicInputs(tx.data.publicInputs().toFields());
      const fieldsAsBuffers = proofWithPubInputs.fieldsWithPublicInputs.map(f => new Uint8Array(f.toBuffer()));

      await using instance = await this.bbJsFactory.getInstance();
      const { verified, durationMs } = await instance.verifyChonkProof(fieldsAsBuffers, verificationKey.keyAsBytes);

      if (!verified) {
        throw new Error(`Failed to verify ${proofType} proof for ${circuit}!`);
      }

      this.logger.debug(`${proofType} verification successful`, {
        circuitName: mapProtocolArtifactNameToCircuitName(circuit),
        duration: durationMs,
        eventName: 'circuit-verification',
        proofType: 'chonk',
      } satisfies CircuitVerificationStats);

      return { valid: true, durationMs, totalDurationMs: totalTimer.ms() };
    } catch (err) {
      this.logger.warn(`Failed to verify ${proofType} proof for tx ${tx.getTxHash().toString()}: ${String(err)}`);
      return { valid: false, durationMs: 0, totalDurationMs: 0 };
    }
  }
}

/** Split a buffer into 32-byte Uint8Array field elements. */
function splitBufferToFieldArrays(buffer: Buffer): Uint8Array[] {
  const fields: Uint8Array[] = [];
  for (let i = 0; i < buffer.length; i += 32) {
    fields.push(new Uint8Array(buffer.subarray(i, i + 32)));
  }
  return fields;
}
