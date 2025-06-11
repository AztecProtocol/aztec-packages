import { BatchCall, Fr, type PXE, type Wallet } from '@aztec/aztec.js';
import { AuthContract } from '@aztec/noir-contracts.js/Auth';
import { StateVarsContract } from '@aztec/noir-test-contracts.js/StateVars';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 180_000;

describe('e2e_state_vars', () => {
  jest.setTimeout(TIMEOUT);

  let pxe: PXE;
  let wallet: Wallet;

  let teardown: () => Promise<void>;
  let contract: StateVarsContract;

  const VALUE = 2n;
  const RANDOMNESS = 2n;

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup(2));
    contract = await StateVarsContract.deploy(wallet).send().deployed();
  });

  afterAll(() => teardown());

  describe('PublicImmutable', () => {
    it('private read of uninitialized PublicImmutable', async () => {
      const s = await contract.methods.get_public_immutable().simulate();

      // Send the transaction and wait for it to be mined (wait function throws if the tx is not mined)
      await contract.methods.match_public_immutable(s.account, s.value).send().wait();
    });

    it('initialize and read PublicImmutable', async () => {
      // Initializes the public immutable and then reads the value using a utility  function
      // checking the return values:

      await contract.methods.initialize_public_immutable(1).send().wait();

      const read = await contract.methods.get_public_immutable().simulate();

      expect(read).toEqual({ account: wallet.getAddress(), value: read.value });
    });

    it('private read of PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained private function that reads it directly
      // 2. A constrained private function that calls another private function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = await new BatchCall(wallet, [
        contract.methods.get_public_immutable_constrained_private(),
        contract.methods.get_public_immutable_constrained_private_indirect(),
        contract.methods.get_public_immutable(),
      ]).simulate();

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, value: c.value + 1n });
      await contract.methods.match_public_immutable(c.account, c.value).send().wait();
    });

    it('public read of PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained public function that reads it directly
      // 2. A constrained public function that calls another public function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = await new BatchCall(wallet, [
        contract.methods.get_public_immutable_constrained_public(),
        contract.methods.get_public_immutable_constrained_public_indirect(),
        contract.methods.get_public_immutable(),
      ]).simulate();

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, value: c.value + 1n });

      await contract.methods.match_public_immutable(c.account, c.value).send().wait();
    });

    it('public multiread of PublicImmutable', async () => {
      // Reads the value using a utility function checking the return values with:
      // 1. A constrained public function that reads 5 times directly (going beyond the previous 4 Field return value)

      const a = await contract.methods.get_public_immutable_constrained_public_multiple().simulate();
      const c = await contract.methods.get_public_immutable().simulate();

      expect(a).toEqual([c, c, c, c, c]);
    });

    it('initializing PublicImmutable the second time should fail', async () => {
      // Jest executes the tests sequentially and the first call to initialize_public_immutable was executed
      // in the previous test, so the call below should fail.
      await expect(contract.methods.initialize_public_immutable(1).simulate()).rejects.toThrow(
        'Attempted to emit duplicate nullifier',
      );
    });
  });

  describe('PrivateMutable', () => {
    it('fail to read uninitialized PrivateMutable', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(false);
      await expect(contract.methods.get_private_mutable().simulate()).rejects.toThrow();
    });

    it('initialize PrivateMutable', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(false);
      // Send the transaction and wait for it to be mined (wait function throws if the tx is not mined)
      const receipt = await contract.methods.initialize_private(RANDOMNESS, VALUE).send().wait();

      const txEffects = await pxe.getTxEffect(receipt.txHash);

      // 1 for the tx, another for the initializer
      expect(txEffects?.data.nullifiers.length).toEqual(2);
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
      await expect(contract.methods.initialize_private(RANDOMNESS, VALUE).send().wait()).rejects.toThrow();
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
    });

    it('read initialized PrivateMutable', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
      const { value, owner } = await contract.methods.get_private_mutable().simulate();
      expect(value).toEqual(VALUE);
      expect(owner).toEqual(wallet.getAddress());
    });

    it('replace with same value', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
      const noteBefore = await contract.methods.get_private_mutable().simulate();
      const receipt = await contract.methods.update_private_mutable(RANDOMNESS, VALUE).send().wait();

      const txEffects = await pxe.getTxEffect(receipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const noteAfter = await contract.methods.get_private_mutable().simulate();

      expect(noteBefore.owner).toEqual(noteAfter.owner);
      expect(noteBefore.value).toEqual(noteAfter.value);
    });

    it('replace PrivateMutable with other values', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
      const receipt = await contract.methods
        .update_private_mutable(RANDOMNESS + 2n, VALUE + 1n)
        .send()
        .wait();

      const txEffects = await pxe.getTxEffect(receipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const { value, owner } = await contract.methods.get_private_mutable().simulate();
      expect(value).toEqual(VALUE + 1n);
      expect(owner).toEqual(wallet.getAddress());
    });

    it('replace PrivateMutable dependent on prior value', async () => {
      expect(await contract.methods.is_private_mutable_initialized().simulate()).toEqual(true);
      const noteBefore = await contract.methods.get_private_mutable().simulate();
      const receipt = await contract.methods.increase_private_value().send().wait();

      const txEffects = await pxe.getTxEffect(receipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(txEffects?.data.nullifiers.length).toEqual(2);

      const { value, owner } = await contract.methods.get_private_mutable().simulate();
      expect(value).toEqual(noteBefore.value + 1n);
      expect(owner).toEqual(wallet.getAddress());
    });
  });

  describe('PrivateImmutable', () => {
    it('fail to read uninitialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(false);
      await expect(contract.methods.view_private_immutable().simulate()).rejects.toThrow();
    });

    it('initialize PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(false);
      const receipt = await contract.methods.initialize_private_immutable(RANDOMNESS, VALUE).send().wait();

      const txEffects = await pxe.getTxEffect(receipt.txHash);

      expect(txEffects?.data.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the initializer
      expect(txEffects?.data.nullifiers.length).toEqual(2);
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
      await expect(contract.methods.initialize_private_immutable(RANDOMNESS, VALUE).send().wait()).rejects.toThrow();
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
    });

    it('read initialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
      const { value, owner } = await contract.methods.view_private_immutable().simulate();
      expect(value).toEqual(VALUE);
      expect(owner).toEqual(wallet.getAddress());
    });
  });

  describe('SharedMutable', () => {
    let authContract: AuthContract;

    const delay = async (blocks: number) => {
      for (let i = 0; i < blocks; i++) {
        await authContract.methods.get_authorized().send().wait();
      }
    };

    beforeAll(async () => {
      // We use the auth contract here because has a nice, clear, simple implementation of Shared Mutable
      authContract = await AuthContract.deploy(wallet, wallet.getAddress()).send().deployed();
    });

    it('sets the include by timestamp property', async () => {
      // We change the SharedMutable authorized delay here to 2, this means that a change to the "authorized" value can
      // only be applied 2 blocks after it is initiated, and thus read requests on a historical state without an
      // initiated change is valid for at least 2 blocks.
      await authContract.methods.set_authorized_delay(2).send().wait();

      // Note: Because we are decreasing the delay, we must first wait for the full previous delay - 1 (5 -1).
      await delay(4);

      const expectedModifiedIncludeByTimestamp = (await pxe.getBlockNumber()) + 2;

      // We now call our AuthContract to see if the change in include by timestamp has reflected our delay change
      const tx = await authContract.methods.get_authorized_in_private().prove();

      // The validity of our SharedMutable read request should be limited to 2 blocks
      expect(tx.data.rollupValidationRequests.includeByTimestamp.isSome).toEqual(true);
      expect(tx.data.rollupValidationRequests.includeByTimestamp.value).toEqual(
        new Fr(expectedModifiedIncludeByTimestamp),
      );
    });
  });
});
