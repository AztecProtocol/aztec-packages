import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { DUPLICATE_NULLIFIER_ERROR } from '../../fixtures/fixtures.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

// Covers the unshield (private→public) operation on TokenBlacklist, including authwit-delegated unshielding
// and blacklist enforcement on sender and recipient. Setup: single node with AutomineSequencer, 3 accounts,
// initial mint applied. Time-warp required during setup to cross role-change delay.
describe('automine/token/blacklist_unshielding', () => {
  const t = new BlacklistTokenContractTest('unshielding');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.setup();
    // Beware that we are adding the admin as minter here, which is very slow because it needs multiple blocks.
    await t.applyMint();
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Unshields half of admin's private balance to admin's public balance and verifies via TokenSimulator.
  it('on behalf of self', async () => {
    const balancePriv = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.unshield(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  // Creates a private authwit for unshield, sends through proxy to other's public balance, verifies
  // TokenSimulator, then asserts replay fails with DUPLICATE_NULLIFIER_ERROR.
  it('on behalf of other', async () => {
    const balancePriv0 = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balancePriv0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const action = asset.methods.unshield(adminAddress, otherAddress, amount, authwitNonce);
    const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

    // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
    await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
    tokenSim.transferToPublic(adminAddress, otherAddress, amount);

    // Perform the transfer again, should fail
    await expect(
      sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
    ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  // Error paths: more-than-balance, invalid nonce, over-balance via authwit, wrong caller, blacklist.
  describe('failure cases', () => {
    // Unshields more than private balance (self); expects 'Balance too low'.
    it('on behalf of self (more than balance)', async () => {
      const balancePriv = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.unshield(adminAddress, adminAddress, amount, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    // Self-unshield with nonce=1; expects the invalid-nonce assertion failure.
    it('on behalf of self (invalid authwit nonce)', async () => {
      const balancePriv = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balancePriv + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.unshield(adminAddress, adminAddress, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    // Authwit-unshields more than private balance via proxy; expects 'Balance too low'.
    it('on behalf of other (more than balance)', async () => {
      const balancePriv0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.unshield(adminAddress, otherAddress, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    // Creates authwit designating otherAddress as caller but sends through proxy; expects unknown-authwit
    // error because the message hash references the proxy address.
    it('on behalf of other (invalid designated caller)', async () => {
      const balancePriv0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balancePriv0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.unshield(adminAddress, otherAddress, amount, authwitNonce);
      const call = await action.getFunctionCall();
      const expectedMessageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await wallet.getChainInfo(),
      );

      const witness = await wallet.createAuthWit(adminAddress, { caller: otherAddress, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
    });

    // Attempts unshield where the sender (from) is blacklisted; expects 'Blacklisted: Sender'.
    it('unshield from blacklisted account', async () => {
      await expect(
        asset.methods.unshield(blacklistedAddress, adminAddress, 1n, 0).simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    // Attempts unshield where the recipient (to) is blacklisted; expects 'Blacklisted: Recipient'.
    it('unshield to blacklisted account', async () => {
      await expect(
        asset.methods.unshield(adminAddress, blacklistedAddress, 1n, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
