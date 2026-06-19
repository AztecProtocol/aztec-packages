import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../fixtures/authwit_proxy.js';
import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

// Covers the transfer_to_public entry point on Token contract (private→public): direct, authwit-delegated
// via proxy, and error paths. Setup: single node with AutomineSequencer, 3 accounts, Token deployed with
// initial mint.
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

  // Transfers half of admin's private balance to admin's public balance and verifies via TokenSimulator.
  it('on behalf of self', async () => {
    const { result: balancePriv } = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress });
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  // Creates a private authwit for transfer_to_public to account1, sends through proxy, verifies TokenSimulator,
  // then asserts replay reverts with DUPLICATE_NULLIFIER_ERROR.
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

  // Error paths: more-than-balance, invalid nonce, over-balance via authwit, wrong caller.
  describe('failure cases', () => {
    // Transfers more than private balance to public (self); expects 'Balance too low'.
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

    // Self-transfer_to_public with nonce=1; expects the invalid-nonce assertion.
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

    // Creates authwit for a transfer_to_public exceeding private balance; expects 'Balance too low'.
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

    // Creates authwit designating account1 as caller but sends through proxy; expects unknown-authwit error.
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
