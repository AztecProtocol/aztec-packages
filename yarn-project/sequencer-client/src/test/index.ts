import type { PublisherManager } from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { ValidatorClient } from '@aztec/validator-client';

import { SequencerClient } from '../client/sequencer-client.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { Sequencer } from '../sequencer/sequencer.js';
import type { SequencerTimetable } from '../sequencer/timetable.js';

class TestSequencer_ extends Sequencer {
  declare public publicProcessorFactory: PublicProcessorFactory;
  declare public timetable: SequencerTimetable;
  declare public publisher: SequencerPublisher;
  declare public publisherFactory: SequencerPublisherFactory;
  declare public validatorClient: ValidatorClient;
}

export type TestSequencer = TestSequencer_;

class TestSequencerClient_ extends SequencerClient {
  declare public sequencer: TestSequencer;
  declare public publisherManager: PublisherManager<L1TxUtilsWithBlobs>;
}

export type TestSequencerClient = TestSequencerClient_;
