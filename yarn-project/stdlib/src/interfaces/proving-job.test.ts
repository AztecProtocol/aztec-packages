import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';

import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { getEpochFromProvingJobId, makeExecutionResultJobId, makeProvingJobId } from './proving-job.js';

describe('makeExecutionResultJobId', () => {
  it('produces the same id for the same inputs', () => {
    const a = makeExecutionResultJobId(
      EpochNumber(7),
      BlockNumber(42),
      SlotNumber(123),
      4,
      ProvingRequestType.PUBLIC_VM,
    );
    const b = makeExecutionResultJobId(
      EpochNumber(7),
      BlockNumber(42),
      SlotNumber(123),
      4,
      ProvingRequestType.PUBLIC_VM,
    );
    expect(a).toEqual(b);
  });

  it('differs across any input field', () => {
    const base = makeExecutionResultJobId(
      EpochNumber(7),
      BlockNumber(42),
      SlotNumber(123),
      4,
      ProvingRequestType.PUBLIC_VM,
    );
    const variants = [
      makeExecutionResultJobId(EpochNumber(8), BlockNumber(42), SlotNumber(123), 4, ProvingRequestType.PUBLIC_VM),
      makeExecutionResultJobId(EpochNumber(7), BlockNumber(43), SlotNumber(123), 4, ProvingRequestType.PUBLIC_VM),
      makeExecutionResultJobId(EpochNumber(7), BlockNumber(42), SlotNumber(124), 4, ProvingRequestType.PUBLIC_VM),
      makeExecutionResultJobId(EpochNumber(7), BlockNumber(42), SlotNumber(123), 5, ProvingRequestType.PUBLIC_VM),
      makeExecutionResultJobId(
        EpochNumber(7),
        BlockNumber(42),
        SlotNumber(123),
        4,
        ProvingRequestType.PUBLIC_TX_BASE_ROLLUP,
      ),
    ];
    for (const variant of variants) {
      expect(variant).not.toEqual(base);
    }
  });

  it('does not collide with hash-based proving job ids in the same epoch', () => {
    const exec = makeExecutionResultJobId(
      EpochNumber(7),
      BlockNumber(42),
      SlotNumber(123),
      4,
      ProvingRequestType.PUBLIC_VM,
    );
    const hashed = makeProvingJobId(EpochNumber(7), ProvingRequestType.PUBLIC_VM, 'deadbeef');
    expect(exec).not.toEqual(hashed);
  });

  it('keeps getEpochFromProvingJobId working', () => {
    const id = makeExecutionResultJobId(
      EpochNumber(99),
      BlockNumber(1),
      SlotNumber(2),
      3,
      ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
    );
    expect(getEpochFromProvingJobId(id)).toEqual(EpochNumber(99));
  });

  it('rejects negative or non-integer tx indices', () => {
    expect(() =>
      makeExecutionResultJobId(EpochNumber(0), BlockNumber(0), SlotNumber(0), -1, ProvingRequestType.PUBLIC_VM),
    ).toThrow();
    expect(() =>
      makeExecutionResultJobId(EpochNumber(0), BlockNumber(0), SlotNumber(0), 1.5, ProvingRequestType.PUBLIC_VM),
    ).toThrow();
  });
});
