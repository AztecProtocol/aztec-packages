import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { MerkleTreeId } from '@aztec/aztec.js/trees';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { CheatCodes } from '@aztec/aztec/testing';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

// Tests PXE interacting with a node that has pruned relevant blocks, preventing usage of the archive API (which PXE
// should not rely on).
describe('e2e_pruned_blocks', () => {
  // Mining WORLD_STATE_CHECKPOINT_HISTORY+3 sequential dependent txs takes ~24s/block under
  // pipelining, exceeding the default 5min jest timeout. Bump to 15 minutes.
  jest.setTimeout(15 * 60 * 1000);

  let logger: Logger;
  let teardown: () => Promise<void>;

  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let cheatCodes: CheatCodes;

  let wallet: Wallet;

  let admin: AztecAddress;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  let token: TokenContract;

  const MINT_AMOUNT = 1000n;

  // Don't make this value too high since we need to mine this number of empty blocks, which is relatively slow.
  const WORLD_STATE_CHECKPOINT_HISTORY = 2;
  const WORLD_STATE_CHECK_INTERVAL_MS = 300;
  const ARCHIVER_POLLING_INTERVAL_MS = 300;

  beforeAll(async () => {
    ({
      aztecNode,
      aztecNodeAdmin,
      cheatCodes,
      logger,
      teardown,
      wallet,
      accounts: [admin, sender, recipient],
    } = await setup(3, {
      worldStateCheckpointHistory: WORLD_STATE_CHECKPOINT_HISTORY,
      worldStateBlockCheckIntervalMS: WORLD_STATE_CHECK_INTERVAL_MS,
      archiverPollingIntervalMS: ARCHIVER_POLLING_INTERVAL_MS,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
    }));

    ({ contract: token } = await TokenContract.deploy(wallet, admin, 'TEST', '$TST', 18).send({ from: admin }));
    logger.info(`L2 token contract deployed at ${token.address}`);
  });

  afterAll(() => teardown());

  async function waitBlocks(blocks: number): Promise<void> {
    logger.warn(`Awaiting ${blocks} blocks to be mined`);
    for (let i = 0; i < blocks; i++) {
      await token.methods.private_get_name().send({ from: admin });
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

    const { receipt: firstMintReceipt } = await token.methods
      .mint_to_private(sender, MINT_AMOUNT / 2n)
      .send({ from: admin });
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

    // Mine enough blocks past the first mint block so it becomes eligible for pruning, then mark
    // the chain as proven (the AnvilTestWatcher's automatic markAsProven loop only runs under
    // automine, but this fixture uses interval mining — so we mark it explicitly here, the same
    // way the test did before PR #21156 dropped the explicit call). World-state prunes on the
    // chain-finalized event; with Anvil's `finalized = latest - 2` heuristic, we need a couple
    // of additional L1 blocks after markAsProven so the archiver's `getFinalizedL1Block` query
    // resolves to a block that already sees the new proven tip — so we mine a small buffer of
    // empty checkpoints afterwards.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 0 });
    await waitBlocks(WORLD_STATE_CHECKPOINT_HISTORY + 1);
    await cheatCodes.rollup.markAsProven();
    await waitBlocks(2);

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
      60,
      0.5,
    );

    // We've completed the setup we were interested in, and can now simply mint the second half of the amount, transfer
    // the full amount to the recipient (which will require the sender to discover and prove both the old and new notes)
    // and check that everything worked as expected.
    await token.methods.mint_to_private(sender, MINT_AMOUNT / 2n).send({ from: admin });

    await token.methods.transfer(recipient, MINT_AMOUNT).send({ from: sender });

    expect((await token.methods.balance_of_private(recipient).simulate({ from: recipient })).result).toEqual(
      MINT_AMOUNT,
    );
    expect((await token.methods.balance_of_private(sender).simulate({ from: sender })).result).toEqual(0n);
  });
});
