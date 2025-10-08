import type { AztecNodeService } from '@aztec/aztec-node';
import {
  type AztecAddress,
  type AztecNode,
  type DeployOptions,
  type FeePaymentMethod,
  PublicFeePaymentMethod,
  type Wallet,
} from '@aztec/aztec.js';
import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
} from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';

import { inspect } from 'util';

import { FeesTest } from './fees_test.js';

describe('e2e_fees gas_estimation', () => {
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
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    ({ wallet, aliceAddress, bobAddress, bananaCoin, bananaFPC, gasSettings, logger, aztecNode } = await t.setup());
  });

  beforeEach(async () => {
    // Load the gas fees at the start of each test, use those exactly as the max fees per gas
    const gasFees = await aztecNode.getCurrentBaseFees();
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: gasFees,
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
      [GasSettings.from({ ...gasSettings, ...limits }), gasSettings].map(gasSettings =>
        makeTransferRequest().send({ from: aliceAddress, fee: { gasSettings, paymentMethod } }).wait(),
      ),
    );

  const logGasEstimate = (estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) =>
    logger.info(`Estimated gas at`, {
      gasLimits: inspect(estimatedGas.gasLimits),
      teardownGasLimits: inspect(estimatedGas.teardownGasLimits),
    });

  it('estimates gas with Fee Juice payment method', async () => {
    const { estimatedGas } = await makeTransferRequest().simulate({
      from: aliceAddress,
      fee: { gasSettings, estimateGas: true, estimatedGasPadding: 0 },
    });
    logGasEstimate(estimatedGas);

    (t.aztecNode as AztecNodeService).getSequencer()!.updateConfig({ minTxsPerBlock: 2, maxTxsPerBlock: 2 });

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

  it('estimates gas with public payment method', async () => {
    const gasSettingsForEstimation = new GasSettings(
      new Gas(GAS_ESTIMATION_DA_GAS_LIMIT, GAS_ESTIMATION_L2_GAS_LIMIT),
      new Gas(GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT, GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT),
      gasSettings.maxFeesPerGas,
      gasSettings.maxPriorityFeesPerGas,
    );
    const paymentMethod = new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettingsForEstimation);

    const { estimatedGas } = await makeTransferRequest().simulate({
      from: aliceAddress,
      fee: { paymentMethod, estimatedGasPadding: 0, estimateGas: true },
    });
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await sendTransfers(estimatedGas, paymentMethod);

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

  it('estimates gas for public contract initialization with Fee Juice payment method', async () => {
    const deployMethod = () => BananaCoin.deploy(wallet, aliceAddress, 'TKN', 'TKN', 8);
    const deployOpts: (limits?: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) => DeployOptions = limits => ({
      from: aliceAddress,
      fee: { gasSettings: { ...gasSettings, ...limits } },
      skipClassPublication: true,
    });
    const { estimatedGas } = await deployMethod().simulate({
      ...deployOpts(),
      fee: {
        estimateGas: true,
        estimatedGasPadding: 0,
      },
    });
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await Promise.all([
      deployMethod().send(deployOpts(estimatedGas)).wait(),
      deployMethod().send(deployOpts()).wait(),
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
