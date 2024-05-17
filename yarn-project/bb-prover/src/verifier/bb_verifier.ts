import { type Proof, type VerificationKeyData } from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { type DebugLogger, type LogFn, createDebugLogger } from '@aztec/foundation/log';
import { type ProtocolArtifact, ProtocolCircuitArtifacts } from '@aztec/noir-protocol-circuits-types';

import * as fs from 'fs/promises';

import { BB_RESULT, generateKeyForNoirCircuit, verifyProof } from '../bb/execute.js';
import { type BBProverConfig } from '../prover/bb_prover.js';
import { extractVkData } from '../verification_key/verification_key_data.js';

export class BBCircuitVerifier {
  private constructor(
    private config: BBProverConfig,
    private verificationKeys = new Map<ProtocolArtifact, Promise<VerificationKeyData>>(),
    private logger: DebugLogger,
  ) {}

  public static async new(
    config: BBProverConfig,
    initialCircuits: ProtocolArtifact[] = [],
    logger = createDebugLogger('aztec:bb-verifier'),
  ) {
    const keys = new Map<ProtocolArtifact, Promise<VerificationKeyData>>();
    for (const circuit of initialCircuits) {
      const vkData = await this.generateVerificationKey(
        circuit,
        config.bbBinaryPath,
        config.bbWorkingDirectory,
        logger.debug,
      );
      keys.set(circuit, Promise.resolve(vkData));
    }
    return new BBCircuitVerifier(config, keys, logger);
  }

  private static async generateVerificationKey(
    circuit: ProtocolArtifact,
    bbPath: string,
    workingDirectory: string,
    logFn: LogFn,
  ) {
    return await generateKeyForNoirCircuit(
      bbPath,
      workingDirectory,
      circuit,
      ProtocolCircuitArtifacts[circuit],
      'vk',
      logFn,
    ).then(result => {
      if (result.status === BB_RESULT.FAILURE) {
        throw new Error(`Failed to created verification key for ${circuit}, ${result.reason}`);
      }

      return extractVkData(result.vkPath!);
    });
  }

  public async getVerificationKeyData(circuit: ProtocolArtifact) {
    let promise = this.verificationKeys.get(circuit);
    if (!promise) {
      promise = BBCircuitVerifier.generateVerificationKey(
        circuit,
        this.config.bbBinaryPath,
        this.config.bbWorkingDirectory,
        this.logger.debug,
      );
    }
    this.verificationKeys.set(circuit, promise);
    const vk = await promise;
    return vk.clone();
  }

  public async verifyProofForCircuit(circuit: ProtocolArtifact, proof: Proof) {
    // Create random directory to be used for temp files
    const bbWorkingDirectory = `${this.config.bbWorkingDirectory}/${randomBytes(8).toString('hex')}`;
    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    const proofFileName = `${bbWorkingDirectory}/proof`;
    const verificationKeyPath = `${bbWorkingDirectory}/vk`;
    const verificationKey = await this.getVerificationKeyData(circuit);

    this.logger.debug(`Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

    await fs.writeFile(proofFileName, proof.buffer);
    await fs.writeFile(verificationKeyPath, verificationKey.keyAsBytes);

    const logFunction = (message: string) => {
      this.logger.debug(`${circuit} BB out - ${message}`);
    };

    const result = await verifyProof(this.config.bbBinaryPath, proofFileName, verificationKeyPath!, logFunction);

    await fs.rm(bbWorkingDirectory, { recursive: true, force: true });

    if (result.status === BB_RESULT.FAILURE) {
      const errorMessage = `Failed to verify ${circuit} proof!`;
      throw new Error(errorMessage);
    }
  }
}
