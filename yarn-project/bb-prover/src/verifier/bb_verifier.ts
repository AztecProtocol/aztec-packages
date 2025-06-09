import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { ServerCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { ClientProtocolArtifact, ServerProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import type { CircuitVerificationStats } from '@aztec/stdlib/stats';
import { Tx } from '@aztec/stdlib/tx';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  BB_RESULT,
  PROOF_FILENAME,
  PUBLIC_INPUTS_FILENAME,
  VK_FILENAME,
  verifyClientIvcProof,
  verifyProof,
} from '../bb/execute.js';
import type { BBConfig } from '../config.js';
import { getUltraHonkFlavorForCircuit } from '../honk.js';
import { writeClientIVCProofToOutputDirectory } from '../prover/proof_utils.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Built by yarn generate
export const PRIVATE_TAIL_CIVC_VK = path.join(__dirname, '../../artifacts/private-civc-vk');
export const PUBLIC_TAIL_CIVC_VK = path.join(__dirname, '../../artifacts/public-civc-vk');

export class BBCircuitVerifier implements ClientProtocolCircuitVerifier {
  private constructor(
    private config: BBConfig,
    private logger: Logger,
  ) {}

  public stop(): Promise<void> {
    return Promise.resolve();
  }

  public static async new(config: BBConfig, logger = createLogger('bb-prover:verifier')) {
    await fs.mkdir(config.bbWorkingDirectory, { recursive: true });
    return new BBCircuitVerifier(config, logger);
  }

  public getVerificationKeyData(circuitType: ServerProtocolArtifact): VerificationKeyData {
    const vk = ServerCircuitVks[circuitType];
    if (vk === undefined) {
      throw new Error('Could not find VK for server artifact ' + circuitType);
    }
    return vk;
  }

  public async verifyProofForCircuit(circuit: ServerProtocolArtifact, proof: Proof) {
    const operation = async (bbWorkingDirectory: string) => {
      const publicInputsFileName = path.join(bbWorkingDirectory, PUBLIC_INPUTS_FILENAME);
      const proofFileName = path.join(bbWorkingDirectory, PROOF_FILENAME);
      const verificationKeyPath = path.join(bbWorkingDirectory, VK_FILENAME);
      const verificationKey = this.getVerificationKeyData(circuit);

      this.logger.debug(`${circuit} Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13189): Put this proof parsing logic in the proof class.
      await fs.writeFile(publicInputsFileName, proof.buffer.slice(0, proof.numPublicInputs * 32));
      await fs.writeFile(proofFileName, proof.buffer.slice(proof.numPublicInputs * 32));
      await fs.writeFile(verificationKeyPath, verificationKey.keyAsBytes);

      const result = await verifyProof(
        this.config.bbBinaryPath,
        proofFileName,
        verificationKeyPath!,
        getUltraHonkFlavorForCircuit(circuit),
        this.logger,
      );

      if (result.status === BB_RESULT.FAILURE) {
        const errorMessage = `Failed to verify ${circuit} proof!`;
        throw new Error(errorMessage);
      }

      this.logger.debug(`${circuit} verification successful`, {
        circuitName: mapProtocolArtifactNameToCircuitName(circuit),
        duration: result.durationMs,
        eventName: 'circuit-verification',
        proofType: 'ultra-honk',
      } satisfies CircuitVerificationStats);
    };
    await runInDirectory(this.config.bbWorkingDirectory, operation, this.config.bbSkipCleanup, this.logger);
  }

  public async verifyProof(tx: Tx): Promise<boolean> {
    try {
      // TODO(#7370) The verification keys should be supplied separately and based on the expectedCircuit
      // rather than read from the tx object itself. We also need the vks for the translator and ecc, which
      // are not being saved along the other vks yet. Reuse the 'verifyProofForCircuit' method above once
      // we have all the verification keys available.
      const expectedCircuit: ClientProtocolArtifact = tx.data.forPublic
        ? 'PrivateKernelTailToPublicArtifact'
        : 'PrivateKernelTailArtifact';
      const circuit = 'ClientIVC';

      // Block below is almost copy-pasted from verifyProofForCircuit
      const operation = async (bbWorkingDirectory: string) => {
        const logFunction = (message: string) => {
          this.logger.debug(`${circuit} BB out - ${message}`);
        };

        await writeClientIVCProofToOutputDirectory(tx.clientIvcProof, bbWorkingDirectory);
        const result = await verifyClientIvcProof(
          this.config.bbBinaryPath,
          bbWorkingDirectory.concat('/proof'),
          tx.data.forPublic ? PUBLIC_TAIL_CIVC_VK : PRIVATE_TAIL_CIVC_VK,
          logFunction,
        );

        if (result.status === BB_RESULT.FAILURE) {
          const errorMessage = `Failed to verify ${circuit} proof for ${expectedCircuit}!`;
          throw new Error(errorMessage);
        }

        this.logger.debug(`${circuit} verification successful`, {
          circuitName: mapProtocolArtifactNameToCircuitName(expectedCircuit),
          duration: result.durationMs,
          eventName: 'circuit-verification',
          proofType: 'client-ivc',
        } satisfies CircuitVerificationStats);
      };
      await runInDirectory(this.config.bbWorkingDirectory, operation, this.config.bbSkipCleanup, this.logger);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to verify ClientIVC proof for tx ${await Tx.getHash(tx)}: ${String(err)}`);
      return false;
    }
  }
}
