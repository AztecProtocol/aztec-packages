import { Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer_to_public', () => {
  const t = new TokenContractTest('transfer_to_public');
  let { asset, wallet, adminAddress, account1Address, account2Address, tokenSim } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, wallet, adminAddress, account1Address, account2Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('on behalf of self', async () => {
    const balancePriv = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress }).wait();

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  it('on behalf of other', async () => {
    const balancePriv0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balancePriv0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);

    // Both wallets are connected to same node and PXE so we could just insert directly
    // But doing it in two actions to show the flow.
    const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

    await action.send({ from: account1Address, authWitnesses: [witness] }).wait();
    tokenSim.transferToPublic(adminAddress, account1Address, amount);

    // Perform the transfer again, should fail
    const txReplay = asset.methods
      .transfer_to_public(adminAddress, account1Address, amount, authwitNonce)
      .send({ from: account1Address, authWitnesses: [witness] });
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('on behalf of self (more than balance)', async () => {
      const balancePriv = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('on behalf of self (invalid authwit nonce)', async () => {
      const balancePriv = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('on behalf of other (more than balance)', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

      await expect(action.simulate({ from: account1Address, authWitnesses: [witness] })).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
    });

    it('on behalf of other (invalid designated caller)', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: account2Address, call: await action.getFunctionCall() },
        await wallet.getChainInfo(),
      );

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

      await expect(action.simulate({ from: account2Address, authWitnesses: [witness] })).rejects.toThrow(
        `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
      );
    });
  });
});
