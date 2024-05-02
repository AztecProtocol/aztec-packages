import { AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type Fr } from '@aztec/foundation/fields';
import { type Tuple } from '@aztec/foundation/serialize';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import {
  type MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  type NULLIFIER_TREE_HEIGHT,
} from '../constants.gen.js';
import { siloNullifier } from '../hash/hash.js';
import {
  type MembershipWitness,
  type Nullifier,
  NullifierContext,
  NullifierReadRequestHintsBuilder,
  ReadRequestContext,
} from '../structs/index.js';
import { countAccumulatedItems, getNonEmptyItems } from '../utils/index.js';

interface NullifierMembershipWitnessWithPreimage {
  membershipWitness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>;
  leafPreimage: IndexedTreeLeafPreimage;
}

export async function buildNullifierReadRequestHints(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: Tuple<ReadRequestContext, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<NullifierContext, typeof MAX_NEW_NULLIFIERS_PER_TX>,
  siloed = false,
) {
  const builder = new NullifierReadRequestHintsBuilder();

  const numReadRequests = countAccumulatedItems(nullifierReadRequests);

  const nullifierMap: Map<bigint, { nullifier: NullifierContext; index: number }[]> = new Map();
  getNonEmptyItems(nullifiers).forEach((nullifier, index) => {
    const value = nullifier.value.toBigInt();
    const arr = nullifierMap.get(value) ?? [];
    arr.push({ nullifier, index });
    nullifierMap.set(value, arr);
  });

  for (let i = 0; i < numReadRequests; ++i) {
    const readRequest = nullifierReadRequests[i];
    const pendingNullifier = nullifierMap
      .get(readRequest.value.toBigInt())
      ?.find(
        ({ nullifier }) =>
          nullifier.contractAddress.equals(readRequest.contractAddress) && readRequest.counter > nullifier.counter,
      );

    if (pendingNullifier !== undefined) {
      builder.addPendingReadRequest(i, pendingNullifier.index);
    } else {
      const siloedValue = siloed ? readRequest.value : siloNullifier(readRequest.contractAddress, readRequest.value);
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

export function buildSiloedNullifierReadRequestHints(
  oracle: {
    getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitnessWithPreimage>;
  },
  nullifierReadRequests: Tuple<ReadRequestContext, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<Nullifier, typeof MAX_NEW_NULLIFIERS_PER_TX>,
) {
  // Nullifiers outputted from public kernels are already siloed while read requests are not.
  // Siloing the read request values and set the contract addresses to zero to find the matching nullifier contexts.
  const siloedReadRequests = padArrayEnd(
    getNonEmptyItems(nullifierReadRequests).map(
      r => new ReadRequestContext(siloNullifier(r.contractAddress, r.value), r.counter, AztecAddress.ZERO),
    ),
    ReadRequestContext.empty(),
    MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  );

  const nullifierContexts = nullifiers.map(
    n => new NullifierContext(n.value, n.counter, n.noteHash, AztecAddress.ZERO),
  ) as Tuple<NullifierContext, typeof MAX_NEW_NULLIFIERS_PER_TX>;

  return buildNullifierReadRequestHints(oracle, siloedReadRequests, nullifierContexts, true);
}
