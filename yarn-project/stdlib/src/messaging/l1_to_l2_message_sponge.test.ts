import { Fr } from '@aztec/foundation/curves/bn254';

import type { InboxMessageBundle } from './inbox_message_bundle.js';
import { L1ToL2MessageSponge, accumulateL1ToL2MessageSponge } from './l1_to_l2_message_sponge.js';

describe('L1ToL2MessageSponge', () => {
  const leaves = [new Fr(11), new Fr(22), new Fr(33), new Fr(44), new Fr(55)];

  const absorbed = async (bundle: InboxMessageBundle) => (await accumulateL1ToL2MessageSponge(bundle)).toBuffer();

  it('counts absorbed leaves', async () => {
    const sponge = L1ToL2MessageSponge.empty();
    await sponge.absorb(leaves.slice(0, 3), [true, false, false]);
    expect(sponge.numAbsorbed).toBe(3);
    await sponge.absorb(leaves.slice(3), [true, false]);
    expect(sponge.numAbsorbed).toBe(5);
  });

  it('rejects flags that are not aligned with the leaves', async () => {
    const sponge = L1ToL2MessageSponge.empty();
    await expect(sponge.absorb(leaves, [true, false])).rejects.toThrow('bucket-start flags');
  });

  it('reaches the same state when a bundle is split at a bucket boundary', async () => {
    const whole: InboxMessageBundle = [leaves.slice(0, 3), leaves.slice(3)];

    const threaded = L1ToL2MessageSponge.empty();
    await threaded.absorb(leaves.slice(0, 3), [true, false, false]);
    await threaded.absorb(leaves.slice(3), [true, false]);

    expect(threaded.toBuffer()).toEqual(await absorbed(whole));
  });

  it('diverges when a bundle is split inside a bucket', async () => {
    // One bucket over all five leaves, but consumed as 3 + 2: the second chunk can only claim a boundary the
    // checkpoint's own flags do not have.
    const whole: InboxMessageBundle = [leaves];

    const threaded = L1ToL2MessageSponge.empty();
    await threaded.absorb(leaves.slice(0, 3), [true, false, false]);
    await threaded.absorb(leaves.slice(3), [true, false]);

    expect(threaded.toBuffer()).not.toEqual(await absorbed(whole));
  });

  it('commits to the bucket grouping, not just the leaf order', async () => {
    const oneBucket = await absorbed([leaves]);
    const twoBuckets = await absorbed([leaves.slice(0, 2), leaves.slice(2)]);

    expect(oneBucket).not.toEqual(twoBuckets);
  });

  it('absorbs nothing for an empty bundle', async () => {
    expect(await absorbed([])).toEqual(L1ToL2MessageSponge.empty().toBuffer());
  });

  it('absorbs one field per leaf with the flag packed above it', async () => {
    // The accumulated state must be the plain sponge over `leaf + flag * 2^248` per leaf.
    const bundle: InboxMessageBundle = [leaves.slice(0, 2), leaves.slice(2, 3)];
    const flagged = (leaf: Fr) => new Fr(leaf.toBigInt() + (1n << 248n));

    const expected = L1ToL2MessageSponge.empty();
    await expected.sponge.absorb([flagged(leaves[0]), leaves[1], flagged(leaves[2])]);
    expected.numAbsorbed = 3;

    expect(await absorbed(bundle)).toEqual(expected.toBuffer());
  });

  it('rejects a leaf that does not fit under the flag', async () => {
    // A leaf at or above the flag's weight could impersonate a flagged smaller leaf, so the packing refuses it.
    const sponge = L1ToL2MessageSponge.empty();
    await expect(sponge.absorb([new Fr(1n << 248n)], [false])).rejects.toThrow('does not fit in 248 bits');
  });
});
