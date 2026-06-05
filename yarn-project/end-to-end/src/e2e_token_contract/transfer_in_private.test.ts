import { computeAuthWitMessageHash, computeInnerAuthWitHashFromAction } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../fixtures/authwit_proxy.js';
import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup({ ...AUTOMINE_E2E_OPTS });
    ({ asset, tokenSim, wallet, adminAddress, account1Address, badAccount } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer on behalf of other', async () => {
    const { result: balance0 } = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);
    const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

    // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
    await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
    tokenSim.transferPrivate(adminAddress, account1Address, amount);

    // Perform the transfer again, should fail
    await expect(
      sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
    ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('transfer on behalf of self with non-zero nonce', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 - 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(
        asset.methods.transfer_in_private(adminAddress, account1Address, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(
            "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
          ),
          stack: expect.stringMatching(/at Token\.transfer_in_private.*/),
        }),
      );
    });

    it('transfer more than balance on behalf of other', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const { result: balance1 } = await asset.methods
        .balance_of_private(account1Address)
        .simulate({ from: account1Address });
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow('Assertion failed: Balance too low');
      expect((await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        balance0,
      );
      expect(
        (await asset.methods.balance_of_private(account1Address).simulate({ from: account1Address })).result,
      ).toEqual(balance1);
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });

    it('transfer on behalf of other without approval', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);
      const call = await action.getFunctionCall();
      const messageHash = await computeAuthWitMessageHash(
        { caller: t.authwitProxy.address, call },
        await wallet.getChainInfo(),
      );

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress })).rejects.toThrow(
        `Unknown auth witness for message hash ${messageHash.toString()}`,
      );
    });

    it('transfer on behalf of other, wrong designated caller', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);
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
      expect((await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).result).toEqual(
        balance0,
      );
    });

    it('transfer on behalf of other, cancelled authwit', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);

      const intent = { caller: t.authwitProxy.address, action };

      const witness = await wallet.createAuthWit(adminAddress, intent);

      const innerHash = await computeInnerAuthWitHashFromAction(t.authwitProxy.address, action);
      await asset.methods.cancel_authwit(innerHash).send({ from: adminAddress });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      // The transfer should fail because nullifier already emitted
      await expect(
        sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    it('transfer on behalf of other, invalid verify_private_authwit on "from"', async () => {
      const authwitNonce = Fr.random();

      // Should fail as the returned value from the badAccount is malformed
      const txCancelledAuthwit = asset.methods.transfer_in_private(
        badAccount.address,
        account1Address,
        0,
        authwitNonce,
      );
      await expect(txCancelledAuthwit.simulate({ from: account1Address })).rejects.toThrow(
        'Assertion failed: Message not authorized by account',
      );
    });
  });
});
