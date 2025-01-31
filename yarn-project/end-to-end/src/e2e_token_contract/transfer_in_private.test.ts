import { Fr, computeAuthWitMessageHash, computeInnerAuthWitHashFromAction } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, accounts, tokenSim, wallets, badAccount } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, accounts, tokenSim, wallets, badAccount } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
    const amount = balance0 / 2n;
    const nonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    // docs:start:authwit_transfer_example
    const action = asset
      .withWallet(wallets[1])
      .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce);

    const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
    await wallets[1].addAuthWitness(witness);
    expect(await wallets[0].lookupValidity(wallets[0].getAddress(), { caller: accounts[1].address, action })).toEqual({
      isValidInPrivate: true,
      isValidInPublic: false,
    });
    // docs:end:authwit_transfer_example

    // We give wallets[1] access to wallets[0]'s notes to be able to transfer the notes.
    wallets[1].setScopes([wallets[1].getAddress(), wallets[0].getAddress()]);

    // Perform the transfer
    await action.send().wait();
    tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

    // Perform the transfer again, should fail
    const txReplay = asset
      .withWallet(wallets[1])
      .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce)
      .send();
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 - 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(
        asset.methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, 1).simulate(),
      ).rejects.toThrow('Assertion failed: invalid nonce');
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const balance1 = await asset.methods.balance_of_private(accounts[1].address).simulate();
      const amount = balance0 + 1n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce);

      // Both wallets are connected to same node and PXE so we could just insert directly using
      // await wallet.signAndAddAuthWitness(messageHash, );
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
      await wallets[1].addAuthWitness(witness);

      // Perform the transfer
      await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
      expect(await asset.methods.balance_of_private(accounts[0].address).simulate()).toEqual(balance0);
      expect(await asset.methods.balance_of_private(accounts[1].address).simulate()).toEqual(balance1);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });

    it('transfer on behalf of other without approval', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce);
      const messageHash = await computeAuthWitMessageHash(
        { caller: accounts[1].address, action },
        {
          chainId: wallets[0].getChainId(),
          version: wallets[0].getVersion(),
        },
      );

      await expect(action.simulate()).rejects.toThrow(
        `Unknown auth witness for message hash ${messageHash.toString()}`,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[2])
        .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce);
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: accounts[2].address, action },
        {
          chainId: wallets[0].getChainId(),
          version: wallets[0].getVersion(),
        },
      );

      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
      await wallets[2].addAuthWitness(witness);

      // We give wallets[2] access to wallets[0]'s notes to test the authwit.
      wallets[2].setScopes([wallets[2].getAddress(), wallets[0].getAddress()]);

      await expect(action.simulate()).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
      expect(await asset.methods.balance_of_private(accounts[0].address).simulate()).toEqual(balance0);
    });

    it('transfer on behalf of other, cancelled authwit', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce);

      const intent = { caller: accounts[1].address, action };

      const witness = await wallets[0].createAuthWit(intent);
      await wallets[1].addAuthWitness(witness);

      expect(await wallets[0].lookupValidity(wallets[0].getAddress(), intent)).toEqual({
        isValidInPrivate: true,
        isValidInPublic: false,
      });

      const innerHash = await computeInnerAuthWitHashFromAction(accounts[1].address, await action.request());
      await asset.withWallet(wallets[0]).methods.cancel_authwit(innerHash).send().wait();

      expect(await wallets[0].lookupValidity(wallets[0].getAddress(), intent)).toEqual({
        isValidInPrivate: false,
        isValidInPublic: false,
      });

      // Perform the transfer, should fail because nullifier already emitted
      const txCancelledAuthwit = asset
        .withWallet(wallets[1])
        .methods.transfer_in_private(accounts[0].address, accounts[1].address, amount, nonce)
        .send();
      await expect(txCancelledAuthwit.wait()).rejects.toThrowError(DUPLICATE_NULLIFIER_ERROR);
    });

    it('transfer on behalf of other, invalid verify_private_authwit on "from"', async () => {
      const nonce = Fr.random();

      // Should fail as the returned value from the badAccount is malformed
      const txCancelledAuthwit = asset
        .withWallet(wallets[1])
        .methods.transfer_in_private(badAccount.address, accounts[1].address, 0, nonce)
        .send();
      await expect(txCancelledAuthwit.wait()).rejects.toThrow('Assertion failed: Message not authorized by account');
    });
  });
});
