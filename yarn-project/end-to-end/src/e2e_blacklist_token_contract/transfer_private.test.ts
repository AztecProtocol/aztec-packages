import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract transfer private', () => {
  const t = new BlacklistTokenContractTest('transfer_private');
  let { asset, tokenSim, admin, adminAddress, other, otherAddress, blacklisted, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, admin, adminAddress, other, otherAddress, blacklisted, blacklistedAddress } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const tokenTransferInteraction = asset.withWallet(admin).methods.transfer(adminAddress, otherAddress, amount, 0);
    await tokenTransferInteraction.send({ from: adminAddress }).wait();
    tokenSim.transferPrivate(adminAddress, otherAddress, amount);
  });

  it('transfer to self', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer(adminAddress, adminAddress, amount, 0).send({ from: adminAddress }).wait();
    tokenSim.transferPrivate(adminAddress, adminAddress, amount);
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    // docs:start:authwit_transfer_example
    // docs:start:authwit_computeAuthWitMessageHash
    const action = asset.withWallet(other).methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
    // docs:end:authwit_computeAuthWitMessageHash
    // docs:start:create_authwit
    const witness = await admin.createAuthWit({ caller: otherAddress, action });
    // docs:end:create_authwit

    // Perform the transfer

    // docs:start:add_authwit
    await action.send({ from: otherAddress, authWitnesses: [witness] }).wait();
    // docs:end:add_authwit
    // docs:end:authwit_transfer_example
    tokenSim.transferPrivate(adminAddress, otherAddress, amount);

    // Perform the transfer again, should fail
    const txReplay = asset
      .withWallet(other)
      .methods.transfer(adminAddress, otherAddress, amount, authwitNonce)
      .send({ from: otherAddress, authWitnesses: [witness] });
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(adminAddress, otherAddress, amount, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 - 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(adminAddress, otherAddress, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const balance1 = await asset.methods.balance_of_private(otherAddress).simulate({ from: otherAddress });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(other).methods.transfer(adminAddress, otherAddress, amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await admin.createAuthWit({ caller: otherAddress, action });

      // Perform the transfer
      await expect(action.simulate({ from: otherAddress, authWitnesses: [witness] })).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
      expect(await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).toEqual(balance0);
      expect(await asset.methods.balance_of_private(otherAddress).simulate({ from: otherAddress })).toEqual(balance1);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });

    it('transfer on behalf of other without approval', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(other).methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
      const messageHash = await computeAuthWitMessageHash(
        { caller: otherAddress, action },
        { chainId: admin.getChainId(), version: admin.getVersion() },
      );

      await expect(action.simulate({ from: otherAddress })).rejects.toThrow(
        `Unknown auth witness for message hash ${messageHash.toString()}`,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(blacklisted).methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: blacklistedAddress, action },
        { chainId: admin.getChainId(), version: admin.getVersion() },
      );

      const witness = await admin.createAuthWit({ caller: otherAddress, action });

      await expect(action.simulate({ from: blacklistedAddress, authWitnesses: [witness] })).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
      expect(await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).toEqual(balance0);
    });

    it('transfer from a blacklisted account', async () => {
      await expect(
        asset
          .withWallet(blacklisted)
          .methods.transfer(blacklistedAddress, adminAddress, 1n, 0)
          .simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    it('transfer to a blacklisted account', async () => {
      await expect(
        asset.methods.transfer(adminAddress, blacklistedAddress, 1n, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
