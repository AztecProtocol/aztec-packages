import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { MerkleTreeId } from '@aztec/aztec.js/trees';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { CheatCodes } from '@aztec/aztec/testing';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

// Tests PXE interacting with a node that has pruned relevant blocks, preventing usage of the archive API (which PXE
// should not rely on).
//
// Uses a single node with AutomineSequencer, worldStateCheckpointHistory=2, and
// aztecProofSubmissionEpochs=1024 (effectively no reorg). markAsProven + extra L1 blocks cause world-state
// to prune old block data; the test then verifies that PXE can still discover notes from pruned blocks.
describe('automine/effects/pruned_blocks', () => {
  jest.setTimeout(5 * 60 * 1000);

  let logger: Logger;
  let teardown: () => Promise<void>;

  let aztecNode: AztecNode & AztecNodeDebug;
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
      cheatCodes,
      logger,
      teardown,
      wallet,
      accounts: [admin, sender, recipient],
    } = (
      await AutomineTestContext.setup({
        numberOfAccounts: 3,
        worldStateCheckpointHistory: WORLD_STATE_CHECKPOINT_HISTORY,
        worldStateBlockCheckIntervalMS: WORLD_STATE_CHECK_INTERVAL_MS,
        archiverPollingIntervalMS: ARCHIVER_POLLING_INTERVAL_MS,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      })
    ).context);

    ({ contract: token } = await TokenContract.deploy(wallet, admin, 'TEST', '$TST', 18).send({ from: admin }));
    logger.info(`L2 token contract deployed at ${token.address}`);
  });

  afterAll(() => teardown());

  async function mineEmptyBlocks(blocks: number): Promise<void> {
    logger.warn(`Mining ${blocks} empty blocks`);
    for (let i = 0; i < blocks; i++) {
      await aztecNode.mineBlock();
      logger.warn(`Mined ${i + 1}/${blocks} blocks`);
    }
  }

  // Polls the historical leaf query until it starts throwing "Unable to find leaf", which is how a
  // pruned world-state block surfaces to callers once the prune has propagated.
  const waitForWorldStatePrune = (blockNumber: BlockNumber, note: Fr) =>
    retryUntil(
      async () => {
        try {
          await aztecNode.findLeavesIndexes(blockNumber, MerkleTreeId.NOTE_HASH_TREE, [note]);
          return false;
        } catch (error) {
          return (error as Error).message.includes('Unable to find leaf');
        }
      },
      'waiting for pruning',
      60,
      0.5,
    );

  // Mints half the token amount (tx1), mines enough empty blocks to make that block eligible for pruning,
  // calls markAsProven + extra L1 blocks to finalize the prune, polls until the archive query on tx1's
  // block fails, then mints the other half and transfers the full amount. Asserts final balances.
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

    // Mine enough empty blocks past the first mint block so it becomes eligible for pruning, then
    // mark the chain as proven. Under AUTOMINE_E2E_OPTS the AutomineSequencer does not mark blocks
    // proven and no EpochTestSettler is wired in the e2e fixture, so we mark explicitly here.
    // World-state prunes on the chain-finalized event; with Anvil's `finalized = latest - 2`
    // heuristic, we need a couple of additional L1 blocks after markAsProven so the archiver's
    // `getFinalizedL1Block` query resolves to a block that already sees the new proven tip.
    await mineEmptyBlocks(WORLD_STATE_CHECKPOINT_HISTORY + 1);
    await cheatCodes.rollup.markAsProven();
    await cheatCodes.eth.mineEmptyBlock(3);

    // The same historical query we performed before should now fail since this block is not available anymore. We poll
    // the node for a bit until it processes the blocks we marked as proven, causing the historical query to fail.
    logger.warn(`Awaiting 'unable to find leaf' error from node due to pruned history`);
    await waitForWorldStatePrune(firstMintReceipt.blockNumber!, mintedNote!);

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
