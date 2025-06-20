import {
  type AccountWallet,
  type AztecAddress,
  type AztecNode,
  type Logger,
  MerkleTreeId,
  type Wallet,
  retryUntil,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { setup } from './fixtures/utils.js';

// Tests PXE interacting with a node that has pruned relevant blocks, preventing usage of the archive API (which PXE
// should not rely on).
describe('e2e_pruned_blocks', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;

  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let cheatCodes: CheatCodes;

  let wallets: AccountWallet[];

  let adminWallet: Wallet;
  let senderWallet: Wallet;

  let admin: AztecAddress;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  let token: TokenContract;

  const MINT_AMOUNT = 1000n;

  // Don't make this value too high since we need to mine this number of empty blocks, which is relatively slow.
  const WORLD_STATE_BLOCK_HISTORY = 2;
  const EPOCH_LENGTH = 2;
  const WORLD_STATE_CHECK_INTERVAL_MS = 300;
  const ARCHIVER_POLLING_INTERVAL_MS = 300;

  beforeAll(async () => {
    ({ aztecNode, aztecNodeAdmin, cheatCodes, logger, teardown, wallets } = await setup(3, {
      aztecEpochDuration: EPOCH_LENGTH,
      worldStateBlockHistory: WORLD_STATE_BLOCK_HISTORY,
      worldStateBlockCheckIntervalMS: WORLD_STATE_CHECK_INTERVAL_MS,
      archiverPollingIntervalMS: ARCHIVER_POLLING_INTERVAL_MS,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
    }));

    [adminWallet, senderWallet] = wallets;
    [admin, sender, recipient] = wallets.map(a => a.getAddress());

    token = await TokenContract.deploy(adminWallet, admin, 'TEST', '$TST', 18).send().deployed();
    logger.info(`L2 token contract deployed at ${token.address}`);
  });

  afterAll(() => teardown());

  async function waitBlocks(blocks: number): Promise<void> {
    logger.warn(`Awaiting ${blocks} blocks to be mined`);
    for (let i = 0; i < blocks; i++) {
      await token.methods.private_get_name().send().wait();
      logger.warn(`Mined ${i + 1}/${blocks} blocks`);
    }
  }

  it('can discover and use notes created in both pruned and available blocks', async () => {
    // This is the only test in this suite so it doesn't seem worthwhile to worry too much about reusable setup etc. For
    // simplicity's sake I just did the entire thing here.

    // We are going to mint two notes for the sender, each for half of a total amount, and then have the sender combine
    // both in a transfer to the recipient. The catch is that enough blocks will be mined between the first and second
    // mint transaction that the node will drop the block corresponding to the first mint, resulting in errors if PXE
    // tried to access any historical information related to it (which it shouldn't).

    const firstMintReceipt = await token
      .withWallet(adminWallet)
      .methods.mint_to_private(admin, sender, MINT_AMOUNT / 2n)
      .send()
      .wait();
    const firstMintTxEffect = await aztecNode.getTxEffect(firstMintReceipt.txHash);

    // mint_to_private should create just one new note with the minted amount
    expect(firstMintTxEffect?.data.noteHashes.length).toEqual(1);
    const mintedNote = firstMintTxEffect?.data.noteHashes[0];

    // We now make a historical query for the leaf index at the block number in which this first note was created and
    // check that we get a valid result, which indirectly means that the queried block has not yet been pruned.
    expect(
      (await aztecNode.findLeavesIndexes(firstMintReceipt.blockNumber!, MerkleTreeId.NOTE_HASH_TREE, [mintedNote!]))[0]!
        .data,
    ).toBeGreaterThan(0);

    // We now mine dummy blocks, mark them as proven and wait for the node to process them, which should result in older
    // blocks (notably the one with the minted note) being pruned. Given world state prunes based on the finalized tip,
    // and we are defining the finalized tip as two epochs behind the proven one, we need to mine two extra epochs.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 0 });
    await waitBlocks(WORLD_STATE_BLOCK_HISTORY + EPOCH_LENGTH * 2 + 1);
    await cheatCodes.rollup.markAsProven();

    // The same historical query we performed before should now fail since this block is not available anymore. We poll
    // the node for a bit until it processes the blocks we marked as proven, causing the historical query to fail.
    logger.warn(`Awaiting 'unable to find leaf' error from node due to pruned history`);
    await retryUntil(
      async () => {
        try {
          await aztecNode.findLeavesIndexes(firstMintReceipt.blockNumber!, MerkleTreeId.NOTE_HASH_TREE, [mintedNote!]);
          return false;
        } catch (error) {
          return (error as Error).message.includes('Unable to find leaf');
        }
      },
      'waiting for pruning',
      (WORLD_STATE_CHECK_INTERVAL_MS + ARCHIVER_POLLING_INTERVAL_MS) * 5,
      0.2,
    );

    // We've completed the setup we were interested in, and can now simply mint the second half of the amount, transfer
    // the full amount to the recipient (which will require the sender to discover and prove both the old and new notes)
    // and check that everything worked as expected.
    await token
      .withWallet(adminWallet)
      .methods.mint_to_private(admin, sender, MINT_AMOUNT / 2n)
      .send()
      .wait();

    await token.withWallet(senderWallet).methods.transfer(recipient, MINT_AMOUNT).send().wait();

    expect(await token.methods.balance_of_private(recipient).simulate()).toEqual(MINT_AMOUNT);
    expect(await token.methods.balance_of_private(sender).simulate()).toEqual(0n);
  });
});
