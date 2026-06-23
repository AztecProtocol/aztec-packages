import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';
import type { SequencerEvents } from '@aztec/sequencer-client';

import type { EndToEndContext } from '../../../fixtures/utils.js';
import type { TestWallet } from '../../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import {
  type BlockProposedEvent,
  MBPS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  type TrackedSequencerEvent,
  buildMockGossipValidators,
} from '../../multi_node_test_context.js';
import { type MbpsFixture, NODE_COUNT, jest, waitForProvenCheckpoint } from './setup.js';

const PIPELINE_TX_COUNT = 34;
const PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

describe('multi-node/consensus/mbps/pipelining', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  /**
   * Sets up the pipelining MBPS context: same MBPS timing profile as {@link setupMbps} plus 500ms mock
   * gossip latency, a tighter `maxTxsPerCheckpoint`, and node-0 with checkpoint promotion disabled so
   * the blob-promotion behavior of the other nodes can be asserted against it.
   */
  async function setupPipeline(): Promise<MbpsFixture> {
    const validators = buildMockGossipValidators(NODE_COUNT);

    const test = await MultiNodeTestContext.setup({
      ...MBPS_TIMING,
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

    const { failEvents } = test.watchSequencerEvents(
      nodes.map(n => n.getSequencer()!),
      i => ({ validator: validators[i].attester }),
    );

    return { test, context, logger, rollup, archiver, validators, nodes, contract, wallet, from, failEvents };
  }

  /**
   * Waits until the archiver's checkpointed chain tip has reached `targetBlockNumber`, then retrieves all
   * checkpoints, checks that one has the target block count, and returns its number.
   */
  async function assertPipelineMultipleBlocksPerSlot(
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

    let expectedBlockNumber = checkpoints[0].checkpoint.blocks[0].number;
    let multiBlockCheckpointNumber: CheckpointNumber | undefined;

    for (const checkpoint of checkpoints) {
      const blockCount = checkpoint.checkpoint.blocks.length;
      if (blockCount >= targetBlockCount && multiBlockCheckpointNumber === undefined) {
        multiBlockCheckpointNumber = checkpoint.checkpoint.number;
      }
      logger.warn(`Checkpoint ${checkpoint.checkpoint.number} has ${blockCount} blocks`, {
        checkpoint: checkpoint.checkpoint.getStats(),
      });

      for (let i = 0; i < blockCount; i++) {
        const block = checkpoint.checkpoint.blocks[i];
        expect(block.indexWithinCheckpoint).toBe(i);
        expect(block.checkpointNumber).toBe(checkpoint.checkpoint.number);
        expect(block.number).toBe(expectedBlockNumber);
        expectedBlockNumber++;
      }
    }

    expect(multiBlockCheckpointNumber).toBeDefined();
    return multiBlockCheckpointNumber!;
  }

  // Pre-proves TX_COUNT txs, starts sequencers, waits for all txs to be mined. Asserts a
  // MBPS checkpoint with ≥EXPECTED_BLOCKS_PER_CHECKPOINT blocks. Asserts every block's header
  // slot equals build-slot+1 (pipelining offset). Verifies node-0 fetches blobs (promotion
  // disabled) while nodes 1-3 skip blob fetching (promotion enabled). Waits for the checkpoint
  // to be proven.
  it('pipelining builds blocks using slot plus 1 proposer and proves them', async () => {
    fixture = await setupPipeline();
    const { test, context, logger, archiver, nodes, contract, from } = fixture;

    // Spy on getBlobSidecar on all validator nodes before sequencers start, so we check that nodes
    // promote their proposed checkpoints and don't source data from blobs if they don't need to.
    const blobSpies = nodes.map((node, i) => {
      const blobClient = node.getBlobClient()!;
      const spy = jest.spyOn(blobClient, 'getBlobSidecar');
      logger.warn(`Installed getBlobSidecar spy on validator node ${i}`);
      return spy;
    });

    // Subscribe to block-proposed events to capture build slots
    const blockProposedEvents: BlockProposedEvent[] = [];
    const sequencers = nodes.map(n => n.getSequencer()!);
    for (const sequencer of sequencers) {
      sequencer.getSequencer().on('block-proposed', (args: Parameters<SequencerEvents['block-proposed']>[0]) => {
        logger.warn(`block-proposed event: blockNumber=${args.blockNumber}, slot=${args.slot}`, args);
        blockProposedEvents.push({
          blockNumber: args.blockNumber,
          slot: args.slot,
          buildSlot: args.buildSlot,
        });
      });
    }

    const initialCheckpointNumber = await fixture.rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txs = await timesAsync(PIPELINE_TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    // Start the sequencers
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining; target the highest block number across mined receipts
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    const multiBlockCheckpoint = await assertPipelineMultipleBlocksPerSlot(
      PIPELINE_EXPECTED_BLOCKS_PER_CHECKPOINT,
      maxMinedBlockNumber,
    );

    // Verify the pipelining offset: build slot N vs submission slot N+1
    await test.assertProposerPipelining(archiver, blockProposedEvents, logger);

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

    // Verify proving still works end-to-end with pipelined proposers
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});
