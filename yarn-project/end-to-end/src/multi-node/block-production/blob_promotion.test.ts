import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig } from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveAndSendTxs } from '../../test-wallet/utils.js';
import { MultiNodeTestContext, buildMockGossipValidators } from '../multi_node_test_context.js';
import {
  type BlockProductionWithProverFixture,
  NODE_COUNT,
  WIDE_SLOT_TIMING,
  jest,
  waitForProvenCheckpoint,
} from './setup.js';

// Exactly fills one checkpoint to `maxTxsPerCheckpoint` (24) below, building a single ~12-block
// checkpoint. The assertions only need one checkpoint with `PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT`
// blocks plus node-0's blob fetch on that checkpoint's download, so sending a second checkpoint's
// worth of txs (the old 34) just forces an extra ~72s build slot that nothing here checks.
const PIPELINE_TX_COUNT = 24;
const PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

// Blob/checkpoint promotion under stressed multi-block production: a node with promotion disabled
// fetches blobs while promotion-enabled peers fetch zero (the getBlobSidecar spy), and a
// high-block-count checkpoint built under adverse gossip latency still proves. The MBPS and pipelining
// offset assertions live in their behavior-named homes (production tests, pipeline_prune) and are not
// re-checked here.
describe('multi-node/block-production/blob_promotion', () => {
  let fixture: BlockProductionWithProverFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  /**
   * Sets up the pipelining wide-slot context: same timing profile as {@link setupBlockProductionWithProver} plus 500ms mock
   * gossip latency, a tighter `maxTxsPerCheckpoint`, and node-0 with checkpoint promotion disabled so
   * the blob-promotion behavior of the other nodes can be asserted against it.
   */
  async function setupBlobPromotion(): Promise<BlockProductionWithProverFixture> {
    const validators = buildMockGossipValidators(NODE_COUNT);

    const test = await MultiNodeTestContext.setup({
      ...WIDE_SLOT_TIMING,
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      mockGossipSubNetworkLatency: 500, // adverse network conditions
      startProverNode: true,
      maxTxsPerCheckpoint: 24,
      inboxLag: 2,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 2,
      pxeOpts: { syncChainTip: 'checkpointed' },
      skipInitialSequencer: true,
    });

    const { context, logger, rollup } = test;
    const wallet = context.wallet as TestWallet;
    const from = context.accounts[0]; // auto-created by setup

    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    // Clear inherited coinbase so each validator derives coinbase from its own attester key
    const nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: undefined,
        // Disable checkpoint promotion on the first node so it always fetches blobs,
        // allowing us to assert that other nodes skip blob fetching via promotion.
        ...(i === 0 ? { skipPromoteProposedCheckpointDuringL1Sync: true } : {}),
      } as Partial<AztecNodeConfig>),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    wallet.updateNode(nodes[0]);
    const archiver = nodes[0].getBlockSource() as Archiver;

    const contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });

    const { failEvents } = test.watchNodeSequencerEvents(nodes);

    return { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from, failEvents };
  }

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
    fixture = await setupBlobPromotion();
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
