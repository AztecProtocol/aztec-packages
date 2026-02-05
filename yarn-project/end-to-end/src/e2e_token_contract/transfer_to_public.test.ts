import { computeAuthWitMessageHash } from '@aztec/aztec.js/authorization';
import { getPublicEvents } from '@aztec/aztec.js/events';
import { Fr } from '@aztec/aztec.js/fields';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

const PRIVATE_ADDRESS = TokenContractTest.PRIVATE_ADDRESS;

describe('e2e_token_contract transfer_to_public', () => {
  const t = new TokenContractTest('transfer_to_public');
  let { asset, wallet, adminAddress, account1Address, account2Address, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
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

    await asset.methods.transfer_to_public(adminAddress, adminAddress, amount, 0).send({ from: adminAddress });

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  it('emits a Transfer event on transfer to public', async () => {
    const balancePriv = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balancePriv / 2n;
    expect(amount).toBeGreaterThan(0n);

    const receipt = await asset.methods
      .transfer_to_public(adminAddress, adminAddress, amount, 0)
      .send({ from: adminAddress });

    const events = await getPublicEvents<Transfer>(t.node, TokenContract.events.Transfer, {
      fromBlock: BlockNumber(receipt.blockNumber!),
      toBlock: BlockNumber(receipt.blockNumber! + 1),
    });

    expect(events.length).toBe(1);
    expect(events[0].event.from).toEqual(PRIVATE_ADDRESS);
    expect(events[0].event.to).toEqual(adminAddress);
    expect(events[0].event.amount).toEqual(amount);

    tokenSim.transferToPublic(adminAddress, adminAddress, amount);
  });

  it('on behalf of other', async () => {
    const balancePriv0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balancePriv0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const action = asset.methods.transfer_to_public(adminAddress, account1Address, amount, authwitNonce);
    const call = await action.getFunctionCall();
    const witness = await wallet.createAuthWit(adminAddress, { caller: t.proxy.address, action });

    await t.proxy.methods
      .forward_private_4(call.to, call.selector, call.args)
      .send({ from: adminAddress, authWitnesses: [witness] });
    tokenSim.transferToPublic(adminAddress, account1Address, amount);

    // Perform the transfer again, should fail
    await expect(
      t.proxy.methods
        .forward_private_4(call.to, call.selector, call.args)
        .send({ from: adminAddress, authWitnesses: [witness] }),
    ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
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
