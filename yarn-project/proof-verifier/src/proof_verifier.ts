import { retrieveL2ProofsFromRollup } from '@aztec/archiver/data-retrieval';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { createEthereumChain } from '@aztec/ethereum';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Attributes, Metrics, type TelemetryClient, type UpDownCounter, ValueType } from '@aztec/telemetry-client';

import { type PublicClient, createPublicClient, http } from 'viem';

import { type ProofVerifierConfig } from './config.js';

export class ProofVerifier {
  private runningPromise: RunningPromise;
  private synchedToL1Block = 0n;

  private proofVerified: UpDownCounter;

  constructor(
    private config: ProofVerifierConfig,
    private client: PublicClient,
    private verifier: BBCircuitVerifier,
    telemetryClient: TelemetryClient,
    private logger: DebugLogger,
  ) {
    this.runningPromise = new RunningPromise(this.work.bind(this), config.pollIntervalMs);
    this.proofVerified = telemetryClient.getMeter('ProofVerifier').createUpDownCounter(Metrics.PROOF_VERIFIER_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of proofs verified by the block verifier bot',
    });
    this.synchedToL1Block = config.l1StartBlock - 1n;
  }

  static async new(config: ProofVerifierConfig, telemetryClient: TelemetryClient): Promise<ProofVerifier> {
    const logger = createDebugLogger('aztec:block-verifier-bot');
    const verifier = await BBCircuitVerifier.new(config, [], logger);
    const client = createPublicClient({
      chain: createEthereumChain(config.l1Url, config.l1ChainId).chainInfo,
      transport: http(config.l1Url),
    });

    return new ProofVerifier(config, client, verifier, telemetryClient, logger);
  }

  start() {
    this.runningPromise.start();
  }

  async stop() {
    await this.runningPromise.stop();
  }

  private async work() {
    const startBlock = this.synchedToL1Block + 1n;
    this.logger.debug(`Fetching proofs from L1 block ${startBlock}`);
    const { lastProcessedL1BlockNumber, retrievedData } = await retrieveL2ProofsFromRollup(
      this.client,
      this.config.rollupAddress,
      startBlock,
    );

    for (const { l2BlockNumber, txHash, proof, proverId } of retrievedData) {
      try {
        await this.verifier.verifyProofForCircuit('RootRollupArtifact', proof);
        this.logger.info(`Verified proof for L2 block proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`);

        this.proofVerified.add(1, {
          [Attributes.ROLLUP_PROVER_ID]: proverId.toString(),
          [Attributes.OK]: true,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to verify proof for L2 block proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`,
        );

        this.proofVerified.add(1, {
          [Attributes.ROLLUP_PROVER_ID]: proverId.toString(),
          [Attributes.OK]: false,
        });
      }
    }

    this.synchedToL1Block = lastProcessedL1BlockNumber;
  }
}
