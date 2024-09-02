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
  PublicDataLeafHint,
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

async function buildPublicDataLeafHint(oracle: PublicDataMembershipWitnessOracle, leafSlot: bigint) {
  const { membershipWitness, leafPreimage } = await oracle.getMatchOrLowPublicDataMembershipWitness(leafSlot);
  return new PublicDataLeafHint(leafPreimage, membershipWitness);
}

export async function buildPublicDataHints(
  oracle: PublicDataMembershipWitnessOracle,
  publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
  publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,
): Promise<Tuple<PublicDataLeafHint, typeof MAX_PUBLIC_DATA_HINTS>> {
  const leafSlots = [...publicDataReads.map(r => r.leafSlot), ...publicDataUpdateRequests.map(w => w.leafSlot)]
    .filter(s => !s.isZero())
    .map(s => s.toBigInt());
  const uniqueLeafSlots = [...new Set(leafSlots)];
  const hints = await Promise.all(uniqueLeafSlots.map(slot => buildPublicDataLeafHint(oracle, slot)));
  return padArrayEnd(hints, PublicDataLeafHint.empty(), MAX_PUBLIC_DATA_HINTS);
}

export async function buildPublicDataHint(oracle: PublicDataMembershipWitnessOracle, leafSlot: bigint) {
  const { membershipWitness, leafPreimage } = await oracle.getMatchOrLowPublicDataMembershipWitness(leafSlot);
  const exists = leafPreimage.slot.toBigInt() === leafSlot;
  const value = exists ? leafPreimage.value : Fr.ZERO;
  return new PublicDataHint(new Fr(leafSlot), value, 0, membershipWitness, leafPreimage);
}
