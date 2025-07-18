import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract unshielding', () => {
  const t = new BlacklistTokenContractTest('unshielding');
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

  it('on behalf of self', async () => {
    const balancePriv = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.unshield(wallets[0].getAddress(), wallets[0].getAddress(), amount, 0).send().wait();

    tokenSim.transferToPublic(wallets[0].getAddress(), wallets[0].getAddress(), amount);
  });

  it('on behalf of other', async () => {
    const balancePriv0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
    const amount = balancePriv0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset
      .withWallet(wallets[1])
      .methods.unshield(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);

    // Both wallets are connected to same node and PXE so we could just insert directly
    // But doing it in two actions to show the flow.
    const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

    await action.send({ authWitnesses: [witness] }).wait();
    tokenSim.transferToPublic(wallets[0].getAddress(), wallets[1].getAddress(), amount);

    // Perform the transfer again, should fail
    const txReplay = asset
      .withWallet(wallets[1])
      .methods.unshield(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce)
      .send({ authWitnesses: [witness] });
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    // @todo @LHerskind This error is weird?
  });

  describe('failure cases', () => {
    it('on behalf of self (more than balance)', async () => {
      const balancePriv = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.unshield(wallets[0].getAddress(), wallets[0].getAddress(), amount, 0).simulate(),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('on behalf of self (invalid authwit nonce)', async () => {
      const balancePriv = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.unshield(wallets[0].getAddress(), wallets[0].getAddress(), amount, 1).simulate(),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('on behalf of other (more than balance)', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.unshield(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('on behalf of other (invalid designated caller)', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(wallets[0].getAddress()).simulate();
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[2])
        .methods.unshield(wallets[0].getAddress(), wallets[1].getAddress(), amount, authwitNonce);
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: wallets[2].getAddress(), action },
        { chainId: wallets[0].getChainId(), version: wallets[0].getVersion() },
      );

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: wallets[1].getAddress(), action });

      await expect(action.simulate({ authWitnesses: [witness] })).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
    });

    it('unshield from blacklisted account', async () => {
      await expect(
        asset
          .withWallet(blacklisted)
          .methods.unshield(blacklisted.getAddress(), wallets[0].getAddress(), 1n, 0)
          .simulate(),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    it('unshield to blacklisted account', async () => {
      await expect(
        asset.methods.unshield(wallets[0].getAddress(), blacklisted.getAddress(), 1n, 0).simulate(),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
