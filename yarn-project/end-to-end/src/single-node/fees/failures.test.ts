import { FunctionSelector } from '@aztec/aztec.js/abi';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { SetPublicAuthwitContractInteraction } from '@aztec/aztec.js/authorization';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { PrivateFeePaymentMethod, PublicFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { TokenContract as BananaCoin } from '@aztec/noir-contracts.js/Token';
import { FunctionCall, FunctionType } from '@aztec/stdlib/abi';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { PIPELINING_SETUP_OPTS, U128_UNDERFLOW_ERROR } from '../../fixtures/fixtures.js';
import { ensureAuthRegistryPublished } from '../../fixtures/setup.js';
import { expectMapping } from '../../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

// Fee behaviour when transactions revert. Uses FeesTest (prod sequencer, pipelining preset:
// ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=0, aztecEpochDuration=4,
// aztecProofSubmissionEpochs=640), fake in-proc prover node, and GasBridgingTestHarness for
// L1↔L2 fee-juice bridging. Auto-proving is disabled after setup so tests control proving themselves.
describe('single-node/fees/failures', () => {
  // FeesTest.setup + applyFPCSetup chains many dependent txs which run at the
  // ~24s/tx pipelined cadence, exceeding the default 5 min hook window.
  jest.setTimeout(900_000);

  let wallet: Wallet;
  let aliceAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;
  let aztecNode: AztecNode;
  const coinbase = EthAddress.random();

  const t = new FeesTest('failures', 3, { coinbase });

  beforeAll(async () => {
    // Shorter epochs (default 32 → 4) speed the per-test `advanceToNextEpoch + waitForProven`
    // cycle: the prover-node submits a proof as soon as the epoch is complete, so ~8x shorter
    // epochs ≈ ~8x faster proof cadence per cycle. Setup itself stays slot-bound.
    await t.setup({ ...PIPELINING_SETUP_OPTS, aztecProofSubmissionEpochs: 640, aztecEpochDuration: 4 });
    await t.applyFPCSetup();
    ({ wallet, aliceAddress, sequencerAddress, bananaCoin, bananaFPC, gasSettings } = t);
    await ensureAuthRegistryPublished(wallet, aliceAddress);
    aztecNode = t.aztecNode;

    // Prove up until the current state by advancing the epoch and waiting for the prover node.
    await t.cheatCodes.rollup.advanceToNextEpoch();
    await t.catchUpProvenChain();
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Submits a tx that reverts in public app logic while using the private FPC path. Asserts that the
  // fee is still paid from the FPC's gas balance, Alice gets a banana refund note, and the sequencer
  // reward on L1 equals the fee minus prover fee and burn after the epoch is proven.
  it('reverts transactions but still pays fees using PrivateFeePaymentMethod', async () => {
    const outrageousPublicAmountAliceDoesNotHave = t.ALICE_INITIAL_BANANAS * 5n;
    const privateMintedAlicePrivateBananas = t.ALICE_INITIAL_BANANAS;

    const [initialAlicePrivateBananas] = await t.getBananaPrivateBalanceFn(aliceAddress, sequencerAddress);
    const [initialFPCPublicBananas] = await t.getBananaPublicBalanceFn(bananaFPC.address);

    await t.mintPrivateBananas(privateMintedAlicePrivateBananas, aliceAddress);
    // Catch the initial balances after the mint above, which costs gas.
    const [initialAliceGas, initialFPCGas] = await t.getGasBalanceFn(aliceAddress, bananaFPC.address);

    // if we simulate locally, it throws an error
    await expect(
      bananaCoin.methods
        // still use a public transfer so as to fail in the public app logic phase
        .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
        .simulate({
          from: aliceAddress,
          fee: {
            gasSettings,
            paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
          },
        }),
    ).rejects.toThrow(U128_UNDERFLOW_ERROR);

    // we did not pay the fee, because we did not submit the TX
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [initialAlicePrivateBananas + privateMintedAlicePrivateBananas],
    );
    await expectMapping(t.getGasBalanceFn, [aliceAddress, bananaFPC.address], [initialAliceGas, initialFPCGas]);

    // We wait until the proven chain is caught up so all previous fees are paid out.
    // REFACTOR: manual advanceToNextEpoch + catchUpProvenChain sequence; replace with a single
    // waitForEpochProven() helper on FeesTest that encapsulates this pattern.
    await t.cheatCodes.rollup.advanceToNextEpoch();
    await t.catchUpProvenChain();

    const currentSequencerRewards = await t.getCoinbaseSequencerRewards();
    const provenCheckpointBefore = await t.rollupContract.getProvenCheckpointNumber();

    const { receipt: txReceipt } = await bananaCoin.methods
      .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PrivateFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
        },
        wait: { dontThrowOnRevert: true },
      });

    expect(txReceipt.executionResult).toBe(TxExecutionResult.REVERTED);

    const { sequencerBlockRewards } = await t.getBlockRewards();

    // @note There is a potential race condition here if other tests send transactions that get into the same
    // epoch and thereby pays out fees at the same time (when proven).
    await t.cheatCodes.rollup.advanceToNextEpoch();
    const provenTimeout =
      (t.context.config.aztecProofSubmissionEpochs + 1) *
      t.context.config.aztecEpochDuration *
      t.context.config.aztecSlotDuration;
    await waitForProven(aztecNode, txReceipt, { provenTimeout });

    // Under pipelining, multiple empty checkpoints can land and prove between the snapshot and waitForProven;
    // each one contributes a block reward to the coinbase, so multiply by the actual proven-checkpoint delta.
    const provenCheckpointAfter = await t.rollupContract.getProvenCheckpointNumber();
    const newlyProvenCheckpoints = BigInt(provenCheckpointAfter - provenCheckpointBefore);

    const feeAmount = txReceipt.transactionFee!;
    const expectedProverFee = await t.getCommittedProverFee(txReceipt.blockNumber!);
    const expectedBurn = await t.getCommittedBurn(txReceipt.blockNumber!);
    const newSequencerRewards = await t.getCoinbaseSequencerRewards();
    expect(newSequencerRewards).toEqual(
      currentSequencerRewards +
        newlyProvenCheckpoints * sequencerBlockRewards +
        feeAmount -
        expectedBurn -
        expectedProverFee,
    );

    // and thus we paid the fee
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress],
      [
        // Even with the revert public teardown function got successfully executed so Alice received the refund note
        // and hence paid the actual fee.
        initialAlicePrivateBananas + privateMintedAlicePrivateBananas - feeAmount,
      ],
    );

    // FPC should have received the fee in public
    await expect(t.getBananaPublicBalanceFn(t.bananaFPC.address)).resolves.toEqual([
      initialFPCPublicBananas + feeAmount,
    ]);

    // Gas balance of Alice should have stayed the same as the FPC paid the gas fee and not her (she paid bananas
    // to FPC admin).
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address],
      [initialAliceGas, initialFPCGas - feeAmount],
    );
  });

  // Same as above but using the public FPC path. Verifies the public banana balances are updated
  // correctly for Alice and the FPC even when the app logic transfer reverts.
  it('reverts transactions but still pays fees using PublicFeePaymentMethod', async () => {
    const outrageousPublicAmountAliceDoesNotHave = t.ALICE_INITIAL_BANANAS * 5n;
    const publicMintedAlicePublicBananas = t.ALICE_INITIAL_BANANAS;

    const [initialAlicePrivateBananas, initialSequencerPrivateBananas] = await t.getBananaPrivateBalanceFn(
      aliceAddress,
      sequencerAddress,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.getBananaPublicBalanceFn(
      aliceAddress,
      bananaFPC.address,
    );

    await bananaCoin.methods.mint_to_public(aliceAddress, publicMintedAlicePublicBananas).send({ from: aliceAddress });

    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.getGasBalanceFn(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    // if we simulate locally, it throws an error
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
        .simulate({
          from: aliceAddress,
          fee: {
            paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
          },
        }),
    ).rejects.toThrow(U128_UNDERFLOW_ERROR);

    // we did not pay the fee, because we did not submit the TX
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + publicMintedAlicePublicBananas, initialFPCPublicBananas, 0n],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas, initialSequencerGas],
    );

    // if we skip simulation, it includes the failed TX
    const { receipt: txReceipt } = await bananaCoin.methods
      .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
        },
        wait: { dontThrowOnRevert: true },
      });

    expect(txReceipt.executionResult).toBe(TxExecutionResult.REVERTED);
    const feeAmount = txReceipt.transactionFee!;

    // and thus we paid the fee
    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePublicBananas + publicMintedAlicePublicBananas - feeAmount, initialFPCPublicBananas + feeAmount, 0n],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - feeAmount, initialSequencerGas],
    );
  });

  // A tx whose fee-payment setup phase (BuggedSetupFeePaymentMethod) demands more than maxFee causes
  // both local simulation and the sequencer to reject the tx outright — the tx is never included.
  it('fails transaction that error in setup', async () => {
    const OutrageousPublicAmountAliceDoesNotHave = BigInt(100e12);

    // simulation throws an error when setup fails
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .simulate({
          from: aliceAddress,
          fee: {
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
          },
        }),
    ).rejects.toThrow(/\[SETUP\] UNRECOVERABLE ERROR/);

    // so does the sequencer
    await expect(
      bananaCoin.methods
        .transfer_in_public(aliceAddress, sequencerAddress, OutrageousPublicAmountAliceDoesNotHave, 0)
        .send({
          from: aliceAddress,
          fee: {
            paymentMethod: new BuggedSetupFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
          },
        }),
    ).rejects.toThrow(/Transaction (0x)?[0-9a-fA-F]{64} was dropped/i);
  });

  // A tx whose teardown gas limit is zero (BuggedTeardownFeePaymentMethod) reverts in teardown but
  // is still included in a block. Asserts the tx revert code is REVERTED, Alice was charged up to the
  // fee limit in setup, and the epoch can still be proven after the revert.
  it('includes transaction that error in teardown', async () => {
    /**
     * We trigger an error in teardown by having the "FPC" call a function that reverts.
     */
    const publicMintedAlicePublicBananas = 100_000_000_000n;

    const [initialAlicePrivateBananas, initialSequencerPrivateBananas] = await t.getBananaPrivateBalanceFn(
      aliceAddress,
      sequencerAddress,
    );
    const [initialAlicePublicBananas, initialFPCPublicBananas] = await t.getBananaPublicBalanceFn(
      aliceAddress,
      bananaFPC.address,
    );

    await bananaCoin.methods.mint_to_public(aliceAddress, publicMintedAlicePublicBananas).send({ from: aliceAddress });

    const [initialAliceGas, initialFPCGas, initialSequencerGas] = await t.getGasBalanceFn(
      aliceAddress,
      bananaFPC.address,
      sequencerAddress,
    );

    const badGas = GasSettings.from({
      ...gasSettings,
      teardownGasLimits: Gas.empty(),
    });

    await expect(
      bananaCoin.methods
        .mint_to_public(aliceAddress, 1n) // random operation
        .simulate({
          from: aliceAddress,
          fee: {
            paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, badGas),
          },
        }),
    ).rejects.toThrow();

    const { receipt } = await bananaCoin.methods
      .mint_to_public(aliceAddress, 1n) // random operation
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new PublicFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, badGas),
        },
        wait: { dontThrowOnRevert: true },
      });
    expect(receipt.executionResult).toEqual(TxExecutionResult.REVERTED);
    expect(receipt.transactionFee).toBeGreaterThan(0n);

    await expectMapping(
      t.getBananaPrivateBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAlicePrivateBananas, 0n, initialSequencerPrivateBananas],
    );
    // Since setup went through, Alice transferred to the FPC
    await expectMapping(
      t.getBananaPublicBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [
        initialAlicePublicBananas + publicMintedAlicePublicBananas - badGas.getFeeLimit().toBigInt(),
        initialFPCPublicBananas + badGas.getFeeLimit().toBigInt(),
        0n,
      ],
    );
    await expectMapping(
      t.getGasBalanceFn,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [initialAliceGas, initialFPCGas - receipt.transactionFee!, initialSequencerGas],
    );

    // Prove the block containing the teardown-reverted tx (revert_code = 2).
    await t.cheatCodes.rollup.advanceToNextEpoch();
    const provenTimeout =
      (t.context.config.aztecProofSubmissionEpochs + 1) *
      t.context.config.aztecEpochDuration *
      t.context.config.aztecSlotDuration;
    await waitForProven(aztecNode, receipt, { provenTimeout });
  });

  // Sends a tx that reverts in both app logic and teardown, then advances the epoch and waits for
  // the block to be proven. Ensures a double-revert tx can be proven without hanging the prover.
  it('proves transaction where both app logic and teardown revert', async () => {
    const outrageousPublicAmountAliceDoesNotHave = t.ALICE_INITIAL_BANANAS * 5n;

    // Send a tx that will revert in BOTH app logic and teardown.
    const { receipt } = await bananaCoin.methods
      .transfer_in_public(aliceAddress, sequencerAddress, outrageousPublicAmountAliceDoesNotHave, 0)
      .send({
        from: aliceAddress,
        fee: {
          paymentMethod: new BuggedTeardownFeePaymentMethod(bananaFPC.address, aliceAddress, wallet, gasSettings),
        },
        wait: { dontThrowOnRevert: true },
      });

    expect(receipt.executionResult).toBe(TxExecutionResult.REVERTED);
    expect(receipt.transactionFee).toBeGreaterThan(0n);

    await t.cheatCodes.rollup.advanceToNextEpoch();
    const provenTimeout =
      (t.context.config.aztecProofSubmissionEpochs + 1) *
      t.context.config.aztecEpochDuration *
      t.context.config.aztecSlotDuration;
    await waitForProven(aztecNode, receipt, { provenTimeout });
  });
});

