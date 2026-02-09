import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { FullNodeCheckpointsBuilder, ValidatorClient } from '@aztec/validator-client';

import { SequencerClient } from '../client/sequencer-client.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import { Sequencer } from '../sequencer/sequencer.js';
import type { SequencerTimetable } from '../sequencer/timetable.js';

class TestSequencer_ extends Sequencer {
  declare public publicProcessorFactory: PublicProcessorFactory;
  declare public timetable: SequencerTimetable;
  declare public publisherFactory: SequencerPublisherFactory;
  declare public validatorClient: ValidatorClient;
  declare public checkpointsBuilder: FullNodeCheckpointsBuilder;
}

export type TestSequencer = TestSequencer_;

class TestSequencerClient_ extends SequencerClient {
  declare public sequencer: TestSequencer;
  declare public publisherManager: PublisherManager<L1TxUtilsWithBlobs>;
}

export type TestSequencerClient = TestSequencerClient_;
