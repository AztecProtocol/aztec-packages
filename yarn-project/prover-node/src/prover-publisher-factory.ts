import type { RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import type { Logger } from '@aztec/foundation/log';
import type { PublisherConfig, TxSenderConfig } from '@aztec/sequencer-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { ProverNodePublisher } from './prover-node-publisher.js';

export class ProverPublisherFactory {
  constructor(
    private config: TxSenderConfig & PublisherConfig,
    private deps: {
      rollupContract: RollupContract;
      publisherManager: PublisherManager<L1TxUtils>;
      log: Logger;
      telemetry?: TelemetryClient;
    },
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
    return new ProverNodePublisher(this.config, {
      rollupContract: this.deps.rollupContract,
      l1TxUtils: l1Publisher,
      log: this.deps.log,
      telemetry: this.deps.telemetry,
    });
  }
}
