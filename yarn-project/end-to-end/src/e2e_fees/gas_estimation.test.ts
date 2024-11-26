import {
  type AccountWallet,
  type AztecAddress,
  FeeJuicePaymentMethod,
  type FeePaymentMethod,
  PublicFeePaymentMethod,
} from '@aztec/aztec.js';
import { Gas, GasSettings } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { TokenContract as BananaCoin, type FPCContract } from '@aztec/noir-contracts.js';

import { inspect } from 'util';

import { FeesTest } from './fees_test.js';

describe('e2e_fees gas_estimation', () => {
  let aliceWallet: AccountWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;
  let logger: Logger;

  const t = new FeesTest('gas_estimation');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFPCSetupSnapshot();
    await t.applyFundAliceWithBananas();
    await t.applyFundAliceWithFeeJuice();
    ({ aliceWallet, aliceAddress, bobAddress, bananaCoin, bananaFPC, gasSettings, logger } = await t.setup());

    // We let Alice see Bob's notes because the expect uses Alice's wallet to interact with the contracts to "get" state.
    aliceWallet.setScopes([aliceAddress, bobAddress]);
  });

  beforeEach(async () => {
    // Load the gas fees at the start of each test, use those exactly as the max fees per gas
    const gasFees = await aliceWallet.getCurrentBaseFees();
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: gasFees,
    });
  });

  afterAll(async () => {
    await t.teardown();
  });

  const makeTransferRequest = () => bananaCoin.methods.transfer_in_public(aliceAddress, bobAddress, 1n, 0n);

  // Sends two tx with transfers of public tokens: one with estimateGas on, one with estimateGas off
  const sendTransfers = (paymentMethod: FeePaymentMethod) =>
    Promise.all(
      [true, false].map(estimateGas =>
        makeTransferRequest().send({ estimateGas, fee: { gasSettings, paymentMethod } }).wait(),
      ),
    );

  const logGasEstimate = (estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) =>
    logger.info(`Estimated gas at`, {
      gasLimits: inspect(estimatedGas.gasLimits),
      teardownGasLimits: inspect(estimatedGas.teardownGasLimits),
    });

  const expectGreaterFeeFromEstimatedGas = (
    estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>,
    actualFee: bigint,
  ) => {
    const feeFromEstimatedGas = estimatedGas.gasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();

    // The actual fee should be under the estimate, since we add 10% by default to the estimated gas (see aztec.js/src/contract/get_gas_limits.ts).
    const adjustedForFloatingPoint = new Gas(1, 1).computeFee(gasSettings.maxFeesPerGas).toBigInt();
    expect(feeFromEstimatedGas).toBeLessThanOrEqual((actualFee * 110n) / 100n + adjustedForFloatingPoint);
    expect(feeFromEstimatedGas).toBeGreaterThan(actualFee);
  };

  it('estimates gas with Fee Juice payment method', async () => {
    const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
    const estimatedGas = await makeTransferRequest().estimateGas({ fee: { gasSettings, paymentMethod } });
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await sendTransfers(paymentMethod);
    const actualFee = withEstimate.transactionFee!;

    // Tx has no teardown cost, so both fees should just reflect the actual gas cost.
    expect(actualFee).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    // Check that the estimate was close to the actual gas used by recomputing the tx fee from it
    expectGreaterFeeFromEstimatedGas(estimatedGas, actualFee);
  });

  it('estimates gas with public payment method', async () => {
    const teardownFixedFee = gasSettings.teardownGasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();
    const paymentMethod = new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet);
    const estimatedGas = await makeTransferRequest().estimateGas({ fee: { gasSettings, paymentMethod } });
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await sendTransfers(paymentMethod);
    const actualFee = withEstimate.transactionFee!;

    // Actual teardown gas used is less than the limits.
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeLessThan(gasSettings.teardownGasLimits.l2Gas);
    expect(estimatedGas.teardownGasLimits.daGas).toBeLessThan(gasSettings.teardownGasLimits.daGas);

    // Estimation should yield that teardown has reduced cost, but is not zero
    expect(withEstimate.transactionFee!).toBeLessThan(withoutEstimate.transactionFee!);
    expect(withEstimate.transactionFee!).toBeGreaterThan(withoutEstimate.transactionFee! - teardownFixedFee);

    // Check that estimated gas for teardown are not zero since we're doing work there
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeGreaterThan(0);

    // Check that the estimate was close to the actual gas used by recomputing the tx fee from it
    expectGreaterFeeFromEstimatedGas(estimatedGas, actualFee);
  });

  it('estimates gas for public contract initialization with Fee Juice payment method', async () => {
    const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
    const deployMethod = () => BananaCoin.deploy(aliceWallet, aliceAddress, 'TKN', 'TKN', 8);
    const deployOpts = { fee: { gasSettings, paymentMethod }, skipClassRegistration: true };
    const estimatedGas = await deployMethod().estimateGas(deployOpts);
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await Promise.all([
      deployMethod()
        .send({ ...deployOpts, estimateGas: true })
        .wait(),
      deployMethod()
        .send({ ...deployOpts, estimateGas: false })
        .wait(),
    ]);

    // Estimation should yield that teardown has no cost, so should send the tx with zero for teardown
    const actualFee = withEstimate.transactionFee!;
    expect(actualFee).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    // Check that the estimate was close to the actual gas used by recomputing the tx fee from it
    expectGreaterFeeFromEstimatedGas(estimatedGas, actualFee);
  });
});
