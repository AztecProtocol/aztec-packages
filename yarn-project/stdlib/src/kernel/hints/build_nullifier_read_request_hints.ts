import {
  type MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  type NULLIFIER_TREE_HEIGHT,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { type IndexedTreeLeafPreimage, MembershipWitness } from '@aztec/foundation/trees';

import { AztecAddress } from '../../aztec-address/index.js';
import { siloNullifier } from '../../hash/hash.js';
import { Nullifier, type ScopedNullifier } from '../nullifier.js';
import { countAccumulatedItems, getNonEmptyItems } from '../utils/order_and_comparison.js';
import { NullifierReadRequestHintsBuilder } from './nullifier_read_request_hints.js';
import { ReadRequest, ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestActionsEnum, ReadRequestResetStates } from './read_request_hints.js';
import { ScopedValueCache } from './scoped_value_cache.js';

export function isValidNullifierReadRequest(readRequest: ScopedReadRequest, nullifier: ScopedNullifier) {
  return (
    readRequest.value.equals(nullifier.value) &&
    nullifier.contractAddress.equals(readRequest.contractAddress) &&
    readRequest.counter > nullifier.counter
  );
}

interface NullifierMembershipWitnessWithPreimage {
  membershipWitness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>;
  leafPreimage: IndexedTreeLeafPreimage;
}

export function getNullifierReadRequestResetStates(
  nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
  futureNullifiers: ScopedNullifier[],
): ReadRequestResetStates<typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX> {
  const resetStates = ReadRequestResetStates.empty(MAX_NULLIFIER_READ_REQUESTS_PER_TX);

  const nullifierMap: Map<bigint, { nullifier: ScopedNullifier; index: number }[]> = new Map();
  getNonEmptyItems(nullifiers).forEach((nullifier, index) => {
    const value = nullifier.value.toBigInt();
    const arr = nullifierMap.get(value) ?? [];
    arr.push({ nullifier, index });
    nullifierMap.set(value, arr);
  });

  const futureNullifiersMap = new ScopedValueCache(futureNullifiers);

  const numReadRequests = countAccumulatedItems(nullifierReadRequests);

  for (let i = 0; i < numReadRequests; ++i) {
    const readRequest = nullifierReadRequests[i];
    const pendingNullifier = nullifierMap
      .get(readRequest.value.toBigInt())
      ?.find(({ nullifier }) => isValidNullifierReadRequest(readRequest, nullifier));

    if (pendingNullifier !== undefined) {
      resetStates.states[i] = ReadRequestActionsEnum.READ_AS_PENDING;
      resetStates.pendingReadHints.push(new PendingReadHint(i, pendingNullifier.index));
    } else if (
      !futureNullifiersMap
        .get(readRequest)
        .some(futureNullifier => isValidNullifierReadRequest(readRequest, futureNullifier))
    ) {
      resetStates.states[i] = ReadRequestActionsEnum.READ_AS_SETTLED;
    }
  }

  return resetStates;
}

export async function buildNullifierReadRequestHintsFromResetStates<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  resetStates: ReadRequestResetStates<typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  maxPending: PENDING = MAX_NULLIFIER_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NULLIFIER_READ_REQUESTS_PER_TX as SETTLED,
  siloed = false,
) {
  const builder = new NullifierReadRequestHintsBuilder(maxPending, maxSettled);

  resetStates.pendingReadHints.forEach(hint => {
    builder.addPendingReadRequest(hint.readRequestIndex, hint.pendingValueIndex);
  });

  for (let i = 0; i < resetStates.states.length; i++) {
    if (resetStates.states[i] === ReadRequestActionsEnum.READ_AS_SETTLED) {
      const readRequest = nullifierReadRequests[i];
      const siloedValue = siloed
        ? readRequest.value
        : await siloNullifier(readRequest.contractAddress, readRequest.value);
      const membershipWitnessWithPreimage = await oracle.getNullifierMembershipWitness(siloedValue);
      builder.addSettledReadRequest(
        i,
        membershipWitnessWithPreimage.membershipWitness,
        membershipWitnessWithPreimage.leafPreimage,
      );
    }
  }

  return builder.toHints();
}

export async function buildNullifierReadRequestHints<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
  futureNullifiers: ScopedNullifier[],
  maxPending: PENDING = MAX_NULLIFIER_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NULLIFIER_READ_REQUESTS_PER_TX as SETTLED,
  siloed = false,
) {
  const resetStates = getNullifierReadRequestResetStates(nullifierReadRequests, nullifiers, futureNullifiers);
  return await buildNullifierReadRequestHintsFromResetStates(
    oracle,
    nullifierReadRequests,
    resetStates,
    maxPending,
    maxSettled,
    siloed,
  );
}

export async function buildSiloedNullifierReadRequestHints<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<Nullifier, typeof MAX_NULLIFIERS_PER_TX>,
  maxPending: PENDING = MAX_NULLIFIER_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NULLIFIER_READ_REQUESTS_PER_TX as SETTLED,
) {
  // Nullifiers outputted from public kernels are already siloed while read requests are not.
  // Siloing the read request values and set the contract addresses to zero to find the matching nullifier contexts.
  const nonEmptyNullifierReadRequests = getNonEmptyItems(nullifierReadRequests);
  const readRequests = await Promise.all(
    nonEmptyNullifierReadRequests.map(async r =>
      new ReadRequest(await siloNullifier(r.contractAddress, r.value), r.counter).scope(AztecAddress.ZERO),
    ),
  );
  const siloedReadRequests = padArrayEnd(readRequests, ScopedReadRequest.empty(), MAX_NULLIFIER_READ_REQUESTS_PER_TX);

  const scopedNullifiers = nullifiers.map(n =>
    new Nullifier(n.value, n.counter, n.noteHash).scope(AztecAddress.ZERO),
  ) as Tuple<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>;

  return buildNullifierReadRequestHints(oracle, siloedReadRequests, scopedNullifiers, [], maxPending, maxSettled, true);
}
