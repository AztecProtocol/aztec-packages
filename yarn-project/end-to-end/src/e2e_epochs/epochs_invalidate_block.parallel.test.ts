import { CalldataRetriever } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { ExtendedViemWalletClient, ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { timeoutPromise } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { OffenseType } from '@aztec/slasher';
import { computeQuorum, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
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

    // Setup context with the given set of validators, mocked gossip sub network, and no anvil test watcher.
    // Uses multiple-blocks-per-slot timing configuration.
    test = await EpochsTestContext.setup({
      ethereumSlotDuration: 8,
      aztecSlotDuration: 32,
      blockDurationMs: 6000,
      l1PublishingTime: 8,
      enforceTimeTable: true,
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
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
      enableProposerPipelining: true,
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
    // Start all sequencers with default (good) config, wait for the first checkpoint to land,
    // then apply the bad config to the proposers of the next two slots. This avoids the race
    // where a bad proposer is also the proposer of slot+1 and gets the bad config too early.
    const sequencers = nodes.map(node => node.getSequencer()!);
    sequencers.forEach(s => s.updateConfig({ minTxsPerBlock: 0 }));
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers, waiting for first checkpoint before applying malicious config`);

    // Wait for at least one checkpoint to be mined so that any in-progress slot has completed
    const initialCheckpointNumber = (await nodes[0].getChainTips()).checkpointed.checkpoint.number;
    await test.waitUntilCheckpointNumber(CheckpointNumber(initialCheckpointNumber + 1), test.L2_SLOT_DURATION_IN_S * 4);

    // Align to the start of an L2 slot before computing the bad slots, so we have a generous
    // buffer to push the malicious config to badSlot1's proposer before it snapshots its config
    // into a new CheckpointProposalJob. Under proposer pipelining, that job is built during the
    // last L1 slot of the previous L2 slot (when getEpochAndSlotInNextL1Slot first returns the
    // proposer's target slot), so the practical window is somewhat less than a full L2 slot.
    await test.monitor.waitUntilNextL2Slot();
    const { l2SlotNumber: currentSlot } = await test.monitor.run();
    logger.warn(`First checkpoint mined, current slot is ${currentSlot}`);

    // Pick the next two slots with a 2-slot gap to account for pipelining plus a margin
    const badSlot1 = SlotNumber.add(currentSlot, 3);
    const badSlot2 = SlotNumber.add(currentSlot, 4);
    const badSlots = [badSlot1, badSlot2];
    const badProposers = await Promise.all(badSlots.map(s => test.epochCache.getProposerAttesterAddressInSlot(s)));

    const badNodes = [];
    for (let badProposerIndex = 0; badProposerIndex < badProposers.length; badProposerIndex++) {
      const badProposer = badProposers[badProposerIndex];
      logger.warn(`Disabling invalidation checks and attestation gathering for proposer ${badProposer}`);
      const nodeIndex = nodes.findIndex(n => n.getSequencer()!.validatorAddresses!.some(a => a.equals(badProposer!)));
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

    // Wait for both checkpoints to be mined
    logger.warn(`Waiting for two checkpoints to be mined on slots ${expectedFirstSlot} and ${expectedSecondSlot}`);
    const [firstCheckpoint, secondCheckpoint] = await Promise.race([
      await Promise.all([firstCheckpointPromise.promise, secondCheckpointPromise.promise]),
      timeoutPromise(test.L2_SLOT_DURATION_IN_S * 8 * 1000).then(() => [CheckpointNumber(0), CheckpointNumber(0)]),
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
