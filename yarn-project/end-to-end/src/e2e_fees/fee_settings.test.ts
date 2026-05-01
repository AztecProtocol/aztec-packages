import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PER_GAS } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { inspect } from 'util';

import { DEFAULT_MIN_FEE_PADDING } from '../fixtures/fixtures.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees fee settings', () => {
  let aztecNode: AztecNode;
  let cheatCodes: CheatCodes;
  let aliceAddress: AztecAddress;
  let wallet: TestWallet;
  let gasSettings: Partial<GasSettings>;
  let testContract: TestContract;
  let testContractDeployBlock: BlockNumber;
  const t = new FeesTest('fee_juice', 1);

  beforeAll(async () => {
    await t.setup();
    ({ aliceAddress, wallet, gasSettings, cheatCodes, aztecNode } = t);

    const deployedTestContract = await TestContract.deploy(wallet).send({
      from: aliceAddress,
    });
    testContract = deployedTestContract.contract;
    testContractDeployBlock = deployedTestContract.receipt.blockNumber!;
    gasSettings = { ...gasSettings, maxFeesPerGas: undefined };
  });

  afterAll(async () => {
    await t.teardown();
  });

  describe('setting max fee per gas', () => {
    const bumpL2Fees = async () => {
      const before = await aztecNode.getCurrentMinFees();
      t.logger.info(`Initial L2 min fees are ${inspect(before)}`, { minFees: before.toInspect() });
      await cheatCodes.rollup.bumpProvingCostPerMana(current => (current * 120n) / 100n);
      return await retryUntil(
        async () => {
          const after = await aztecNode.getCurrentMinFees();
          t.logger.info(`L2 min fees are now ${inspect(after)}`, {
            minFeesBefore: before.toInspect(),
            minFeesAfter: after.toInspect(),
          });
          return after.feePerL2Gas > before.feePerL2Gas ? after : undefined;
        },
        'L2 min fee increase',
        5,
        1,
      );
    };

    // Pick a baseline from the post-checkpoint chain state. The prove step itself is
    // made deterministic by prepareTxsWithMockedMinFees below.
    const getCurrentMinFeesAfterCheckpoint = async (checkpointedBlock: BlockNumber) => {
      return await retryUntil(
        async () => {
          const currentCheckpointedBlock = await aztecNode.getBlockNumber('checkpointed');
          if (currentCheckpointedBlock < checkpointedBlock) {
            return undefined;
          }

          return await aztecNode.getCurrentMinFees();
        },
        `L2 min fees after block ${checkpointedBlock} is checkpointed`,
        60,
        1,
      );
    };

    const proveTx = async (minFeePadding: number | undefined) => {
      t.logger.info(`Preparing tx to be sent with min fee padding ${minFeePadding}`);
      wallet.setMinFeePadding(minFeePadding);
      const tx = await proveInteraction(wallet, testContract.methods.emit_nullifier_public(Fr.random()), {
        from: aliceAddress,
        fee: { gasSettings },
      });
      const { maxFeesPerGas } = tx.data.constants.txContext.gasSettings;
      t.logger.info(`Tx with hash ${tx.txHash.toString()} ready with max fees ${inspect(maxFeesPerGas)}`);
      return tx;
    };

    const prepareTxsWithMockedMinFees = async (noPaddingMinFees: GasFees, defaultPaddingMinFees: GasFees) => {
      // Mock getPredictedMinFees (used by the wallet) and getCurrentMinFees (used by bumpL2Fees and other callers).
      const getPredictedMinFeesSpy = jest
        .spyOn(aztecNode, 'getPredictedMinFees')
        .mockResolvedValueOnce([noPaddingMinFees])
        .mockResolvedValueOnce([defaultPaddingMinFees]);
      const getCurrentMinFeesSpy = jest
        .spyOn(aztecNode, 'getCurrentMinFees')
        .mockResolvedValueOnce(noPaddingMinFees)
        .mockResolvedValueOnce(defaultPaddingMinFees);

      try {
        const txWithNoPadding = await proveTx(0);
        const txWithDefaultPadding = await proveTx(undefined);
        return { txWithNoPadding, txWithDefaultPadding };
      } finally {
        getPredictedMinFeesSpy.mockRestore();
        getCurrentMinFeesSpy.mockRestore();
      }
    };

    it('handles min fee spikes with default padding', async () => {
      const stableMinFees = await getCurrentMinFeesAfterCheckpoint(testContractDeployBlock);
      const { txWithNoPadding, txWithDefaultPadding } = await prepareTxsWithMockedMinFees(stableMinFees, stableMinFees);

      expect(txWithNoPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(stableMinFees)).toBe(true);
      expect(
        txWithDefaultPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(
          stableMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING),
        ),
      ).toBe(true);

      // Now bump the L2 fees before we actually send them
      const bumpedMinFees = await bumpL2Fees();
      expect(stableMinFees.feePerL2Gas).toBeLessThan(bumpedMinFees.feePerL2Gas);
      expect(stableMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING).feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);

      // And check that the no-padding does not get mined, but the default padding is good enough
      t.logger.info(`Sending txs`);
      await expect(txWithNoPadding.send()).rejects.toThrow(TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
      await expect(txWithDefaultPadding.send()).resolves.toBeDefined();
    });

    it('reproduces the stale fee snapshot race deterministically', async () => {
      const lowerMinFees = await getCurrentMinFeesAfterCheckpoint(testContractDeployBlock);
      const higherMinFees = lowerMinFees.mul(2);

      const { txWithNoPadding, txWithDefaultPadding } = await prepareTxsWithMockedMinFees(higherMinFees, lowerMinFees);

      expect(txWithNoPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(higherMinFees)).toBe(true);
      expect(
        txWithDefaultPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(
          lowerMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING),
        ),
      ).toBe(true);

      const bumpedMinFees = await bumpL2Fees();
      expect(lowerMinFees.feePerL2Gas).toBeLessThan(bumpedMinFees.feePerL2Gas);
      expect(higherMinFees.feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);
      expect(lowerMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING).feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);

      // This is the original flake: the "no padding" tx only succeeds because it was
      // accidentally prepared against an earlier, higher fee snapshot than the padded tx.
      await expect(txWithNoPadding.send()).resolves.toBeDefined();
      await expect(txWithDefaultPadding.send()).resolves.toBeDefined();
    });
  });
});
