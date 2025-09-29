import { Fr, computeSecretHash } from '@aztec/aztec.js';

import { U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract shield + redeem_shield', () => {
  const t = new BlacklistTokenContractTest('shield');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot(); // Beware that we are adding the admin as minter here
    await t.setup();
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

  it('on behalf of self', async () => {
    const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    expect(amount).toBeGreaterThan(0n);

    const receipt = await asset.methods.shield(adminAddress, amount, secretHash, 0).send({ from: adminAddress }).wait();

    // Redeem it
    await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, receipt.txHash);
    await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress }).wait();

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await t.tokenSim.check();
  });

  it('on behalf of other', async () => {
    const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
    const amount = balancePub / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset.methods.shield(adminAddress, amount, secretHash, authwitNonce);
    const validateActionInteraction = await wallet.setPublicAuthWit(
      adminAddress,
      { caller: otherAddress, action },
      true,
    );
    await validateActionInteraction.send().wait();

    const receipt = await action.send({ from: otherAddress }).wait();

    // Check that replaying the shield should fail!
    await expect(
      asset.methods.shield(adminAddress, amount, secretHash, authwitNonce).simulate({ from: otherAddress }),
    ).rejects.toThrow(/unauthorized/);

    // Redeem it
    await t.addPendingShieldNoteToPXE(asset, adminAddress, amount, secretHash, receipt.txHash);
    await asset.methods.redeem_shield(adminAddress, amount, secret).send({ from: adminAddress }).wait();

    // Check that the result matches token sim
    tokenSim.transferToPrivate(adminAddress, adminAddress, amount);
    await t.tokenSim.check();
  });

  describe('failure cases', () => {
    it('on behalf of self (more than balance)', async () => {
      const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('on behalf of self (invalid authwit nonce)', async () => {
      const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('on behalf of other (more than balance)', async () => {
      const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.shield(adminAddress, amount, secretHash, authwitNonce);
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send().wait();

      await expect(action.simulate({ from: otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('on behalf of other (wrong designated caller)', async () => {
      const balancePub = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balancePub + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.shield(adminAddress, amount, secretHash, authwitNonce);
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send().wait();

      await expect(action.simulate({ from: blacklistedAddress })).rejects.toThrow(/unauthorized/);
    });

    it('on behalf of other (without approval)', async () => {
      const balance = await asset.methods.balance_of_public(adminAddress).simulate({ from: adminAddress });
      const amount = balance / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.shield(adminAddress, amount, secretHash, authwitNonce).simulate({ from: otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    it('shielding from blacklisted account', async () => {
      await expect(
        asset.methods.shield(blacklistedAddress, 1n, secretHash, 0).simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });
  });
});
