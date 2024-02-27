import {
  AccountWalletWithPrivateKey,
  AztecAddress,
  ExtendedNote,
  Fr,
  Note,
  TxHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { BufferReader } from '@aztec/foundation/serialize';
import { TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { EndToEndContext, setup } from './fixtures/utils.js';

jest.setTimeout(1_000_000);

describe('e2e_partial_notes', () => {
  let ctx: EndToEndContext;
  let bananaCoin: TokenContract;

  beforeAll(async () => {
    ctx = await setup(2);
    bananaCoin = await TokenContract.deploy(ctx.wallet, ctx.wallet.getAddress(), 'BananaCoin', 'BAC', 18n)
      .send()
      .deployed();

    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);
    const tx = await bananaCoin.methods.mint_private(1000n, secretHash).send().wait();
    await addPendingShieldNoteToPXE(ctx.wallet, bananaCoin.address, 1000n, secretHash, tx.txHash);

    await bananaCoin.methods.redeem_shield(ctx.wallet.getAddress(), 1000n, secret).send().wait();
  });

  it('should have a private balance', async () => {
    expect(await bananaCoin.methods.balance_of_private(ctx.wallet.getAddress()).view()).toEqual(1000n);
  });

  it('should split', async () => {
    const out = await bananaCoin.methods.split_it(ctx.wallets[1].getAddress(), 250n, 150n).send().wait({ debug: true });
    const logs = await ctx.aztecNode.getUnencryptedLogs({
      txHash: out.txHash,
    });

    const partialNotes = BufferReader.asReader(logs.logs[0].log.data).readArray(2, Fr);
    const slots = BufferReader.asReader(logs.logs[1].log.data).readArray(2, Fr);
    const amounts = BufferReader.asReader(logs.logs[2].log.data).readArray(2, Fr);
    const noteTypeId = new Fr(8411110710111078111116101n); // TokenNote

    console.log(partialNotes);
    console.log(slots);
    console.log(amounts);
    console.log('note hashes:', out.debugInfo?.newNoteHashes);

    // the pxe could keep track of partial notes and recreate them
    // for now, just add the notes manually
    await ctx.wallets[0].addNote(
      new ExtendedNote(
        new Note([amounts[0], ctx.wallets[0].getAddress(), partialNotes[0]]),
        ctx.wallets[0].getAddress(),
        bananaCoin.address,
        slots[0],
        noteTypeId,
        out.txHash,
      ),
    );

    await ctx.wallets[1].addNote(
      new ExtendedNote(
        new Note([amounts[1], ctx.wallets[1].getAddress(), partialNotes[1]]),
        ctx.wallets[1].getAddress(),
        bananaCoin.address,
        slots[1],
        noteTypeId,
        out.txHash,
      ),
    );

    // if notes were added correctly then we should have a balance
    await expect(bananaCoin.methods.balance_of_private(ctx.wallets[0].getAddress()).view()).resolves.toEqual(850n);
    await expect(bananaCoin.methods.balance_of_private(ctx.wallets[1].getAddress()).view()).resolves.toEqual(150n);

    // and we should be able to consume the notes
    // use wallets[1] since it should just have one note (the partial note)
    await bananaCoin
      .withWallet(ctx.wallets[1])
      .methods.transfer(ctx.wallets[1].getAddress(), ctx.wallets[0].getAddress(), 100n, 0)
      .send()
      .wait();

    await expect(bananaCoin.methods.balance_of_private(ctx.wallets[0].getAddress()).view()).resolves.toEqual(950n);
    await expect(bananaCoin.methods.balance_of_private(ctx.wallets[1].getAddress()).view()).resolves.toEqual(50n);
  });
});

const addPendingShieldNoteToPXE = async (
  wallet: AccountWalletWithPrivateKey,
  contract: AztecAddress,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash,
) => {
  const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
  const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

  const note = new Note([new Fr(amount), secretHash]);
  const extendedNote = new ExtendedNote(note, wallet.getAddress(), contract, storageSlot, noteTypeId, txHash);
  await wallet.addNote(extendedNote);
};
