import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Tuple } from '@aztec/foundation/serialize';

import {
  MAX_PUBLIC_DATA_HINTS,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '../constants.gen.js';
import { PublicDataRead, PublicDataTreeLeafPreimage, PublicDataUpdateRequest } from '../structs/index.js';
import { buildPublicDataHints } from './build_public_data_hints.js';

describe('buildPublicDataHints', () => {
  let publicDataReads: Tuple<PublicDataRead, typeof MAX_PUBLIC_DATA_READS_PER_TX>;
  let publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>;

  const publicDataLeaves = [
    new PublicDataTreeLeafPreimage(new Fr(0), new Fr(0), new Fr(11), 2n),
    new PublicDataTreeLeafPreimage(new Fr(22), new Fr(200), new Fr(0), 0n),
    new PublicDataTreeLeafPreimage(new Fr(11), new Fr(100), new Fr(22), 1n),
  ];

  const makePublicDataRead = (leafSlot: number, value: number) =>
    new PublicDataRead(new Fr(leafSlot), new Fr(value), 0);
  const makePublicDataWrite = (leafSlot: number, value: number) =>
    new PublicDataUpdateRequest(new Fr(leafSlot), new Fr(value), 0);

  const oracle = {
    getMatchOrLowPublicDataMembershipWitness: (leafSlot: bigint) => {
      const leafPreimage = publicDataLeaves.find(
        l => l.slot.toBigInt() <= leafSlot && (l.nextSlot.isZero() || l.nextSlot.toBigInt() > leafSlot),
      );
      return { membershipWitness: {}, leafPreimage } as any;
    },
  };

  const buildAndCheckHints = async (expectedSlots: number[]) => {
    const hints = await buildPublicDataHints(oracle, publicDataReads, publicDataUpdateRequests);
    const partialHints = expectedSlots.map(s =>
      expect.objectContaining({
        preimage: publicDataLeaves.find(l => l.slot.equals(new Fr(s))),
      }),
    );
    const emptyPartialHint = expect.objectContaining({ preimage: PublicDataTreeLeafPreimage.empty() });
    expect(hints).toEqual(padArrayEnd(partialHints, emptyPartialHint, MAX_PUBLIC_DATA_HINTS));
  };

  beforeEach(() => {
    publicDataReads = makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, PublicDataRead.empty);
    publicDataUpdateRequests = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest.empty);
  });

  it('returns empty hints', async () => {
    await buildAndCheckHints([]);
  });

  it('builds hints for reads for uninitialized slots', async () => {
    publicDataReads[0] = makePublicDataRead(12, 0);
    publicDataReads[1] = makePublicDataRead(39, 0);
    await buildAndCheckHints([11, 22]);
  });

  it('builds hints for reads for initialized slots', async () => {
    publicDataReads[0] = makePublicDataRead(22, 200);
    publicDataReads[1] = makePublicDataRead(11, 100);
    await buildAndCheckHints([22, 11]);
  });

  it('builds hints for writes to uninitialized slots', async () => {
    publicDataUpdateRequests[0] = makePublicDataWrite(5, 500);
    publicDataUpdateRequests[1] = makePublicDataWrite(17, 700);
    await buildAndCheckHints([0, 11]);
  });

  it('builds hints for writes to initialized slots', async () => {
    publicDataUpdateRequests[0] = makePublicDataWrite(11, 111);
    publicDataUpdateRequests[1] = makePublicDataWrite(22, 222);
    await buildAndCheckHints([11, 22]);
  });

  it('skip hints for repeated reads', async () => {
    publicDataReads[0] = makePublicDataRead(22, 200); // 22
    publicDataReads[1] = makePublicDataRead(39, 0); // 22
    publicDataReads[2] = makePublicDataRead(22, 200); // No hint needed because slot 22 was read.
    publicDataReads[3] = makePublicDataRead(39, 0); // No hint needed because slot 39 was read.
    publicDataReads[4] = makePublicDataRead(12, 0); // 11
    publicDataReads[5] = makePublicDataRead(39, 0); // // No hint needed because slot 39 was read.
    await buildAndCheckHints([22, 22, 11]);
  });

  it('skip hints for repeated writes', async () => {
    publicDataUpdateRequests[0] = makePublicDataWrite(11, 111); // 11
    publicDataUpdateRequests[1] = makePublicDataWrite(5, 500); // 0
    publicDataUpdateRequests[2] = makePublicDataWrite(11, 112); // No hint needed because slot 11 was written.
    publicDataUpdateRequests[3] = makePublicDataWrite(17, 700); // 11
    publicDataUpdateRequests[4] = makePublicDataWrite(11, 113); // No hint needed because slot 11 was written.
    publicDataUpdateRequests[5] = makePublicDataWrite(5, 222); // No hint needed because slot 5 was written.
    publicDataUpdateRequests[6] = makePublicDataWrite(37, 700); // 22
    await buildAndCheckHints([11, 0, 11, 22]);
  });

  it('builds hints for mixed reads and writes', async () => {
    publicDataReads[0] = makePublicDataRead(22, 200); // 22
    publicDataReads[1] = makePublicDataRead(7, 0); // 0
    publicDataReads[2] = makePublicDataRead(41, 0); // 22
    publicDataReads[3] = makePublicDataRead(11, 100); // 11
    publicDataReads[4] = makePublicDataRead(39, 0); // 22
    publicDataUpdateRequests[0] = makePublicDataWrite(11, 111); // No hint needed because slot 11 was read.
    publicDataUpdateRequests[1] = makePublicDataWrite(5, 500); // 0
    publicDataUpdateRequests[2] = makePublicDataWrite(17, 700); // 11
    publicDataUpdateRequests[3] = makePublicDataWrite(22, 222); // No hint needed because slot 22 was read.
    publicDataUpdateRequests[4] = makePublicDataWrite(39, 700); // No hint needed because slot 39 was read.
    await buildAndCheckHints([22, 0, 22, 11, 22, 0, 11]);
  });
});
