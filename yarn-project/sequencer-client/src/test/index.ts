import { type PublicProcessorFactory } from '@aztec/simulator';

import { SequencerClient } from '../client/sequencer-client.js';
import { type L1Publisher } from '../publisher/l1-publisher.js';
import { Sequencer } from '../sequencer/sequencer.js';
import { type SequencerState } from '../sequencer/utils.js';

class TestSequencer_ extends Sequencer {
  public override publicProcessorFactory!: PublicProcessorFactory;
  public override timeTable!: Record<SequencerState, number>;
  public override processTxTime!: number;
  public override publisher!: L1Publisher;
}

export type TestSequencer = TestSequencer_;

class TestSequencerClient_ extends SequencerClient {
  public override sequencer!: TestSequencer;
}

export type TestSequencerClient = TestSequencerClient_;

export * from './test-l1-publisher.js';
