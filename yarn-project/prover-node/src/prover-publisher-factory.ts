import type { RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LoggerBindings } from '@aztec/foundation/log';
import type { ProverPublisherConfig, ProverTxSenderConfig } from '@aztec/sequencer-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { ProverNodePublisher } from './prover-node-publisher.js';

export class ProverPublisherFactory {
  constructor(
    private config: ProverTxSenderConfig & ProverPublisherConfig,
    private deps: {
      rollupContract: RollupContract;
      publisherManager: PublisherManager<L1TxUtils>;
      proofSubmissionTarget?: EthAddress;
      telemetry?: TelemetryClient;
    },
    private bindings?: LoggerBindings,
  ) {}

  public async start() {
    await this.deps.publisherManager.loadState();
  }

  public stop() {
    this.deps.publisherManager.interrupt();
  }

  /**
   * Creates a new Prover Publisher instance.
   * @returns A new ProverNodePublisher instance.
   */
  public async create(): Promise<ProverNodePublisher> {
    const l1Publisher = await this.deps.publisherManager.getAvailablePublisher();
    return new ProverNodePublisher(
      this.config,
      {
        rollupContract: this.deps.rollupContract,
        l1TxUtils: l1Publisher,
        proofSubmissionTarget: this.deps.proofSubmissionTarget,
        telemetry: this.deps.telemetry,
      },
      this.bindings,
    );
  }
}
