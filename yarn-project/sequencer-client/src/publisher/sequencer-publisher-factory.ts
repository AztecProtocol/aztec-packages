import { EthAddress } from '@aztec/aztec.js';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import type { EpochCache } from '@aztec/epoch-cache';
import type { PublisherManager } from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import type { DateProvider } from '@aztec/foundation/timer';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { SequencerClientConfig } from '../config.js';
import type { SequencerContracts } from '../sequencer/config.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';
import { SequencerPublisher } from './sequencer-publisher.js';

export type AttestorPublisherPair = {
  attestorAddress: EthAddress;
  publisher: SequencerPublisher;
};

export class SequencerPublisherFactory {
  private publisherMetrics: SequencerPublisherMetrics;
  constructor(
    private sequencerConfig: SequencerClientConfig,
    private deps: {
      telemetry: TelemetryClient;
      publisherManager: PublisherManager<L1TxUtilsWithBlobs>;
      blobSinkClient?: BlobSinkClientInterface;
      dateProvider: DateProvider;
      epochCache: EpochCache;
      l1Contracts: SequencerContracts;
    },
  ) {
    this.publisherMetrics = new SequencerPublisherMetrics(deps.telemetry, 'SequencerPublisher');
  }
  /**
   * Creates a new SequencerPublisher instance.
   * @param _validatorAddress - The address of the validator that will be using the publisher.
   * @returns A new SequencerPublisher instance.
   */
  public async create(validatorAddress?: EthAddress): Promise<AttestorPublisherPair> {
    const l1Publisher = await this.deps.publisherManager.getAvailablePublisher();
    const rollup = this.deps.l1Contracts.rollupContract;
    const newSlashingProposer = await rollup.getSlashingProposer();
    const slashingProposerContract = newSlashingProposer;

    const publisher = new SequencerPublisher(this.sequencerConfig, {
      l1TxUtils: l1Publisher,
      telemetry: this.deps.telemetry,
      blobSinkClient: this.deps.blobSinkClient,
      rollupContract: this.deps.l1Contracts.rollupContract,
      epochCache: this.deps.epochCache,
      governanceProposerContract: this.deps.l1Contracts.governanceProposerContract,
      slashingProposerContract: slashingProposerContract,
      dateProvider: this.deps.dateProvider,
      metrics: this.publisherMetrics,
    });
    const attestorAddress = validatorAddress ?? EthAddress.ZERO;
    return {
      attestorAddress,
      publisher,
    };
  }
}
