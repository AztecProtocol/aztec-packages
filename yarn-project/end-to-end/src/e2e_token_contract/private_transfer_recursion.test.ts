import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { mintNotes } from '../fixtures/token_utils.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract private transfer recursion', () => {
  const t = new TokenContractTest('odd_transfer_private');
  let { asset, wallet, adminAddress, account1Address, node } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    ({ asset, wallet, adminAddress, account1Address, node } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  it('transfer full balance', async () => {
    // We insert 16 notes, which is large enough to guarantee that the token will need to do two recursive calls to
    // itself to consume them all (since it retrieves 2 notes on the first pass and 8 in each subsequent pass).
    const totalNotes = 16;
    const totalBalance = await mintNotes(wallet, adminAddress, adminAddress, asset, Array(totalNotes).fill(10n));
    const tx = await asset.methods.transfer(account1Address, totalBalance).send({ from: adminAddress }).wait();
    const txEffects = await node.getTxEffect(tx.txHash);

    // We should have nullified all notes, plus an extra nullifier for the transaction and one for the event commitment.
    expect(txEffects!.data.nullifiers.length).toBe(totalNotes + 1 + 1);
    // We should have created a single new note, for the recipient
    expect(txEffects!.data.noteHashes.length).toBe(1);

    const events = await wallet.getPrivateEvents<Transfer>(
      asset.address,
      TokenContract.events.Transfer,
      tx.blockNumber!,
      1,
      [account1Address],
    );

    expect(events[0]).toEqual({
      from: adminAddress,
      to: account1Address,
      amount: totalBalance,
    });
  });

  it('transfer less than full balance and get change', async () => {
    const noteAmounts = [10n, 10n, 10n, 10n];
    const expectedChange = 3n; // This will result in one of the notes being partially used

    const totalBalance = await mintNotes(wallet, adminAddress, adminAddress, asset, noteAmounts);
    const toSend = totalBalance - expectedChange;

    const tx = await asset.methods.transfer(account1Address, toSend).send({ from: adminAddress }).wait();
    const txEffects = await node.getTxEffect(tx.txHash);

    // We should have nullified all notes, plus an extra nullifier for the transaction and one for the event commitment.
    expect(txEffects!.data.nullifiers.length).toBe(noteAmounts.length + 1 + 1);
    // We should have created two new notes, one for the recipient and one for the sender (with the change)
    expect(txEffects!.data.noteHashes.length).toBe(2);

    const senderBalance = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    expect(senderBalance).toEqual(expectedChange);

    const events = await wallet.getPrivateEvents<Transfer>(
      asset.address,
      TokenContract.events.Transfer,
      tx.blockNumber!,
      1,
      [account1Address],
    );

    expect(events[0]).toEqual({
      from: adminAddress,
      to: account1Address,
      amount: toSend,
    });
  });

  describe('failure cases', () => {
    it('transfer more than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });

      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);

      await expect(asset.methods.transfer(account1Address, amount).simulate({ from: adminAddress })).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
    });
  });
});
