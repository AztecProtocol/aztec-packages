import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PER_GAS } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { inspect } from 'util';

import { DEFAULT_MIN_FEE_PADDING } from '../../fixtures/fixtures.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { FeesTest } from './fees_test.js';

// Fee oracle and wallet fee-padding behaviour under L1 base-fee spikes and governance fee-config bumps.
// Uses FeesTest with a custom timing preset (ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0,
// aztecProofSubmissionEpochs=640, manaTarget=4M, walletMinFeePadding=30) and fake in-proc prover node.
// No token bridging involved — all L1 interaction is L1 base-fee cheat codes and Rollup oracle calls.
// (Category: single-node despite using FeesTest, since no cross-chain token transfer or fee-juice
// portal bridging occurs in any test body — L1 is active only for oracle updates.)
describe('single-node/fees/fee_settings', () => {
  let aztecNode: AztecNode;
  let cheatCodes: CheatCodes;
  let aliceAddress: AztecAddress;
  let wallet: TestWallet;
  let gasSettings: Partial<GasSettings>;
  let testContract: TestContract;
  let testContractDeployBlock: BlockNumber;

  // Run under proposer pipelining. `manaTarget` is set just above the largest setup tx
  // (account deploy ~6.5M mana, so manaLimit = 2 * manaTarget = 8M covers it). `walletMinFeePadding: 30`
  // matches PR #23150's pipelining-aware default — under pipelining the proposer's fee evolves up to ~20x
  // between PXE snapshot and inclusion for setup txs, so the 5x default is no longer sufficient.
  // (Test-body txs explicitly call `wallet.setMinFeePadding(...)` so they don't use the wallet default.)
  const AZTEC_SLOT_DURATION = 12;
  const t = new FeesTest('fee_juice', 1, {
    inboxLag: 2,
    minTxsPerBlock: 0,
    aztecSlotDuration: AZTEC_SLOT_DURATION,
    ethereumSlotDuration: 4,
    aztecProofSubmissionEpochs: 640,
    walletMinFeePadding: 30,
    manaTarget: 4_000_000n,
  });

  // FeesTest.setup chains many dependent txs which run at the pipelined cadence (one per L2 slot);
  // the default 300s jest hook timeout is not enough.
  jest.setTimeout(600_000);

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

  // Tests that wallet fee padding correctly handles L2 fee spikes driven by L1 base-fee changes.
  describe('setting max fee per gas', () => {
    // Drive an organic L2 fee bump via an L1 base-fee spike. On mainnet, L1 base fees fluctuate
    // organically with L1 demand and dominate `feePerL2Gas` (the rollup's L1 gas oracle samples
    // L1 base fee into `post` at every successful rotation and the L2 manaMinFee is derived from
    // it). We simulate that by setting the next L1 block's base fee to a multiple of the current
    // one and forcing an oracle rotation via the cheatcode-callable `Rollup.updateL1GasFeeOracle`.
    // Unlike `bumpProvingCostPerMana` (the only-owner governance write previously used here), this
    // does NOT mutate `FeeStore.config`, so it does not trigger the `Rollup__InvalidManaMinFee`
    // recovery race that pipelined proposers hit when governance config mutates between header
    // build and L1 submission.
    //
    // Congestion via heavy L2 txs was considered: each `emit_nullifier_public` is only ~570k mana,
    // and at `manaTarget=4M` the sequencer takes ~3 of those per checkpoint (~1.88M mana — well
    // below target), so excessMana stays at zero and the congestion-multiplier channel never
    // engages. The L1 base-fee channel is both more reliable here and a closer analogue to
    // mainnet behaviour (L1 base fee swings happen routinely; sustained L2 congestion is rarer).
    //
    // `reference` is the snapshot the caller intends to compare against. The retry waits until the
    // post-rotation L2 fee is at least 1.3x of `reference` — an earlier version compared `after`
    // against an internal `before` captured at function entry and exited as soon as `after > before`,
    // but the natural L2 fee fluctuates between L1 blocks (EIP-1559 decay swings the sample), so a
    // 1-wei drift above `before` satisfied that condition without the oracle ever rotating. The
    // retry returned ~15s in — well before the LIFETIME-LAG=3 slot (36s) oracle deadband opened —
    // and the caller's `> reference * 1.1` assertion failed because the returned value was just
    // natural noise. Requiring `after >= reference * 13/10` distinguishes a real rotation (≥1.5x
    // rise) from ambient noise (≤±10%).
    const inflateL2FeesViaL1BaseFee = async (reference: GasFees) => {
      const beforeAtCall = await aztecNode.getCurrentMinFees();
      t.logger.info(`Initial L2 min fees are ${inspect(beforeAtCall)} (reference=${inspect(reference)})`, {
        minFees: beforeAtCall.toInspect(),
        reference: reference.toInspect(),
      });

      const minRiseTarget = (reference.feePerL2Gas * 13n) / 10n;

      // Bump the next L1 block base fee from the requested L2 fee rise rather than from a fixed
      // absolute L1 floor. Fast automined L1 setup can leave anvil's natural base fee very low;
      // a 0.1 gwei floor turns this into a >6x L2 spike, which is outside the default-padding
      // behavior this test is checking. The reference-derived target keeps the spike meaningful
      // while staying below the padded max fee asserted below. The oracle rotation deadband
      // (`LIFETIME - LAG = 3` L2 slots between successful rotations, see FeeLib.sol:170)
      // silently no-ops `updateL1GasFeeOracle` until the window opens; we retry every second so
      // the *first* call after the deadband opens captures our bumped block.
      const latestL1Block = await cheatCodes.eth.publicClient.getBlock();
      const currentL1BaseFee = latestL1Block.baseFeePerGas ?? 1_000_000_000n;
      const referenceDerivedL1BaseFee = (minRiseTarget * 2n) / 8_000n;
      const targetL1BaseFee = referenceDerivedL1BaseFee > 0n ? referenceDerivedL1BaseFee : 1n;
      t.logger.info(`Targeting L1 base fee ${targetL1BaseFee} (current ${currentL1BaseFee})`);

      // Skip the oracle rotation deadband cheaply. `updateL1GasFeeOracle` no-ops until the current
      // L2 slot reaches `lastSlotOfChange + (LIFETIME - LAG) = +3` (FeeLib.sol updateL1GasFeeOracle),
      // and the retry below otherwise burns that window mining one L1 block per ~4s interval tick
      // (each `updateL1GasFeeOracle` waits a full anvil block interval for its receipt). Warping the
      // shared clock forward past the deadband lets the first retry iteration rotate immediately. The
      // warp only moves *when* the deadband opens, not the base fee the rotation captures (the retry
      // re-pins `targetL1BaseFee` every iteration), so the >=1.3x assertions are unaffected, and the
      // self-correcting retry still converges if the warp lands a slot short.
      await cheatCodes.rollup.advanceSlots(3);

      // REFACTOR: hand-rolled retryUntil loop that mines L1 blocks and rotates the oracle; replace with
      // a helper on RollupCheatCodes that abstracts the L1-base-fee-spike + oracle-rotation retry.
      return await retryUntil(
        async () => {
          await cheatCodes.eth.setNextBlockBaseFeePerGas(targetL1BaseFee);
          await cheatCodes.eth.mine();
          try {
            await cheatCodes.rollup.updateL1GasFeeOracle();
          } catch {
            // Rotation deadband closed — try again on the next iteration.
          }
          const after = await aztecNode.getCurrentMinFees();
          t.logger.info(`L2 min fees are now ${inspect(after)}`, {
            minFeesBefore: beforeAtCall.toInspect(),
            minFeesAfter: after.toInspect(),
            minRiseTarget: minRiseTarget.toString(),
          });
          return after.feePerL2Gas >= minRiseTarget ? after : undefined;
        },
        'L2 min fee organic increase (L1 base fee bump) above reference',
        90,
        1,
      );
    };

    // Pick a baseline from the post-checkpoint chain state. The prove step itself is
    // made deterministic by prepareTxsWithMockedMinFees below.
    const getCurrentMinFeesAfterCheckpoint = async (checkpointedBlock: BlockNumber) => {
      // REFACTOR: hand-rolled retryUntil polling for a checkpointed block number; replace with a
      // waitUntilCheckpointedBlockNumber(node, blockNumber) helper in the e2e fixture utilities.
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
      // Mock getPredictedMinFees (used by the wallet) and getCurrentMinFees (used by inflateL2FeesViaCongestion
      // and other callers).
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

    // Prepares two txs at the same stable fee snapshot (one with no padding, one with default 30x
    // padding), then spikes the L1 base fee so the L2 oracle rotates upward. Asserts the no-padding
    // tx is rejected for insufficient fee while the padded tx mines successfully.
    it('handles min fee spikes with default padding', async () => {
      const stableMinFees = await getCurrentMinFeesAfterCheckpoint(testContractDeployBlock);
      const { txWithNoPadding, txWithDefaultPadding } = await prepareTxsWithMockedMinFees(stableMinFees, stableMinFees);

      expect(txWithNoPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(stableMinFees)).toBe(true);
      expect(
        txWithDefaultPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(
          stableMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING),
        ),
      ).toBe(true);

      // Now bump the L2 fees organically (L1 base fee spike) before we actually send them.
      // Require the bump to be at least 10% — a "any-positive-rise" check is satisfied by 1 wei
      // and doesn't prove a meaningful fee shift was handled. `inflateL2FeesViaL1BaseFee` takes
      // `stableMinFees` as the reference so its retry waits until the oracle has actually rotated
      // to our bumped L1 fee, rather than returning on the first sub-percent natural fluctuation.
      const bumpedMinFees = await inflateL2FeesViaL1BaseFee(stableMinFees);
      expect(stableMinFees.feePerL2Gas).toBeLessThan(bumpedMinFees.feePerL2Gas);
      expect(bumpedMinFees.feePerL2Gas).toBeGreaterThan((stableMinFees.feePerL2Gas * 11n) / 10n);
      expect(stableMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING).feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);

      // And check that the no-padding does not get mined, but the default padding is good enough
      t.logger.info(`Sending txs`);
      await expect(txWithNoPadding.send()).rejects.toThrow(TX_ERROR_INSUFFICIENT_FEE_PER_GAS);
      await expect(txWithDefaultPadding.send()).resolves.toBeDefined();
    });

    // Prepares one tx against a synthetically higher fee snapshot and another against a lower one,
    // then spikes L2 fees between the lower and higher values. Asserts both mine, proving the higher
    // snapshot correctly covers the post-spike fee without relying on the default padding.
    it('reproduces the stale fee snapshot race deterministically', async () => {
      // The previous test bumped the proving cost, setting FeeLib's provingCostLastUpdate.
      // Clear the 30-day cooldown so bumpL2Fees below can land.
      await cheatCodes.rollup.clearProvingCostCooldown();

      const lowerMinFees = await getCurrentMinFeesAfterCheckpoint(testContractDeployBlock);
      // `higherMinFees` is the synthetic "stale" snapshot the wallet supposedly took before the
      // real L2 fee bumped — it only needs to stay above the realized `bumpedMinFees` so that
      // `txWithNoPadding` is still mineable after the bump. Use `4x` for unambiguous headroom
      // while keeping the snapshot below the 6x default-padding cap.
      const higherMinFees = lowerMinFees.mul(4);

      const { txWithNoPadding, txWithDefaultPadding } = await prepareTxsWithMockedMinFees(higherMinFees, lowerMinFees);

      expect(txWithNoPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(higherMinFees)).toBe(true);
      expect(
        txWithDefaultPadding.data.constants.txContext.gasSettings.maxFeesPerGas.equals(
          lowerMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING),
        ),
      ).toBe(true);

      const bumpedMinFees = await inflateL2FeesViaL1BaseFee(lowerMinFees);
      expect(lowerMinFees.feePerL2Gas).toBeLessThan(bumpedMinFees.feePerL2Gas);
      expect(bumpedMinFees.feePerL2Gas).toBeGreaterThan((lowerMinFees.feePerL2Gas * 11n) / 10n);
      expect(higherMinFees.feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);
      expect(lowerMinFees.mul(1 + DEFAULT_MIN_FEE_PADDING).feePerL2Gas).toBeGreaterThan(bumpedMinFees.feePerL2Gas);

      // This is the original flake: the "no padding" tx only succeeds because it was
      // accidentally prepared against an earlier, higher fee snapshot than the padded tx.
      await expect(txWithNoPadding.send()).resolves.toBeDefined();
      await expect(txWithDefaultPadding.send()).resolves.toBeDefined();
    });

    // Regression test for A-1057: a governance fee-config bump between proposer build and L1 submit
    // invalidates the pipelined checkpoint. Asserts the chain skips the bad slot and resumes producing
    // checkpoints, and that a fresh tx prepared after the bump mines under default padding.
    // Regression test for A-1057. Under pipelining, the proposer for slot N starts building the
    // checkpoint header (and bakes `manaMinFee` into `gasFees.feePerL2Gas`) during slot N-1. If
    // governance executes `setProvingCostPerMana` or `updateManaTarget` between that build and the
    // L1 submission, L1 recomputes `manaMinFee` from the post-mutation `FeeStore.config` and the
    // submitted header reverts with `Rollup__InvalidManaMinFee`. The chain should eat the
    // in-flight checkpoint and the next pipelined proposer should produce a header that validates,
    // resuming normal block production. This test exercises that path end-to-end: bump once, then
    // verify the chain advances and a fresh tx still mines.
    it('recovers after a governance fee-config bump invalidates a pipelined checkpoint', async () => {
      // Take a fresh checkpoint baseline so we measure progress strictly post-bump, and capture
      // the slot of `checkpointBefore` so we can assert below that at least one L2 slot was
      // skipped between the bump and recovery — that's the positive signal that a pipelined
      // header was actually dropped, distinguishing the A-1057 recovery path from a chain that
      // silently absorbed the governance write without exercising the failure case.
      const checkpointBefore = await aztecNode.getCheckpointNumber('checkpointed');
      const slotBefore = (await aztecNode.getCheckpoint(checkpointBefore))!.header.slotNumber;

      t.logger.info(`Bumping provingCostPerMana at checkpointed=${checkpointBefore} (slot ${slotBefore})`);
      await cheatCodes.rollup.bumpProvingCostPerMana(current => (current * 120n) / 100n);

      // At most a couple of pipelined headers were built against the pre-bump config; allow up to
      // 6 slot windows before insisting the chain has made forward progress past the bump. With
      // pipelining + minTxsPerBlock=0 an idle chain still emits empty checkpoints, so the
      // `checkpointed` tip must strictly advance.
      const RECOVERY_TARGET = CheckpointNumber.add(checkpointBefore, 3);
      const RECOVERY_BUDGET_SECONDS = AZTEC_SLOT_DURATION * 6;
      // REFACTOR: hand-rolled retryUntil polling for checkpoint number; replace with a
      // waitForCheckpointNumber(node, target) helper from EpochsTestContext or a shared utility.
      await retryUntil(
        async () => (await aztecNode.getCheckpointNumber('checkpointed')) >= RECOVERY_TARGET,
        `chain advances at least ${RECOVERY_TARGET - checkpointBefore} checkpoints past governance bump`,
        RECOVERY_BUDGET_SECONDS,
        1,
      );

      // Healthy pipelining produces one checkpoint per L2 slot, so an advance of 3 checkpoints
      // covers exactly 3 slots. If a pipelined header was invalidated and dropped (the A-1057
      // path), the recovery span will cover at least one extra slot. A passing assertion here
      // proves the test exercised the invalidation+recovery flow rather than landing the bump
      // outside the vulnerable window.
      const slotAfter = (await aztecNode.getCheckpoint(RECOVERY_TARGET))!.header.slotNumber;
      const slotSpan = slotAfter - slotBefore;
      t.logger.info(`Recovery spanned ${slotSpan} slots for ${RECOVERY_TARGET - checkpointBefore} checkpoints`, {
        slotBefore,
        slotAfter,
        checkpointBefore,
        recoveryTarget: RECOVERY_TARGET,
      });
      expect(slotSpan).toBeGreaterThan(RECOVERY_TARGET - checkpointBefore);

      // Fresh tx prepared against the post-bump fee snapshot still mines under default padding.
      const tx = await proveTx(undefined);
      await expect(tx.send()).resolves.toBeDefined();
    });
  });
});
