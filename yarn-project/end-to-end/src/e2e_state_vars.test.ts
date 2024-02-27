import { TxStatus, Wallet } from '@aztec/aztec.js';
import { DocsExampleContract } from '@aztec/noir-contracts.js';

import { setup } from './fixtures/utils.js';

describe('e2e_state_vars', () => {
  let wallet: Wallet;

  let teardown: () => Promise<void>;
  let contract: DocsExampleContract;

  const POINTS = 1n;
  const RANDOMNESS = 2n;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());
    contract = await DocsExampleContract.deploy(wallet).send().deployed();
  }, 25_000);

  afterAll(() => teardown());

  describe('Stable Public State', () => {
    it('private read of uninitialized stable', async () => {
      const s = await contract.methods.get_stable().view();

      const receipt2 = await contract.methods.match_stable(s.account, s.points).send().wait();
      expect(receipt2.status).toEqual(TxStatus.MINED);
    });

    it('private read of initialized stable', async () => {
      const receipt = await contract.methods.initialize_stable(1).send().wait();
      expect(receipt.status).toEqual(TxStatus.MINED);
      const s = await contract.methods.get_stable().view();

      const receipt2 = await contract.methods.match_stable(s.account, s.points).send().wait();
      expect(receipt2.status).toEqual(TxStatus.MINED);
    }, 200_000);
  });

  describe('PrivateMutable', () => {
    it('fail to read uninitialized PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(false);
      await expect(contract.methods.get_legendary_card().view()).rejects.toThrowError();
    });

    it('initialize PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(false);
      const receipt = await contract.methods.initialize_private(RANDOMNESS, POINTS).send().wait();
      expect(receipt.status).toEqual(TxStatus.MINED);

      const tx = await wallet.getTx(receipt.txHash);
      expect(tx?.newNoteHashes.length).toEqual(1);
      // 1 for the tx, another for the initializer
      expect(tx?.newNullifiers.length).toEqual(2);
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
      await expect(contract.methods.initialize_private(RANDOMNESS, POINTS).send().wait()).rejects.toThrowError();
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
    });

    it('read initialized PrivateMutable', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
      const { points, randomness } = await contract.methods.get_legendary_card().view();
      expect(points).toEqual(POINTS);
      expect(randomness).toEqual(RANDOMNESS);
    });

    it('replace with same value', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
      const noteBefore = await contract.methods.get_legendary_card().view();
      const receipt = await contract.methods.update_legendary_card(RANDOMNESS, POINTS).send().wait();
      expect(receipt.status).toEqual(TxStatus.MINED);

      const tx = await wallet.getTx(receipt.txHash);
      expect(tx?.newNoteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(tx?.newNullifiers.length).toEqual(2);

      const noteAfter = await contract.methods.get_legendary_card().view();

      expect(noteBefore.owner).toEqual(noteAfter.owner);
      expect(noteBefore.points).toEqual(noteAfter.points);
      expect(noteBefore.randomness).toEqual(noteAfter.randomness);
      expect(noteBefore.header.contract_address).toEqual(noteAfter.header.contract_address);
      expect(noteBefore.header.storage_slot).toEqual(noteAfter.header.storage_slot);
      expect(noteBefore.header.is_transient).toEqual(noteAfter.header.is_transient);
      // !!! Nonce must be different
      expect(noteBefore.header.nonce).not.toEqual(noteAfter.header.nonce);
    });

    it('replace PrivateMutable with other values', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
      const receipt = await contract.methods
        .update_legendary_card(RANDOMNESS + 2n, POINTS + 1n)
        .send()
        .wait();
      expect(receipt.status).toEqual(TxStatus.MINED);
      const tx = await wallet.getTx(receipt.txHash);
      expect(tx?.newNoteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(tx?.newNullifiers.length).toEqual(2);

      const { points, randomness } = await contract.methods.get_legendary_card().view();
      expect(points).toEqual(POINTS + 1n);
      expect(randomness).toEqual(RANDOMNESS + 2n);
    });

    it('replace PrivateMutable dependent on prior value', async () => {
      expect(await contract.methods.is_legendary_initialized().view()).toEqual(true);
      const noteBefore = await contract.methods.get_legendary_card().view();
      const receipt = await contract.methods.increase_legendary_points().send().wait();
      expect(receipt.status).toEqual(TxStatus.MINED);
      const tx = await wallet.getTx(receipt.txHash);
      expect(tx?.newNoteHashes.length).toEqual(1);
      // 1 for the tx, another for the nullifier of the previous note
      expect(tx?.newNullifiers.length).toEqual(2);

      const { points, randomness } = await contract.methods.get_legendary_card().view();
      expect(points).toEqual(noteBefore.points + 1n);
      expect(randomness).toEqual(noteBefore.randomness);
    });
  });

  describe('PrivateImmutable', () => {
    it('fail to read uninitialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(false);
      await expect(contract.methods.view_imm_card().view()).rejects.toThrowError();
    });

    it('initialize PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(false);
      const receipt = await contract.methods.initialize_private_immutable(RANDOMNESS, POINTS).send().wait();
      expect(receipt.status).toEqual(TxStatus.MINED);

      const tx = await wallet.getTx(receipt.txHash);
      expect(tx?.newNoteHashes.length).toEqual(1);
      // 1 for the tx, another for the initializer
      expect(tx?.newNullifiers.length).toEqual(2);
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(true);
    });

    it('fail to reinitialize', async () => {
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(true);
      await expect(
        contract.methods.initialize_private_immutable(RANDOMNESS, POINTS).send().wait(),
      ).rejects.toThrowError();
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(true);
    });

    it('read initialized PrivateImmutable', async () => {
      expect(await contract.methods.is_priv_imm_initialized().view()).toEqual(true);
      const { points, randomness } = await contract.methods.view_imm_card().view();
      expect(points).toEqual(POINTS);
      expect(randomness).toEqual(RANDOMNESS);
    });
  });
});
