import { MAX_NULLIFIERS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';

import { AztecAddress } from '../../aztec-address/index.js';
import { ClaimedLengthArray } from '../claimed_length_array.js';
import { Nullifier, type ScopedNullifier } from '../nullifier.js';
import { buildNullifierReadRequestHints } from './build_nullifier_read_request_hints.js';
import { type NullifierReadRequestHints, NullifierReadRequestHintsBuilder } from './nullifier_read_request_hints.js';
import { ReadRequest, ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestAction, SettledReadHint } from './read_request_hints.js';

describe('buildNullifierReadRequestHints', () => {
  /**
   * Create fixtures.
   */
  const contractAddress = AztecAddress.fromBigInt(112233n);

  const innerNullifier = (index: number) => index + 1;

  const makeReadRequest = (value: number, counter = 2) =>
    new ReadRequest(new Fr(value), counter).scope(contractAddress);

  const makeNullifier = (value: number, counter = 1) =>
    new Nullifier(new Fr(value), counter, Fr.ZERO).scope(contractAddress);

  const settledNullifierInnerValue = 99999;
  const oracle = {
    getNullifierMembershipWitness: () => ({ membershipWitness: {}, leafPreimage: {} }) as any,
  };
  const nullifiers: Tuple<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX> = makeTuple(MAX_NULLIFIERS_PER_TX, i =>
    makeNullifier(innerNullifier(i)),
  );
  const futureNullifiers = Array.from({ length: MAX_NULLIFIERS_PER_TX }).map((_, i) =>
    makeNullifier(innerNullifier(i + MAX_NULLIFIERS_PER_TX)),
  );

  /**
   * Set up initial state.
   */
  let nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>;
  let expectedHints: NullifierReadRequestHints<
    typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX
  >;
  let numReadRequests = 0;
  let numPendingReads = 0;
  let numSettledReads = 0;

  /**
   * Helper functions for updating the state.
   */
  const readPendingNullifier = ({
    nullifierIndex,
    readRequestIndex = numReadRequests,
    hintIndex = numPendingReads,
  }: {
    nullifierIndex: number;
    readRequestIndex?: number;
    hintIndex?: number;
  }) => {
    nullifierReadRequests[readRequestIndex] = makeReadRequest(innerNullifier(nullifierIndex));
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsPending(hintIndex);
    expectedHints.pendingReadHints[hintIndex] = new PendingReadHint(readRequestIndex, nullifierIndex);
    numReadRequests++;
    numPendingReads++;
  };

  const readSettledNullifier = ({
    readRequestIndex = numReadRequests,
    hintIndex = numSettledReads,
  }: {
    readRequestIndex?: number;
    hintIndex?: number;
  } = {}) => {
    nullifierReadRequests[readRequestIndex] = makeReadRequest(settledNullifierInnerValue);
    expectedHints.readRequestActions[readRequestIndex] = ReadRequestAction.readAsSettled(hintIndex);
    expectedHints.settledReadHints[hintIndex] = new SettledReadHint(readRequestIndex, {} as any, {} as any);
    numReadRequests++;
    numSettledReads++;
  };

  const readFutureNullifier = (nullifierIndex: number) => {
    const readRequestIndex = numReadRequests;
    nullifierReadRequests[readRequestIndex] = makeReadRequest(futureNullifiers[nullifierIndex].value.toNumber());
    numReadRequests++;
  };

  const buildHints = async () =>
    await buildNullifierReadRequestHints(
      oracle,
      new ClaimedLengthArray(nullifierReadRequests, numReadRequests),
      new ClaimedLengthArray(nullifiers, MAX_NULLIFIERS_PER_TX),
      futureNullifiers,
    );

  beforeEach(() => {
    nullifierReadRequests = makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ScopedReadRequest.empty);
    expectedHints = NullifierReadRequestHintsBuilder.empty(
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    );
    numReadRequests = 0;
    numPendingReads = 0;
    numSettledReads = 0;
  });

  it('builds empty hints', async () => {
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for pending nullifier read requests', async () => {
    readPendingNullifier({ nullifierIndex: 2 });
    readPendingNullifier({ nullifierIndex: 1 });
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for settled nullifier read requests', async () => {
    readSettledNullifier();
    readSettledNullifier();
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });

  it('builds hints for mixed pending and settled and future nullifier read requests', async () => {
    readPendingNullifier({ nullifierIndex: 2 });
    readSettledNullifier();
    readFutureNullifier(0);
    readSettledNullifier();
    readPendingNullifier({ nullifierIndex: 1 });
    readFutureNullifier(1);
    readPendingNullifier({ nullifierIndex: 1 });
    const hints = await buildHints();
    expect(hints).toEqual(expectedHints);
  });
});
