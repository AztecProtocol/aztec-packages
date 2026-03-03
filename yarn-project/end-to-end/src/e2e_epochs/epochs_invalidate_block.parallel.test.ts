import type { AztecNodeService } from '@aztec/aztec-node';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { timeoutPromise } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { OffenseType } from '@aztec/slasher';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getAnvilPort } from '../fixtures/fixtures.js';
import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 5;
const VALIDATOR_COUNT = 5;

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
      numberOfAccounts: 1,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
      aztecTargetCommitteeSize: VALIDATOR_COUNT,
      archiverPollingIntervalMS: 200,
      anvilAccounts: 20,
      anvilPort: BASE_ANVIL_PORT + ++anvilPortOffset,
      slashingRoundSizeInEpochs: 4,
      slashingOffsetInRounds: 256,
      slasherFlavor: 'tally',
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    });

    ({ context, logger, l1Client } = test);
    rollupContract = new RollupContract(l1Client, test.rollup.address);

    // Halt block building in initial aztec node
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

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
    const initialCheckpointNumber = (await nodes[0].getL2Tips()).checkpointed.checkpoint.number;

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
    const checkpointInvalidatedFilter = await l1Client.createContractEventFilter({
      address: rollupContract.address,
      abi: RollupAbi,
      eventName: 'CheckpointInvalidated',
      fromBlock: 1n,
      toBlock: 'latest',
    });

    const checkpointInvalidatedEvents = await retryUntil(
      async () => {
        const events = await l1Client.getFilterLogs({ filter: checkpointInvalidatedFilter });
        return events.length > 0 ? events : undefined;
      },
      'CheckpointInvalidated event',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.1,
    );

    // Verify the checkpoint was invalidated and the chain rolled back
    const [event] = checkpointInvalidatedEvents;
    logger.warn(`CheckpointInvalidated event emitted`, { event });
    expect(event.args.checkpointNumber).toBeGreaterThan(initialCheckpointNumber);
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

  it('proposer invalidates previous checkpoint with multiple blocks while posting its own', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const [initialCheckpointNumber, initialBlockNumber] = await nodes[0]
      .getL2Tips()
      .then(t => [t.checkpointed.checkpoint.number, t.checkpointed.block.number] as const);

    // Configure all sequencers to skip collecting attestations before starting
    // Also set minBlocksForCheckpoint to ensure multi-block checkpoints
    logger.warn('Configuring all sequencers to skip attestation collection');
    sequencers.forEach(sequencer => {
      sequencer.updateConfig({ skipCollectingAttestations: true, minBlocksForCheckpoint: 2 });
    });

    // Send a few transactions so the sequencer builds multiple blocks in the checkpoint
    // We'll later check that the first tx at least was picked up and mined
    logger.warn('Sending multiple transactions to trigger block building');
    const [{ txHash: sentTx }] = await timesAsync(8, i =>
      testContract.methods.emit_nullifier(BigInt(i + 1)).send({ from: context.accounts[0], wait: NO_WAIT }),
    );

    // Disable skipCollectingAttestations after the first checkpoint and capture its number
    test.monitor.on('checkpoint', ({ checkpointNumber }) => {
      logger.warn(`Disabling skipCollectingAttestations after checkpoint ${checkpointNumber} has been mined`);
      sequencers.forEach(sequencer => {
        sequencer.updateConfig({ skipCollectingAttestations: false });
      });
    });

    // Start all sequencers
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers with skipCollectingAttestations=true`);

    // Create a filter for CheckpointInvalidated events
    const checkpointInvalidatedFilter = await l1Client.createContractEventFilter({
      address: rollupContract.address,
      abi: RollupAbi,
      eventName: 'CheckpointInvalidated',
      fromBlock: 1n,
      toBlock: 'latest',
    });

    // The next proposer should invalidate the previous checkpoint and publish a new one
    logger.warn('Waiting for next proposer to invalidate the previous checkpoint');

    // Wait for the CheckpointInvalidated event
    const checkpointInvalidatedEvents = await retryUntil(
      async () => {
        const events = await l1Client.getFilterLogs({ filter: checkpointInvalidatedFilter });
        return events.length > 0 ? events : undefined;
      },
      'CheckpointInvalidated event',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.1,
    );

    // Verify the CheckpointInvalidated event was emitted and that the block was removed
    const [event] = checkpointInvalidatedEvents;
    logger.warn(`CheckpointInvalidated event emitted`, { event });
    expect(event.args.checkpointNumber).toBeGreaterThan(initialCheckpointNumber);
    expect(test.rollup.address).toEqual(event.address);

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

    // Check that we have tagged an offense for that
    const offenses = await context.aztecNodeAdmin.getSlashOffenses('all');
    expect(offenses.length).toBeGreaterThan(0);
    const invalidBlockOffense = offenses.find(o => o.offenseType === OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS);
    expect(invalidBlockOffense).toBeDefined();

    const currentCheckpoint = await test.rollup.getCheckpointNumber();

    logger.warn('Sending further transactions to trigger more block building');
    await timesAsync(8, i =>
      testContract.methods.emit_nullifier(BigInt(i + 100)).send({ from: context.accounts[0], wait: NO_WAIT }),
    );

    logger.warn(`Waiting for checkpoint ${currentCheckpoint + 2} to be mined to ensure chain can progress`);
    await test.waitUntilCheckpointNumber(CheckpointNumber(currentCheckpoint + 2), test.L2_SLOT_DURATION_IN_S * 8);

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

  // Here we disable invalidation checks from two of the proposers. Our goal is to get two invalid checkpoints
  // in a row, so the third proposer invalidates the earliest one, and the chain progresses. Note that the
  // second invalid checkpoint will also have invalid attestations, we are *not* testing the scenario where the
  // committee is malicious (or incompetent) and attests for the descendent of an invalid checkpoint.
  it('proposer invalidates multiple checkpoints', async () => {
    const initialSlot = (await test.monitor.run()).l2SlotNumber;

    // Disable validation and attestation gathering for the proposers of two consecutive slots
    // Note that we dont do this on the immediate next slot in case it has already started being built
    const badProposers = await Promise.all([
      test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(initialSlot + 2)),
      test.epochCache.getProposerAttesterAddressInSlot(SlotNumber(initialSlot + 3)),
    ]);

    const badNodes = [];
    for (const badProposer of badProposers) {
      logger.warn(`Disabling invalidation checks and attestation gathering for proposer ${badProposer}`);
      const node = nodes.find(n => n.getSequencer()!.validatorAddresses!.some(a => a.equals(badProposer!)));
      if (!node) {
        throw new Error(`Could not find node for proposer ${badProposer}`);
      }
      badNodes.push(node);
      await node.setConfig({
        skipInvalidateBlockAsProposer: true,
        skipCollectingAttestations: true,
        skipValidateCheckpointAttestations: true,
        minTxsPerBlock: 0,
      });
    }

    // Start all sequencers
    const sequencers = nodes.map(node => node.getSequencer()!);
    await Promise.all(sequencers.map(s => s.start()));
    logger.warn(`Started all sequencers`);

    // We should see two invalid blocks being proposed by the bad proposers in those two slots
    const firstCheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    const secondCheckpointPromise = promiseWithResolvers<CheckpointNumber>();
    const expectedFirstSlot = Number(BigInt(initialSlot) + 2n);
    const expectedSecondSlot = Number(BigInt(initialSlot) + 3n);
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

    // Subscribe to checkpoint invalidation events
    const invalidatePromise = promiseWithResolvers<CheckpointNumber>();
    const unsubscribe = rollupContract.listenToCheckpointInvalidated(event => {
      logger.warn(`Checkpoint ${event.checkpointNumber} has been invalidated`, event);
      invalidatePromise.resolve(event.checkpointNumber);
      unsubscribe();
    });

    // Wait for a slot with a good proposer
    logger.warn(
      `Checkpoints ${firstCheckpoint} and ${secondCheckpoint} have been mined. Waiting for slot with good proposer.`,
    );
    const goodProposer = await retryUntil(async () => {
      const { currentSlot } = test.epochCache.getCurrentAndNextSlot();
      const currentProposer = await test.epochCache.getProposerAttesterAddressInSlot(currentSlot);
      if (badProposers.every(p => !p!.equals(currentProposer!))) {
        return currentProposer;
      }
    });

    // As soon as it's the turn of a good proposer, we should see the first checkpoint being invalidated
    logger.warn(`Turn for ${goodProposer}. Waiting for invalidation.`);
    const invalidatedCheckpoint = await Promise.race([
      invalidatePromise.promise,
      timeoutPromise(test.L2_SLOT_DURATION_IN_S * 4 * 1000).then(() => CheckpointNumber(0)),
    ]);

    // The invalidated checkpoint should be the first one,
    // but it may also be a checkpoint *before* the first one that gets mined in an early slot
    expect(invalidatedCheckpoint).toBeLessThanOrEqual(firstCheckpoint);

    // Restore bad nodes back to normal. They should eventually detect that their archive root does not
    // match the value on chain and roll back their invalid nodes.
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

  it('committee member invalidates a block if proposer does not come through', async () => {
    const sequencers = nodes.map(node => node.getSequencer()!);
    const initialCheckpointNumber = await nodes[0].getL2Tips().then(t => t.checkpointed.checkpoint.number);

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

    // Create a filter for CheckpointInvalidated events
    const checkpointInvalidatedFilter = await l1Client.createContractEventFilter({
      address: rollupContract.address,
      abi: RollupAbi,
      eventName: 'CheckpointInvalidated',
      fromBlock: 1n,
      toBlock: 'latest',
    });

    // Some committee member should invalidate the previous checkpoint
    logger.warn('Waiting for committee member to invalidate the previous checkpoint');

    // Wait for the CheckpointInvalidated event
    const checkpointInvalidatedEvents = await retryUntil(
      async () => {
        const events = await l1Client.getFilterLogs({ filter: checkpointInvalidatedFilter });
        return events.length > 0 ? events : undefined;
      },
      'CheckpointInvalidated event',
      test.L2_SLOT_DURATION_IN_S * 5,
      0.1,
    );

    // Verify the CheckpointInvalidated event was emitted
    const [event] = checkpointInvalidatedEvents;
    logger.warn(`CheckpointInvalidated event emitted`, { event });
    expect(event.args.checkpointNumber).toBeGreaterThan(initialCheckpointNumber);

    // And check that the invalidation happened at least after the specified timeout.
    // We use the checkpoint header timestamp (L2 timestamp) since that's what the sequencer uses
    // to calculate how long to wait before invalidating, not the L1 block timestamp when it landed.
    const invalidSlotTimestamp = getTimestampForSlot(invalidCheckpointSlotNumber!, test.constants);
    const { timestamp: invalidationTimestamp } = await l1Client.getBlock({ blockNumber: event.blockNumber });
    expect(invalidationTimestamp).toBeGreaterThanOrEqual(invalidSlotTimestamp + BigInt(invalidationDelay));

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
