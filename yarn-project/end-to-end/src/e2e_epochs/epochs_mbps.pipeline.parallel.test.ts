import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

const NODE_COUNT = 4;
const EXPECTED_BLOCKS_PER_CHECKPOINT = 8;

// Send enough transactions to trigger multiple blocks within a checkpoint assuming 2 txs per block.
const TX_COUNT = 34;

// Four-validator pipelining + MBPS suite. Verifies blocks are built in slot N by the proposer
// scheduled for slot N+1 (the pipelining +1 offset). Includes a prover node (fake proofs) and
// uses 500ms mock gossip latency to simulate adverse network conditions. Two tests: (1) normal
// pipelining flow asserting build-vs-submission slot offsets and blob-fetch promotion; (2) a
// proposer skips its checkpoint publish, triggering an uncheckpointed-blocks prune followed by
// recovery. Uses EpochsTestContext with mockGossipSubNetwork and no initial sequencer.
describe('e2e_epochs/epochs_mbps_pipeline', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let archiver: Archiver;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: TestContract;
  let wallet: TestWallet;
  let from: AztecAddress;

  /** Creates validators and sets up the test context with MBPS and proposer pipelining. */
  async function setupTest(opts: {
    syncChainTip: 'proposed' | 'checkpointed';
    minTxsPerBlock?: number;
    maxTxsPerBlock?: number;
  }) {
    const { syncChainTip = 'checkpointed', ...setupOpts } = opts;

    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      mockGossipSubNetworkLatency: 500, // adverse network conditions
      startProverNode: true,
      perBlockAllocationMultiplier: 8,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 12,
      aztecSlotDuration: 72,
      blockDurationMs: 5500,
      maxTxsPerCheckpoint: 24,
      aztecTargetCommitteeSize: 3,
      inboxLag: 2,
      ...setupOpts,
      pxeOpts: { syncChainTip },
      skipInitialSequencer: true,
    });

    ({ context, logger, rollup } = test);
    wallet = context.wallet;
    from = context.accounts[0]; // auto-created by setup

    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    // Clear inherited coinbase so each validator derives coinbase from its own attester key
    nodes = await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        coinbase: undefined,
        // Disable checkpoint promotion on the first node so it always fetches blobs,
        // allowing us to assert that other nodes skip blob fetching via promotion.
        ...(i === 0 ? { skipPromoteProposedCheckpointDuringL1Sync: true } : {}),
      }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    wallet.updateNode(nodes[0]);
    archiver = nodes[0].getBlockSource() as Archiver;

    contract = await test.registerTestContract(wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  }

  /**
   * Waits until the archiver's checkpointed chain tip has reached `targetBlockNumber`, then retrieves all checkpoints,
   * checks that one has the target block count, and returns its number.
   */
  async function assertMultipleBlocksPerSlot(
    targetBlockCount: number,
    targetBlockNumber: BlockNumber,
    logger: Logger,
  ): Promise<CheckpointNumber> {
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

  /** Waits until a specific multi-block checkpoint is proven. */
  async function waitForProvenCheckpoint(targetCheckpoint: CheckpointNumber) {
    const provenTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4;
    logger.warn(`Waiting for checkpoint ${targetCheckpoint} to be proven (timeout=${provenTimeout}s)`);
    await test.waitUntilProvenCheckpointNumber(targetCheckpoint, provenTimeout);
    logger.warn(`Proven checkpoint advanced to ${test.monitor.provenCheckpointNumber}`);
  }

  /**
   * Asserts pipelining by comparing the build slot (from block-proposed events) against
   * the submission slot (from block headers). With pipelining, the block is built in slot N
   * but its header carries submission slot N+1.
   */
  async function assertProposerPipelining(
    blockProposedEvents: { blockNumber: BlockNumber; slot: SlotNumber; buildSlot: SlotNumber }[],
    logger: Logger,
  ) {
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);

    logger.warn(`assertProposerPipelining: ${allBlocks.length} blocks, ${blockProposedEvents.length} events`, {
      blockNumbers: allBlocks.map(b => b.number),
      eventBlockNumbers: blockProposedEvents.map(e => e.blockNumber),
    });

    let foundPipelining = false;

    for (const block of allBlocks) {
      const headerSlot = block.header.globalVariables.slotNumber; // submission slot (N+1)
      const coinbase = block.header.globalVariables.coinbase;

      // Find the block-proposed event for this block (use Number() for safe comparison)
      const event = blockProposedEvents.find(e => Number(e.blockNumber) === Number(block.number));
      // if there is no event, then it was probably block number one - which was proposed in setup
      if (!event) {
        continue;
      }

      const buildSlot = event.buildSlot; // build slot (N)

      // Verify the pipelining offset: block built in slot N, submitted in slot N+1
      expect(Number(headerSlot)).toBe(Number(buildSlot) + 1);
      foundPipelining = true;

      // Verify coinbase matches the expected proposer for the submission slot
      const expectedProposer = await rollup.getProposerAt(getTimestampForSlot(headerSlot, test.constants));
      expect(coinbase).toEqual(expectedProposer);

      logger.warn(`Block ${block.number}: buildSlot=${buildSlot}, submissionSlot=${headerSlot}, coinbase=${coinbase}`, {
        blockNumber: block.number,
        buildSlot,
        headerSlot,
        coinbase: coinbase.toString(),
        expectedProposer: expectedProposer.toString(),
      });
    }

    expect(foundPipelining).toBe(true);
    logger.warn(`Pipelining assertion passed for ${allBlocks.length} blocks`);
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  // Pre-proves TX_COUNT txs, starts sequencers, waits for all txs to be mined. Asserts a
  // MBPS checkpoint with ≥EXPECTED_BLOCKS_PER_CHECKPOINT blocks. Asserts every block's header
  // slot equals build-slot+1 (pipelining offset). Verifies node-0 fetches blobs (promotion
  // disabled) while nodes 1-3 skip blob fetching (promotion enabled). Waits for the checkpoint
  // to be proven.
  it('pipelining builds blocks using slot plus 1 proposer and proves them', async () => {
    await setupTest({ syncChainTip: 'checkpointed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    // Spy on getBlobSidecar on all validator nodes before sequencers start, so we check that nodes
    // promote their proposed checkpoints and don't source data from blobs if they don't need to.
    const blobSpies = nodes.map((node, i) => {
      const blobClient = node.getBlobClient()!;
      const spy = jest.spyOn(blobClient, 'getBlobSidecar');
      logger.warn(`Installed getBlobSidecar spy on validator node ${i}`);
      return spy;
    });

    // Subscribe to block-proposed events to capture build slots
    const blockProposedEvents: { blockNumber: BlockNumber; slot: SlotNumber; buildSlot: SlotNumber }[] = [];
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

    const initialCheckpointNumber = await rollup.getCheckpointNumber();
    logger.warn(`Initial checkpoint number: ${initialCheckpointNumber}`);

    // Pre-prove and send transactions
    const txs = await timesAsync(TX_COUNT, i =>
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
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(
      EXPECTED_BLOCKS_PER_CHECKPOINT,
      maxMinedBlockNumber,
      logger,
    );

    // Verify the pipelining offset: build slot N vs submission slot N+1
    await assertProposerPipelining(blockProposedEvents, logger);

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
    await waitForProvenCheckpoint(multiBlockCheckpoint);
  });

  // Establishes a baseline at checkpoint 1. Identifies the next proposer and disables its
  // checkpoint publishing. Waits for the L2PruneUncheckpointed event on the archiver, then
  // re-enables publishing. Waits for all txs to be mined, asserts a MBPS checkpoint exists,
  // verifies the pipelining offset, and checks recovery blockNumber > baseline.
  it('prunes uncheckpointed blocks when proposer fails to deliver', async () => {
    await setupTest({ syncChainTip: 'checkpointed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });

    const blockProposedEvents: { blockNumber: BlockNumber; slot: SlotNumber; buildSlot: SlotNumber }[] = [];
    const sequencers = nodes.map(n => n.getSequencer()!);

    // Pre-prove and send transactions
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, { txs: txHashes });

    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers`);

    // Assert that at least 1 checkpoint has been reached
    const checkpointTimeout = test.L2_SLOT_DURATION_IN_S * test.epochDuration * 3;
    await test.waitUntilCheckpointNumber(CheckpointNumber(1), checkpointTimeout);
    const checkpointedBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Baseline established: checkpoint 1 reached at block ${checkpointedBlockNumber}`);
    // Target a submission slot whose pipelined build has not started yet.
    const { slot: currentSlot } = test.epochCache.getEpochAndSlotNow();
    const { proposerIndex, slot: proposerSlotToNotPublish } = await findNextProposerIndex(
      test.epochCache,
      validators,
      SlotNumber(currentSlot + 2),
    );
    logger.warn(
      `Will skip checkpoint publishing for proposer ${proposerIndex} in slot ${proposerSlotToNotPublish} - current slot ${currentSlot}`,
    );

    const targetSequencer = nodes[proposerIndex].getSequencer();
    if (!targetSequencer) {
      throw new Error('Target proposer sequencer not found');
    }
    // Subscribe to prune event BEFORE disabling publishing, so we don't miss the event
    const prunePromise = new Promise<void>(resolve => {
      archiver.events.once(L2BlockSourceEvents.L2PruneUncheckpointed, () => resolve());
    });

    // The sequencer keeps building blocks and broadcasting via P2P, but won't submit the checkpoint to L1
    targetSequencer.updateConfig({ skipPublishingCheckpointsPercent: 100 });

    const pruneTimeout = test.L2_SLOT_DURATION_IN_S * 5 * 1000;
    logger.warn(`Waiting for uncheckpointed blocks to be pruned (timeout=${pruneTimeout}ms)`);
    await executeTimeout(() => prunePromise, pruneTimeout);

    // add block proposed listeners after the prune
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
    logger.warn(`Pruning detected, block number now ${await archiver.getBlockNumber()}`);

    // Re-enable checkpoint publishing
    logger.warn(`Re-enabling checkpoint publishing for validator ${proposerIndex}`);
    targetSequencer.updateConfig({ skipPublishingCheckpointsPercent: 0 });

    // Wait for a new checkpoint (recovery) - where all txs end up mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await executeTimeout(
      () => Promise.all(txHashes.map(txHash => waitForTx(context.aztecNode, txHash, { timeout }))),
      timeout * 1000,
    );
    logger.warn(`All txs have been mined`);

    // Verify MBPS works with pipelining; target the highest block number across mined receipts
    const maxMinedBlockNumber = BlockNumber(Math.max(...receipts.map(r => r.blockNumber ?? 0)));
    await assertMultipleBlocksPerSlot(EXPECTED_BLOCKS_PER_CHECKPOINT, maxMinedBlockNumber, logger);

    // Verify the pipelining offset: build slot N vs submission slot N+1
    await assertProposerPipelining(blockProposedEvents, logger);

    const recoveredBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Recovery complete: block number ${recoveredBlockNumber} > ${checkpointedBlockNumber}`);
    expect(recoveredBlockNumber).toBeGreaterThan(checkpointedBlockNumber);
  });
});

/** Scans upcoming slots to find which validator proposes next and returns its index. */
async function findNextProposerIndex(
  epochCache: EpochCacheInterface,
  validators: { attester: EthAddress }[],
  slotToDisable: SlotNumber,
): Promise<{ proposerIndex: number; slot: SlotNumber }> {
  const proposer = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(slotToDisable));
  if (proposer) {
    const idx = validators.findIndex(v => v.attester.equals(proposer));
    if (idx >= 0) {
      return { proposerIndex: idx, slot: SlotNumber(slotToDisable) };
    }
  }
  throw new Error(`No proposer found in slot ${slotToDisable}`);
}
