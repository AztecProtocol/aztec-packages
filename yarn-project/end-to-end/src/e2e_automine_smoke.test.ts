import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { CheatCodes } from '@aztec/aztec/testing';
import { range } from '@aztec/foundation/array';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

describe('e2e_automine_smoke', () => {
  jest.setTimeout(10 * 60 * 1000);

  let teardown: () => Promise<void>;
  let aztecNode: AztecNode & AztecNodeDebug;
  let aztecNodeService: AztecNodeService;
  let wallet: Wallet;
  let owner: AztecAddress;
  let cheatCodes: CheatCodes;
  let contract: TestContract;

  beforeAll(async () => {
    ({
      teardown,
      aztecNode,
      aztecNodeService,
      wallet,
      accounts: [owner],
      cheatCodes,
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));

    ({ contract } = await TestContract.deploy(wallet).send({ from: owner }));
  });

  afterAll(() => teardown());

  it('mines sequential dependent txs back-to-back', async () => {
    const startBlock = await aztecNode.getBlockNumber();
    const blockNumbers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { receipt } = await contract.methods.emit_nullifier_public(BigInt(i + 1000)).send({ from: owner });
      blockNumbers.push(receipt.blockNumber!);
    }

    // Each .send is sequential, so each tx lands in its own block.
    expect(blockNumbers[0]).toBeGreaterThan(startBlock);
    expect(blockNumbers).toEqual(range(5, startBlock + 1));
  });

  it('parallel sends all land', async () => {
    const startBlock = await aztecNode.getBlockNumber();

    const results = await Promise.all(
      [...Array(5).keys()].map(i => contract.methods.emit_nullifier_public(BigInt(i + 2000)).send({ from: owner })),
    );

    for (const r of results) {
      expect(r.receipt.blockNumber).toBeGreaterThan(startBlock);
    }
  });

  it('warp advances L1 timestamp and the next tx lands at a fresh slot', async () => {
    const before = await cheatCodes.eth.lastBlockTimestamp();
    const warpBy = 24;
    await cheatCodes.warpL2TimeAtLeastBy(aztecNode, warpBy);
    const after = await cheatCodes.eth.lastBlockTimestamp();
    expect(after - before).toBeGreaterThanOrEqual(warpBy);

    const { receipt } = await contract.methods.emit_nullifier_public(BigInt(9999)).send({ from: owner });
    expect(receipt.blockNumber).toBeGreaterThan(0);
  });

  it('prove advances the proven tip and clamps', async () => {
    // Land a tx so there is a checkpointed checkpoint beyond the current proven tip to prove.
    await contract.methods.emit_nullifier_public(BigInt(8000)).send({ from: owner });
    const checkpointed = (await aztecNode.getChainTips()).checkpointed.checkpoint.number;
    expect(checkpointed).toBeGreaterThan(0);

    // No-arg proves up to the latest checkpointed checkpoint and returns it.
    expect(await aztecNode.prove()).toBe(checkpointed);

    // The proven tip the archiver observes catches up after the synthetic settlement.
    await retryUntil(
      async () => (await aztecNode.getChainTips()).proven.checkpoint.number >= checkpointed,
      'proven tip advanced',
      30,
      0.5,
    );

    // A target beyond the checkpointed tip clamps; re-proving is an idempotent no-op.
    expect(await aztecNode.prove(CheckpointNumber(checkpointed + 100))).toBe(checkpointed);
  });

  it('mineBlock produces an empty checkpoint', async () => {
    const before = await aztecNode.getChainTips();
    await aztecNode.mineBlock();
    const after = await aztecNode.getChainTips();
    expect(after.checkpointed.checkpoint.number).toBeGreaterThan(before.checkpointed.checkpoint.number);
    expect(after.checkpointed.block.number).toBeGreaterThan(before.checkpointed.block.number);
  });

  it('revertToCheckpoint rolls back L1+L2 state', async () => {
    // Land a tx and record the checkpoint it landed at.
    await contract.methods.emit_nullifier_public(BigInt(5000)).send({ from: owner });
    const checkpointBefore = (await aztecNode.getChainTips()).checkpointed.checkpoint.number;

    // Land another tx so we advance to a later checkpoint.
    await contract.methods.emit_nullifier_public(BigInt(5001)).send({ from: owner });
    const checkpointAfter = (await aztecNode.getChainTips()).checkpointed.checkpoint.number;
    expect(checkpointAfter).toBeGreaterThan(checkpointBefore);

    // Revert to the first checkpoint.
    const automine = aztecNodeService.getAutomineSequencer()!;
    await automine.revertToCheckpoint(checkpointBefore);

    // Archiver tip should be back at checkpointBefore.
    const checkpointReverted = (await aztecNode.getChainTips()).checkpointed.checkpoint.number;
    expect(checkpointReverted).toBe(checkpointBefore);

    // After reverting, a new tx should land cleanly.
    const { receipt: r3 } = await contract.methods.emit_nullifier_public(BigInt(5002)).send({ from: owner });
    expect(r3.blockNumber).toBeGreaterThan(0);
  });

  it('interleaved txs and warps all land successfully', async () => {
    const startBlock = await aztecNode.getBlockNumber();
    const startL1Ts = await cheatCodes.eth.lastBlockTimestamp();

    // Fire off N sends without awaiting; intermix warps between them.
    const pending: Array<Promise<{ receipt: { blockNumber?: number } }>> = [];
    const NUM_TXS = 6;
    for (let i = 0; i < NUM_TXS; i++) {
      pending.push(contract.methods.emit_nullifier_public(BigInt(i + 7000)).send({ from: owner }));
      // Warp between every couple of sends without awaiting the sends.
      if (i % 2 === 1) {
        await cheatCodes.warpL2TimeAtLeastBy(aztecNode, 24); // 2 slots
      }
    }

    // All txs must eventually land.
    const results = await Promise.all(pending);
    for (const r of results) {
      expect(r.receipt.blockNumber).toBeGreaterThan(startBlock);
    }

    // L1 should have advanced by at least the warps we issued.
    const endL1Ts = await cheatCodes.eth.lastBlockTimestamp();
    expect(endL1Ts - startL1Ts).toBeGreaterThanOrEqual(24 * Math.floor(NUM_TXS / 2));

    // All NUM_TXS receipts must have valid block numbers above startBlock.
    const blockNumbers = results.map(r => r.receipt.blockNumber!);
    expect(blockNumbers.every(n => n > startBlock)).toBe(true);
  });
});
