import { EthAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherFilter, PublisherManager } from '@aztec/ethereum/publisher-manager';
import { SlotNumber } from '@aztec/foundation/branded-types';
import type { DateProvider } from '@aztec/foundation/timer';
import type { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { NodeKeystoreAdapter } from '@aztec/validator-client';

import type { SequencerClientConfig } from '../config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';
import { type Action, SequencerPublisher } from './sequencer-publisher.js';

export type AttestorPublisherPair = {
  attestorAddress: EthAddress;
  publisher: SequencerPublisher;
};

export class SequencerPublisherFactory {
  private publisherMetrics: SequencerPublisherMetrics;

  /** Stores the last slot in which every action was carried out by a publisher */
  private lastActions: Partial<Record<Action, SlotNumber>> = {};

  private logger: Logger;

  constructor(
    private sequencerConfig: SequencerClientConfig,
    private deps: {
      telemetry: TelemetryClient;
      publisherManager: PublisherManager<L1TxUtils>;
      blobClient: BlobClientInterface;
      dateProvider: DateProvider;
      epochCache: EpochCache;
      rollupContract: RollupContract;
      governanceProposerContract: GovernanceProposerContract;
      slashFactoryContract: SlashFactoryContract;
      nodeKeyStore: NodeKeystoreAdapter;
      logger?: Logger;
    },
  ) {
    this.publisherMetrics = new SequencerPublisherMetrics(deps.telemetry, 'SequencerPublisher');
    this.logger = deps.logger ?? createLogger('sequencer');
  }
  /**
   * Creates a new SequencerPublisher instance.
   * @param _validatorAddress - The address of the validator that will be using the publisher.
   * @returns A new SequencerPublisher instance.
   */
  public async create(validatorAddress?: EthAddress): Promise<AttestorPublisherPair> {
    // If we have been given an attestor address we must only allow publishers permitted for that attestor

    const allowedPublishers = !validatorAddress ? [] : this.deps.nodeKeyStore.getPublisherAddresses(validatorAddress);
    const filter: PublisherFilter<L1TxUtils> = !validatorAddress
      ? () => true
      : (utils: L1TxUtils) => {
          const publisherAddress = utils.getSenderAddress();
          return allowedPublishers.some(allowedPublisher => allowedPublisher.equals(publisherAddress));
        };

    const l1Publisher = await this.deps.publisherManager.getAvailablePublisher(filter);
    const attestorAddress =
      validatorAddress ?? this.deps.nodeKeyStore.getAttestorForPublisher(l1Publisher.getSenderAddress());

    const rollup = this.deps.rollupContract;
    const slashingProposerContract = await rollup.getSlashingProposer();

    const publisher = new SequencerPublisher(this.sequencerConfig, {
      l1TxUtils: l1Publisher,
      telemetry: this.deps.telemetry,
      blobClient: this.deps.blobClient,
      rollupContract: this.deps.rollupContract,
      epochCache: this.deps.epochCache,
      governanceProposerContract: this.deps.governanceProposerContract,
      slashingProposerContract,
      slashFactoryContract: this.deps.slashFactoryContract,
      dateProvider: this.deps.dateProvider,
      metrics: this.publisherMetrics,
      lastActions: this.lastActions,
      log: this.logger.createChild('publisher'),
    });

    return {
      attestorAddress,
      publisher,
    };
  }

  /** Interrupts all publishers managed by this factory. Used during sequencer shutdown. */
  public interruptAll(): void {
    this.deps.publisherManager.interrupt();
  }
}
