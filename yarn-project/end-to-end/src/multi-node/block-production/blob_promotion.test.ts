import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';

import { proveAndSendTxs } from '../../test-wallet/utils.js';
import {
  type BlockProductionWithProverFixture,
  jest,
  setupBlockProductionWithProver,
  waitForProvenCheckpoint,
} from './setup.js';

const PIPELINE_MAX_TXS_PER_BLOCK = 2;
const PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

// In case the PIPELINE_TX_COUNT txs we send get split across two checkpoints, ensure at least one
// of them will be filled with the expected number of blocks.
const PIPELINE_TX_COUNT = PIPELINE_MAX_TXS_PER_BLOCK * PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT * 2;

// Blob/checkpoint promotion under stressed multi-block production: a node with promotion disabled
// fetches blobs while promotion-enabled peers fetch zero (the getBlobSidecar spy), and a
// high-block-count checkpoint built under adverse gossip latency still proves.
describe('multi-node/block-production/blob_promotion', () => {
  let fixture: BlockProductionWithProverFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  /**
   * Waits until the archiver's checkpointed chain tip has reached `targetBlockNumber`, then retrieves all
   * checkpoints and returns the number of the first one with at least `targetBlockCount` blocks. Used to
   * pick a high-block-count checkpoint to assert proving against, not to re-assert MBPS itself.
   */
  async function findMultiBlockCheckpoint(
    targetBlockCount: number,
    targetBlockNumber: BlockNumber,
  ): Promise<CheckpointNumber> {
    const { archiver, logger } = fixture;
    await retryUntil(
      async () => {
        const checkpointed = await archiver.getBlockNumber({ tag: 'checkpointed' });
        return checkpointed !== undefined && checkpointed >= targetBlockNumber;
      },
      `archiver checkpointed block ${targetBlockNumber}`,
      10,
      0.1,
    );

    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    logger.warn(`Retrieved ${checkpoints.length} checkpoints from archiver`, {
      checkpoints: checkpoints.map(pc => pc.checkpoint.getStats()),
    });

    const multiBlockCheckpoint = checkpoints.find(pc => pc.checkpoint.blocks.length >= targetBlockCount);
    expect(multiBlockCheckpoint).toBeDefined();
    return multiBlockCheckpoint!.checkpoint.number;
  }

  // Pre-proves TX_COUNT txs under adverse gossip latency, starts sequencers, waits for all txs to be
  // mined, then verifies node-0 (promotion disabled) fetches blobs while nodes 1-3 (promotion enabled)
  // skip blob fetching entirely, and that a high-block-count checkpoint built under load still proves.
  it('promotion-disabled node fetches blobs while peers skip them, and the checkpoint proves', async () => {
    // Same wide-slot prover-backed cluster as the rest of this directory, plus adverse gossip latency, a
    // tighter maxTxsPerCheckpoint, and node 0 with checkpoint promotion disabled so its blob-fetching can
    // be contrasted with the promotion-enabled peers.
    fixture = await setupBlockProductionWithProver({
      syncChainTip: 'checkpointed',
      minTxsPerBlock: 1,
      maxTxsPerBlock: PIPELINE_MAX_TXS_PER_BLOCK,
      maxTxsPerCheckpoint: 24,
      mockGossipSubNetworkLatency: 500,
      clearInheritedCoinbase: true,
      disableCheckpointPromotionOnFirstNode: true,
    });
    const { test, context, logger, nodes, contract, from } = fixture;

    // Spy on getBlobSidecar on all validator nodes before sequencers start, so we check that nodes
    // promote their proposed checkpoints and don't source data from blobs if they don't need to.
    const blobSpies = nodes.map((node, i) => {
      const blobClient = node.getBlobClient()!;
      const spy = jest.spyOn(blobClient, 'getBlobSidecar');
      logger.warn(`Installed getBlobSidecar spy on validator node ${i}`);
      return spy;
    });

    const initialCheckpointNumber = await fixture.rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txHashes = await proveAndSendTxs(
      context.wallet,
      PIPELINE_TX_COUNT,
      i => contract.methods.emit_nullifier(new Fr(i + 1)),
      { from },
    );
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    // Start the sequencers
    await test.startSequencers(nodes);
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Pick a high-block-count checkpoint to assert proving against; target the highest mined block.
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    const multiBlockCheckpoint = await findMultiBlockCheckpoint(
      PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT,
      maxMinedBlockNumber,
    );

    // Verify blob fetching behavior: node 0 has promotion disabled so it must fetch blobs,
    // while all other nodes should promote their proposed checkpoints and skip blob fetching entirely.
    for (let i = 0; i < blobSpies.length; i++) {
      const calls = blobSpies[i].mock.calls.length;
      logger.warn(`Validator ${i} made ${calls} getBlobSidecar calls`);
      if (i === 0) {
        expect(calls).toBeGreaterThan(0);
      } else {
        expect(calls).toBe(0);
      }
    }

    // Verify proving still works end-to-end with pipelined proposers under stressed production.
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});
