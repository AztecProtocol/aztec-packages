import { AztecAddress } from '@aztec/aztec.js/addresses';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS, getPaddedMaxFeesPerGas } from '../../fixtures/fixtures.js';
import { expectMapping } from '../../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

// Sponsored fee payment via SponsoredFPC (SponsoredFeePaymentMethod). Uses FeesTest (prod sequencer,
// pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0), fake in-proc prover
// node, and GasBridgingTestHarness for L1↔L2 fee-juice bridging (the SponsoredFPC is funded at
// genesis via fundSponsoredFPC; the test exercises the sponsored path where the user pays no fee juice
// directly). Also used as a code snippet in the documentation (docs:start/end:sponsored_fpc_simple).
describe('single-node/fees/sponsored_payments', () => {
  // FeesTest.setup + applySponsoredFPCSetup + applyFundAliceWithBananas chains many dependent txs which run
  // at the ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(15 * 60 * 1000);

  let aztecNode: AztecNode;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let sponsoredFPC: SponsoredFPCContract;
  let gasSettings: GasSettings;
  let bananaCoin: TokenContract;

  const t = new FeesTest('sponsored_payment');

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS });
    await t.applySponsoredFPCSetup();
    await t.applyFundAliceWithBananas();
    ({ aztecNode, aliceAddress, bobAddress, sequencerAddress, sponsoredFPC, bananaCoin, gasSettings } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAliceGas: bigint;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let initialBobPublicBananas: bigint;

  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await getPaddedMaxFeesPerGas(aztecNode),
    });

    [[initialAlicePublicBananas, initialBobPublicBananas], [initialAliceGas, initialFPCGas, initialSequencerGas]] =
      await Promise.all([
        t.getBananaPublicBalanceFn(aliceAddress, bobAddress),
        t.getGasBalanceFn(aliceAddress, sponsoredFPC.address, sequencerAddress),
      ]);
  });

  // Alice transfers bananas to Bob via SponsoredFeePaymentMethod. The SponsoredFPC covers the fee
  // from its own gas balance; Alice's gas balance is unaffected and only her banana balance changes.
  it('pays fees for tx that makes a public transfer', async () => {
    // docs:start:sponsored_fpc_simple
    const bananasToSendToBob = 10n;
    const { receipt: tx } = await bananaCoin.methods
      .transfer_in_public(aliceAddress, bobAddress, bananasToSendToBob, 0)
      .send({
        from: aliceAddress,
        fee: {
          gasSettings,
          paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
        },
      });
    // docs:end:sponsored_fpc_simple

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bobAddress],
      [initialAlicePublicBananas - bananasToSendToBob, bananasToSendToBob],
    );

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, sponsoredFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });
});
