import { Fr } from '@aztec/foundation/fields';
import { makeBlockProposal, makeHeader } from '@aztec/stdlib/testing';

import { InMemoryBlockProposalPool } from './memory_block_proposal_pool.js';

describe('InMemoryBlockProposalPool', () => {
  let pool: InMemoryBlockProposalPool;

  const makeBlockProposalWithHash = (seed = 1) => {
    const blockProposal = makeBlockProposal({ header: makeHeader(seed) });
    const hash = blockProposal.payload.header.hash();
    return { blockProposal, hash };
  };

  it('throws if created with invalid pool size', () => {
    expect(() => new InMemoryBlockProposalPool(0)).toThrow();
    expect(() => new InMemoryBlockProposalPool(-1)).toThrow();
  });

  it('adds a block proposal successfully', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const { blockProposal } = makeBlockProposalWithHash();
    expect(await pool.addBLockProposal(blockProposal)).toBe(true);
    expect(await pool.size()).toBe(1);
  });

  it('fails to add a block proposal that is already in the pool', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const { blockProposal } = makeBlockProposalWithHash();
    await pool.addBLockProposal(blockProposal);
    // should fail
    expect(await pool.addBLockProposal(blockProposal)).toBe(false);
    expect(await pool.size()).toBe(1);
  });

  it('adds a duplicate block proposal after it has exited the pool', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const { blockProposal, hash } = makeBlockProposalWithHash();

    expect(await pool.addBLockProposal(blockProposal)).toBe(true);

    // Can't add the block proposal again
    expect(await pool.addBLockProposal(blockProposal)).toBe(false);

    // add 9 more block proposals
    for (let i = 1; i <= 9; i++) {
      expect(await pool.addBLockProposal(makeBlockProposal({ header: makeHeader(i + 1) }))).toBe(true);
    }

    // Still can't add the block proposal
    expect(await pool.addBLockProposal(blockProposal)).toBe(false);
    expect(await pool.hasBlockProposal(hash)).toBe(true);

    // Now add one more
    expect(await pool.addBLockProposal(makeBlockProposal({ header: makeHeader((await pool.size()) + 1) }))).toBe(true);

    // now we should be able to add the first block proposal again
    expect(await pool.addBLockProposal(blockProposal)).toBe(true);
  });

  it('can take many more block proposals than the pool size', async () => {
    pool = new InMemoryBlockProposalPool(10);

    // add 1000 block proposals
    for (let i = 0; i < 1000; i++) {
      expect(await pool.size()).toBeLessThanOrEqual(10);
      // should always be able to add a block proposal,
      expect(await pool.addBLockProposal(makeBlockProposal({ header: makeHeader(i + 1) }))).toBe(true);
    }
  });

  it('hasBlockProposal returns true for existing proposals', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const { blockProposal, hash } = makeBlockProposalWithHash();

    expect(await pool.hasBlockProposal(hash)).toBe(false);
    await pool.addBLockProposal(blockProposal);
    expect(await pool.hasBlockProposal(hash)).toBe(true);
  });

  it('getBlockProposal returns proposal if it exists', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const { blockProposal, hash } = makeBlockProposalWithHash();

    expect(await pool.getBlockProposal(hash)).toBeUndefined();
    await pool.addBLockProposal(blockProposal);

    const retrieved = await pool.getBlockProposal(hash);
    expect(retrieved).toBeDefined();
    expect(retrieved).toEqual(blockProposal);
  });

  it('getBlockProposal returns undefined for non-existent proposal', async () => {
    pool = new InMemoryBlockProposalPool(10);
    const randomHash = Fr.random();

    expect(await pool.getBlockProposal(randomHash)).toBeUndefined();
  });

  it('removes oldest block proposal when pool is full', async () => {
    pool = new InMemoryBlockProposalPool(3);
    const proposals = [];

    // Add 3 proposals
    for (let i = 0; i < 3; i++) {
      const { blockProposal, hash } = makeBlockProposalWithHash(i + 1);
      proposals.push({ blockProposal, hash });
      await pool.addBLockProposal(blockProposal);
    }

    // All 3 should be in the pool
    for (const { hash } of proposals) {
      expect(await pool.hasBlockProposal(hash)).toBe(true);
    }

    // Add a 4th proposal
    const { blockProposal: newProposal } = makeBlockProposalWithHash((await pool.size()) + 1);
    await pool.addBLockProposal(newProposal);

    // First proposal should be removed
    expect(await pool.hasBlockProposal(proposals[0].hash)).toBe(false);
    expect(await pool.hasBlockProposal(proposals[1].hash)).toBe(true);
    expect(await pool.hasBlockProposal(proposals[2].hash)).toBe(true);
  });
});
