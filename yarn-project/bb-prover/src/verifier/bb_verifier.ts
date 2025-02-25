import { Tx } from '@aztec/circuit-types';
import { type ClientProtocolCircuitVerifier } from '@aztec/circuits.js/interfaces/server';
import { type Proof } from '@aztec/circuits.js/proofs';
import { type VerificationKeyData } from '@aztec/circuits.js/vks';
import { runInDirectory } from '@aztec/foundation/fs';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type ClientProtocolArtifact, type ServerProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import { ServerCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';

import { promises as fs } from 'fs';
import * as path from 'path';

import { type CircuitVerificationStats } from '@aztec/circuits.js/stats'index.js';
import { BB_RESULT, PROOF_FILENAME, VK_FILENAME, verifyClientIvcProof, verifyProof } from '../bb/execute.js';
import { type BBConfig } from '../config.js';
import { getUltraHonkFlavorForCircuit } from '../honk.js';
import { writeToOutputDirectory } from '../prover/client_ivc_proof_utils.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';

export class BBCircuitVerifier implements ClientProtocolCircuitVerifier {
  private constructor(private config: BBConfig, private logger: Logger) {}

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
      const proofFileName = path.join(bbWorkingDirectory, PROOF_FILENAME);
      const verificationKeyPath = path.join(bbWorkingDirectory, VK_FILENAME);
      const verificationKey = this.getVerificationKeyData(circuit);

      this.logger.debug(`${circuit} Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

      await fs.writeFile(proofFileName, proof.buffer);
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

        await writeToOutputDirectory(tx.clientIvcProof, bbWorkingDirectory);
        const result = await verifyClientIvcProof(
          this.config.bbBinaryPath,
          bbWorkingDirectory.concat('/proof'),
          bbWorkingDirectory.concat('/vk'),
          logFunction,
        );

        if (result.status === BB_RESULT.FAILURE) {
          const errorMessage = `Failed to verify ${circuit} proof!`;
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
      this.logger.warn(`Failed to verify ClientIVC proof for tx ${Tx.getHash(tx)}: ${String(err)}`);
      return false;
    }
  }
}
