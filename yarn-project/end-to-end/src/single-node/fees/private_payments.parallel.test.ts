import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, waitForProven } from '@aztec/aztec.js/contracts';
import { PrivateFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';
import { TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { expectMapping } from '../../fixtures/utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { FeesTest } from './fees_test.js';

// Private fee payment via BananaCoin FPC (PrivateFeePaymentMethod). Uses FeesTest (prod sequencer,
// pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0, aztecEpochDuration=4,
// aztecProofSubmissionEpochs=640), fake in-proc prover node, and GasBridgingTestHarness for L1↔L2
// fee-juice bridging. Auto-proving is disabled after setup so tests control epoch advancement.
describe('single-node/fees/private_payments', () => {
  // FeesTest.setup + applyFPCSetup + applyFundAliceWithBananas chains many dependent txs which run at the
  // ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(900_000);

  let wallet: TestWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;
  let aztecNode: AztecNode;

  const t = new FeesTest('private_payment');

  beforeAll(async () => {
    // Shorter epochs (default 32 → 4) speed the per-test `advanceToNextEpoch + waitForProven`
    // cycle: the prover-node submits a proof as soon as the epoch is complete, so ~8x shorter
    // epochs ≈ ~8x faster proof cadence per cycle. Setup itself stays slot-bound.
    await t.setup({ ...PIPELINING_SETUP_OPTS, aztecProofSubmissionEpochs: 640, aztecEpochDuration: 4 });
    await t.applyFPCSetup();
    await t.applyFundAliceWithBananas();
    ({ wallet, aliceAddress, bobAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings, aztecNode } = t);

    // Prove up until the current state by advancing the epoch and waiting for the prover node.
    await t.waitForEpochProven();
  });

  afterAll(async () => {
    await t.teardown();
  });

  let initialAlicePublicBananas: bigint;
  let initialAlicePrivateBananas: bigint;
  let initialAliceGas: bigint;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let initialBobPublicBananas: bigint;
  let initialBobPrivateBananas: bigint;

  let initialFPCPublicBananas: bigint;
  let initialFPCGas: bigint;

  let initialSequencerGas: bigint;

  beforeEach(async () => {
    gasSettings = GasSettings.from({
      ...gasSettings,
      maxFeesPerGas: await aztecNode.getCurrentMinFees(),
    });

    [
      [initialAlicePrivateBananas, initialBobPrivateBananas],
      [initialAlicePublicBananas, initialBobPublicBananas, initialFPCPublicBananas],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    ] = await Promise.all([
      t.getBananaPrivateBalanceFn(aliceAddress, bobAddress),
      t.getBananaPublicBalanceFn(aliceAddress, bobAddress, bananaFPC.address),
      t.getGasBalanceFn(aliceAddress, bananaFPC.address, sequencerAddress),
    ]);
  });

  // Alice transfers private bananas to Bob using PrivateFeePaymentMethod. Verifies sequencer rewards
  // on L1 equal fee minus prover fee and burn, and Alice's banana balance decreases by fee + transfer.
  it('pays fees for tx that dont run public app logic', async () => {
    /**
     * PRIVATE SETUP (1 nullifier for tx)
     * check authwit (1 nullifier)
     * reduce alice BC.private by MaxFee (1 nullifier)
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * reduce Alice's BC.private by transferAmount (1 note)
     * create note for Bob of transferAmount (1 note)
     * encrypted logs of 944 bytes
     * unencrypted logs of 20 bytes
     *
     * PUBLIC APP LOGIC
     * N/A
     *
     * PUBLIC TEARDOWN
     *   increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     *   increase Alice's private banana balance by feeAmount by finalizing partial note
     *
     * this is expected to squash notes and nullifiers
     */
    const transferAmount = 5n;
    const interaction = bananaCoin.methods.transfer(bobAddress, transferAmount);
    const localTx = await proveInteraction(wallet, interaction, {
      from: aliceAddress,
      fee: {
        paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
      },
    });
    expect(localTx.data.feePayer).toEqual(bananaFPC.address);

    const sequencerRewardsBefore = await t.getCoinbaseSequencerRewards();
    const { sequencerBlockRewards } = await t.getBlockRewards();
    const provenCheckpointBefore = await t.rollupContract.getProvenCheckpointNumber();

    const receipt = await localTx.send({ timeout: 300, interval: 10 });
    await t.cheatCodes.rollup.advanceToNextEpoch();

    await waitForProven(aztecNode, receipt, { provenTimeout: 300 });

    // Under pipelining, multiple empty checkpoints can land and prove between the snapshot and waitForProven;
    // each one contributes a block reward to the coinbase, so multiply by the actual proven-checkpoint delta.
    const provenCheckpointAfter = await t.rollupContract.getProvenCheckpointNumber();
    const newlyProvenCheckpoints = BigInt(provenCheckpointAfter - provenCheckpointBefore);

    // @note There is a potential race condition here if other tests send transactions that get into the same
    // epoch and thereby pays out fees at the same time (when proven).
    const expectedProverFee = await t.getCommittedProverFee(receipt.blockNumber!);
    const expectedBurn = await t.getCommittedBurn(receipt.blockNumber!);
    await expect(t.getCoinbaseSequencerRewards()).resolves.toEqual(
      sequencerRewardsBefore +
        newlyProvenCheckpoints * sequencerBlockRewards +
        receipt.transactionFee! -
        expectedBurn -
        expectedProverFee,
    );
    const feeAmount = receipt.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress],
      [initialAlicePrivateBananas - feeAmount - transferAmount, transferAmount],
    );

    // FPC should have received fee amount of bananas
    await expectMapping(t.getBananaPublicBalanceFn, [bananaFPC.address], [initialFPCPublicBananas + feeAmount]);

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  // Alice mints private bananas to herself while paying via FPC. Asserts the FPC banana public
  // balance increases by the fee and Alice's private balance increases net of the fee.
  it('pays fees for tx that creates notes in private', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * increase alice BC.private by newlyMintedBananas
     *
     * PUBLIC APP LOGIC
     * BC increase total supply
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const newlyMintedBananas = 10n;
    const { receipt: tx } = await bananaCoin.methods.mint_to_private(aliceAddress, newlyMintedBananas).send({
      from: aliceAddress,
      fee: {
        paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
      },
    });

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas - feeAmount + newlyMintedBananas],
    );

    // FPC should have received fee amount of bananas
    await expectMapping(t.getBananaPublicBalanceFn, [bananaFPC.address], [initialFPCPublicBananas + feeAmount]);

    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  // Alice transfers bananas from public to private (creating a note via public app logic) while paying
  // via FPC. Asserts both private and public balances change correctly and the FPC receives its fee.
  it('pays fees for tx that creates notes in public', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * a partial note is prepared
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by shieldedBananas
     * BC finalizes the partial note with an amount --> this is where the note is created in public
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const amountTransferredToPrivate = 1n;
    const { receipt: tx } = await bananaCoin.methods
      .transfer_to_private(aliceAddress, amountTransferredToPrivate)
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
        },
      });

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas - feeAmount + amountTransferredToPrivate],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAlicePublicBananas - amountTransferredToPrivate, initialFPCPublicBananas + feeAmount],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  // A BatchCall combines a private transfer and a public-to-private shield in one tx while paying via
  // FPC. Verifies all four balance deltas (Alice private, Alice public, Bob private, FPC public).
  it('pays fees for tx that creates notes in both private and public', async () => {
    const amountTransferredInPrivate = 1n;
    const amountTransferredToPrivate = 2n;
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * setup fee and refund partial notes
     * setup public teardown call
     *
     * PRIVATE APP LOGIC
     * reduce Alice's private balance by privateTransfer
     * create note for Bob with privateTransfer amount of private BC
     * prepare partial note (in the transfer to private)
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by amountTransferredToPrivate
     * BC finalize partial note with amountTransferredToPrivate (this is where the note is created in public)
     *
     * PUBLIC TEARDOWN
     * increase sequencer/fee recipient/FPC admin private banana balance by feeAmount by finalizing partial note
     * increase Alice's private banana balance by feeAmount by finalizing partial note
     */
    const { receipt: tx } = await new BatchCall(wallet, [
      bananaCoin.methods.transfer(bobAddress, amountTransferredInPrivate),
      bananaCoin.methods.transfer_to_private(aliceAddress, amountTransferredToPrivate),
    ]).send({
      from: aliceAddress,
      fee: {
        paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
      },
    });

    const feeAmount = tx.transactionFee!;

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bobAddress],
      [
        initialAlicePrivateBananas - feeAmount - amountTransferredInPrivate + amountTransferredToPrivate,
        initialBobPrivateBananas + amountTransferredInPrivate,
      ],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAlicePublicBananas - amountTransferredToPrivate, initialFPCPublicBananas + feeAmount],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  // Deploys a BananaFPC with no fee-juice funding, then tries to use it as a fee payer.
  // Asserts the tx is rejected with "Insufficient fee payer balance" before execution.
  it('rejects txs that dont have enough balance to cover gas costs', async () => {
    // deploy a copy of bananaFPC but don't fund it!
    const { contract: bankruptFPC } = await FPCContract.deploy(wallet, bananaCoin.address, aliceAddress).send({
      from: aliceAddress,
    });

    await expectMapping(t.getGasBalanceFn, [bankruptFPC.address], [0n]);

    await expect(
      bananaCoin.methods.mint_to_private(aliceAddress, 10).send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PrivateFeePaymentMethod(bankruptFPC.address, aliceAddress, wallet, gasSettings),
        },
      }),
    ).rejects.toThrow(TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE);
  });

  // TODO(#7694): Remove this test once the lacking feature in TXE is implemented.
  // Passes max_fee=1 (effectively zero) to PrivateFeePaymentMethod so the funded amount check fires.
  // Asserts simulation throws "max fee not enough to cover tx fee".
  it('insufficient funded amount is correctly handled', async () => {
    // We call arbitrary `private_get_name(...)` function just to check the correct error is triggered.
    await expect(
      bananaCoin.methods.private_get_name().simulate({
        from: aliceAddress,
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(
            bananaFPC.address,
            aliceAddress,
            wallet,
            gasSettings,
            true, // We set max fee/funded amount to 1 to trigger the error.
          ),
        },
      }),
    ).rejects.toThrow('max fee not enough to cover tx fee');
  });
});
