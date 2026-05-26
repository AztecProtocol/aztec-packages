import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { sendThroughAuthwitProxy, simulateThroughAuthwitProxy } from '../fixtures/authwit_proxy.js';
import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { BlacklistTokenContractTest } from './blacklist_token_contract_test.js';

describe('e2e_blacklist_token_contract transfer private', () => {
  const t = new BlacklistTokenContractTest('transfer_private');
  let { asset, tokenSim, wallet, adminAddress, otherAddress, blacklistedAddress } = t;

  beforeAll(async () => {
    // TODO(kill-non-pipelined): re-enable pipelining once B1 (world-state fork lifecycle) is
    // fixed — BlacklistTokenContractTest.applyBaseSetup runs two 86400s warps which time out
    // mineBlock under pipelining. See PIPELINING_GOTCHAS.md.
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
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    const tokenTransferInteraction = asset.methods.transfer(adminAddress, otherAddress, amount, 0);
    await tokenTransferInteraction.send({ from: adminAddress });
    tokenSim.transferPrivate(adminAddress, otherAddress, amount);
  });

  it('transfer to self', async () => {
    const balance0 = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    await asset.methods.transfer(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });
    tokenSim.transferPrivate(adminAddress, adminAddress, amount);
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods
      .balance_of_private(adminAddress)
      .simulate({ from: adminAddress })
      .then(r => r.result);
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const action = asset.methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
    const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

    // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
    await sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] });
    tokenSim.transferPrivate(adminAddress, otherAddress, amount);

    // Perform the transfer again, should fail
    await expect(
      sendThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
    ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(adminAddress, otherAddress, amount, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Balance too low');
    });

    it('transfer on behalf of self with non-zero nonce', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 - 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(
        asset.methods.transfer(adminAddress, otherAddress, amount, 1).simulate({ from: adminAddress }),
      ).rejects.toThrow(
        "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero",
      );
    });

    it('transfer more than balance on behalf of other', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const balance1 = await asset.methods
        .balance_of_private(otherAddress)
        .simulate({ from: otherAddress })
        .then(r => r.result);
      const amount = balance0 + 1n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
      const witness = await wallet.createAuthWit(adminAddress, { caller: t.authwitProxy.address, action });

      // Admin sends through proxy so their keys are in scope, while proxy becomes msg_sender to trigger authwit.
      await expect(
        simulateThroughAuthwitProxy(t.authwitProxy, action, { from: adminAddress, authWitnesses: [witness] }),
      ).rejects.toThrow('Assertion failed: Balance too low');
      expect(
        await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result),
      ).toEqual(balance0);
      expect(
        await asset.methods
          .balance_of_private(otherAddress)
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

    it('transfer on behalf of other without approval', async () => {
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
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
      const balance0 = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress })
        .then(r => r.result);
      const amount = balance0 / 2n;
      const authwitNonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      const action = asset.methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
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
      expect(
        await asset.methods
          .balance_of_private(adminAddress)
          .simulate({ from: adminAddress })
          .then(r => r.result),
      ).toEqual(balance0);
    });

    it('transfer from a blacklisted account', async () => {
      await expect(
        asset.methods.transfer(blacklistedAddress, adminAddress, 1n, 0).simulate({ from: blacklistedAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Sender');
    });

    it('transfer to a blacklisted account', async () => {
      await expect(
        asset.methods.transfer(adminAddress, blacklistedAddress, 1n, 0).simulate({ from: adminAddress }),
      ).rejects.toThrow('Assertion failed: Blacklisted: Recipient');
    });
  });
});
