import { type Archiver, CalldataRetriever } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient, ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { range } from '@aztec/foundation/array';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout, timeoutPromise } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { OffenseType } from '@aztec/slasher';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import { computeQuorum, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import type { Log } from 'viem';

import { getAnvilPort } from '../../fixtures/fixtures.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Set up 6 nodes with 1 validator each, so that we can have up to 2 malicious ones and still achieve quorum
const NODE_COUNT = 6;
const VALIDATOR_COUNT = 6;

const BASE_ANVIL_PORT = getAnvilPort();

// Six-validator suite (one key per node) exercising checkpoint invalidation paths. All nodes use
// a mocked gossip bus. The setup injects bad configs (insufficient attestations, fake/high-s/
// unrecoverable signatures, shuffled attestations, parent-validity bypasses) to force invalid
// checkpoints, then verifies the next good proposer invalidates them and the chain progresses.
// Slasher is enabled. Uses MultiNodeTestContext with mockGossipSubNetwork, no initial sequencer, no
// prover node; ports are port-bumped per test via anvilPortOffset to support parallel execution.
describe('multi-node/slashing/invalidate_block', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;
  let anvilPortOffset = 0;

  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let nodes: AztecNodeService[];
  let testContract: TestContract;
  let from: AztecAddress;

  beforeEach(async () => {
    validators = buildMockGossipValidators(VALIDATOR_COUNT);

    // Setup context with the given set of validators and a mocked gossip sub network.
    // Uses multiple-blocks-per-slot timing configuration.
    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ethereumSlotDuration: 8,
      aztecSlotDuration: 32,
      blockDurationMs: 6000,
      initialValidators: validators,
      aztecTargetCommitteeSize: VALIDATOR_COUNT,
      secondsBeforeInvalidatingBlockAsCommitteeMember: Number.MAX_SAFE_INTEGER,
      archiverPollingIntervalMS: 200,
      anvilAccounts: 20,
      anvilPort: BASE_ANVIL_PORT + ++anvilPortOffset,
      slashingRoundSizeInEpochs: 4,
      slashingOffsetInRounds: 256,
      slasherEnabled: true,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    });

    ({ context, logger, l1Client } = test);
    rollupContract = new RollupContract(l1Client, test.rollup.address);
    from = context.accounts[0]; // auto-created by setup

    // Start the validator nodes
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    const validatorNodes = validators.slice(0, NODE_COUNT);
    nodes = await asyncMap(validatorNodes, ({ privateKey }) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        minTxsPerBlock: 1,
        maxTxsPerBlock: 1,
      }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validatorNodes.map(v => v.attester) });

    // Register test contract for lightweight txs
    testContract = await test.registerTestContract(context.wallet);

    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  function awaitCheckpointInvalidationEvent(
    waitSlots = 8,
  ): Promise<{ checkpointNumber: CheckpointNumber; event: Log }> {
    const promise = promiseWithResolvers<{ checkpointNumber: CheckpointNumber; event: Log }>();
    const unwatch = rollupContract.listenToCheckpointInvalidated(({ checkpointNumber, event }) => {
      unwatch();
      logger.warn(`Checkpoint ${checkpointNumber} has been invalidated`);
      promise.resolve({ checkpointNumber, event });
    });
    return Promise.race([
      promise.promise,
      timeoutPromise(test.L2_SLOT_DURATION_IN_S * waitSlots * 1000, 'Waiting for CheckpointInvalidated event'),
    ]);
  }

  /**
   * Asserts that the given checkpoint, as posted on L1, has fewer valid attestations than quorum.
   * Useful to catch config-timing races where malicious config does not take effect before the proposer
   * starts its work, leading to the test assuming a checkpoint is bad when it actually landed valid.
   */
  async function assertCheckpointInsufficientAttestations(checkpointNumber: CheckpointNumber): Promise<void> {
    const proposedEvents = await rollupContract.getCheckpointProposedEvents(1n, await l1Client.getBlockNumber());
    const event = proposedEvents.find(e => e.args.checkpointNumber === checkpointNumber);
    expect(event).toBeDefined();

    const calldataRetriever = new CalldataRetriever(
      l1Client as unknown as ViemPublicClient,
      l1Client as unknown as ViemPublicDebugClient,
      VALIDATOR_COUNT,
      undefined,
      createLogger('e2e:epochs_invalidate_block:calldata'),
      EthAddress.fromString(rollupContract.address),
    );
    const { attestations } = await calldataRetriever.getCheckpointFromRollupTx(
      event!.l1TransactionHash,
      event!.args.versionedBlobHashes,
      checkpointNumber,
      {
        attestationsHash: event!.args.attestationsHash.toString(),
        payloadDigest: event!.args.payloadDigest.toString(),
      },
    );
    const validCount = attestations.filter(a => !a.signature.isEmpty()).length;
    const quorum = computeQuorum(VALIDATOR_COUNT);
    logger.warn(`Checkpoint ${checkpointNumber} has ${validCount}/${VALIDATOR_COUNT} attestations (quorum=${quorum})`);
    expect(validCount).toBeLessThan(quorum);
  }

  /**
   * Configures all sequencers with an attack config, enables the attack for a single checkpoint,
   * disables it after the first checkpoint is mined (also stopping block production), and waits
   * for the checkpoint to be invalidated. Verifies the chain rolled back to the initial state.
   */
  async function runInvalidationTest(opts: {
    attackConfig: Record<string, unknown>;
    disableConfig: Record<string, unknown>;
  }) {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const initialCheckpointNumber = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;

    sequencers.forEach(sequencer => {
      sequencer.updateConfig({ ...opts.attackConfig, minTxsPerBlock: 0 });
    });

    // Disable the attack after the first checkpoint is mined and prevent further block production
    test.monitor.once('checkpoint', ({ checkpointNumber }) => {
      logger.warn(`Disabling attack after checkpoint ${checkpointNumber} has been mined`);
      sequencers.forEach(sequencer => {
        sequencer.updateConfig({ ...opts.disableConfig, minTxsPerBlock: 100 });
      });
    });

    await Promise.all(sequencers.map(s => s.start()));

    // Wait for the CheckpointInvalidated event
    const { checkpointNumber: invalidatedCheckpointNumber } = await awaitCheckpointInvalidationEvent();

    // Verify the checkpoint was invalidated and the chain rolled back
    expect(invalidatedCheckpointNumber).toBeGreaterThan(initialCheckpointNumber);
    expect(await test.rollup.getCheckpointNumber()).toEqual(initialCheckpointNumber);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  }

  /**
   * Configures all sequencers with an attack config, starts them, waits for two consecutive
   * invalidations of the same checkpoint (confirming the invalid-then-re-invalidated pattern),
   * disables the attack, and verifies the chain progresses and all nodes sync.
   */
  async function runDoubleInvalidationTest(opts: {
    attackConfig: Record<string, unknown>;
    disableConfig: Record<string, unknown>;
  }) {
    const sequencers = nodes.map(node => node.getSequencer()!);
    sequencers.forEach(sequencer => {
      sequencer.updateConfig({ ...opts.attackConfig, minTxsPerBlock: 0 });
    });

    await Promise.all(sequencers.map(s => s.start()));

    // Wait until we see two invalidations, both should be for the same checkpoint
    let lastInvalidatedCheckpointNumber: CheckpointNumber | undefined;
    const invalidatePromise = promiseWithResolvers<void>();
    const unsubscribe = rollupContract.listenToCheckpointInvalidated(data => {
      logger.warn(`Checkpoint ${data.checkpointNumber} has been invalidated`, data);
      if (lastInvalidatedCheckpointNumber === undefined) {
        lastInvalidatedCheckpointNumber = data.checkpointNumber;
      } else {
        expect(data.checkpointNumber).toEqual(lastInvalidatedCheckpointNumber);
        invalidatePromise.resolve();
        unsubscribe();
      }
    });
    await Promise.race([
      timeoutPromise(1000 * test.L2_SLOT_DURATION_IN_S * 8, 'Waiting for two checkpoint invalidations'),
      invalidatePromise.promise,
    ]);

    sequencers.forEach(sequencer => {
      sequencer.updateConfig(opts.disableConfig);
    });

    // Ensure chain progresses
    const targetCheckpointNumber = CheckpointNumber(lastInvalidatedCheckpointNumber! + 2);
    logger.warn(`Waiting until checkpoint ${targetCheckpointNumber} has been mined`);
    await test.monitor.waitUntilCheckpoint(targetCheckpointNumber);

    // Wait for all nodes to sync
    const targetBlock = targetCheckpointNumber;
    logger.warn(`Waiting for all nodes to sync to block ${targetBlock}`);
    await retryUntil(
      async () => {
        const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
        logger.info(`Node synced block numbers: ${blockNumbers.join(', ')}`);
        return blockNumbers.every(bn => bn > targetBlock);
      },
      'Node sync check',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.5,
    );

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  }

  // Configures all sequencers to skip attestation collection and sets minBlocksForCheckpoint=2.
  // Sends 2 txs, waits for the first bad checkpoint to land (insufficient attestations), then
  // lets a slot pass, sends more txs, and waits for a good proposer to invalidate the bad
  // checkpoint in the same L1 tx as a new valid checkpoint. Verifies PROPOSED_INSUFFICIENT_ATTESTATIONS
  // offense is recorded and chain progresses to checkpoint+2.
  // To be able to post its own checkpoint under pipelining, there should be no "proposed" checkpoint in flight,
  // otherwise we consider it's the proposed checkpoint that will invalidate the previous one. If it's the
  // proposed checkpoint the one that ends up being invalid, we need to discard our work, and cannot post our own.
  it('proposer invalidates previous checkpoint with multiple blocks while posting its own', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const [initialCheckpointNumber, initialBlockNumber] = await nodes[0]
      .getChainTips()
      .then(t => [t.checkpointed.checkpoint.number, t.checkpointed.block.number] as const);

    // Configure all sequencers to skip collecting attestations before starting
    // Also set minBlocksForCheckpoint to ensure multi-block checkpoints
    logger.warn('Configuring all sequencers to skip attestation collection');
    sequencers.forEach(sequencer => {
      sequencer.updateConfig({
        skipCollectingAttestations: true,
        maxTxsPerBlock: 1,
        minBlocksForCheckpoint: 2,
        buildCheckpointIfEmpty: false,
      });
    });

    // Send a few transactions so the sequencer builds multiple blocks in the checkpoint
    // We'll later check that the first tx at least was picked up and mined
    logger.warn('Sending transactions to trigger initial block building');
    const [{ txHash: sentTx }] = await timesAsync(2, i =>
      testContract.methods.emit_nullifier(BigInt(i + 1)).send({ from, wait: NO_WAIT }),
    );

    // Disable skipCollectingAttestations after the first checkpoint and capture its number
    const badCheckpointMinedPromise = promiseWithResolvers<CheckpointNumber>();
    test.monitor.on('checkpoint', ({ checkpointNumber }) => {
      badCheckpointMinedPromise.resolve(checkpointNumber);
      logger.warn(`Disabling skipCollectingAttestations after checkpoint ${checkpointNumber} has been mined`);
      sequencers.forEach(sequencer => {
        sequencer.updateConfig({ skipCollectingAttestations: false });
      });
    });

    // Start all sequencers
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers with skipCollectingAttestations=true`);

    // Wait for the bad checkpoint to be mined, which means the attack is live
    const badCheckpointNumber = await badCheckpointMinedPromise.promise;
    await assertCheckpointInsufficientAttestations(badCheckpointNumber);

    // Wait for a slot so we dont have a proposed in-flight checkpoint
    await test.monitor.waitUntilNextL2Slot();

    // And build the next block
    logger.warn('Sending second round of txs');
    await timesAsync(2, i =>
      testContract.methods.emit_nullifier(BigInt(i + 50)).send({ from: context.accounts[0], wait: NO_WAIT }),
    );

    // The next proposer should invalidate the previous checkpoint and publish a new one
    logger.warn('Waiting for next proposer to invalidate the previous checkpoint');
    const { checkpointNumber: invalidatedCheckpointNumber, event } = await awaitCheckpointInvalidationEvent();
    expect(invalidatedCheckpointNumber).toBeGreaterThan(initialCheckpointNumber);

    // The invalidation must have been bundled with a new checkpoint proposal in the same L1 tx.
    const proposedInSameBlock = await rollupContract.getCheckpointProposedEvents(
      event.blockNumber!,
      event.blockNumber!,
    );
    const proposedInSameTx = proposedInSameBlock.find(e => e.l1TransactionHash === event.transactionHash);
    expect(proposedInSameTx).toBeDefined();
    logger.warn(`Invalidation bundled with new checkpoint ${proposedInSameTx!.args.checkpointNumber} in same L1 tx`);

    // Wait for all nodes to sync the new block proposed
    logger.warn('Waiting for all nodes to sync');
    await retryUntil(
      async () => {
        const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
        logger.info(`Node synced block numbers: ${blockNumbers.join(', ')}`);
        return blockNumbers.every(bn => bn > initialBlockNumber);
      },
      'Node sync check',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.5,
    );

    // Verify the transaction was eventually included
    const receipt = await waitForTx(context.aztecNode, sentTx, { timeout: test.L2_SLOT_DURATION_IN_S * 8 });
    expect(receipt.isMined()).toBeTrue();
    logger.warn(`Transaction included in block ${receipt.blockNumber}`);

    // Check that we have tagged an offense for that (query a validator node since the initial node has no slasher)
    const offenses = await nodes[0].getSlashOffenses('all');
    expect(offenses.length).toBeGreaterThan(0);
    const invalidBlockOffense = offenses.find(o => o.offenseType === OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS);
    expect(invalidBlockOffense).toBeDefined();

    const currentCheckpoint = await test.rollup.getCheckpointNumber();

    logger.warn('Sending further transactions to trigger more block building');
    await timesAsync(8, i => testContract.methods.emit_nullifier(BigInt(i + 100)).send({ from, wait: NO_WAIT }));

    logger.warn(`Waiting for checkpoint ${currentCheckpoint + 2} to be mined to ensure chain can progress`);
    await test.waitUntilCheckpointNumber(CheckpointNumber(currentCheckpoint + 2), test.L2_SLOT_DURATION_IN_S * 8);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });

  // Starts sequencers with good config, waits for the first checkpoint, then searches for two
  // consecutive bad slots with distinct proposers. Applies skipCollectingAttestations to both bad
  // proposers and waits for both bad checkpoints to land. Asserts the earliest is invalidated by
  // the next good proposer, restores good config, and verifies the chain can produce checkpoint+3.
  // Here we disable invalidation checks from two of the proposers. Our goal is to get two invalid checkpoints
  // in a row, so the third proposer invalidates the earliest one, and the chain progresses. Note that the
  // second invalid checkpoint will also have invalid attestations, we are *not* testing the scenario where the
  // committee is malicious (or incompetent) and attests for the descendent of an invalid checkpoint.
  it('proposer invalidates multiple checkpoints', async () => {
    // Pick the bad slots before starting any sequencer, then warp to just before them, so a far-away
    // candidate costs a warp instead of a real-time wait. We need a lead-in of good slots: the first
    // good checkpoint lands at warpSlot or warpSlot+1 (warpSlot+2 on a slow start), and the malicious
    // config is applied only after it is mined, so the proposers of warpSlot+1..warpSlot+3 must not be
    // the bad proposers — otherwise a pipelined job created before the bad slots could snapshot the
    // malicious config (jobs snapshot the sequencer config during the last L1 slot of the previous L2
    // slot, when getEpochAndSlotInNextL1Slot first returns the proposer's target slot).
    const sequencers = nodes.map(node => node.getSequencer()!);
    sequencers.forEach(s => s.updateConfig({ minTxsPerBlock: 0 }));

    const preBadSlotCount = 3;
    let warpSlot: SlotNumber | undefined;
    let badProposers: EthAddress[] = [];
    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 2;
    const maxBadSlotSearchAttempts = 100;
    for (let attempt = 0; attempt < maxBadSlotSearchAttempts && warpSlot === undefined; attempt++) {
      try {
        const candidateWarpSlot = SlotNumber(candidate);
        const preBadTargetSlots = times(preBadSlotCount, i => SlotNumber.add(candidateWarpSlot, i + 1));
        const candidateSlot1 = SlotNumber.add(candidateWarpSlot, preBadSlotCount + 1);
        const candidateSlot2 = SlotNumber.add(candidateWarpSlot, preBadSlotCount + 2);
        const [preBadProposers, p1, p2] = await Promise.all([
          Promise.all(preBadTargetSlots.map(slot => test.epochCache.getProposerAttesterAddressInSlot(slot))),
          test.epochCache.getProposerAttesterAddressInSlot(candidateSlot1),
          test.epochCache.getProposerAttesterAddressInSlot(candidateSlot2),
        ]);

        logger.warn(`Checking bad checkpoint slots ${candidateSlot1} and ${candidateSlot2}`, {
          candidateWarpSlot,
          preBadTargetSlots,
          preBadProposers: preBadProposers.map(proposer => proposer?.toString()),
          p1: p1?.toString(),
          p2: p2?.toString(),
        });

        const badProposerHasUnsnapshottedPreBadSlot =
          p1 !== undefined &&
          p2 !== undefined &&
          preBadProposers.some(proposer => proposer !== undefined && (proposer.equals(p1) || proposer.equals(p2)));

        if (p1 && p2 && !badProposerHasUnsnapshottedPreBadSlot) {
          warpSlot = candidateWarpSlot;
          badProposers = [p1, p2];
        }
        candidate++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await test.l1Client.getBlock({ includeTransactions: false });
        const warpBy = test.epochDuration * test.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await test.context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(test.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + 2) {
          candidate = newCurrentSlot + 2;
        }
      }
    }
    if (warpSlot === undefined) {
      throw new Error(`Could not find bad checkpoint slots after ${maxBadSlotSearchAttempts} attempts`);
    }
    const badSlot1 = SlotNumber.add(warpSlot, preBadSlotCount + 1);
    const badSlot2 = SlotNumber.add(warpSlot, preBadSlotCount + 2);
    const badSlots = [badSlot1, badSlot2];

    // Warp to one L1 block before warpSlot, so the sequencers have a full L2 slot to boot and settle
    // pipelining before the build window for warpSlot+1 opens at the end of warpSlot.
    const warpTo = getTimestampForSlot(warpSlot, test.constants) - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping L1 to ${warpTo}, one L1 block before slot ${warpSlot}`, { warpSlot, badSlot1, badSlot2 });
    await test.context.cheatCodes.eth.warp(Number(warpTo), { resetBlockInterval: true });

    // Start all sequencers with default (good) config and wait for the first checkpoint to land,
    // so the chain is moving before we apply the bad config to the proposers of the bad slots.
    const initialCheckpointNumber = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers, waiting for first checkpoint before applying malicious config`);
    await test.waitUntilCheckpointNumber(CheckpointNumber(initialCheckpointNumber + 1), test.L2_SLOT_DURATION_IN_S * 4);

    const badNodes = [];
    for (let badProposerIndex = 0; badProposerIndex < badProposers.length; badProposerIndex++) {
      const badProposer = badProposers[badProposerIndex];
      logger.warn(`Disabling invalidation checks and attestation gathering for proposer ${badProposer}`);
      const nodeIndex = nodes.findIndex(n => n.getSequencer()!.validatorAddresses!.some(a => a.equals(badProposer)));
      if (nodeIndex === -1) {
        throw new Error(`Could not find node for proposer ${badProposer}`);
      }
      const node = nodes[nodeIndex];
      badNodes.push(node);
      await node.setConfig({
        skipInvalidateBlockAsProposer: true,
        skipCollectingAttestations: true,
        skipValidateCheckpointAttestations: true,
        minTxsPerBlock: 0,
      });

      const badSlot = badSlots[badProposerIndex];
      logger.warn(`Applied malicious config to node ${nodeIndex} with proposer ${badProposer} for slot ${badSlot}`);
    }

    // Fail fast with a clear error if applying the configs was so slow that badSlot1's proposal job
    // may have already snapshotted the good config.
    const slotAfterBadConfig = Number(test.epochCache.getEpochAndSlotNow().slot);
    expect(slotAfterBadConfig).toBeLessThan(Number(badSlot1));

    // We should see two invalid blocks being proposed by the bad proposers in those two slots
    const firstCheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    const secondCheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    const expectedFirstSlot = badSlot1;
    const expectedSecondSlot = badSlot2;
    test.monitor.on('checkpoint', ({ checkpointNumber, l2SlotNumber }) => {
      logger.warn(`Checkpoint ${checkpointNumber} at slot ${l2SlotNumber} has been mined`);
      if (l2SlotNumber === expectedFirstSlot) {
        firstCheckpointPromise.resolve(checkpointNumber);
      }
      if (l2SlotNumber === expectedSecondSlot) {
        secondCheckpointPromise.resolve(checkpointNumber);
      }
    });

    // Wait for both checkpoints to be mined. Note that timeoutPromise rejects on timeout, so there
    // is no point in racing against a fallback value.
    logger.warn(`Waiting for two checkpoints to be mined on slots ${expectedFirstSlot} and ${expectedSecondSlot}`);
    const [firstCheckpoint, secondCheckpoint] = await Promise.race([
      Promise.all([firstCheckpointPromise.promise, secondCheckpointPromise.promise]),
      timeoutPromise(
        test.L2_SLOT_DURATION_IN_S * 8 * 1000,
        `Waiting for bad checkpoints at slots ${expectedFirstSlot} and ${expectedSecondSlot}`,
      ),
    ]);

    // Sanity check: verify that both bad checkpoints landed on L1 with insufficient attestations.
    // This catches config-timing races where `skipCollectingAttestations` doesn't take effect in time.
    await assertCheckpointInsufficientAttestations(firstCheckpoint);
    await assertCheckpointInsufficientAttestations(secondCheckpoint);

    // As soon as it's the turn of a good proposer, we should see the first checkpoint being invalidated
    // Note that this may take a few slots to happen
    logger.warn(`Waiting for invalidation`);
    const { checkpointNumber: invalidatedCheckpointNumber } = await awaitCheckpointInvalidationEvent(16);

    // The invalidated checkpoint should be the first one,
    // but it may also be a checkpoint *before* the first one that gets mined in an early slot
    expect(invalidatedCheckpointNumber).toBeLessThanOrEqual(firstCheckpoint);

    // Now restore bad nodes back to normal
    logger.warn(`Restoring bad nodes config back to normal`);
    await Promise.all(
      badNodes.map(async node => {
        await node.setConfig({
          skipInvalidateBlockAsProposer: false,
          skipCollectingAttestations: false,
          skipValidateCheckpointAttestations: false,
        });
      }),
    );

    // And wait for more checkpoints to be mined
    const nextCheckpointNumber = CheckpointNumber(firstCheckpoint + 3);
    logger.warn(`Waiting until more checkpoints have been mined to ensure the chain can progress`);
    await Promise.all(nodes.map(node => node.setConfig({ minTxsPerBlock: 0 })));
    await test.waitUntilCheckpointNumber(nextCheckpointNumber, test.L2_SLOT_DURATION_IN_S * 16);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });

  // Regression for archiver infinite-loop on P1 (insufficient attestations) + P2 (valid descendant
  // of P1 but bypasses the parent-validity gate). Warps L1 to the build window, starts sequencers,
  // waits for both P1 and P2 checkpoints to land on L1. Asserts the chain advances past P2 (archiver
  // no longer stalls), the DescendentOfInvalidAttestationsCheckpointDetected event fires, and both
  // P1/P2 proposers are flagged for slashing (PROPOSED_INSUFFICIENT_ATTESTATIONS and
  // PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS respectively).
  // P1 publishes a checkpoint with insufficient attestations; the next proposer P2 publishes a
  // valid descendant without first invalidating P1. Before the fix, the archiver tripped its
  // `InitialCheckpointNumberNotSequentialError` consecutive-number guard, rolled back the L1
  // sync point, and looped indefinitely. The fix records P1 as a rejected ancestor and skips P2
  // (its valid descendant) outright, emitting `DescendentOfInvalidAttestationsCheckpointDetected`
  // so the slasher can target P2's proposer. This test verifies the chain advances past P2 and
  // that both proposers end up flagged for slashing.
  it('archiver skips a descendant of an invalid-attestations checkpoint', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);

    // The committee invalidation fallback is already disabled by the fixture-level
    // `secondsBeforeInvalidatingBlockAsCommitteeMember`. We also need to disable the non-committee
    // fallback (`considerInvalidatingCheckpoint` at sequencer.ts:950, called from L345) on every
    // node, otherwise any sequencer whose pending chain is invalid will eventually invalidate P1
    // and break the loop we're trying to reproduce.
    sequencers.forEach(s =>
      s.updateConfig({
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: Number.MAX_SAFE_INTEGER,
        minTxsPerBlock: 0,
      }),
    );
    // REFACTOR: hand-rolled slot-search with EpochNotStable warp fallback; replace with a shared
    // helper such as findNextTwoSlotsWithDistinctProposers(test, fromSlot) that encapsulates the
    // EpochNotStable retry-and-warp loop.
    let badSlot1: SlotNumber | undefined;
    let p1Proposer: EthAddress | undefined;
    let p2Proposer: EthAddress | undefined;
    let candidate = Number(test.epochCache.getEpochAndSlotNow().slot) + 4;
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts && badSlot1 === undefined; attempt++) {
      try {
        const [p1, p2] = await Promise.all([
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate)),
          test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate + 1)),
        ]);
        if (p1 && p2 && !p1.equals(p2)) {
          badSlot1 = SlotNumber(candidate);
          p1Proposer = p1;
          p2Proposer = p2;
          break;
        }
        candidate++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('EpochNotStable')) {
          throw err;
        }
        const block = await test.l1Client.getBlock({ includeTransactions: false });
        const warpBy = test.epochDuration * test.L2_SLOT_DURATION_IN_S;
        const newTs = Number(block.timestamp) + warpBy;
        logger.warn(`Hit EpochNotStable at candidate ${candidate}, warping L1 forward by ${warpBy}s to ${newTs}`);
        await test.context.cheatCodes.eth.warp(newTs, { resetBlockInterval: true });
        const newCurrentSlot = Number(test.epochCache.getEpochAndSlotNow().slot);
        if (candidate < newCurrentSlot + 4) {
          candidate = newCurrentSlot + 4;
        }
      }
    }
    if (badSlot1 === undefined || !p1Proposer || !p2Proposer) {
      throw new Error(`Could not find two consecutive slots with different proposers after ${maxAttempts} attempts`);
    }
    const badSlot2 = SlotNumber.add(badSlot1, 1);

    const p1NodeIndex = nodes.findIndex(n => n.getSequencer()!.validatorAddresses!.some(a => a.equals(p1Proposer!)));
    const p2NodeIndex = nodes.findIndex(n => n.getSequencer()!.validatorAddresses!.some(a => a.equals(p2Proposer!)));
    if (p1NodeIndex === -1 || p2NodeIndex === -1) {
      throw new Error(`Could not find nodes for proposers P1=${p1Proposer} P2=${p2Proposer}`);
    }
    const p1Node = nodes[p1NodeIndex];
    const p2Node = nodes[p2NodeIndex];
    logger.warn(`Applying malicious configs`, {
      p1NodeIndex,
      p1Proposer: p1Proposer.toString(),
      badSlot1,
      p2NodeIndex,
      p2Proposer: p2Proposer.toString(),
      badSlot2,
    });

    // P1 publishes its checkpoint with only its own self-attestation (insufficient) and skips
    // any invalidation of earlier checkpoints.
    await p1Node.setConfig({
      skipCollectingAttestations: true,
      skipInvalidateBlockAsProposer: true,
      minTxsPerBlock: 0,
    });

    // P2 collects attestations normally so its checkpoint lands valid, but bypasses the
    // parent-validity gate, so it ends up pushing a valid checkpoint with valid attestations
    // that descends from the invalid P1, which is the scenario we want to test.
    await p2Node.setConfig({
      skipWaitForValidParentCheckpointOnL1: true,
      skipInvalidateBlockAsProposer: true,
      minTxsPerBlock: 0,
    });

    // Subscribe to the new archiver event so we can assert P2 was surfaced through it.
    const observerIndex = range(nodes.length).find(i => i !== p1NodeIndex && i !== p2NodeIndex)!;
    const observerArchiver = nodes[observerIndex].getBlockSource() as Archiver;
    const descendantEvents: { checkpointNumber: CheckpointNumber; ancestorCheckpointNumber: CheckpointNumber }[] = [];
    const onDescendant = (event: {
      checkpoint: { checkpointNumber: CheckpointNumber };
      ancestorCheckpointNumber: CheckpointNumber;
    }) => {
      descendantEvents.push({
        checkpointNumber: event.checkpoint.checkpointNumber,
        ancestorCheckpointNumber: event.ancestorCheckpointNumber,
      });
    };

    observerArchiver.events.on(L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected, onDescendant);

    // Watch for both CheckpointProposed events at the targeted slots.
    const p1CheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    const p2CheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    test.monitor.on('checkpoint', ({ checkpointNumber, l2SlotNumber }) => {
      if (l2SlotNumber === badSlot1) {
        p1CheckpointPromise.resolve(checkpointNumber);
      }
      if (l2SlotNumber === badSlot2) {
        p2CheckpointPromise.resolve(checkpointNumber);
      }
    });

    // Send a couple of txs so there's content for both checkpoints.
    logger.warn('Sending transactions to fill the bad checkpoints');
    await Promise.all(times(4, i => testContract.methods.emit_nullifier(BigInt(i + 1)).send({ from, wait: NO_WAIT })));

    // Sequencers are still stopped. Warp to the L1 block immediately before the pipelined build
    // window for P1, so the first proposer job that can observe the malicious config is the
    // intended checkpoint, not an earlier slot owned by the same validator.
    const buildSlot = SlotNumber.add(badSlot1, -1);
    const buildSlotStart = getTimestampForSlot(buildSlot, test.constants);
    const warpTo = buildSlotStart - BigInt(test.L1_BLOCK_TIME_IN_S);
    logger.warn(`Warping L1 to timestamp ${warpTo} (one L1 block before build slot ${buildSlot})`);
    await test.context.cheatCodes.eth.warp(Number(warpTo), { resetBlockInterval: true });

    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers after warping to the target build window`);

    logger.warn(`Waiting for two checkpoints to be mined on slots ${badSlot1} and ${badSlot2}`);
    const [p1Checkpoint, p2Checkpoint] = await executeTimeout(
      () => Promise.all([p1CheckpointPromise.promise, p2CheckpointPromise.promise]),
      test.L2_SLOT_DURATION_IN_S * 8 * 1000,
      'Waiting for both checkpoints',
    );
    logger.warn(`Observed checkpoints`, { p1Checkpoint, p2Checkpoint, badSlot1, badSlot2 });
    expect(p2Checkpoint).toEqual(CheckpointNumber(p1Checkpoint + 1));

    // P1 must have landed with insufficient attestations (the trigger for the archiver skip).
    await assertCheckpointInsufficientAttestations(p1Checkpoint);

    // Restore the bad proposers to a healthy config so later slots can resume the chain by
    // invalidating P1 and posting fresh checkpoints.
    await Promise.all([
      p1Node.setConfig({ skipCollectingAttestations: false, skipInvalidateBlockAsProposer: false }),
      p2Node.setConfig({ skipWaitForValidParentCheckpointOnL1: false, skipInvalidateBlockAsProposer: false }),
    ]);

    // The archiver should no longer stall: wait for the chain to advance past P2 within a
    // handful of slots. Note we wait on local checkpoint progress here (i.e. for the chain to
    // get unstuck), not specifically on observing P2 in the checkpointed tip — P1 and P2 will
    // both be skipped, the chain will be invalidated, and progress comes from later slots.
    const targetCheckpoint = CheckpointNumber(p2Checkpoint + 1);
    logger.warn(`Waiting for node ${observerIndex} to advance past checkpoint ${p2Checkpoint}`);
    await retryUntil(
      async () => {
        const tips = await nodes[observerIndex].getChainTips();
        return tips.checkpointed.checkpoint.number >= targetCheckpoint;
      },
      'archiver advances past P2',
      test.L2_SLOT_DURATION_IN_S * 8,
      0.5,
    );

    // Confirm the descendant-of-invalid event fired for P2 at least once.
    logger.warn(`Observed ${descendantEvents.length} DescendentOfInvalidAttestationsCheckpointDetected events`);
    expect(descendantEvents.some(e => e.checkpointNumber === p2Checkpoint)).toBe(true);

    // Both proposers should be flagged for slashing: P1 under PROPOSED_INSUFFICIENT_ATTESTATIONS
    // and P2 under PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS.
    const offenses = await nodes[observerIndex].getSlashOffenses('all');
    logger.warn(`Collected ${offenses.length} offenses`, {
      offenses: offenses.map(o => ({
        offenseType: o.offenseType,
        validator: o.validator.toString(),
        slot: o.epochOrSlot,
      })),
    });
    const insufficient = offenses.find(
      o => o.offenseType === OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS && o.epochOrSlot === BigInt(badSlot1),
    );
    expect(insufficient).toBeDefined();
    expect(insufficient!.validator.equals(p1Proposer!)).toBeTrue();

    const descendant = offenses.find(
      o =>
        o.offenseType === OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS &&
        o.epochOrSlot === BigInt(badSlot2),
    );
    expect(descendant).toBeDefined();
    expect(descendant!.validator.equals(p2Proposer!)).toBeTrue();

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
    observerArchiver.events.removeListener(
      L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected,
      onDescendant,
    );
  });

  // All sequencers skip attestation collection and invalidation-as-proposer. Waits for the first
  // bad checkpoint to land, then waits for a committee member to trigger invalidation after the
  // configured delay. Asserts the invalidation happened at or after the slot's timestamp plus the
  // committee invalidation delay.
  // All tests but this one disable invalidation by committee. This test disables invalidation by proposer and
  // instead waits for a committee member to invalidate the block after several proposers not doing so.
  it('committee member invalidates a block if proposer does not come through', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const initialCheckpointNumber = await nodes[0].getChainTips().then(t => t.checkpointed.checkpoint.number);

    // Configure all sequencers to skip collecting attestations before starting
    logger.warn('Configuring all sequencers to skip attestation collection and invalidation as proposer');
    const invalidationDelay = test.L1_BLOCK_TIME_IN_S * 4;
    sequencers.forEach(sequencer => {
      sequencer.updateConfig({
        skipCollectingAttestations: true,
        minTxsPerBlock: 0,
        skipInvalidateBlockAsProposer: true,
        secondsBeforeInvalidatingBlockAsCommitteeMember: invalidationDelay,
      });
    });

    // Disable skipCollectingAttestations after the first block is mined
    let invalidCheckpointSlotNumber: SlotNumber | undefined;
    test.monitor.once('checkpoint', ({ checkpointNumber, l2SlotNumber }) => {
      logger.warn(
        `Disabling skipCollectingAttestations after L2 block ${checkpointNumber} has been mined at L2 slot ${l2SlotNumber}`,
        { checkpointNumber, l2SlotNumber },
      );
      invalidCheckpointSlotNumber = l2SlotNumber;
      sequencers.forEach(sequencer => {
        sequencer.updateConfig({ skipCollectingAttestations: false });
      });
    });

    // Start all sequencers
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers with skipCollectingAttestations=true`);

    // Some committee member should invalidate the previous checkpoint
    logger.warn('Waiting for committee member to invalidate the previous checkpoint');
    const { checkpointNumber: invalidatedCheckpointNumber, event } = await awaitCheckpointInvalidationEvent();
    expect(invalidatedCheckpointNumber).toBeGreaterThan(initialCheckpointNumber);

    // And check that the invalidation happened at least after the specified timeout.
    // We use the checkpoint header timestamp (L2 timestamp) since that's what the sequencer uses
    // to calculate how long to wait before invalidating, not the L1 block timestamp when it landed.
    const invalidSlotTimestamp = getTimestampForSlot(invalidCheckpointSlotNumber!, test.constants);
    const { timestamp: invalidationTimestamp } = await l1Client.getBlock({ blockNumber: event.blockNumber! });
    expect(invalidationTimestamp).toBeGreaterThanOrEqual(invalidSlotTimestamp + BigInt(invalidationDelay));

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });

  // All sequencers use skipCollectingAttestations. After the second CheckpointInvalidated event
  // (same checkpoint number invalidated twice), re-enables attestation collection and verifies the
  // chain produces checkpoint+2. Guards against the regression where the invalidator used the
  // wrong checkpoint when the re-invalidated checkpoint number changed.
  // Regression for an issue where, if the invalidator proposed another invalid checkpoint, the next proposer would
  // try invalidating the first one, which would fail due to mismatching attestations. For example:
  // Slot S:   Checkpoint N is proposed with invalid attestations
  // Slot S+1: Checkpoint N is invalidated, and checkpoint N' (same number) is proposed instead, but also has invalid attestations
  // Slot S+2: Proposer tries to invalidate checkpoint N, when they should invalidate checkpoint N' instead, and fails
  it('chain progresses if a checkpoint with insufficient attestations is invalidated with an invalid one', async () => {
    await runDoubleInvalidationTest({
      attackConfig: { skipCollectingAttestations: true },
      disableConfig: { skipCollectingAttestations: false },
    });
  });

  // Same double-invalidation scenario as above but using injectFakeAttestation instead of
  // skipCollectingAttestations. Regression for a London Q4-2025 attack vector.
  // Regression for Joe's Q42025 London attack. Same as above but with an invalid signature instead of insufficient ones.
  it('chain progresses if a checkpoint with an invalid attestation is invalidated with an invalid one', async () => {
    await runDoubleInvalidationTest({
      attackConfig: { injectFakeAttestation: true },
      disableConfig: { injectFakeAttestation: false },
    });
  });

  // Injects a high-s ECDSA signature (rejected by L1 OpenZeppelin ECDSA but valid offchain),
  // waits for the resulting bad checkpoint, then verifies a good proposer invalidates it.
  // Regression for A-71: Ensure the node correctly invalidates checkpoints where an attestation has a malleable
  // signature (high-s value). The Rollup contract uses OpenZeppelin's ECDSA recover which rejects high-s values
  // per EIP-2, so these signatures recover to address(0) on L1 but may succeed offchain.
  it('proposer invalidates checkpoint with high-s value attestation', async () => {
    await runInvalidationTest({
      attackConfig: { injectHighSValueAttestation: true },
      disableConfig: { injectHighSValueAttestation: false },
    });
  });

  // Injects an unrecoverable signature (e.g. r=0; ecrecover returns address(0) on L1).
  // Waits for the bad checkpoint then verifies a good proposer invalidates it. Regression for A-71.
  // Regression for A-71: Ensure the node correctly invalidates checkpoints where an attestation's signature
  // cannot be recovered (e.g. r=0). On L1, ecrecover returns address(0) for such signatures.
  it('proposer invalidates checkpoint with unrecoverable signature attestation', async () => {
    await runInvalidationTest({
      attackConfig: { injectUnrecoverableSignatureAttestation: true },
      disableConfig: { injectUnrecoverableSignatureAttestation: false },
    });
  });

  // Injects shuffled attestation ordering (accepted offchain but rejected by L1 which requires the
  // committee order). Waits for the bad checkpoint then verifies a good proposer invalidates it.
  // Regression for the node accepting attestations that did not conform to the committee order,
  // but L1 requires the same ordering. See #18219.
  it('proposer invalidates previous block with shuffled attestations', async () => {
    await runInvalidationTest({
      attackConfig: { shuffleAttestationOrdering: true },
      disableConfig: { shuffleAttestationOrdering: false },
    });
  });

  // A checkpoint with invalid attestations must be rejected from L1 calldata, before its blob is fetched.
  // The attack forces the bad checkpoint to be reachable only from L1 calldata — no blob, no local blocks
  // anywhere — so the proposer that later invalidates it can only have rejected it from calldata. Had the
  // archiver fetched the blob first, the missing blob would have stalled its sync and nothing would ever be
  // invalidated. Recovering from a checkpoint whose blob is genuinely unavailable is out of scope (A-1260).
  it('proposer invalidates a non-broadcast checkpoint whose blob is withheld', async () => {
    // Drop every node's blob store so the bad checkpoint's blob never reaches the shared filestore. Reads
    // (getBlobSidecar) are untouched, so previously-stored good checkpoints stay fetchable; only this
    // checkpoint's blob is missing. jest.restoreAllMocks() in afterEach restores the original method.
    const blobSpies = nodes.map(node =>
      jest.spyOn(node.getBlobClient()!, 'sendBlobsToFilestore').mockResolvedValue(false),
    );

    await runInvalidationTest({
      // skipCollectingAttestations makes the checkpoint invalid; skipBroadcastProposals withholds the p2p
      // proposal so peers only see it on L1; skipPushProposedBlocksToArchiver denies even the proposer's own
      // archiver a local copy — otherwise it could promote that copy, skip the blob fetch, detect the bad
      // attestations and invalidate without ever exercising the calldata-first path, masking a regression.
      attackConfig: {
        skipCollectingAttestations: true,
        skipBroadcastProposals: true,
        skipPushProposedBlocksToArchiver: true,
      },
      disableConfig: {
        skipCollectingAttestations: false,
        skipBroadcastProposals: false,
        skipPushProposedBlocksToArchiver: false,
      },
    });

    // The bad checkpoint's blob upload was intercepted, so it never reached the shared store: the
    // invalidation above proves a proposer rejected it from L1 calldata without ever fetching its blob.
    expect(blobSpies.some(spy => spy.mock.calls.length > 0)).toBe(true);
  });
});
