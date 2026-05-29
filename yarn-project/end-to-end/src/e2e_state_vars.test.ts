import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { AuthContract } from '@aztec/noir-contracts.js/Auth';
import { StateVarsContract } from '@aztec/noir-test-contracts.js/StateVars';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 300_000;

describe('e2e_state_vars', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;

  let teardown: () => Promise<void>;
  let contract: StateVarsContract;

  const VALUE = 2n;
  const RANDOMNESS = 2n;

  beforeAll(async () => {
    ({
      teardown,
      aztecNode,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    ({ contract } = await StateVarsContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  describe('PublicImmutable', () => {
    it('private read of uninitialized PublicImmutable should fail', async () => {
      await expect(
        contract.methods.get_public_immutable_constrained_private().simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow('Trying to read from uninitialized PublicImmutable');
    });

    it('initialize and read PublicImmutable', async () => {
      // Initializes the public immutable and then reads the value using a utility  function
      // checking the return values:

      await contract.methods.initialize_public_immutable(1).send({ from: defaultAccountAddress });

      const { result: read } = await contract.methods.get_public_immutable().simulate({ from: defaultAccountAddress });

      expect(read).toEqual({ account: defaultAccountAddress, value: read.value });
    });

    it('private read of initialized PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained private function that reads it directly
      // 2. A constrained private function that calls another private function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = (
        await new BatchCall(wallet, [
          contract.methods.get_public_immutable_constrained_private(),
          contract.methods.get_public_immutable_constrained_private_indirect(),
          contract.methods.get_public_immutable(),
        ]).simulate({ from: defaultAccountAddress })
      ).result.map((r: any) => r.result);

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, value: c.value + 1n });
      await contract.methods.match_public_immutable(c.account, c.value).send({ from: defaultAccountAddress });
    });

    it('public read of PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained public function that reads it directly
      // 2. A constrained public function that calls another public function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = (
        await new BatchCall(wallet, [
          contract.methods.get_public_immutable_constrained_public(),
          contract.methods.get_public_immutable_constrained_public_indirect(),
          contract.methods.get_public_immutable(),
        ]).simulate({ from: defaultAccountAddress })
      ).result.map((r: any) => r.result);

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, value: c.value + 1n });

      await contract.methods.match_public_immutable(c.account, c.value).send({ from: defaultAccountAddress });
    });

    it('public multiread of PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained public function that reads 5 times directly (going beyond the previous 4 Field return value)

      const { result: a } = await contract.methods
        .get_public_immutable_constrained_public_multiple()
        .simulate({ from: defaultAccountAddress });
      const { result: c } = await contract.methods.get_public_immutable().simulate({ from: defaultAccountAddress });

      expect(a).toEqual([c, c, c, c, c]);
    });

    it('initializing PublicImmutable the second time should fail', async () => {
      // Jest executes the tests sequentially and the first call to initialize_public_immutable was executed
      // in the previous test, so the call below should fail.
      await expect(
        contract.methods.initialize_public_immutable(1).simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow('Attempted to emit duplicate nullifier');
    });
  });

  describe('PrivateMutable', () => {
    it('fail to read uninitialized PrivateMutable', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(false);
      await expect(
        contract.methods.get_private_mutable(defaultAccountAddress).simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow();
    });

    it('initialize PrivateMutable', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(false);
      // Send the transaction and wait for it to be mined (wait function throws if the tx is not mined)
      const { receipt: txReceipt } = await contract.methods
        .initialize_private(RANDOMNESS, VALUE)
        .send({ from: defaultAccountAddress });

      const txEffects = await aztecNode.getTxEffect(txReceipt.txHash);

      // 1 for the tx, another for the initializer
      expect(txEffects?.data.nullifiers.length).toEqual(2);
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      await expect(
        contract.methods.initialize_private(RANDOMNESS, VALUE).send({ from: defaultAccountAddress }),
      ).rejects.toThrow();
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
    });

    it('read initialized PrivateMutable', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      const {
        result: { value },
      } = await contract.methods.get_private_mutable(defaultAccountAddress).simulate({ from: defaultAccountAddress });
      expect(value).toEqual(VALUE);
    });

    it('replace with same value', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      const { result: noteBefore } = await contract.methods
        .get_private_mutable(defaultAccountAddress)
        .simulate({ from: defaultAccountAddress });
      const { receipt: txReceipt } = await contract.methods
        .update_private_mutable(RANDOMNESS, VALUE)
        .send({ from: defaultAccountAddress });

      const txEffects = await aztecNode.getTxEffect(txReceipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const { result: noteAfter } = await contract.methods
        .get_private_mutable(defaultAccountAddress)
        .simulate({ from: defaultAccountAddress });

      expect(noteBefore.value).toEqual(noteAfter.value);
    });

    it('replace PrivateMutable with other values', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      const { receipt: txReceipt } = await contract.methods
        .update_private_mutable(RANDOMNESS + 2n, VALUE + 1n)
        .send({ from: defaultAccountAddress });

      const txEffects = await aztecNode.getTxEffect(txReceipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const {
        result: { value },
      } = await contract.methods.get_private_mutable(defaultAccountAddress).simulate({ from: defaultAccountAddress });
      expect(value).toEqual(VALUE + 1n);
    });

    it('replace PrivateMutable dependent on prior value', async () => {
      expect(
        (
          await contract.methods
            .is_private_mutable_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      const { result: noteBefore } = await contract.methods
        .get_private_mutable(defaultAccountAddress)
        .simulate({ from: defaultAccountAddress });
      const { receipt: txReceipt } = await contract.methods
        .increase_private_value()
        .send({ from: defaultAccountAddress });

      const txEffects = await aztecNode.getTxEffect(txReceipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const {
        result: { value },
      } = await contract.methods.get_private_mutable(defaultAccountAddress).simulate({ from: defaultAccountAddress });
      expect(value).toEqual(noteBefore.value + 1n);
    });
  });

  describe('PrivateImmutable', () => {
    it('fail to read uninitialized PrivateImmutable', async () => {
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(false);
      await expect(
        contract.methods.view_private_immutable(defaultAccountAddress).simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow();
    });

    it('initialize PrivateImmutable', async () => {
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(false);
      const { receipt: txReceipt } = await contract.methods
        .initialize_private_immutable(RANDOMNESS, VALUE)
        .send({ from: defaultAccountAddress });

      const txEffects = await aztecNode.getTxEffect(txReceipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the initializer
      expect(txEffects?.data.nullifiers.length).toEqual(2);
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      await expect(
        contract.methods.initialize_private_immutable(RANDOMNESS, VALUE).send({ from: defaultAccountAddress }),
      ).rejects.toThrow();
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
    });

    it('read initialized PrivateImmutable', async () => {
      expect(
        (
          await contract.methods
            .is_priv_imm_initialized(defaultAccountAddress)
            .simulate({ from: defaultAccountAddress })
        ).result,
      ).toEqual(true);
      const {
        result: { value },
      } = await contract.methods
        .view_private_immutable(defaultAccountAddress)
        .simulate({ from: defaultAccountAddress });
      expect(value).toEqual(VALUE);
    });
  });

  describe('DelayedPublicMutable', () => {
    let authContract: AuthContract;

    const aztecSlotDuration = DefaultL1ContractsConfig.aztecSlotDuration;

    beforeAll(async () => {
      // We use the auth contract here because has a nice, clear, simple implementation of Delayed Public Mutable
      ({ contract: authContract } = await AuthContract.deploy(wallet, defaultAccountAddress).send({
        from: defaultAccountAddress,
      }));

      if (aztecSlotDuration !== 72) {
        throw new Error(
          'Aztec slot duration changed and this will break this test. Update CHANGE_AUTHORIZED_DELAY constant in the Auth contract to be 5 slots again.',
        );
      }
    });

    it('sets the expiration timestamp property', async () => {
      // Mirrors CHANGE_AUTHORIZED_DELAY in noir-contracts/contracts/app/auth_contract/src/main.nr.
      const oldDelay = 360n;
      const newDelay = BigInt(aztecSlotDuration * 2);
      // We change the DelayedPublicMutable authorized delay here to 2 slots, this means that a change to the "authorized"
      // value can only be applied 2 slots after it is initiated, and thus read requests on a historical state without
      // an initiated change is valid for at least 2 slots.
      const setDelayResult = await authContract.methods
        .set_authorized_delay(newDelay)
        .send({ from: defaultAccountAddress });
      const setDelayBlockNumber = setDelayResult.receipt.blockNumber;
      if (setDelayBlockNumber === undefined) {
        throw new Error('set_authorized_delay tx did not return a block number');
      }
      const setDelayBlock = await aztecNode.getBlockData(setDelayBlockNumber);
      // When *decreasing* the delay, ScheduledDelayChange::schedule_change sets the scheduled
      // timestamp_of_change to `current_timestamp + (oldDelay - newDelay)` — not `current_timestamp + oldDelay`.
      // See noir-protocol-circuits/crates/types/src/delayed_public_mutable/scheduled_delay_change.nr.
      const timestampOfChange = setDelayBlock!.header.globalVariables.timestamp + (oldDelay - newDelay);

      // Advance the chain until the scheduled timestamp_of_change has been reached, so any future
      // anchor block falls in the "post" branch of get_effective_minimum_delay_at and the effective
      // delay equals newDelay - 1 (not the larger time_until_delay_change + newDelay - 1). We send
      // no-op txs to push fresh blocks rather than relying on wall-clock time: the e2e fixture
      // forces aztecSlotDuration=12s under pipelining (see fixtures/setup.ts), so a fixed
      // `delay(N blocks)` cannot count for the schedule — block timestamp polling is the
      // slot-duration-agnostic way to know we have crossed the schedule.
      while ((await aztecNode.getBlockData('latest'))!.header.globalVariables.timestamp < timestampOfChange) {
        await authContract.methods.get_authorized().send({ from: defaultAccountAddress });
      }

      // We now call our AuthContract to see if the change in expiration timestamp has reflected our delay change.
      // expirationTimestamp is `anchor.timestamp + effective_minimum_delay`, where the anchor is the
      // historical header the PXE pinned at the start of proveTx. Compare directly against that anchor
      // so the assertion isn't flaky against chain drift between the "latest" snapshot and proveTx's own sync.
      const tx = await proveInteraction(wallet, authContract.methods.get_authorized_in_private(), {
        from: defaultAccountAddress,
      });

      const anchorTimestamp = tx.data.constants.anchorBlockHeader.globalVariables.timestamp;
      expect(tx.data.expirationTimestamp).toEqual(anchorTimestamp + newDelay - 1n);
    });
  });
});
