import type { AztecNode } from '@aztec/aztec.js/node';
import { BlockNumber } from '@aztec/foundation/branded-types';

import { jest } from '@jest/globals';
import 'jest-extended';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { setup } from '../../fixtures/utils.js';

// Exercises the node block-data query API against block 0 (the genesis block). Checks that
// getBlockData returns a valid header, that getBlock by hash and by number round-trips correctly,
// and that block 0 contains no txEffects. Uses PIPELINING_SETUP_OPTS (prod sequencer,
// ethSlot=4s, aztecSlot=12s, minTxsPerBlock=0).
describe('single-node/misc/node_block_api', () => {
  jest.setTimeout(5 * 60 * 1000);

  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, aztecNode } = await setup(0, {
      ...PIPELINING_SETUP_OPTS,
    }));
  });

  afterAll(() => teardown());

  // Fetches block 0 by number and by hash; asserts the returned blocks match and contain no txEffects.
  it('returns initial block data', async () => {
    const initialHeader = (await aztecNode.getBlockData(BlockNumber.ZERO))?.header;
    expect(initialHeader).toBeDefined();
    const initialHeaderHash = await initialHeader!.hash();
    const initialBlockByHash = await aztecNode.getBlock(initialHeaderHash, { includeTransactions: true });
    expect(initialBlockByHash).toBeDefined();
    expect(initialBlockByHash!.hash.equals(initialHeaderHash)).toBeTrue();
    expect(initialBlockByHash!.body.txEffects.length).toBe(0);
    const initialBlockByNumber = await aztecNode.getBlock(BlockNumber.ZERO, { includeTransactions: true });
    expect(initialBlockByNumber).toBeDefined();
    expect(initialBlockByNumber!.hash.equals(initialHeaderHash)).toBeTrue();
    expect(initialBlockByNumber!.body.txEffects.length).toBe(0);
  });
});
