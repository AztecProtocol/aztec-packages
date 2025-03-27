import type { PublicProcessorFactory } from '@aztec/simulator/server';

import { SequencerClient } from '../client/sequencer-client.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { Sequencer } from '../sequencer/sequencer.js';
import type { SequencerTimetable } from '../sequencer/timetable.js';

class TestSequencer_ extends Sequencer {
  public declare publicProcessorFactory: PublicProcessorFactory;
  public declare timetable: SequencerTimetable;
  public declare publisher: SequencerPublisher;
}

export type TestSequencer = TestSequencer_;

class TestSequencerClient_ extends SequencerClient {
  public declare sequencer: TestSequencer;
}

export type TestSequencerClient = TestSequencerClient_;
