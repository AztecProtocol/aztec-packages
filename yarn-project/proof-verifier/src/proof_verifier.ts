import { retrieveL2ProofsFromRollup } from '@aztec/archiver/data-retrieval';
import { BBCircuitVerifier } from '@aztec/bb-prover';
import { createEthereumChain } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import {
  Attributes,
  Metrics,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  type UpDownCounter,
  ValueType,
  trackSpan,
} from '@aztec/telemetry-client';

import { type PublicClient, createPublicClient, http } from 'viem';

import { type ProofVerifierConfig } from './config.js';

const EXPECTED_PROOF_SIZE = 13988;

export class ProofVerifier implements Traceable {
  private runningPromise: RunningPromise;
  private synchedToL1Block = 0n;

  private proofVerified: UpDownCounter;

  public readonly tracer: Tracer;

  constructor(
    private config: ProofVerifierConfig,
    private client: PublicClient,
    private verifier: BBCircuitVerifier,
    telemetryClient: TelemetryClient,
    private logger: Logger,
  ) {
    this.tracer = telemetryClient.getTracer('ProofVerifier');
    this.runningPromise = new RunningPromise(this.work.bind(this), this.logger, config.pollIntervalMs);
    this.proofVerified = telemetryClient.getMeter('ProofVerifier').createUpDownCounter(Metrics.PROOF_VERIFIER_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of proofs verified by the block verifier bot',
    });
    this.synchedToL1Block = BigInt(config.l1StartBlock - 1);
  }

  static async new(config: ProofVerifierConfig, telemetryClient: TelemetryClient): Promise<ProofVerifier> {
    const logger = createLogger('proof-verifier:block-verifier-bot');
    const verifier = await BBCircuitVerifier.new(config, [], logger);
    const client = createPublicClient({
      chain: createEthereumChain(config.l1Url, config.l1ChainId).chainInfo,
      transport: http(config.l1Url),
      pollingInterval: config.viemPollingIntervalMS,
    });

    return new ProofVerifier(config, client, verifier, telemetryClient, logger);
  }

  start() {
    this.logger.info(`Starting proof verifier monitoring rollup=${this.config.rollupAddress}`);
    this.runningPromise.start();
  }

  async stop() {
    await this.runningPromise.stop();
  }

  @trackSpan('ProofVerifier.work')
  private async work() {
    const startBlock = this.synchedToL1Block + 1n;
    this.logger.debug(`Fetching proofs from L1 block ${startBlock}`);
    const { lastProcessedL1BlockNumber, retrievedData } = await retrieveL2ProofsFromRollup(
      this.client,
      this.config.rollupAddress,
      startBlock,
    );

    if (retrievedData.length === 0) {
      this.logger.debug(`No proofs found since L1 block ${startBlock}`);
      return;
    } else {
      this.logger.debug(`Fetched ${retrievedData.length} proofs since L1 block ${startBlock}`);
    }

    for (const { l2BlockNumber, txHash, proof, proverId } of retrievedData) {
      this.logger.debug(
        `Proof size ${proof.buffer.length} for L2 block proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`,
      );

      const invalidProofFormat = proof.buffer.length < EXPECTED_PROOF_SIZE;
      if (invalidProofFormat) {
        this.logger.warn(
          `Invalid proof format detected: proof length=${proof.buffer.length}bytes proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`,
        );
      }

      try {
        await this.verifier.verifyProofForCircuit('RootRollupArtifact', proof);
        this.logger.info(`Verified proof for L2 block proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`);

        this.proofVerified.add(1, {
          [Attributes.ROLLUP_PROVER_ID]: proverId.toString(),
          [Attributes.STATUS]: 'valid',
        });
      } catch (err) {
        this.logger.warn(
          `Failed to verify proof for L2 block proverId=${proverId} l2Block=${l2BlockNumber} l1Tx=${txHash}`,
        );

        if (invalidProofFormat) {
          this.proofVerified.add(1, {
            [Attributes.ROLLUP_PROVER_ID]: proverId.toString(),
            [Attributes.STATUS]: 'invalid_proof_format',
          });
        } else {
          this.proofVerified.add(1, {
            [Attributes.ROLLUP_PROVER_ID]: proverId.toString(),
            [Attributes.STATUS]: 'invalid',
          });
        }
      }
    }

    this.synchedToL1Block = lastProcessedL1BlockNumber;
  }
}
