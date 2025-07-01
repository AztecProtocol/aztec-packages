import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract transfer private', () => {
  const t = new BlacklistTokenContractTest('transfer_private');
  let { asset, tokenSim, wallets, blacklisted } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallets, blacklisted } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const tokenTransferInteraction = asset
      .withWallet(wallets[0])
      .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, 0);
    await tokenTransferInteraction.send().wait();
    tokenSim.transferPrivate(wallets[0].getAddress(), wallets[1].getAddress(), amount);
  });

  it('transfer to self', async () => {
    const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer(wallets[0].getAddress(), wallets[0].getAddress(), amount, 0).send().wait();
    tokenSim.transferPrivate(wallets[0].getAddress(), wallets[0].getAddress(), amount);
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    // docs:start:authwit_transfer_example
    // docs:start:authwit_computeAuthWitMessageHash
    const action = asset
      .withWallet(wallets[1])
      .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);
    // docs:end:authwit_computeAuthWitMessageHash
    // docs:start:create_authwit
    const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });
    // docs:end:create_authwit

    // Perform the transfer

    // docs:start:add_authwit
    await action.send({ authWitnesses: [witness] }).wait();
    // docs:end:add_authwit
    // docs:end:authwit_transfer_example
    tokenSim.transferPrivate(wallets[0].getAddress(), wallets[1].getAddress(), amount);

    // Perform the transfer again, should fail
    const txReplay = asset
      .withWallet(wallets[1])
      .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce)
      .send({ authWitnesses: [witness] });
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, 0).simulate(),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 - 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, 1).simulate(),
      ).rejects.toThrow(
        'Assertion failed: Invalid authwit nonce. When from and msg_sender are the same, authwit_nonce must be zero',
      );
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const balance1 = await asset.methods.balance_of_private(wallets[1].getAddress()).simulate();
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      // Perform the transfer
      await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow('Assertion failed: Balance too low');
      expect(await asset.methods.balance_of_private(wallets[0].getAddress()).simulate()).toEqual(balance0);
      expect(await asset.methods.balance_of_private(wallets[1].getAddress()).simulate()).toEqual(balance1);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });

    it('transfer on behalf of other without approval', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);
      const messageHash = await computeAuthWitMessageHash(
        { caller: wallets[1].getAddress(), action },
        { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
      );

      await expect(action.simulate()).rejects.toThrow(
        `Unknown auth witness for message hash ${messageHash.toString()}`,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[2])
        .methods.transfer(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: wallets[2].getAddress(), action },
        { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
      );

      const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
      expect(await asset.methods.balance_of_private(wallets[0].getAddress()).simulate()).toEqual(balance0);
    });

    it('transfer from a blacklisted account', async () => {
      await expect(
        asset
          .withWallet(blacklisted)
          .methods.transfer(blacklisted.getAddress(), wallets[0].getAddress(), 1n, 0)
          .simulate(),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    it('transfer to a blacklisted account', async () => {
      await expect(
        asset.methods.transfer(wallets[0].getAddress(), blacklisted.getAddress(), 1n, 0).simulate(),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
