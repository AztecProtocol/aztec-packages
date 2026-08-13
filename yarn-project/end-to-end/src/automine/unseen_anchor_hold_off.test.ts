import type { Archiver } from '@aztec/archiver';
import { type AztecNodeService, createAztecNodeService } from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { MerkleTreeId } from '@aztec/aztec.js/trees';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { AutomineTestContext } from './automine_test_context.js';

// A node behind a load balancer can receive queries anchored on a block another node has served but this one has
// not synced yet. Instead of failing them, the node briefly holds a query whose anchor is one block past its tip
// (or an unknown block hash) until the block arrives. This test models the skew directly: the automine node mines
// and publishes blocks, while a follower node syncs from the same L1 only when the test triggers its archiver, so
// a query anchored on a freshly mined block hangs until the test forces the sync.
describe('automine/unseen_anchor_hold_off', () => {
  jest.setTimeout(5 * 60 * 1000);

  // Effectively-infinite wait budgets so a held query cannot time out under CI load: the test settles it by
  // triggering the follower sync, never by exhausting the budget.
  const HOLD_OFF_BUDGET_MS = 10 * 60 * 1000;
  // How long a query must stay pending before we accept it is being held rather than failed.
  const PENDING_CHECK_MS = 2_000;
  // The follower archiver never polls on its own within the test's lifetime; it syncs only via syncImmediate.
  const FOLLOWER_POLL_INTERVAL_MS = 60 * 60 * 1000;

  let test: AutomineTestContext;
  let logger: Logger;
  let node: AztecNode & AztecNodeDebug;
  let follower: AztecNodeService;

  beforeAll(async () => {
    test = await AutomineTestContext.setup({ numberOfAccounts: 0 });
    ({ logger, aztecNode: node } = test);

    logger.info(`Creating follower node with manually triggered sync`);
    follower = await createAztecNodeService(
      {
        ...test.context.config,
        disableValidator: true,
        validatorPrivateKeys: undefined,
        sequencerPublisherPrivateKeys: [],
        p2pEnabled: false,
        dataDirectory: undefined,
        archiverPollingIntervalMS: FOLLOWER_POLL_INTERVAL_MS,
        rpcUnseenBlockByNumberWaitMs: HOLD_OFF_BUDGET_MS,
        rpcUnseenBlockByHashWaitMs: HOLD_OFF_BUDGET_MS,
      },
      { dateProvider: test.context.dateProvider },
      { genesis: test.context.genesis },
    );

    await syncFollower();
    expect(await follower.getBlockNumber()).toBe(await node.getBlockNumber());
    logger.info(`Follower synced to block ${await follower.getBlockNumber()}`);
  });

  afterAll(async () => {
    await follower?.stop();
    await test?.teardown();
  });

  /** Runs one follower archiver sync iteration, the only way the follower learns of new blocks in this test. */
  const syncFollower = () => (follower.getBlockSource() as Archiver).syncImmediate();

  /** Asserts `promise` is still pending (not resolved and not rejected) after `ms` of real time. */
  const expectStillPendingAfter = async (promise: Promise<unknown>, ms: number) => {
    const outcome = await Promise.race([promise.then(() => 'settled'), sleep(ms).then(() => 'pending')]);
    expect(outcome).toBe('pending');
  };

  it('holds a world-state query anchored one block past the tip until the block arrives', async () => {
    const followerTip = await follower.getBlockNumber();
    await node.mineBlock();
    const mined = (await node.getBlock(await node.getBlockNumber()))!;
    expect(mined.number).toBe(followerTip + 1);

    // The mined block's own hash is an archive-tree leaf at that block's state, so the query can only be answered
    // once the follower holds the block it is anchored on.
    const query = follower.findLeavesIndexes({ number: mined.number }, MerkleTreeId.ARCHIVE, [mined.hash.toFr()]);
    await expectStillPendingAfter(query, PENDING_CHECK_MS);
    expect(await follower.getBlockNumber()).toBe(followerTip);

    await syncFollower();
    const [leaf] = await query;
    expect(leaf).toBeDefined();
    expect(leaf!.l2BlockNumber).toBe(mined.number);
    expect(leaf!.l2BlockHash.toString()).toBe(mined.hash.toString());
  });

  it('holds a block query anchored on an unseen block hash until the block arrives', async () => {
    await node.mineBlock();
    const mined = (await node.getBlock(await node.getBlockNumber()))!;
    expect(mined.number).toBe((await follower.getBlockNumber()) + 1);

    const query = follower.getBlock({ hash: mined.hash });
    await expectStillPendingAfter(query, PENDING_CHECK_MS);

    await syncFollower();
    const block = await query;
    expect(block).toBeDefined();
    expect(block!.number).toBe(mined.number);
    expect(block!.hash.toString()).toBe(mined.hash.toString());
  });

  it('fails fast on a query anchored more than one block past the tip', async () => {
    const followerTip = await follower.getBlockNumber();
    await node.mineBlock();
    await node.mineBlock();
    const nodeTip = await node.getBlockNumber();
    expect(nodeTip).toBe(followerTip + 2);

    // Two blocks ahead is not the one-block load-balancer skew the hold-off absorbs, so the query must fail
    // without consuming the wait budget. The elapsed bound is far above the fail-fast path but far below the
    // budget, so it distinguishes the two without being sensitive to CI load.
    const timer = new Timer();
    await expect(follower.findLeavesIndexes({ number: nodeTip }, MerkleTreeId.ARCHIVE, [Fr.ZERO])).rejects.toThrow(
      /not found/i,
    );
    expect(timer.ms()).toBeLessThan(HOLD_OFF_BUDGET_MS / 10);

    await syncFollower();
    expect(await follower.getBlockNumber()).toBe(nodeTip);
  });
});
