import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { PublicFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS, getPaddedMaxFeesPerGas } from '../../fixtures/fixtures.js';
import { expectMapping } from '../../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

// Public fee payment via BananaCoin FPC (PublicFeePaymentMethod). Uses FeesTest (prod sequencer,
// pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0), fake in-proc prover
// node, and GasBridgingTestHarness for L1↔L2 fee-juice bridging (the FPC setup bridges fee juice).
describe('single-node/fees/public_payments', () => {
  // FeesTest.setup + applyFPCSetup + applyFundAliceWithBananas chains many dependent txs which run
  // at the ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(15 * 60 * 1000);

  let aztecNode: AztecNode;
  let wallet: Wallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;

  const t = new FeesTest('public_payment');

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    await t.applyFPCSetup();
    await t.applyFundAliceWithBananas();
    ({ wallet, aliceAddress, bobAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings, aztecNode } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAliceGas: bigint;

  let initialBobPublicBananas: bigint;

  let initialFPCPublicBananas: bigint;
  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await getPaddedMaxFeesPerGas(aztecNode),
    });

    [
      [initialAlicePublicBananas, initialBobPublicBananas, initialFPCPublicBananas],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    ] = await Promise.all([
      t.getBananaPublicBalanceFn(aliceAddress, bobAddress, bananaFPC.address),
      t.getGasBalanceFn(aliceAddress, bananaFPC.address, sequencerAddress),
    ]);
  });

  // Alice sends 10 bananas to Bob using PublicFeePaymentMethod. Asserts Alice's banana balance
  // decreases by bananasToSendToBob + fee, FPC public balance increases by fee, and FPC gas decreases.
  it('pays fees for tx that make public transfer', async () => {
    const bananasToSendToBob = 10n;
    const { receipt: tx } = await bananaCoin.methods
      .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
        },
      });

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, bobAddress],
      [
        initialAlicePublicBananas - (feeAmount + bananasToSendToBob),
        initialFPCPublicBananas + feeAmount,
        initialBobPublicBananas + bananasToSendToBob,
      ],
    );

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });
});
