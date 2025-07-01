import type { PublicProcessorFactory } from '@aztec/simulator/server';

import { SequencerClient } from '../client/sequencer-client.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { Sequencer } from '../sequencer/sequencer.js';
import type { SequencerTimetable } from '../sequencer/timetable.js';

class TestSequencer_ extends Sequencer {
  declare public publicProcessorFactory: PublicProcessorFactory;
  declare public timetable: SequencerTimetable;
  declare public publisher: SequencerPublisher;
}

export type TestSequencer = TestSequencer_;

class TestSequencerClient_ extends SequencerClient {
  declare public sequencer: TestSequencer;
}

export type TestSequencerClient = TestSequencerClient_;
