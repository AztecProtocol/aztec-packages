import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { retryUntil } from '@aztec/foundation/retry';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';

import { jest } from '@jest/globals';

import { FAST_E2E_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

/**
 * Smoke test for `FAST_E2E_SETUP_OPTS`. This is the canary for the AnvilTestWatcher-removal
 * work in PR #23340: if the watcher is reintroduced or the timetable normalization regresses,
 * this test is the first thing that fails.
 *
 * The config gives us:
 *   - aztecSlotDuration = 12s, ethereumSlotDuration = 4s, aztecEpochDuration = 4 slots
 *   - one block per slot (blockDurationMs unset → single-block mode in the timetable)
 *   - pipelining on (build slot N-1, commit to slot N)
 *   - EpochTestSettler wired (testOnlyAutoProveAfterPublish = true), advancing proven once
 *     per completed epoch (48s wall time)
 *   - no AnvilTestWatcher running for the anvil-backed run
 *
 * The test exercises three invariants:
 *   1. The chain advances on its own under interval mining + pipelining.
 *   2. 20 sequential dependent txs land in distinct blocks (single-block mode keeps batching off).
 *   3. The proven tip advances after an epoch completes (EpochTestSettler works).
 */
describe('e2e_fast_config', () => {
  jest.setTimeout(15 * 60 * 1000);

  let wallet: Wallet;
  let ownerAddress: AztecAddress;
  let teardown: () => Promise<void>;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [ownerAddress],
      aztecNode,
    } = await setup(1, { ...FAST_E2E_SETUP_OPTS }));
  });

  afterAll(() => teardown());

  it(
    'mines 20 sequential txs across at least 12 distinct blocks',
    async () => {
      const { contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });
      const blockNumbers = new Set<number>();

      for (let i = 0; i < 20; i++) {
        const { receipt } = await contract.methods.increment_public_value(ownerAddress, i).send({ from: ownerAddress });
        expect(receipt.blockNumber).toBeDefined();
        blockNumbers.add(receipt.blockNumber!);
      }

      // Sequential `.send()` waits for each tx to mine; single-block-per-slot mode means
      // every tx is its own block. Empty checkpoints between txs only increase chain height,
      // never collapse it. Fewer than 12 distinct blocks would mean batching of dependent
      // txs, which would be a cadence regression.
      expect(blockNumbers.size).toBeGreaterThanOrEqual(12);
    },
    10 * 60 * 1000,
  );

  it(
    'proven tip advances within two epochs of publish',
    async () => {
      const { contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });
      const { receipt } = await contract.methods.increment_public_value(ownerAddress, 0).send({ from: ownerAddress });
      expect(receipt.blockNumber).toBeDefined();
      const provenTarget = receipt.blockNumber!;

      // EpochTestSettler advances proven once per completed epoch. With aztecEpochDuration=4
      // and aztecSlotDuration=12, an epoch is 48s; allow two epochs of slack for the in-flight
      // checkpoint to settle into the next one.
      await retryUntil(
        async () => (await aztecNode.getBlockNumber('proven')) >= provenTarget,
        `proven tip reaches block ${provenTarget}`,
        /* timeoutSecs= */ 150,
        /* intervalSecs= */ 1,
      );
    },
    3 * 60 * 1000,
  );
});
