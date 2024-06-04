import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR, U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { EscrowTokenContractTest, toAddressOption } from './escrowable_token_contract_test.js';

// @todo For this test to be truly meaningful we need to run every actor with a separate PXE.
// When they are using the same we don't actually know if the default values are correct or
// they just figure it out because they know the keys of everyone.

describe('e2e_escrowable_token_contract shield + redeem_shield', () => {
  const t = new EscrowTokenContractTest('shield');
  let { asset, tokenSim, wallets, blacklisted } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot(); // Beware that we are adding the admin as minter here
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallets, blacklisted } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('on behalf of self to self', async () => {
    const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods
      .shield_from_private(
        wallets[0].getAddress(),
        wallets[0].getAddress(),
        amount,
        0,
        toAddressOption(),
        toAddressOption(),
      )
      .send()
      .wait();

    tokenSim.shieldAndRedeem(wallets[0].getAddress(), wallets[0].getAddress(), amount);
  });

  it('on behalf of self to other', async () => {
    const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods
      .shield_from_private(
        wallets[0].getAddress(),
        wallets[1].getAddress(),
        amount,
        0,
        toAddressOption(),
        toAddressOption(),
      )
      .send()
      .wait();

    tokenSim.shieldAndRedeem(wallets[0].getAddress(), wallets[1].getAddress(), amount);
  });

  it('on behalf of other', async () => {
    const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
    const amount = balancePub / 2n;
    const nonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset
      .withWallet(wallets[1])
      .methods.shield_from_private(
        wallets[0].getAddress(),
        wallets[1].getAddress(),
        amount,
        nonce,
        toAddressOption(),
        toAddressOption(),
      );
    await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

    await action.send().wait();

    tokenSim.shieldAndRedeem(wallets[0].getAddress(), wallets[1].getAddress(), amount);
    await tokenSim.check();

    // Check that replaying the shield should fail!
    const txReplay = asset
      .withWallet(wallets[1])
      .methods.shield_from_private(
        wallets[0].getAddress(),
        wallets[1].getAddress(),
        amount,
        nonce,
        toAddressOption(),
        toAddressOption(),
      )
      .send();
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('on behalf of self (more than balance)', async () => {
      const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods
          .shield_from_private(
            wallets[0].getAddress(),
            wallets[0].getAddress(),
            amount,
            0,
            toAddressOption(),
            toAddressOption(),
          )
          .prove(),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('on behalf of self (invalid nonce)', async () => {
      const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods
          .shield_from_private(
            wallets[0].getAddress(),
            wallets[0].getAddress(),
            amount,
            1,
            toAddressOption(),
            toAddressOption(),
          )
          .prove(),
      ).rejects.toThrow('Assertion failed: invalid nonce');
    });

    it('on behalf of other (more than balance)', async () => {
      const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
      const amount = balancePub + 1n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.shield_from_private(
          wallets[0].getAddress(),
          wallets[1].getAddress(),
          amount,
          nonce,
          toAddressOption(),
          toAddressOption(),
        );
      await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      await expect(action.prove()).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('on behalf of other (wrong designated caller)', async () => {
      const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
      const amount = balancePub + 1n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[2])
        .methods.shield_from_private(
          wallets[0].getAddress(),
          wallets[1].getAddress(),
          amount,
          nonce,
          toAddressOption(),
          toAddressOption(),
        );
      await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      const expectedMessageHash = computeAuthWitMessageHash(
        wallets[2].getAddress(),
        wallets[0].getChainId(),
        wallets[0].getVersion(),
        action.request(),
      );

      await expect(action.prove()).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
    });

    it('on behalf of other (without approval)', async () => {
      const balancePub = tokenSim.balanceOfPublic(wallets[0].getAddress());
      const amount = balancePub / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset
        .withWallet(wallets[1])
        .methods.shield_from_private(
          wallets[0].getAddress(),
          wallets[1].getAddress(),
          amount,
          nonce,
          toAddressOption(),
          toAddressOption(),
        );

      const expectedMessageHash = computeAuthWitMessageHash(
        wallets[1].getAddress(),
        wallets[0].getChainId(),
        wallets[0].getVersion(),
        action.request(),
      );

      await expect(action.prove()).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
    });

    it('shielding from blacklisted account', async () => {
      await expect(
        asset
          .withWallet(blacklisted)
          .methods.shield_from_private(
            blacklisted.getAddress(),
            wallets[0].getAddress(),
            1n,
            0,
            toAddressOption(),
            toAddressOption(),
          )
          .prove(),
      ).rejects.toThrow("Assertion failed: Blacklisted: Sender '!from_roles.is_blacklisted'");
    });

    it('shielding to blacklisted account', async () => {
      await expect(
        asset
          .withWallet(wallets[0])
          .methods.shield_from_private(
            wallets[0].getAddress(),
            blacklisted.getAddress(),
            1n,
            0,
            toAddressOption(),
            toAddressOption(),
          )
          .prove(),
      ).rejects.toThrow("Assertion failed: Blacklisted: Recipient '!to_roles.is_blacklisted'");
    });
  });
});
