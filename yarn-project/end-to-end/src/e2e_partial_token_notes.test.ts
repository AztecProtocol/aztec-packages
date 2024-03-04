/* eslint-disable no-console */
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

jest.setTimeout(30_000);

describe('e2e_partial_token_notes', () => {
  let ctx: EndToEndContext;
  let tokenContract: TokenContract;

  beforeAll(async () => {
    ctx = await setup(2);
    tokenContract = await TokenContract.deploy(ctx.wallet, ctx.wallet.getAddress(), 'Test', 'TEST', 18n)
      .send()
      .deployed();

    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);
    const tx = await tokenContract.methods.mint_private(1000n, secretHash).send().wait();
    await addPendingShieldNoteToPXE(ctx.wallet, tokenContract.address, 1000n, secretHash, tx.txHash);

    await tokenContract.methods.redeem_shield(ctx.wallet.getAddress(), 1000n, secret).send().wait();
  }, 50_000);

  it('splits a balance in two partial notes', async () => {
    const partialNoteHashes = await createPartialNotes(1000n);

    await expect(tokenContract.methods.balance_of_private(ctx.wallets[0].getAddress()).view()).resolves.toEqual(0n);

    const completeNotesTx = await tokenContract.methods
      .complete_partial_notes_pair(partialNoteHashes, [400, 600])
      .send()
      .wait();

    await completePartialNotes([400, 600], completeNotesTx.txHash);

    await expect(tokenContract.methods.balance_of_private(ctx.wallets[0].getAddress()).view()).resolves.toEqual(400n);
    await expect(tokenContract.methods.balance_of_private(ctx.wallets[1].getAddress()).view()).resolves.toEqual(600n);
  });

  it('completed notes are usable', async () => {
    // nullify the one note completed above
    await expect(
      ctx.pxe.getNotes({
        contractAddress: tokenContract.address,
        owner: ctx.wallets[0].getAddress(),
      }),
    ).resolves.toHaveLength(1);

    await tokenContract.methods
      .transfer(ctx.wallets[0].getAddress(), ctx.wallets[1].getAddress(), 10n, 0)
      .send()
      .wait();

    await expect(tokenContract.methods.balance_of_private(ctx.wallets[0].getAddress()).view()).resolves.toEqual(390n);
    await expect(tokenContract.methods.balance_of_private(ctx.wallets[1].getAddress()).view()).resolves.toEqual(610n);
  });

  it('partial notes are completable only once', async () => {
    const partialNoteHashes = await createPartialNotes(10n);
    await tokenContract.methods.complete_partial_notes_pair(partialNoteHashes, [5n, 5n]).send().wait();
    await expect(
      tokenContract.methods.complete_partial_notes_pair(partialNoteHashes, [5n, 5n]).send().wait(),
    ).rejects.toThrow(/was dropped/);
  });

  it('partial notes are be constrained to original total amount', async () => {
    const partialNoteHashes = await createPartialNotes(10n);

    await expect(
      tokenContract.methods.complete_partial_notes_pair(partialNoteHashes, [5n, 6n]).send().wait(),
    ).rejects.toThrow(/Partial notes not authorized/);
  });

  it('partial notes can only be completed by original creator', async () => {
    const partialNoteHashes = await createPartialNotes(10n);

    await expect(
      tokenContract
        .withWallet(ctx.wallets[1])
        .methods.complete_partial_notes_pair(partialNoteHashes, [5n, 5n])
        .send()
        .wait(),
    ).rejects.toThrow(/Partial notes not authorized/);
  });

  const createPartialNotes = async (totalAmount: bigint | number) => {
    const { txHash } = await tokenContract.methods
      .split_into_partial_notes_pair(ctx.wallets[0].getAddress(), ctx.wallets[1].getAddress(), totalAmount, 0)
      .send()
      .wait();

    const logs = await ctx.pxe.getUnencryptedLogs({ txHash });
    const partialNoteHashes = BufferReader.asReader(logs.logs[0].log.data).readArray(2, Fr);

    return partialNoteHashes;
  };

  const completePartialNotes = async (expectedAmounts: number[], completionTxHash: TxHash) => {
    // TODO use a dedicated event selector for these completion events once implemented
    const logs = await ctx.pxe.getUnencryptedLogs({ txHash: completionTxHash });
    const completedEvent0 = BufferReader.asReader(logs.logs[0].log.data).readArray(2, Fr);
    const completedEvent1 = BufferReader.asReader(logs.logs[1].log.data).readArray(2, Fr);

    // constant value taken from the Noir contract
    const tokenNoteId = new Fr(8411110710111078111116101n);

    expect(completedEvent0).toEqual([tokenNoteId, new Fr(expectedAmounts[0])]);
    expect(completedEvent1).toEqual([tokenNoteId, new Fr(expectedAmounts[1])]);

    await ctx.pxe.completePartialNote(
      tokenContract.address,
      tokenNoteId,
      [[0, new Fr(expectedAmounts[0])]],
      completionTxHash,
    );

    await ctx.pxe.completePartialNote(
      tokenContract.address,
      tokenNoteId,
      [[0, new Fr(expectedAmounts[1])]],
      completionTxHash,
    );
  };
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
