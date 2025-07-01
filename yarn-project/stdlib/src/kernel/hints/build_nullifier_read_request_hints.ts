import {
  type MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  type NULLIFIER_TREE_HEIGHT,
} from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { type IndexedTreeLeafPreimage, MembershipWitness } from '@aztec/foundation/trees';

import { siloNullifier } from '../../hash/hash.js';
import type { ClaimedLengthArray } from '../claimed_length_array.js';
import type { ScopedNullifier } from '../nullifier.js';
import { NullifierReadRequestHintsBuilder } from './nullifier_read_request_hints.js';
import { ScopedReadRequest } from './read_request.js';
import { PendingReadHint, ReadRequestActionEnum, ReadRequestResetActions } from './read_request_hints.js';
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

export function getNullifierReadRequestResetActions(
  nullifierReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
  futureNullifiers: ScopedNullifier[],
): ReadRequestResetActions<typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX> {
  const resetActions = ReadRequestResetActions.empty(MAX_NULLIFIER_READ_REQUESTS_PER_TX);

  const nullifierMap: Map<bigint, { nullifier: ScopedNullifier; index: number }[]> = new Map();
  nullifiers.getActiveItems().forEach((nullifier, index) => {
    const value = nullifier.value.toBigInt();
    const arr = nullifierMap.get(value) ?? [];
    arr.push({ nullifier, index });
    nullifierMap.set(value, arr);
  });

  const futureNullifiersMap = new ScopedValueCache(futureNullifiers);

  for (let i = 0; i < nullifierReadRequests.claimedLength; ++i) {
    const readRequest = nullifierReadRequests.array[i];
    const pendingNullifier = nullifierMap
      .get(readRequest.value.toBigInt())
      ?.find(({ nullifier }) => isValidNullifierReadRequest(readRequest, nullifier));

    if (pendingNullifier !== undefined) {
      resetActions.actions[i] = ReadRequestActionEnum.READ_AS_PENDING;
      resetActions.pendingReadHints.push(new PendingReadHint(i, pendingNullifier.index));
    } else if (
      !futureNullifiersMap
        .get(readRequest)
        .some(futureNullifier => isValidNullifierReadRequest(readRequest, futureNullifier))
    ) {
      resetActions.actions[i] = ReadRequestActionEnum.READ_AS_SETTLED;
    }
  }

  return resetActions;
}

export async function buildNullifierReadRequestHintsFromResetActions<PENDING extends number, SETTLED extends number>(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  resetActions: ReadRequestResetActions<typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  maxPending: PENDING = MAX_NULLIFIER_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NULLIFIER_READ_REQUESTS_PER_TX as SETTLED,
  siloed = false,
) {
  const builder = new NullifierReadRequestHintsBuilder(maxPending, maxSettled);

  resetActions.pendingReadHints.forEach(hint => {
    builder.addPendingReadRequest(hint.readRequestIndex, hint.pendingValueIndex);
  });

  for (let i = 0; i < resetActions.actions.length; i++) {
    if (resetActions.actions[i] === ReadRequestActionEnum.READ_AS_SETTLED) {
      const readRequest = nullifierReadRequests.array[i];
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
  nullifierReadRequests: ClaimedLengthArray<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
  futureNullifiers: ScopedNullifier[],
  maxPending: PENDING = MAX_NULLIFIER_READ_REQUESTS_PER_TX as PENDING,
  maxSettled: SETTLED = MAX_NULLIFIER_READ_REQUESTS_PER_TX as SETTLED,
  siloed = false,
) {
  const resetActions = getNullifierReadRequestResetActions(nullifierReadRequests, nullifiers, futureNullifiers);
  return await buildNullifierReadRequestHintsFromResetActions(
    oracle,
    nullifierReadRequests,
    resetActions,
    maxPending,
    maxSettled,
    siloed,
  );
}
