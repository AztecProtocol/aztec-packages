import { createLogger } from '@aztec/aztec.js/log';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { createAztecNodeDebugClient } from '@aztec/stdlib/interfaces/client';

const { AZTEC_NODE_URL = 'http://localhost:8080', ETHEREUM_HOSTS = 'http://localhost:8545' } = process.env;

// Unlike the non-composed e2e_cheat_codes.test.ts these tests are testing that the AztecNodeDebug endpoints get
// correctly exposed on the node.
// Runs against a pre-started docker-compose network (AZTEC_NODE_URL + ETHEREUM_HOSTS); no in-proc setup().
describe('e2e_cheat_codes', () => {
  const logger = createLogger('e2e:cheat_codes');
  let aztecNode: AztecNode;
  let nodeDebug: AztecNode & AztecNodeDebug;
  let cheatCodes: CheatCodes;

  beforeAll(async () => {
    aztecNode = createAztecNodeClient(AZTEC_NODE_URL);
    await waitForNode(aztecNode, logger);
    nodeDebug = Object.assign({}, aztecNode, createAztecNodeDebugClient(AZTEC_NODE_URL));
    const l1RpcUrls = ETHEREUM_HOSTS.split(',');
    cheatCodes = await CheatCodes.create(l1RpcUrls, aztecNode, new DateProvider());
  });

  it('warpL2TimeAtLeastTo produces a block with at least the target timestamp', async () => {
    // We use L1 timestamp instead of wall clock time because previous test suites may have warped L1 time far ahead of
    // Date.now(), causing the target to appear "in the past" relative to L1. And fundamentally this is the current
    // approach because L1 is the ultimate source of true time in the system.
    const currentL1Timestamp = Number(await cheatCodes.eth.lastBlockTimestamp());
    const targetTimestamp = currentL1Timestamp + 1000;
    await cheatCodes.warpL2TimeAtLeastTo(nodeDebug, targetTimestamp);

    const blockNumber = await aztecNode.getBlockNumber();
    const block = await aztecNode.getBlock(blockNumber);
    expect(block).toBeDefined();
    expect(Number(block!.header.globalVariables.timestamp)).toBeGreaterThanOrEqual(targetTimestamp);
  });

  it('warpL2TimeAtLeastBy advances time by at least the duration', async () => {
    const blockBeforeAdvance = await aztecNode.getBlock(await aztecNode.getBlockNumber());
    const timestampBefore = Number(blockBeforeAdvance!.header.globalVariables.timestamp);

    const advancement = 100;
    await cheatCodes.warpL2TimeAtLeastBy(nodeDebug, advancement);

    const blockNumber = await aztecNode.getBlockNumber();
    const block = await aztecNode.getBlock(blockNumber);
    expect(block).toBeDefined();
    const timestampAfter = Number(block!.header.globalVariables.timestamp);
    expect(timestampAfter).toBeGreaterThanOrEqual(timestampBefore + advancement);
  });

  it('warpL2TimeAtLeastBy with sub-slot duration auto-adjusts to next slot', async () => {
    const blockBefore = await aztecNode.getBlock(await aztecNode.getBlockNumber());
    const timestampBefore = Number(blockBefore!.header.globalVariables.timestamp);

    // Duration of 1 second is less than a slot, but should still produce a block via auto-adjust. warpL2TimeAtLeastBy
    // reads the current L1 time inside the sequencer queue and adds the duration, so the target is always in the
    // future by the time the warp runs — no timestamp race.
    await cheatCodes.warpL2TimeAtLeastBy(nodeDebug, 1);

    const blockNumber = await aztecNode.getBlockNumber();
    const block = await aztecNode.getBlock(blockNumber);
    expect(block).toBeDefined();
    const timestampAfter = Number(block!.header.globalVariables.timestamp);
    expect(timestampAfter).toBeGreaterThan(timestampBefore);
  });

  it('warpL2TimeAtLeastBy with zero duration throws', async () => {
    await expect(cheatCodes.warpL2TimeAtLeastBy(nodeDebug, 0)).rejects.toThrow('duration must be positive');
  });

  it('warpL2TimeAtLeastTo with target in current slot auto-adjusts to next slot', async () => {
    // Target is 1 second ahead of L1 time — still in the current slot, so auto-adjust rounds up to the next slot
    // boundary and builds there. The sequencer can advance L1 (e.g. an auto-settle epoch proof mines an empty L1
    // block) between our `lastBlockTimestamp()` read and the warp running on the queue; if that pushes L1 past the
    // target the warp no-ops rather than throwing, so we assert against whichever clock leads.
    const targetTimestamp = Number(await cheatCodes.eth.lastBlockTimestamp()) + 1;
    await cheatCodes.warpL2TimeAtLeastTo(nodeDebug, targetTimestamp);

    const block = await aztecNode.getBlock(await aztecNode.getBlockNumber());
    expect(block).toBeDefined();
    const l2Timestamp = Number(block!.header.globalVariables.timestamp);
    const l1Timestamp = Number(await cheatCodes.eth.lastBlockTimestamp());
    expect(Math.max(l2Timestamp, l1Timestamp)).toBeGreaterThanOrEqual(targetTimestamp);
  });

  it('warpL2TimeAtLeastTo with past timestamp is a no-op', async () => {
    const blockNumberBefore = await aztecNode.getBlockNumber();
    const pastTimestamp = Number(await cheatCodes.eth.lastBlockTimestamp()) - 1000;

    await expect(cheatCodes.warpL2TimeAtLeastTo(nodeDebug, pastTimestamp)).resolves.toBeUndefined();
    expect(await aztecNode.getBlockNumber()).toBe(blockNumberBefore);
  });
});
