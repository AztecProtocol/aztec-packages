import { Fr } from '@aztec/aztec.js/fields';

import { AUTOMINE_E2E_OPTS } from '../fixtures/fixtures.js';
import { U128_UNDERFLOW_ERROR } from '../fixtures/index.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract transfer public', () => {
  const t = new BlacklistTokenContractTest('transfer_public');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    await t.setup({ ...AUTOMINE_E2E_OPTS });
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

  it('transfer less than balance', async () => {
    const balance0 = await asset.methods
      .balance_of_public(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer_public(adminAddress, otherAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferPublic(adminAddress, otherAddress, amount);
  });

  it('transfer to self', async () => {
    const balance = await asset.methods
      .balance_of_public(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferPublic(adminAddress, adminAddress, amount);
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods
      .balance_of_public(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const authwitNonce = Fr.random();

    const action = asset.methods.transfer_public(adminAddress, otherAddress, amount, authwitNonce);

    const validateActionInteraction = await wallet.setPublicAuthWit(
      adminAddress,
      { caller: otherAddress, action },
      true,
    );
    await validateActionInteraction.send();

    // Perform the transfer
    await action.send({ from: otherAddress });

    tokenSim.transferPublic(adminAddress, otherAddress, amount);

    await expect(
      asset.methods.transfer_public(adminAddress, otherAddress, amount, authwitNonce).simulate({ from: otherAddress }),
    ).rejects.toThrow(/unauthorized/);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 + 1n;
      const authwitNonce = 0;
      await expect(
        asset.methods
          .transfer_public(adminAddress, otherAddress, amount, authwitNonce)
          .simulate({ from: adminAddress }),
      ).rejects.toThrow(U128_UNDERFLOW_ERROR);
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 - 1n;
      const authwitNonce = 1;
      await expect(
        asset.methods
          .transfer_public(adminAddress, otherAddress, amount, authwitNonce)
          .simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('transfer on behalf of other without "approval"', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      await expect(
        asset.methods
          .transfer_public(adminAddress, otherAddress, amount, authwitNonce)
          .simulate({ from: otherAddress }),
      ).rejects.toThrow(/unauthorized/);
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const balance1 = await asset.methods
        .balance_of_public(otherAddress)
        .simulate({ from: otherAddress })
        .then(r => r.result);
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_public(adminAddress, otherAddress, amount, authwitNonce);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: otherAddress, action },
        true,
      );
      await validateActionInteraction.send();
      // Perform the transfer
      await expect(action.simulate({ from: otherAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);

      expect(
        await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result),
      ).toEqual(balance0);
      expect(
        await asset.methods
          .balance_of_public(otherAddress)
          .simulate({ from: otherAddress })
          .then(r => r.result),
      ).toEqual(balance1);
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const balance0 = await asset.methods
        .balance_of_public(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const balance1 = await asset.methods
        .balance_of_public(otherAddress)
        .simulate({ from: otherAddress })
        .then(r => r.result);
      const amount = balance0 + 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.methods.transfer_public(adminAddress, otherAddress, amount, authwitNonce);

      const validateActionInteraction = await wallet.setPublicAuthWit(
        adminAddress,
        { caller: adminAddress, action },
        true,
      );
      await validateActionInteraction.send();

      // Perform the transfer
      await expect(action.simulate({ from: otherAddress })).rejects.toThrow(/unauthorized/);

      expect(
        await asset.methods
          .balance_of_public(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result),
      ).toEqual(balance0);
      expect(
        await asset.methods
          .balance_of_public(otherAddress)
          .simulate({ from: otherAddress })
          .then(r => r.result),
      ).toEqual(balance1);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });

    it('transfer from a blacklisted account', async () => {
      await expect(
        asset.methods.transfer_public(blacklistedAddress, adminAddress, 1n, 0n).simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    it('transfer to a blacklisted account', async () => {
      await expect(
        asset.methods.transfer_public(adminAddress, blacklistedAddress, 1n, 0n).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
