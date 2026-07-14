import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { type FeePaymentMethod, PublicFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { Logger } from '@aztec/foundation/log';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { SequencerState } from '@aztec/sequencer-client';
import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
  Gas,
  GasFees,
  GasSettings,
  type GasUsed,
} from '@aztec/stdlib/gas';
import { getGasLimits } from '@aztec/wallet-sdk/base-wallet';

import { jest } from '@jest/globals';
import { inspect } from 'util';

import { PIPELINING_SETUP_OPTS, getPaddedMaxFeesPerGas } from '../../fixtures/fixtures.js';
import { waitForSequencerState } from '../../fixtures/wait_helpers.js';
import { FeesTest } from './fees_test.js';

// Gas estimation accuracy and FPC teardown gas prediction. Uses FeesTest (prod sequencer, pipelining
// preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0), fake in-proc prover node, and
// GasBridgingTestHarness for L1↔L2 fee-juice bridging (the FPC setup bridges fee juice to BananaFPC).
describe('single-node/fees/gas_estimation', () => {
  // FeesTest.setup + applyFPCSetup + applyFundAliceWithBananas chains many dependent txs which run
  // at the pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(900_000);

  let wallet: Wallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;
  let logger: Logger;
  let aztecNode: AztecNode;

  const t = new FeesTest('gas_estimation');

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    // Alice's banana mints and the BananaFPC deploy each depend only on the BananaCoin deployed
    // during setup, so they run concurrently and share slots.
    await Promise.all([t.applyFPCSetup(), t.applyFundAliceWithBananas()]);
    ({ wallet, aliceAddress, bobAddress, bananaCoin, bananaFPC, gasSettings, logger, aztecNode } = t);
  });

  // Derives declared gas limits from simulated usage with zero padding, mirroring what the old
  // `estimateGas: true, estimatedGasPadding: 0` flow produced: `gasLimits == manaUsed`.
  const estimateGasLimits = async (gasUsed: GasUsed): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> => {
    const { txsLimits } = await aztecNode.getNodeInfo();
    return getGasLimits(gasUsed, Gas.from(txsLimits.gas), 0);
  };

  beforeEach(async () => {
    // Pad max fees per gas to absorb pipelined fee-asset price evolution between snapshot and
    // submission. The assertions below compare `transactionFee` (manaUsed * block.gasFees) against
    // `estimatedGas.gasLimits.computeFee(block.gasFees)`, so they only require `gasLimits == manaUsed`
    // (guaranteed by zero padding); they do not require `maxFeesPerGas == block.gasFees`.
    const paddedMaxFees = await getPaddedMaxFeesPerGas(aztecNode);
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: paddedMaxFees,
      maxPriorityFeesPerGas: new GasFees(0, 0),
    });
  }, 10000);

  afterAll(async () => {
    await t.teardown();
  });

  const makeTransferRequest = () => bananaCoin.methods.transfer_in_public(aliceAddress, bobAddress, 1n, 0n);

  // Sends two txs with transfers of public tokens: one with limits based on the estimate, another one without
  const sendTransfers = (
    limits: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>,
    paymentMethod?: FeePaymentMethod,
  ) =>
    Promise.all(
      [GasSettings.from({ ...gasSettings, ...limits }), gasSettings].map(async gasSettings => {
        const { receipt } = await makeTransferRequest().send({
          from: aliceAddress,
          fee: { gasSettings, paymentMethod },
        });
        return receipt;
      }),
    );

  const logGasEstimate = (estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) =>
    logger.info(`Estimated gas at`, {
      gasLimits: inspect(estimatedGas.gasLimits),
      teardownGasLimits: inspect(estimatedGas.teardownGasLimits),
    });

  // Simulates a public token transfer with includeMetadata=true and derives zero-padded gas limits from
  // the reported gasUsed (v5: the old estimateGas=true / estimatedGasPadding=0 flow was replaced by
  // simulate(includeMetadata) + estimateGasLimits, which yields gasLimits == manaUsed), then sends two
  // copies — one with the estimated gas limits, one without. Asserts the estimated tx and the default tx
  // pay the same fee, and that the estimated teardown gas is zero for a Fee Juice payment (no teardown work).
  it('estimates gas with Fee Juice payment method', async () => {
    const sim = await makeTransferRequest().simulate({
      from: aliceAddress,
      fee: { gasSettings },
      includeMetadata: true,
    });
    const estimatedGas = await estimateGasLimits(sim.gasUsed!);
    logGasEstimate(estimatedGas);

    const sequencer = t.context.sequencer!.getSequencer();

    await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 2, maxTxsPerBlock: 2 });

    // Wait for any in-progress checkpoint job to complete before sending txs.
    // This ensures the next checkpoint job will use the updated minTxsPerBlock config.
    await waitForSequencerState(sequencer, SequencerState.IDLE);

    const [withEstimate, withoutEstimate] = await sendTransfers(estimatedGas);

    // This is the interesting case, which we hit most of the time.
    const block = await t.aztecNode.getBlock(withEstimate.blockNumber!);
    expect(block!.header.totalManaUsed.toNumber()).toBe(estimatedGas.gasLimits.l2Gas * 2);

    // Tx has no teardown cost, so both fees should just reflect the actual gas cost.
    expect(withEstimate.transactionFee!).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    // Check that estimated fee and fee of the tx with estimate are the same. We need to use the gas fees (gas price)
    // from the block in which the tx with estimate landed.
    const gasFeesForBlockInWhichTxWithEstimateLanded = block!.header.globalVariables.gasFees;
    const estimatedFee = estimatedGas.gasLimits.computeFee(gasFeesForBlockInWhichTxWithEstimateLanded).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });

  // Same flow but with a public FPC payment method. Asserts the estimated teardown gas limits are
  // smaller than the default and that the estimated tx fee is lower than the unestimated tx fee.
  it('estimates gas with public payment method', async () => {
    const gasSettingsForEstimation = new GasSettings(
      new Gas(GAS_ESTIMATION_DA_GAS_LIMIT, GAS_ESTIMATION_L2_GAS_LIMIT),
      new Gas(GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT, GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT),
      gasSettings.maxFeesPerGas,
      gasSettings.maxPriorityFeesPerGas,
    );
    const paymentMethod = new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettingsForEstimation);

    const sim2 = await makeTransferRequest().simulate({
      from: aliceAddress,
      fee: { paymentMethod },
      includeMetadata: true,
    });
    const estimatedGas = await estimateGasLimits(sim2.gasUsed!);
    logGasEstimate(estimatedGas);

    // Pin both transfers into the same block so they share one block.gasFees. The assertions below
    // compare the estimated and unestimated transactionFees directly (toBeLessThan / toBeGreaterThan),
    // which only isolates the teardown-refund difference when both txs are billed at the same L2 gas
    // price. Under the pipelining preset (minTxsPerBlock: 0, two blocks per slot) the two concurrent
    // sends would otherwise land in different blocks whose feePerL2Gas can differ several-fold as the
    // L1 base fee evolves on a freshly-deployed chain, flipping the comparison.
    const sequencer = t.context.sequencer!.getSequencer();
    await t.aztecNodeAdmin.setConfig({ minTxsPerBlock: 2, maxTxsPerBlock: 2 });
    // Wait for any in-progress checkpoint job to complete so the next job picks up the updated config.
    await waitForSequencerState(sequencer, SequencerState.IDLE);

    const [withEstimate, withoutEstimate] = await sendTransfers(estimatedGas, paymentMethod);

    // Guards the same-block invariant the fee comparisons below rely on; if a batching change ever lets
    // the two txs split across blocks again, this fails clearly instead of resurfacing as a flaky fee assertion.
    expect(withEstimate.blockNumber).toEqual(withoutEstimate.blockNumber);

    const teardownFixedFee = gasSettings.teardownGasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();

    // Checks that estimated teardown gas limits are less than the default ones.
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeLessThan(gasSettings.teardownGasLimits.l2Gas);
    expect(estimatedGas.teardownGasLimits.daGas).toBeLessThan(gasSettings.teardownGasLimits.daGas);

    // Estimation reduces the fee because we accurately predict teardown which isn't refunded!
    expect(withEstimate.transactionFee!).toBeLessThan(withoutEstimate.transactionFee!);
    // The fee should be higher than just the non teardown cost
    expect(withEstimate.transactionFee!).toBeGreaterThan(withoutEstimate.transactionFee! - teardownFixedFee);
    // Check that estimated gas for teardown are not zero since we're doing work there
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeGreaterThan(0);

    // Check that estimated fee and fee of the tx with estimate are the same. We need to use the gas fees (gas price)
    // from the block in which the tx with estimate landed.
    const block = await t.aztecNode.getBlock(withEstimate.blockNumber!);
    const gasFeesForBlockInWhichTxWithEstimateLanded = block!.header.globalVariables.gasFees;

    const estimatedFee = estimatedGas.gasLimits.computeFee(gasFeesForBlockInWhichTxWithEstimateLanded).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });

  // Deploys a BananaCoin contract, simulating with includeMetadata=true and deriving zero-padded gas
  // limits from gasUsed (v5: replaces the old estimateGas=true flow — see note above), then sends two
  // deployments — one with estimated limits, one with defaults. Asserts both pay the same fee and
  // estimated teardown is zero.
  it('estimates gas for public contract initialization with Fee Juice payment method', async () => {
    const deployMethod = () => BananaCoin.deploy(wallet, aliceAddress, 'TKN', 'TKN', 8);
    const deployOpts = (limits?: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) => {
      return {
        from: aliceAddress,
        fee: { gasSettings: limits ? { ...gasSettings, ...limits } : gasSettings },
        skipClassPublication: true,
      };
    };

    const sim3 = await deployMethod().simulate({
      from: aliceAddress,
      skipClassPublication: true,
      includeMetadata: true,
    });
    const estimatedGas = await estimateGasLimits(sim3.gasUsed!);
    logGasEstimate(estimatedGas);

    const [{ receipt: withEstimate }, { receipt: withoutEstimate }] = await Promise.all([
      deployMethod().send(deployOpts(estimatedGas)),
      deployMethod().send(deployOpts()),
    ]);

    // Estimation should yield that teardown has no cost, so should send the tx with zero for teardown
    expect(withEstimate.transactionFee!).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    // Check that estimated fee and fee of the tx with estimate are the same. We need to use the gas fees (gas price)
    // from the block in which the tx with estimate landed.
    const block = await t.aztecNode.getBlock(withEstimate.blockNumber!);
    const gasFeesForBlockInWhichTxWithEstimateLanded = block!.header.globalVariables.gasFees;

    const estimatedFee = estimatedGas.gasLimits.computeFee(gasFeesForBlockInWhichTxWithEstimateLanded).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });
});
