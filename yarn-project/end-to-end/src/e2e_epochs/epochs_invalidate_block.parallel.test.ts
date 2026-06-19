import { type Archiver, CalldataRetriever } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { ExtendedViemWalletClient, ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { range } from '@aztec/foundation/array';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout, timeoutPromise } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { OffenseType } from '@aztec/slasher';
import { L2BlockSourceEvents } from '@aztec/stdlib/block';
import { computeQuorum, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Log } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getAnvilPort } from '../fixtures/fixtures.js';
import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Set up 6 nodes with 1 validator each, so that we can have up to 2 malicious ones and still achieve quorum
const NODE_COUNT = 6;
const VALIDATOR_COUNT = 6;

const BASE_ANVIL_PORT = getAnvilPort();

describe('e2e_epochs/epochs_invalidate_block', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;
  let anvilPortOffset = 0;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let testContract: TestContract;
  let from: AztecAddress;

  beforeEach(async () => {
    validators = times(VALIDATOR_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with the given set of validators and a mocked gossip sub network.
    // Uses multiple-blocks-per-slot timing configuration.
    test = await EpochsTestContext.setup({
      ethereumSlotDuration: 8,
      aztecSlotDuration: 32,
      blockDurationMs: 6000,
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
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
      skipInitialSequencer: true,
      inboxLag: 2,
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

  // A-1252: a checkpoint with invalid attestations is detected from L1 calldata *before* its blob is
  // fetched (the honest node assertion below), so a malformed or withheld blob can no longer stall
  // detection. End-to-end this keeps the chain live: the bad checkpoint is invalidated and a fresh node
  // that cannot obtain its blob (no gossiped copy to promote, blob deleted from the shared store) still
  // syncs past it instead of looping on a blob-fetch error.
  it('detects an invalid-attestations checkpoint from calldata and syncs a fresh node past its withheld blob', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const initialCheckpointNumber = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;

    // Subscribe on an already-running honest node so we reliably capture the detection event (a fresh
    // observer would process the bad checkpoint during its initial sync, before we could subscribe).
    const detected: CheckpointNumber[] = [];
    const onInvalid = (e: {
      validationResult: { valid: boolean; checkpoint: { checkpointNumber: CheckpointNumber } };
    }) => detected.push(e.validationResult.checkpoint.checkpointNumber);
    const honestArchiver = nodes[0].getBlockSource() as Archiver;
    honestArchiver.events.on(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, onInvalid);

    // All sequencers post one checkpoint with insufficient attestations, then revert to honest config so
    // the chain recovers by invalidating it. minTxsPerBlock:0 keeps empty checkpoints flowing afterwards.
    sequencers.forEach(s => s.updateConfig({ skipCollectingAttestations: true, minTxsPerBlock: 0 }));
    test.monitor.once('checkpoint', ({ checkpointNumber }) => {
      logger.warn(`Disabling attack after checkpoint ${checkpointNumber} has been mined`);
      sequencers.forEach(s => s.updateConfig({ skipCollectingAttestations: false, minTxsPerBlock: 0 }));
    });
    await Promise.all(sequencers.map(s => s.start()));

    // Wait for the bad checkpoint to be invalidated on L1 and confirm it really landed with < quorum.
    const { checkpointNumber: badCheckpointNumber } = await awaitCheckpointInvalidationEvent();
    expect(badCheckpointNumber).toBeGreaterThan(initialCheckpointNumber);
    await assertCheckpointInsufficientAttestations(badCheckpointNumber);

    // Withhold the bad checkpoint's blob from the shared store. Its proposed event is the first one for
    // that number (the later re-mined valid checkpoint has different content, hence different blob hashes,
    // so deleting the bad one's blobs leaves the recovered chain syncable).
    const proposedEvents = await rollupContract.getCheckpointProposedEvents(1n, await l1Client.getBlockNumber());
    const badEvent = proposedEvents.find(e => e.args.checkpointNumber === badCheckpointNumber);
    expect(badEvent).toBeDefined();
    const sharedBlobsDir = join(test.context.config.dataDirectory!, 'shared-blobs', 'blobs');
    for (const hash of badEvent!.args.versionedBlobHashes) {
      await rm(join(sharedBlobsDir, `0x${hash.toString('hex')}.data`), { force: true });
    }
    logger.warn(
      `Withheld ${badEvent!.args.versionedBlobHashes.length} blob(s) for bad checkpoint ${badCheckpointNumber}`,
    );

    // Let the recovered chain advance past the bad slot so the observer has a healthy tip to reach.
    await test.waitUntilCheckpointNumber(CheckpointNumber(badCheckpointNumber + 1), test.L2_SLOT_DURATION_IN_S * 12);

    // Create a fresh observer AFTER the bad checkpoint was gossiped, so it has no proposed copy to promote
    // and must rely on L1 calldata. Attestations are validated from calldata first, the checkpoint is rejected, and sync proceeds.
    const observer = await test.createNonValidatorNode();
    const honestTip = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;
    await retryUntil(
      async () => (await observer.getChainTips()).checkpointed.checkpoint.number >= honestTip,
      'observer syncs past the bad checkpoint without its withheld blob',
      test.L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );

    // The bad checkpoint was detected from calldata (the path that gates the blob fetch).
    expect(detected).toContain(badCheckpointNumber);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
    honestArchiver.events.removeListener(L2BlockSourceEvents.InvalidAttestationsCheckpointDetected, onInvalid);
  });

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

  // Regression for Joe's Q42025 London attack. Same as above but with an invalid signature instead of insufficient ones.
  it('chain progresses if a checkpoint with an invalid attestation is invalidated with an invalid one', async () => {
    await runDoubleInvalidationTest({
      attackConfig: { injectFakeAttestation: true },
      disableConfig: { injectFakeAttestation: false },
    });
  });

  // Regression for A-71: Ensure the node correctly invalidates checkpoints where an attestation has a malleable
  // signature (high-s value). The Rollup contract uses OpenZeppelin's ECDSA recover which rejects high-s values
  // per EIP-2, so these signatures recover to address(0) on L1 but may succeed offchain.
  it('proposer invalidates checkpoint with high-s value attestation', async () => {
    await runInvalidationTest({
      attackConfig: { injectHighSValueAttestation: true },
      disableConfig: { injectHighSValueAttestation: false },
    });
  });

  // Regression for A-71: Ensure the node correctly invalidates checkpoints where an attestation's signature
  // cannot be recovered (e.g. r=0). On L1, ecrecover returns address(0) for such signatures.
  it('proposer invalidates checkpoint with unrecoverable signature attestation', async () => {
    await runInvalidationTest({
      attackConfig: { injectUnrecoverableSignatureAttestation: true },
      disableConfig: { injectUnrecoverableSignatureAttestation: false },
    });
  });

  // Regression for the node accepting attestations that did not conform to the committee order,
  // but L1 requires the same ordering. See #18219.
  it('proposer invalidates previous block with shuffled attestations', async () => {
    await runInvalidationTest({
      attackConfig: { shuffleAttestationOrdering: true },
      disableConfig: { shuffleAttestationOrdering: false },
    });
  });
});

// A-1252 rows 4/5: a checkpoint with VALID attestations but an unfetchable blob
// cannot be rejected by attestation validation — the node must fetch the blob to
// ingest it. Before the fix, the blob-decode/fetch failure threw on every sync iteration, freezing the
// L1 sync clock (this.l1Timestamp is only advanced at the end of syncFromL1) and halting the node. The
// fix makes the failure non-fatal once the checkpoint's epoch can be pruned (its proof window expired),
// so the node skips it and its sync clock advances again. This fixture uses a short proof window and no
// prover, so epochs become prunable shortly after they end.
describe('e2e_epochs/epochs_blob_unavailable_prune', () => {
  let logger: Logger;
  let l1Client: ExtendedViemWalletClient;
  let rollupContract: RollupContract;
  let portOffset = 100;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    validators = times(VALIDATOR_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      ethereumSlotDuration: 8,
      aztecSlotDuration: 32,
      aztecEpochDuration: 6,
      blockDurationMs: 6000,
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      // Short proof window + no prover, so a checkpoint's epoch becomes prunable shortly after it ends.
      aztecProofSubmissionEpochs: 1,
      startProverNode: false,
      aztecTargetCommitteeSize: VALIDATOR_COUNT,
      secondsBeforeInvalidatingBlockAsCommitteeMember: Number.MAX_SAFE_INTEGER,
      archiverPollingIntervalMS: 200,
      anvilAccounts: 20,
      anvilPort: BASE_ANVIL_PORT + ++portOffset,
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      skipInitialSequencer: true,
    });

    ({ logger, l1Client } = test);
    rollupContract = new RollupContract(l1Client, test.rollup.address);

    const validatorNodes = validators.slice(0, NODE_COUNT);
    nodes = await asyncMap(validatorNodes, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true, minTxsPerBlock: 0 }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('skips a checkpoint with an unfetchable blob once its epoch can be pruned, unfreezing the sync clock', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);

    // Produce a couple of healthy checkpoints (valid attestations), then freeze the chain so the latest
    // one stays canonical — no honest proposer prunes it yet, isolating the observer's recovery to the fix.
    // We halt by raising minTxsPerBlock (rather than stopping the sequencer, which closes its store and
    // can't be cleanly restarted) so we can resume production later in the same test.
    const initial = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;
    await Promise.all(sequencers.map(s => s.start()));
    await test.waitUntilCheckpointNumber(CheckpointNumber(initial + 2), test.L2_SLOT_DURATION_IN_S * 16);
    // Halt all production: require txs that never arrive AND disable forced empty checkpoints.
    sequencers.forEach(s => s.updateConfig({ minTxsPerBlock: 100, buildCheckpointIfEmpty: false }));
    await sleep(test.L2_SLOT_DURATION_IN_S * 1500); // let any in-flight checkpoint land before reading the tip

    // Withhold the latest checkpoint's blob from the shared store.
    const proposedEvents = await rollupContract.getCheckpointProposedEvents(1n, await l1Client.getBlockNumber());
    const badEvent = proposedEvents.reduce((a, b) => (b.args.checkpointNumber > a.args.checkpointNumber ? b : a));
    const badCheckpointNumber = badEvent.args.checkpointNumber;
    logger.warn(`Froze chain at checkpoint ${badCheckpointNumber}`);
    const badL1Timestamp = (await l1Client.getBlock({ blockNumber: badEvent!.l1BlockNumber })).timestamp;
    // The file blob store namespaces blobs under `<root>/aztec-{chainId}-{version}-0x{rollup}/blobs`.
    const sharedRoot = join(test.context.config.dataDirectory!, 'shared-blobs');
    const namespaceDir = (await readdir(sharedRoot)).find(e => e.startsWith('aztec-'));
    expect(namespaceDir).toBeDefined();
    const blobsDir = join(sharedRoot, namespaceDir!, 'blobs');
    const targetNames = badEvent!.args.versionedBlobHashes.map(h => `0x${h.toString('hex')}.data`);
    const before = await readdir(blobsDir);
    for (const name of targetNames) {
      expect(before).toContain(name); // guards against the blob path layout drifting and silently passing
      await rm(join(blobsDir, name), { force: true });
    }
    expect((await readdir(blobsDir)).length).toEqual(before.length - targetNames.length);
    logger.warn(`Withheld ${targetNames.length} blob(s) for checkpoint ${badCheckpointNumber} from ${blobsDir}`);

    // Spin up a fresh observer that never promotes (so it must fetch the blob) and does not block on its
    // initial sync (so it can stall in the background while we drive the clock forward).
    const observer = await test.createNonValidatorNode({
      skipArchiverInitialSync: true,
      skipPromoteProposedCheckpointDuringL1Sync: true,
    });

    // It cannot get past the bad checkpoint while its epoch is still provable: the blob fetch throws every
    // iteration and the sync clock never advances (getL1Timestamp stays undefined).
    logger.warn(`Waiting for obersver node to attempt sync...`);
    await sleep(test.L2_SLOT_DURATION_IN_S * 1000);
    const frozenTs = await observer.getSyncedL1Timestamp();
    logger.warn(`Observer sync clock before window expiry: ${frozenTs} (bad checkpoint L1 ts ${badL1Timestamp})`);
    expect(frozenTs === undefined || frozenTs < badL1Timestamp).toBeTrue();

    // Advance L1 past the bad checkpoint's epoch proof-submission window, making it prunable.
    const now = BigInt(await test.context.cheatCodes.eth.lastBlockTimestamp());
    const windowSeconds = (test.constants.proofSubmissionEpochs + 2) * test.epochDuration * test.L2_SLOT_DURATION_IN_S;
    await test.context.cheatCodes.eth.warp(Number(now + BigInt(windowSeconds)), { resetBlockInterval: true });
    logger.warn(`Warped L1 forward by ${windowSeconds}s so checkpoint ${badCheckpointNumber} can be pruned`);

    // With the fix the observer skips the unfetchable checkpoint and its sync clock advances past it.
    // Without the fix it keeps throwing on the withheld blob and getL1Timestamp stays frozen/undefined.
    await retryUntil(
      async () => {
        const ts = await observer.getSyncedL1Timestamp();
        return ts !== undefined && ts > badL1Timestamp;
      },
      'observer sync clock unfreezes once the bad checkpoint becomes prunable',
      test.L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );

    // Resume production: the next proposer prunes the doomed unproven epoch on L1 (prune-on-propose, since
    // its proof window has expired) and the chain rebuilds. Every node — validators and the observer that
    // skipped the unfetchable checkpoint — must progress past it. This also implicitly asserts the prune
    // happened: had the chain instead built on top of the bad checkpoint, the observer (which never
    // ingested it) could not ingest any descendant, so it could never get past badCheckpointNumber.
    logger.warn(`Resuming production to let the chain prune and rebuild`);
    sequencers.forEach(s => s.updateConfig({ minTxsPerBlock: 0, buildCheckpointIfEmpty: true }));

    const allNodes = [...nodes, observer];
    await retryUntil(
      async () => {
        const tips = await Promise.all(allNodes.map(n => n.getChainTips().then(t => t.checkpointed.checkpoint.number)));
        logger.info(`Node checkpoint tips: ${tips.join(', ')} (target > ${badCheckpointNumber})`);
        return tips.every(n => n > badCheckpointNumber);
      },
      'chain prunes and every node (incl. the previously-stuck observer) progresses past the bad checkpoint',
      test.L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
