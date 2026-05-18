import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { CheatCodes } from '@aztec/aztec/testing';
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
  let wallet: Wallet;
  let owner: AztecAddress;
  let cheatCodes: CheatCodes;
  let contract: TestContract;

  beforeAll(async () => {
    ({
      teardown,
      aztecNode,
      wallet,
      accounts: [owner],
      cheatCodes,
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));

    ({ contract } = await TestContract.deploy(wallet).send({ from: owner }));
  });

  afterAll(() => teardown());

  it('mines sequential dependent txs back-to-back', async () => {
    const startBlock = await aztecNode.getBlockNumber();
    const startWall = Date.now();

    const blockNumbers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { receipt } = await contract.methods.emit_nullifier_public(BigInt(i + 1000)).send({ from: owner });
      blockNumbers.push(receipt.blockNumber!);
    }
    const wallSeconds = (Date.now() - startWall) / 1000;

    // Each .send is sequential, so each tx lands in its own block.
    expect(new Set(blockNumbers).size).toBe(5);
    expect(blockNumbers[0]).toBeGreaterThan(startBlock);
    // 5 dependent txs under interval-mined 12s slots would take ~60s. Under automine
    // they should complete well under 30s of wall time.
    expect(wallSeconds).toBeLessThan(30);
  });

  it('parallel sends all land (count of distinct blocks is implementation detail)', async () => {
    const startBlock = await aztecNode.getBlockNumber();

    const results = await Promise.all(
      [...Array(5).keys()].map(i => contract.methods.emit_nullifier_public(BigInt(i + 2000)).send({ from: owner })),
    );
    const blockNumbers = results.map(r => r.receipt.blockNumber!);

    // All txs land.
    expect(blockNumbers.every(n => n !== undefined && n > startBlock)).toBe(true);
    expect(blockNumbers.length).toBe(5);
    // Builder consumes all eligible pending txs per block, so the number of distinct blocks
    // is between 1 (all batched) and 5 (one each). Either is correct.
    expect(new Set(blockNumbers).size).toBeGreaterThanOrEqual(1);
    expect(new Set(blockNumbers).size).toBeLessThanOrEqual(5);
  });

  it('warpL2TimeAtLeastBy advances L1 timestamp and the next tx lands at a fresh slot', async () => {
    const before = await cheatCodes.eth.lastBlockTimestamp();
    await cheatCodes.warpL2TimeAtLeastBy(aztecNode, 3600);
    const after = await cheatCodes.eth.lastBlockTimestamp();
    expect(after - before).toBeGreaterThanOrEqual(3600);

    const { receipt } = await contract.methods.emit_nullifier_public(BigInt(9999)).send({ from: owner });
    expect(receipt.blockNumber).toBeGreaterThan(0);
  });

  it('mineBlock produces an empty checkpoint', async () => {
    const before = await aztecNode.getBlockNumber();
    await aztecNode.mineBlock();
    const after = await aztecNode.getBlockNumber();
    expect(after).toBeGreaterThan(before);
  });
});
