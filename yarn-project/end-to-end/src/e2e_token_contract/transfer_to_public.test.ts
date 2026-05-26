import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../fixtures/authwit_proxy.js';
import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer_to_public', () => {
  const t = new TokenContractTest('transfer_to_public');
  let { asset, wallet, adminAddress, account1Address, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    // Have to destructure again to ensure we have latest refs.
    ({ asset, wallet, adminAddress, account1Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('on behalf of self', async () => {
    const { result: balancePriv } = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress });
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  it('on behalf of other', async () => {
    const { result: balancePriv0 } = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress });
    const amount = balancePriv0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);
    const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

    // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
    await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
    tokenSim.transferToPublic(adminAddress, account1Address, amount);

    // Perform the transfer again, should fail
    await expect(
      sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
    ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('on behalf of self (more than balance)', async () => {
      const { result: balancePriv } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('on behalf of self (invalid authwit nonce)', async () => {
      const { result: balancePriv } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('on behalf of other (more than balance)', async () => {
      const { result: balancePriv0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('on behalf of other (invalid designated caller)', async () => {
      const { result: balancePriv0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);
      const call = await action.getFunctionCall();
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await wallet.getChainInfo(),
      );

      const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
    });
  });
});