/**
 * Fee payment method whose teardown always reverts because max_fee is set to 0.
 * The FPC's _pay_refund will assert `0 >= actual_fee` which always fails since actual_fee > 0.
 * The setup transfer of 0 tokens succeeds (and the authwit matches the 0 amount).
 */
class BuggedTeardownFeePaymentMethod extends PublicFeePaymentMethod {
  override async getExecutionPayload(): Promise<ExecutionPayload> {
    const zeroFee = new Fr(0n);
    const authwitNonce = Fr.random();

    const asset = await this.getAsset();

    // Authorize the FPC to transfer 0 tokens (matches the 0 max_fee we'll pass).
    const setPublicAuthWitInteraction = await SetPublicAuthwitContractInteraction.create(
      this.wallet,
      this.sender,
      {
        caller: this.paymentContract,
        call: FunctionCall.from({
          name: 'transfer_in_public',
          to: asset,
          selector: await FunctionSelector.fromSignature('transfer_in_public((Field),(Field),u128,Field)'),
          type: FunctionType.PUBLIC,
          hideMsgSender: false,
          isStatic: false,
          args: [this.sender.toField(), this.paymentContract.toField(), zeroFee, authwitNonce],
          returnTypes: [],
        }),
      },
      true,
    );

    return new ExecutionPayload(
      [
        ...(await setPublicAuthWitInteraction.request()).calls,
        FunctionCall.from({
          name: 'fee_entrypoint_public',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('fee_entrypoint_public(u128,Field)'),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [zeroFee, authwitNonce],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.paymentContract,
    );
  }
}

class BuggedSetupFeePaymentMethod extends PublicFeePaymentMethod {
  override async getExecutionPayload(): Promise<ExecutionPayload> {
    const maxFee = this.gasSettings.getFeeLimit();
    const authwitNonce = Fr.random();

    const tooMuchFee = new Fr(maxFee.toBigInt() * 2n);

    const asset = await this.getAsset();

    const setPublicAuthWitInteraction = await SetPublicAuthwitContractInteraction.create(
      this.wallet,
      this.sender,
      {
        caller: this.paymentContract,
        call: FunctionCall.from({
          name: 'transfer_in_public',
          to: asset,
          selector: await FunctionSelector.fromSignature('transfer_in_public((Field),(Field),u128,Field)'),
          type: FunctionType.PUBLIC,
          hideMsgSender: false /** the target function performs an authwit, so msg_sender is needed */,
          isStatic: false,
          args: [this.sender.toField(), this.paymentContract.toField(), maxFee, authwitNonce],
          returnTypes: [],
        }),
      },
      true,
    );

    return new ExecutionPayload(
      [
        ...(await setPublicAuthWitInteraction.request()).calls,
        FunctionCall.from({
          name: 'fee_entrypoint_public',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('fee_entrypoint_public(u128,Field)'),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [tooMuchFee, authwitNonce],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.paymentContract, // feePayer
    );
  }
}
