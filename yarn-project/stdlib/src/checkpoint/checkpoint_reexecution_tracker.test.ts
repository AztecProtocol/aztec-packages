import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { CheckpointReexecutionTracker } from './checkpoint_reexecution_tracker.js';

describe('CheckpointReexecutionTracker', () => {
  let tracker: CheckpointReexecutionTracker;

  beforeEach(() => {
    tracker = new CheckpointReexecutionTracker();
  });

  it('records and queries `valid` outcomes by (checkpoint number, archive root)', () => {
    const cp = CheckpointNumber(7);
    const archive = Fr.random();
    tracker.recordOutcome(SlotNumber(42), archive, 'valid', cp);

    expect(tracker.hasReexecuted(cp, archive)).toBe(true);
    expect(tracker.hasReexecuted(cp, Fr.random())).toBe(false);
    expect(tracker.hasReexecuted(CheckpointNumber(8), archive)).toBe(false);
  });

  it('hasReexecuted is true only for `valid` outcomes', () => {
    const cp = CheckpointNumber(1);
    const archive = Fr.random();

    tracker.recordOutcome(SlotNumber(1), archive, 'invalid', cp);
    expect(tracker.hasReexecuted(cp, archive)).toBe(false);

    tracker.recordOutcome(SlotNumber(1), archive, 'unvalidated', cp);
    expect(tracker.hasReexecuted(cp, archive)).toBe(false);

    tracker.recordOutcome(SlotNumber(1), archive, 'valid', cp);
    expect(tracker.hasReexecuted(cp, archive)).toBe(true);
  });

  it('exposes outcomes by slot', () => {
    tracker.recordOutcome(SlotNumber(10), Fr.random(), 'valid', CheckpointNumber(1));
    tracker.recordOutcome(SlotNumber(20), Fr.random(), 'invalid', CheckpointNumber(2));
    tracker.recordOutcome(SlotNumber(30), Fr.random(), 'unvalidated', CheckpointNumber(3));

    expect(tracker.getOutcomeForSlot(SlotNumber(10))).toBe('valid');
    expect(tracker.getOutcomeForSlot(SlotNumber(20))).toBe('invalid');
    expect(tracker.getOutcomeForSlot(SlotNumber(30))).toBe('unvalidated');
    expect(tracker.getOutcomeForSlot(SlotNumber(99))).toBeUndefined();
  });

  it('records slot-only outcomes when checkpoint number is unknown', () => {
    const archive = Fr.random();
    tracker.recordOutcome(SlotNumber(5), archive, 'invalid');

    expect(tracker.getOutcomeForSlot(SlotNumber(5))).toBe('invalid');
    expect(tracker.hasReexecuted(CheckpointNumber(0), archive)).toBe(false);
  });

  it('tracks competing archive roots at the same checkpoint independently', () => {
    const cp = CheckpointNumber(5);
    const archiveA = Fr.random();
    const archiveB = Fr.random();

    tracker.recordOutcome(SlotNumber(50), archiveB, 'invalid', cp);
    tracker.recordOutcome(SlotNumber(51), archiveA, 'valid', cp);

    expect(tracker.hasReexecuted(cp, archiveA)).toBe(true);
    expect(tracker.hasReexecuted(cp, archiveB)).toBe(false);
  });

  it('removeBefore drops entries below the cutoff and clears their slot index', () => {
    tracker.recordOutcome(SlotNumber(10), Fr.random(), 'valid', CheckpointNumber(1));
    tracker.recordOutcome(SlotNumber(20), Fr.random(), 'valid', CheckpointNumber(2));
    tracker.recordOutcome(SlotNumber(30), Fr.random(), 'valid', CheckpointNumber(3));

    tracker.removeBefore(CheckpointNumber(3));

    expect(tracker.getOutcomeForSlot(SlotNumber(10))).toBeUndefined();
    expect(tracker.getOutcomeForSlot(SlotNumber(20))).toBeUndefined();
    expect(tracker.getOutcomeForSlot(SlotNumber(30))).toBe('valid');
  });

  it('overwrites a prior outcome for the same (checkpoint, archive)', () => {
    const cp = CheckpointNumber(1);
    const archive = Fr.random();
    tracker.recordOutcome(SlotNumber(1), archive, 'unvalidated', cp);
    tracker.recordOutcome(SlotNumber(1), archive, 'valid', cp);

    expect(tracker.hasReexecuted(cp, archive)).toBe(true);
    expect(tracker.getOutcomeForSlot(SlotNumber(1))).toBe('valid');
  });

  it('removeBefore drops slot-only entries older than the highest removed slot', () => {
    // Slot-only entries (no checkpoint number) cannot be reached via byCheckpoint pruning.
    // Without slot-watermark pruning they would accumulate forever.
    tracker.recordOutcome(SlotNumber(5), Fr.random(), 'unvalidated');
    tracker.recordOutcome(SlotNumber(10), Fr.random(), 'valid', CheckpointNumber(1));
    tracker.recordOutcome(SlotNumber(12), Fr.random(), 'unvalidated');
    tracker.recordOutcome(SlotNumber(20), Fr.random(), 'valid', CheckpointNumber(2));
    tracker.recordOutcome(SlotNumber(25), Fr.random(), 'unvalidated');

    tracker.removeBefore(CheckpointNumber(2));

    expect(tracker.getOutcomeForSlot(SlotNumber(5))).toBeUndefined();
    expect(tracker.getOutcomeForSlot(SlotNumber(10))).toBeUndefined();
    // Slot 12 is above the highest removed slot (10)
    expect(tracker.getOutcomeForSlot(SlotNumber(12))).toBe('unvalidated');
    expect(tracker.getOutcomeForSlot(SlotNumber(20))).toBe('valid');
    expect(tracker.getOutcomeForSlot(SlotNumber(25))).toBe('unvalidated');
  });

  describe('recordTxsCollected', () => {
    it('records and queries by (slot, indexWithinCheckpoint) with three-valued result', () => {
      tracker.recordTxsCollected(SlotNumber(11), 0, true);
      tracker.recordTxsCollected(SlotNumber(11), 1, false);

      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 0)).toBe(true);
      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 1)).toBe(false);
      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 2)).toBeUndefined();
      expect(tracker.getTxsCollectedRecord(SlotNumber(99), 0)).toBeUndefined();
    });

    it('preserves prior txsCollected entries when recordOutcome fires for the same slot', () => {
      tracker.recordTxsCollected(SlotNumber(11), 0, true);
      tracker.recordTxsCollected(SlotNumber(11), 1, false);

      tracker.recordOutcome(SlotNumber(11), Fr.random(), 'valid', CheckpointNumber(7));

      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 0)).toBe(true);
      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 1)).toBe(false);
      expect(tracker.getOutcomeForSlot(SlotNumber(11))).toBe('valid');
    });

    it('overwrites a prior collected value at the same (slot, index)', () => {
      tracker.recordTxsCollected(SlotNumber(11), 0, false);
      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 0)).toBe(false);

      tracker.recordTxsCollected(SlotNumber(11), 0, true);
      expect(tracker.getTxsCollectedRecord(SlotNumber(11), 0)).toBe(true);
    });

    it('removeBefore drops txsCollected entries together with their slot', () => {
      tracker.recordTxsCollected(SlotNumber(10), 0, true);
      tracker.recordOutcome(SlotNumber(10), Fr.random(), 'valid', CheckpointNumber(1));
      tracker.recordTxsCollected(SlotNumber(20), 0, false);
      tracker.recordOutcome(SlotNumber(20), Fr.random(), 'valid', CheckpointNumber(2));

      tracker.removeBefore(CheckpointNumber(2));

      expect(tracker.getTxsCollectedRecord(SlotNumber(10), 0)).toBeUndefined();
      expect(tracker.getTxsCollectedRecord(SlotNumber(20), 0)).toBe(false);
    });

    it('removeBefore drops standalone txsCollected entries via the slot watermark', () => {
      // recordTxsCollected without a subsequent recordOutcome creates a slot-only entry with
      // no checkpoint number; it must still be reachable by the slot-watermark cleanup.
      tracker.recordTxsCollected(SlotNumber(5), 0, true);
      tracker.recordOutcome(SlotNumber(10), Fr.random(), 'valid', CheckpointNumber(1));
      tracker.recordTxsCollected(SlotNumber(12), 0, true);
      tracker.recordOutcome(SlotNumber(20), Fr.random(), 'valid', CheckpointNumber(2));

      tracker.removeBefore(CheckpointNumber(2));

      expect(tracker.getTxsCollectedRecord(SlotNumber(5), 0)).toBeUndefined();
      expect(tracker.getTxsCollectedRecord(SlotNumber(10), 0)).toBeUndefined();
      // Slot 12 is above the highest removed slot (10), so it survives.
      expect(tracker.getTxsCollectedRecord(SlotNumber(12), 0)).toBe(true);
      expect(tracker.getOutcomeForSlot(SlotNumber(20))).toBe('valid');
    });
  });
});
