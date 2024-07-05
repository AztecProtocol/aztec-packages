import { BatchCall, EventType, Fr } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js';

import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('odd_transfer_private');
  let { asset, accounts, tokenSim, wallets } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, accounts, tokenSim, wallets } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer full balance', async () => {
    const N = 5;
    // Mint 4 * N notes
    // Then calls `transfer` to send all the notes to another account
    // The transfer will only spend 2 notes itself, and then call `_accumulate` which will recurse
    // until it have spent all the notes

    let expectedNullifiers = 2; // 1 from the tx_hash and 1 from the original note in the senders possesion

    for (let i = 0; i < N; i++) {
      const actions = [
        asset.methods.privately_mint_private_note(1n).request(),
        asset.methods.privately_mint_private_note(1n).request(),
        asset.methods.privately_mint_private_note(1n).request(),
        asset.methods.privately_mint_private_note(1n).request(),
      ];
      await new BatchCall(wallets[0], actions).send().wait();

      expectedNullifiers += actions.length;

      tokenSim.mintPrivate(BigInt(actions.length));
      tokenSim.redeemShield(accounts[0].address, BigInt(actions.length));
    }

    const amount = await asset.methods.balance_of_private(accounts[0].address).simulate();

    expect(amount).toBeGreaterThan(0n);
    const tx = await asset.methods.transfer(accounts[1].address, amount).send().wait({ debug: true });
    tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

    expect(tx.debugInfo?.nullifiers.length).toBe(expectedNullifiers);

    // We expect there to have been inserted a single new note.
    expect(tx.debugInfo?.noteHashes.length).toBe(1);

    const events = await wallets[1].getEvents(EventType.Encrypted, TokenContract.events.Transfer, tx.blockNumber!, 1);

    expect(events[0]).toEqual({
      from: accounts[0].address,
      to: accounts[1].address,
      amount: new Fr(amount),
    });
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(asset.methods.transfer(accounts[1].address, amount).simulate()).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
    });
  });
});
