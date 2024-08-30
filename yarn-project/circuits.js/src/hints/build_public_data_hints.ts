import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Tuple } from '@aztec/foundation/serialize';

import {
  MAX_PUBLIC_DATA_HINTS,
  type MAX_PUBLIC_DATA_READS_PER_TX,
  type MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  type PUBLIC_DATA_TREE_HEIGHT,
} from '../constants.gen.js';
import {
  type PublicDataRead,
  type PublicDataTreeLeafPreimage,
  type PublicDataUpdateRequest,
} from '../structs/index.js';
import { type MembershipWitness } from '../structs/membership_witness.js';
import { PublicDataHint } from '../structs/public_data_hint.js';

interface PublicDataMembershipWitnessWithPreimage {
  membershipWitness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>;
  leafPreimage: PublicDataTreeLeafPreimage;
}

type PublicDataMembershipWitnessOracle = {
  getMatchOrLowPublicDataMembershipWitness(leafSlot: bigint): Promise<PublicDataMembershipWitnessWithPreimage>;
};

export async function buildPublicDataHints(
  oracle: PublicDataMembershipWitnessOracle,
  publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
  publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
): Promise<Tuple<PublicDataHint, typeof MAX_PUBLIC_DATA_HINTS>> {
  const slotCounterMap = new Map<bigint, number>();
  publicDataReads
    .filter(r => !r.isEmpty())
    .forEach(r => {
      if (!r.isEmpty()) {
        slotCounterMap.set(r.leafSlot.toBigInt(), 0);
      }
    });
  publicDataUpdateRequests
    .filter(w => !w.isEmpty())
    .forEach(w => {
      if (!w.isEmpty()) {
        let overrideCounter = slotCounterMap.get(w.leafSlot.toBigInt()) || 0;
        if (!overrideCounter || overrideCounter > w.counter) {
          overrideCounter = w.counter;
        }
        slotCounterMap.set(w.leafSlot.toBigInt(), overrideCounter);
      }
    });
  const uniquePublicDataLeafSlots = [...slotCounterMap.keys()];

  const hints = await Promise.all(
    uniquePublicDataLeafSlots.map(slot => buildPublicDataHint(oracle, slot, slotCounterMap.get(slot)!)),
  );
  return padArrayEnd(hints, PublicDataHint.empty(), MAX_PUBLIC_DATA_HINTS);
}

export async function buildPublicDataHint(
  oracle: PublicDataMembershipWitnessOracle,
  leafSlot: bigint,
  overrideCounter: number,
) {
  const { membershipWitness, leafPreimage } = await oracle.getMatchOrLowPublicDataMembershipWitness(leafSlot);
  const exists = leafPreimage.slot.toBigInt() === leafSlot;
  const value = exists ? leafPreimage.value : Fr.ZERO;
  return new PublicDataHint(new Fr(leafSlot), value, overrideCounter, membershipWitness, leafPreimage);
}
