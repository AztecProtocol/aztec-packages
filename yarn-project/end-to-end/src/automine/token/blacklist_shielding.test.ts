import { computeSecretHash } from '@aztec/aztec.js/crypto';
import { Fr } from '@aztec/aztec.js/fields';

import { U128_UNDERFLOW_ERROR } from '../../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';
import { INVALID_AUTHWIT_NONCE_ERROR, amountAboveBalance, halfBalanceOf } from './token_test_helpers.js';

// Covers the shield (public→private) and redeem_shield operations on TokenBlacklist, including
// authwit-delegated shielding and blacklist enforcement. Setup: single node with AutomineSequencer,
// 3 accounts, initial mint applied. Time-warp required during setup to cross role-change delay.
describe('automine/token/blacklist_shielding', () => {
  const t = new BlacklistTokenContractTest('shield');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.setup();
    await t.applyMint(); // Beware that we are adding the admin as minter here
    // Have to destructure again to ensure we have latest refs.
    ({ asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t);
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  const secret = Fr.random();
  let secretHash: Fr;

  beforeAll(async () => {
    secretHash = await computeSecretHash(secret);
  });

  // Shields half the admin's public balance to private, registers the note in PXE, redeems it, and
  // verifies the result against TokenSimulator.
  it('on behalf of self', async () => {
    const amount = await halfBalanceOf(asset, 'public', adminAddress);

    const { receipt } = await asset.methods.shield(adminAddress, amount, secretHash, 0).send({ from: adminAddress });

    // Redeem it
    await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, receipt.txHash);
    await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress });

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await t.tokenSim.check();
  });

  // Sets a public authwit allowing otherAddress to shield admin's tokens, executes the shield from
  // otherAddress, verifies replay fails (unauthorized), redeems, and checks TokenSimulator.
  it('on behalf of other', async () => {
    const amount = await halfBalanceOf(asset, 'public', adminAddress);
    const authwitNonce = Fr.random();

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset.methods.shield(adminAddress, amount, secretHash, authwitNonce);
    const validateActionInteraction = await wallet.setPublicAuthWit(
      adminAddress,
      { caller: otherAddress, action },
      true,
    );
    await validateActionInteraction.send();

    const { receipt } = await action.send({ from: otherAddress });

    // Check that replaying the shield should fail!
    await expect(
      asset.methods.shield(adminAddress, amount, secretHash, authwitNonce).simulate({ from: otherAddress }),
    ).rejects.toThrow(/unauthorized/);

    // Redeem it
    await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, receipt.txHash);
    await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress });

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await t.tokenSim.check();
  });

  // Error paths: more-than-balance, invalid nonce, wrong caller, missing approval, blacklist.
  describe('failure cases', () => {
    // Shields more than public balance (self); expects U128_UNDERFLOW_ERROR.
    it('on behalf of self (more than balance)', async () => {
      const amount = await amountAboveBalance(asset, 'public', adminAddress);
      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    // Self-shield with nonce=1; expects invalid-nonce assertion failure.
    it('on behalf of self (invalid authwit nonce)', async () => {
      const amount = await amountAboveBalance(asset, 'public', adminAddress);
      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(INVALID_AUTHWIT_NONCE_ERROR);
    });

    // Authwit-shields more than balance via otherAddress; expects U128_UNDERFLOW_ERROR.
    it('on behalf of other (more than balance)', async () => {
      const amount = await amountAboveBalance(asset, 'public', adminAddress);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.shield(adminAddress, amount, secretHash, Fr.random());
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send();

      await expect(action.simulate({ from: otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    // Approves otherAddress as caller, executes from blacklistedAddress; expects unauthorized.
    it('on behalf of other (wrong designated caller)', async () => {
      const amount = await amountAboveBalance(asset, 'public', adminAddress);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.shield(adminAddress, amount, secretHash, Fr.random());
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send();

      await expect(action.simulate({ from: blacklistedAddress })).rejects.toThrow(/unauthorized/);
    });

    // Calls shield for admin from otherAddress without any authwit; expects unauthorized.
    it('on behalf of other (without approval)', async () => {
      const amount = await halfBalanceOf(asset, 'public', adminAddress);
      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, Fr.random()).simulate({ from: otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    // Attempts shield from the blacklisted account; expects 'Blacklisted: Sender' assertion.
    it('shielding from blacklisted account', async () => {
      await expect(
        asset.methods.shield(blacklistedAddress, 1n, secretHash, 0).simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });
  });
});
