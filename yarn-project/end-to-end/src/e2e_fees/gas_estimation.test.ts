import { type AztecNodeService } from '@aztec/aztec-node';
import {
  type AccountWallet,
  type AztecAddress,
  FeeJuicePaymentMethod,
  type FeePaymentMethod,
  PublicFeePaymentMethod,
} from '@aztec/aztec.js';
import { GasSettings } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';

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
        makeTransferRequest()
          .send({ fee: { estimateGas, gasSettings, paymentMethod, estimatedGasPadding: 0 } })
          .wait(),
      ),
    );

  const logGasEstimate = (estimatedGas: Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>) =>
    logger.info(`Estimated gas at`, {
      gasLimits: inspect(estimatedGas.gasLimits),
      teardownGasLimits: inspect(estimatedGas.teardownGasLimits),
    });

  it('estimates gas with Fee Juice payment method', async () => {
    const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
    const estimatedGas = await makeTransferRequest().estimateGas({
      fee: { gasSettings, paymentMethod, estimatedGasPadding: 0 },
    });
    logGasEstimate(estimatedGas);

    (t.aztecNode as AztecNodeService).getSequencer()!.updateSequencerConfig({ minTxsPerBlock: 2, maxTxsPerBlock: 2 });

    const [withEstimate, withoutEstimate] = await sendTransfers(paymentMethod);

    // This is the interesting case, which we hit most of the time.
    const block = await t.pxe.getBlock(withEstimate.blockNumber!);
    expect(block!.header.totalManaUsed.toNumber()).toBe(estimatedGas.gasLimits.l2Gas * 2);

    // Tx has no teardown cost, so both fees should just reflect the actual gas cost.
    expect(withEstimate.transactionFee!).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    const estimatedFee = estimatedGas.gasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });

  it('estimates gas with public payment method', async () => {
    const teardownFixedFee = gasSettings.teardownGasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();
    const paymentMethod = new PublicFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet);
    const estimatedGas = await makeTransferRequest().estimateGas({
      fee: { gasSettings, paymentMethod, estimatedGasPadding: 0 },
    });
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await sendTransfers(paymentMethod);

    // Actual teardown gas used is less than the limits.
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeLessThan(gasSettings.teardownGasLimits.l2Gas);
    expect(estimatedGas.teardownGasLimits.daGas).toBeLessThan(gasSettings.teardownGasLimits.daGas);

    // Estimation should yield that teardown has reduced cost, but is not zero
    expect(withEstimate.transactionFee!).toBeLessThan(withoutEstimate.transactionFee!);
    expect(withEstimate.transactionFee!).toBeGreaterThan(withoutEstimate.transactionFee! - teardownFixedFee);

    // Check that estimated gas for teardown are not zero since we're doing work there
    expect(estimatedGas.teardownGasLimits.l2Gas).toBeGreaterThan(0);

    const estimatedFee = estimatedGas.gasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });

  it('estimates gas for public contract initialization with Fee Juice payment method', async () => {
    const paymentMethod = new FeeJuicePaymentMethod(aliceAddress);
    const deployMethod = () => BananaCoin.deploy(aliceWallet, aliceAddress, 'TKN', 'TKN', 8);
    const deployOpts = (estimateGas = false) => ({
      fee: { gasSettings, paymentMethod, estimateGas, estimatedGasPadding: 0 },
      skipClassRegistration: true,
    });
    const estimatedGas = await deployMethod().estimateGas(deployOpts());
    logGasEstimate(estimatedGas);

    const [withEstimate, withoutEstimate] = await Promise.all([
      deployMethod().send(deployOpts(true)).wait(),
      deployMethod().send(deployOpts(false)).wait(),
    ]);

    // Estimation should yield that teardown has no cost, so should send the tx with zero for teardown
    expect(withEstimate.transactionFee!).toEqual(withoutEstimate.transactionFee!);

    // Check that estimated gas for teardown are zero
    expect(estimatedGas.teardownGasLimits.l2Gas).toEqual(0);
    expect(estimatedGas.teardownGasLimits.daGas).toEqual(0);

    const estimatedFee = estimatedGas.gasLimits.computeFee(gasSettings.maxFeesPerGas).toBigInt();
    expect(estimatedFee).toEqual(withEstimate.transactionFee!);
  });
});
