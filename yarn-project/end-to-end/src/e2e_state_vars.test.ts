import { BatchCall, Fr, type PXE, type Wallet } from '@aztec/aztec.js';
import { AuthContract, DocsExampleContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 180_000;

describe('e2e_state_vars', () => {
  jest.setTimeout(TIMEOUT);

  let pxe: PXE;
  let wallet: Wallet;

  let teardown: () => Promise<void>;
  let contract: DocsExampleContract;

  const POINTS = 1n;
  const RANDOMNESS = 2n;

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup(2));
    contract = await DocsExampleContract.deploy(wallet).send().deployed();
  });

  afterAll(() => teardown());

  describe('PublicImmutable', () => {
    it('private read of uninitialized PublicImmutable', async () => {
      const s = await contract.methods.get_public_immutable().simulate();

      // Send the transaction and wait for it to be mined (wait function throws if the tx is not mined)
      await contract.methods.match_public_immutable(s.account, s.points).send().wait();
    });

    it('initialize and read PublicImmutable', async () => {
      // Initializes the public immutable and then reads the value using an unconstrained function
      // checking the return values:

      await contract.methods.initialize_public_immutable(1).send().wait();

      const read = await contract.methods.get_public_immutable().simulate();

      expect(read).toEqual({ account: wallet.getAddress(), points: read.points });
    });

    it('private read of PublicImmutable', async () => {
      // Reads the value using an unconstrained function checking the return values with:
      // 1. A constrained private function that reads it directly
      // 2. A constrained private function that calls another private function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = await new BatchCall(wallet, [
        contract.methods.get_public_immutable_constrained_private().request(),
        contract.methods.get_public_immutable_constrained_private_indirect().request(),
        contract.methods.get_public_immutable().request(),
      ]).simulate();

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, points: c.points + 1n });
      await contract.methods.match_public_immutable(c.account, c.points).send().wait();
    });

    it('public read of PublicImmutable', async () => {
      // Reads the value using an unconstrained function checking the return values with:
      // 1. A constrained public function that reads it directly
      // 2. A constrained public function that calls another public function that reads.
      //    The indirect, adds 1 to the point to ensure that we are returning the correct value.

      const [a, b, c] = await new BatchCall(wallet, [
        contract.methods.get_public_immutable_constrained_public().request(),
        contract.methods.get_public_immutable_constrained_public_indirect().request(),
        contract.methods.get_public_immutable().request(),
      ]).simulate();

      expect(a).toEqual(c);
      expect(b).toEqual({ account: c.account, points: c.points + 1n });

      await contract.methods.match_public_immutable(c.account, c.points).send().wait();
    });

    it('public multiread of PublicImmutable', async () => {
      // Reads the value using an unconstrained function checking the return values with:
      // 1. A constrained public function that reads 5 times directly (going beyond the previous 4 Field return value)

      const a = await contract.methods.get_public_immutable_constrained_public_multiple().simulate();
      const c = await contract.methods.get_public_immutable().simulate();

      expect(a).toEqual([c, c, c, c, c]);
    });

    it('initializing PublicImmutable the second time should fail', async () => {
      // Jest executes the tests sequentially and the first call to initialize_public_immutable was executed
      // in the previous test, so the call below should fail.
      await expect(contract.methods.initialize_public_immutable(1).prove()).rejects.toThrow(
        'Assertion failed: PublicImmutable already initialized',
      );
    });
  });

  describe('PrivateMutable', () => {
    it('fail to read uninitialized PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(false);
      await expect(contract.methods.get_legendary_card().simulate()).rejects.toThrow();
    });

    it('initialize PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(false);
      // Send the transaction and wait for it to be mined (wait function throws if the tx is not mined)
      const { debugInfo } = await contract.methods.initialize_private(RANDOMNESS, POINTS).send().wait({ debug: true });

      // 1 for the tx, another for the initializer
      expect(debugInfo!.nullifiers.length).toEqual(2);
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
      await expect(contract.methods.initialize_private(RANDOMNESS, POINTS).send().wait()).rejects.toThrow();
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
    });

    it('read initialized PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
      const { points, randomness } = await contract.methods.get_legendary_card().simulate();
      expect(points).toEqual(POINTS);
      expect(randomness).toEqual(RANDOMNESS);
    });

    it('replace with same value', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
      const noteBefore = await contract.methods.get_legendary_card().simulate();
      const { debugInfo } = await contract.methods
        .update_legendary_card(RANDOMNESS, POINTS)
        .send()
        .wait({ debug: true });

      expect(debugInfo!.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(debugInfo!.nullifiers.length).toEqual(2);

      const noteAfter = await contract.methods.get_legendary_card().simulate();

      expect(noteBefore.owner).toEqual(noteAfter.owner);
      expect(noteBefore.points).toEqual(noteAfter.points);
      expect(noteBefore.randomness).toEqual(noteAfter.randomness);
      expect(noteBefore.header.contract_address).toEqual(noteAfter.header.contract_address);
      expect(noteBefore.header.storage_slot).toEqual(noteAfter.header.storage_slot);
      expect(noteBefore.header.note_hash_counter).toEqual(noteAfter.header.note_hash_counter);
      // !!! Nonce must be different
      expect(noteBefore.header.nonce).not.toEqual(noteAfter.header.nonce);
    });

    it('replace PrivateMutable with other values', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
      const { debugInfo } = await contract.methods
        .update_legendary_card(RANDOMNESS + 2n, POINTS + 1n)
        .send()
        .wait({ debug: true });

      expect(debugInfo!.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(debugInfo!.nullifiers.length).toEqual(2);

      const { points, randomness } = await contract.methods.get_legendary_card().simulate();
      expect(points).toEqual(POINTS + 1n);
      expect(randomness).toEqual(RANDOMNESS + 2n);
    });

    it('replace PrivateMutable dependent on prior value', async () => {
      expect(await contract.methods.is_legendary_initialized().simulate()).toEqual(true);
      const noteBefore = await contract.methods.get_legendary_card().simulate();
      const { debugInfo } = await contract.methods.increase_legendary_points().send().wait({ debug: true });

      expect(debugInfo!.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(debugInfo!.nullifiers.length).toEqual(2);

      const { points, randomness } = await contract.methods.get_legendary_card().simulate();
      expect(points).toEqual(noteBefore.points + 1n);
      expect(randomness).toEqual(noteBefore.randomness);
    });
  });

  describe('PrivateImmutable', () => {
    it('fail to read uninitialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(false);
      await expect(contract.methods.view_imm_card().simulate()).rejects.toThrow();
    });

    it('initialize PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(false);
      const { debugInfo } = await contract.methods
        .initialize_private_immutable(RANDOMNESS, POINTS)
        .send()
        .wait({ debug: true });

      expect(debugInfo!.noteHashes.length).toEqual(1);
      // 1 for the tx, another for the initializer
      expect(debugInfo!.nullifiers.length).toEqual(2);
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
      await expect(contract.methods.initialize_private_immutable(RANDOMNESS, POINTS).send().wait()).rejects.toThrow();
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
    });

    it('read initialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().simulate()).toEqual(true);
      const { points, randomness } = await contract.methods.view_imm_card().simulate();
      expect(points).toEqual(POINTS);
      expect(randomness).toEqual(RANDOMNESS);
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

    it('sets the max block number property', async () => {
      // We change the SharedMutable authorized delay here to 2, this means that a change to the "authorized" value can
      // only be applied 2 blocks after it is initiated, and thus read requests on a historical state without an
      // initiated change is valid for at least 2 blocks.
      await authContract.methods.set_authorized_delay(2).send().wait();

      // Note: Because we are decreasing the delay, we must first wait for the full previous delay - 1 (5 -1).
      await delay(4);

      const expectedModifiedMaxBlockNumber = (await pxe.getBlockNumber()) + 2;

      // We now call our AuthContract to see if the change in max block number has reflected our delay change
      const tx = await authContract.methods.get_authorized_in_private().prove();

      // The validity of our SharedMutable read request should be limited to 2 blocks
      expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
      expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(new Fr(expectedModifiedMaxBlockNumber));
    });
  });
});
