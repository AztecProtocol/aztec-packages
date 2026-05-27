import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import type { SequencerClient, SequencerEvents } from '@aztec/sequencer-client';
import { getEpochAtSlot, getEpochNumberAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext, type EpochsTestOpts } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 3;

type PreparingEvent = Parameters<SequencerEvents['preparing-checkpoint']>[0];
type PublishedEvent = Parameters<SequencerEvents['checkpoint-published']>[0];

describe('e2e_epochs/epochs_proof_at_boundary', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let proverNode: AztecNodeService;

  const setupTest = async (
    overrides: Partial<EpochsTestOpts> = {},
    validatorOverrides: { minTxsPerBlock?: number; maxTxsPerBlock?: number } = {},
  ) => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      aztecProofSubmissionEpochs: 1024,
      aztecSlotDurationInL1Slots: 3,
      ethereumSlotDuration: 12,
      blockDurationMs: 6000,
      startProverNode: false,
      enforceTimeTable: true,
      skipInitialSequencer: true,
      enableProposerPipelining: true,
      inboxLag: 2,
      ...overrides,
    });

    ({ context, logger } = test);

    const minTxsPerBlock = validatorOverrides.minTxsPerBlock ?? 0;
    const maxTxsPerBlock = validatorOverrides.maxTxsPerBlock ?? 1;
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { minTxsPerBlock, maxTxsPerBlock }),
    );

    proverNode = await test.createProverNode({
      cancelTxOnTimeout: false,
      maxSpeedUpAttempts: 0,
      dontStart: true,
    });
    context.proverNode = proverNode;

    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  };

  const collectSequencerEvents = (sequencers: SequencerClient[]) => {
    const published: PublishedEvent[] = [];
    const preparing: PreparingEvent[] = [];
    const publishFailures: Parameters<SequencerEvents['checkpoint-publish-failed']>[0][] = [];
    const blockProposed: Parameters<SequencerEvents['block-proposed']>[0][] = [];

    for (const sequencer of sequencers) {
      const seq = sequencer.getSequencer();
      seq.on('checkpoint-published', args => published.push(args));
      seq.on('preparing-checkpoint', args => preparing.push(args));
      seq.on('checkpoint-publish-failed', args => publishFailures.push(args));
      seq.on('block-proposed', args => blockProposed.push(args));
    }

    return { published, preparing, publishFailures, blockProposed };
  };

  const computeBoundarySlot = async () => {
    await retryUntil(
      async () => {
        await test.monitor.run(true);
        return test.monitor.checkpointNumber >= CheckpointNumber(1);
      },
      'first checkpoint mined',
      120,
      0.5,
    );

    const firstCheckpoint = await test.rollup.getCheckpoint(CheckpointNumber(1));
    const firstCheckpointEpoch = getEpochAtSlot(firstCheckpoint.slotNumber, test.constants);
    logger.warn(`First checkpoint landed in slot ${firstCheckpoint.slotNumber} (epoch ${firstCheckpointEpoch}).`);

    const nowTs = BigInt(test.context.dateProvider.nowInSeconds());
    const requiredTs = nowTs + BigInt(test.L2_SLOT_DURATION_IN_S * 2);
    const minEpochFromTime = EpochNumber(getEpochNumberAtTimestamp(requiredTs - 1n, test.constants) + 1);
    const boundaryEpoch = EpochNumber(Math.max(firstCheckpointEpoch + 2, Number(minEpochFromTime)));
    const boundarySlot = SlotNumber(Number(boundaryEpoch) * test.epochDuration);
    const boundaryTs = getTimestampForSlot(boundarySlot, test.constants);
    logger.warn(`Targeting boundary at slot ${boundarySlot} (epoch ${boundaryEpoch}, ts ${boundaryTs}).`);

    return { boundarySlot, boundaryEpoch, boundaryTs, firstCheckpointEpoch };
  };

  const waitPastBoundary = async (boundarySlot: SlotNumber) => {
    await test.monitor.waitUntilL2Slot(SlotNumber(boundarySlot + 2));
    await retryUntil(
      async () => {
        await test.monitor.run(true);
        return test.monitor.l2SlotNumber >= boundarySlot + 2;
      },
      'archiver caught up past boundary',
      30,
      0.5,
    );
  };

  const waitForFirstCheckpointAfterBoundary = async (
    events: ReturnType<typeof collectSequencerEvents>,
    boundarySlot: SlotNumber,
  ): Promise<PublishedEvent> => {
    const result = await retryUntil(
      () => events.published.find(p => Number(p.slot) > Number(boundarySlot)),
      'first checkpoint published after boundary',
      Number(test.L2_SLOT_DURATION_IN_S) * 4,
      0.5,
    );
    if (!result) {
      throw new Error('No checkpoint was published after the boundary');
    }
    logger.warn(`First post-boundary checkpoint published`, result);
    return result;
  };

  // Asserts that no propose tx ever reached L1 for the boundary slot: the publisher dropped it at
  // preCheck. We check both that no `checkpoint-published` fired AND that every publish-failure
  // event for that slot is missing 'propose' from sentActions / failedActions.
  const assertBoundaryDidNotPropose = (events: ReturnType<typeof collectSequencerEvents>, boundarySlot: SlotNumber) => {
    const boundaryPublished = events.published.find(p => Number(p.slot) === Number(boundarySlot));
    expect(boundaryPublished).toBeUndefined();

    const boundaryFailures = events.publishFailures.filter(e => Number(e.slot) === Number(boundarySlot));
    expect(boundaryFailures.length).toBeGreaterThan(0);
    for (const failure of boundaryFailures) {
      expect(failure.sentActions ?? []).not.toContain('propose');
      expect(failure.failedActions ?? []).not.toContain('propose');
    }
  };

  // Tighter happy-path bound: the proof must land BEFORE the boundary slot's pipelined build kicks
  // off. With pipelining, the boundary slot's build starts at the start of the previous L2 slot
  // (i.e. boundaryTs - L2_SLOT_DURATION_IN_S). If the proof's L1 block is strictly earlier than
  // that, the build at the boundary observes `tips.proven` already advanced so the proven pin is
  // defensive only (no prune is due) and the boundary checkpoint publishes on the happy path.
  const assertProofMinedBeforeBoundaryBuild = async (proofReceipt: { blockNumber: bigint }, boundaryTs: bigint) => {
    const proofBlock = await test.l1Client.getBlock({ blockNumber: proofReceipt.blockNumber });
    expect(proofBlock.timestamp).toBeLessThan(boundaryTs - BigInt(test.L2_SLOT_DURATION_IN_S));
    logger.warn(`Proof tx mined at L1 ts ${proofBlock.timestamp}`, {
      blockNumber: proofReceipt.blockNumber,
      boundaryTs,
    });
  };

  // Tighter window: proof lands in the L2 slot immediately before the boundary (the pipeline-sleep
  // window), strictly before the boundary timestamp.
  const assertProofMinedJustBeforeBoundary = async (proofReceipt: { blockNumber: bigint }, boundaryTs: bigint) => {
    const proofBlock = await test.l1Client.getBlock({ blockNumber: proofReceipt.blockNumber });
    expect(proofBlock.timestamp).toBeLessThan(boundaryTs);
    expect(proofBlock.timestamp).toBeGreaterThan(boundaryTs - BigInt(test.L2_SLOT_DURATION_IN_S));
    logger.warn(`Proof tx mined at L1 ts ${proofBlock.timestamp}`, {
      blockNumber: proofReceipt.blockNumber,
      boundaryTs,
    });
  };

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('proof lands during slot build and checkpoint succeeds at boundary', async () => {
    // The proof for the unproven epoch lands AFTER the boundary slot's pipelined build starts but
    // BEFORE the publisher's preCheck. The proven pin lets the boundary checkpoint build before
    // the proof has landed; the preCheck succeeds because the proof arrives in time.
    await setupTest({ aztecProofSubmissionEpochs: 1 });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const events = collectSequencerEvents(sequencers);

    const { boundarySlot, boundaryTs } = await computeBoundarySlot();

    const proofMineTarget = boundaryTs - BigInt(test.L1_BLOCK_TIME_IN_S);
    const proofWaitTimeoutSeconds = Number(proofMineTarget) - test.context.dateProvider.nowInSeconds() + 60;

    // Arm the delayer BEFORE starting the prover so the very first tx the prover submits cannot
    // escape the delay window.
    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;
    proverDelayer.pauseNextTxUntilTimestamp(proofMineTarget, proofWaitTimeoutSeconds);
    await proverNode.getProverNode()!.start();
    logger.warn(`Scheduled proof tx to mine at L1 timestamp ${proofMineTarget}`, {
      proofMineTarget,
      boundarySlot,
      boundaryTs,
    });

    await waitPastBoundary(boundarySlot);

    const sentProofTxHashes = proverDelayer.getSentTxHashes();
    expect(sentProofTxHashes.length).toBeGreaterThan(0);
    const proofTxHash = sentProofTxHashes[0];
    const proofReceipt = await test.l1Client.getTransactionReceipt({ hash: proofTxHash });
    expect(proofReceipt.status).toEqual('success');

    await assertProofMinedJustBeforeBoundary(proofReceipt, boundaryTs);

    const boundaryPublished = events.published.find(p => Number(p.slot) === Number(boundarySlot));
    expect(boundaryPublished).toBeDefined();

    const boundaryPreparing = events.preparing.filter(p => Number(p.targetSlot) === Number(boundarySlot));
    expect(boundaryPreparing.some(p => p.hadProposedParent)).toBe(true);

    expect(Number(test.monitor.checkpointNumber)).toBeGreaterThanOrEqual(Number(boundaryPublished!.checkpoint));
    logger.warn(`Test passed. Final tip checkpoint=${test.monitor.checkpointNumber}`);
  });

  it('proof lands well before deadline and checkpoint succeeds at boundary', async () => {
    // Sanity check: the prover runs on its natural schedule, so the proof lands well before the
    // boundary epoch. By the time the boundary slot is built `tips.proven` is already advanced
    // and the proven pin is defensive only — but the boundary checkpoint must still publish.
    await setupTest({ aztecProofSubmissionEpochs: 1 });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const events = collectSequencerEvents(sequencers);

    const { boundarySlot, boundaryTs } = await computeBoundarySlot();

    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;
    await proverNode.getProverNode()!.start();

    await waitPastBoundary(boundarySlot);

    const sentProofTxHashes = proverDelayer.getSentTxHashes();
    expect(sentProofTxHashes.length).toBeGreaterThan(0);
    const proofReceipt = await test.l1Client.getTransactionReceipt({ hash: sentProofTxHashes[0] });
    expect(proofReceipt.status).toEqual('success');
    await assertProofMinedBeforeBoundaryBuild(proofReceipt, boundaryTs);

    const boundaryPublished = events.published.find(p => Number(p.slot) === Number(boundarySlot));
    expect(boundaryPublished).toBeDefined();

    const boundaryPreparing = events.preparing.filter(p => Number(p.targetSlot) === Number(boundarySlot));
    expect(boundaryPreparing.some(p => p.hadProposedParent)).toBe(true);

    expect(Number(test.monitor.checkpointNumber)).toBeGreaterThanOrEqual(Number(boundaryPublished!.checkpoint));
  });

  it('proof never lands so no checkpoint submission is attempted', async () => {
    // The boundary slot's build applies the proven pin, but the publisher's preCheck rejects the
    // propose tx because the proof never landed. After the prune fires on a later slot, a fresh
    // propose advances the chain and a checkpoint is published in the new epoch.
    await setupTest({ aztecProofSubmissionEpochs: 1 });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const events = collectSequencerEvents(sequencers);

    const { boundarySlot, boundaryEpoch } = await computeBoundarySlot();

    // Arm the delayer to drop the proof tx BEFORE starting the prover so it cannot escape.
    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;
    proverDelayer.cancelNextTx();
    await proverNode.getProverNode()!.start();
    logger.warn(`Cancelled prover node's next tx; proof will never land.`);

    await waitPastBoundary(boundarySlot);

    assertBoundaryDidNotPropose(events, boundarySlot);

    const boundaryPreparing = events.preparing.filter(p => Number(p.targetSlot) === Number(boundarySlot));
    expect(boundaryPreparing.some(p => p.hadProposedParent)).toBe(true);

    // After the boundary fails, a subsequent slot's propose tx triggers the on-chain prune (since
    // the proof never landed and the deadline has expired) and resets `tips.pending`. The fresh
    // checkpoint against the genesis archive should land within a few slots of the boundary —
    // empirically the next slot or two depending on whether the proposer rebuilds in time and
    // whether the on-chain prune fires in-tx on the first post-boundary propose attempt.
    const firstPostBoundary = await waitForFirstCheckpointAfterBoundary(events, boundarySlot);
    expect(Number(firstPostBoundary.slot)).toBeLessThanOrEqual(Number(boundarySlot) + 2);
    expect(getEpochAtSlot(firstPostBoundary.slot, test.constants)).toBe(boundaryEpoch);
  });

  it('proof lands without a proposed parent and boundary checkpoint succeeds', async () => {
    // The slot before the boundary is paused so the boundary slot's build does not see a proposed
    // parent. The proof still lands well before the deadline, so the proven pin is defensive only
    // and the boundary checkpoint is published normally.
    await setupTest({ aztecProofSubmissionEpochs: 1 });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const events = collectSequencerEvents(sequencers);

    const { boundarySlot } = await computeBoundarySlot();
    const slotN = SlotNumber(Number(boundarySlot) - 1);
    logger.warn(`Pausing proposing for slot ${slotN}`);

    for (const sequencer of sequencers) {
      sequencer.updateConfig({ pauseProposingForSlots: [slotN] });
    }

    await proverNode.getProverNode()!.start();
    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;

    await waitPastBoundary(boundarySlot);

    const sentProofTxHashes = proverDelayer.getSentTxHashes();
    expect(sentProofTxHashes.length).toBeGreaterThan(0);
    const proofReceipt = await test.l1Client.getTransactionReceipt({ hash: sentProofTxHashes[0] });
    expect(proofReceipt.status).toEqual('success');

    const boundaryPublished = events.published.find(p => Number(p.slot) === Number(boundarySlot));
    expect(boundaryPublished).toBeDefined();

    const boundaryPreparing = events.preparing.filter(p => Number(p.targetSlot) === Number(boundarySlot));
    expect(boundaryPreparing.length).toBeGreaterThan(0);
    expect(boundaryPreparing.every(p => !p.hadProposedParent)).toBe(true);

    expect(Number(test.monitor.checkpointNumber)).toBeGreaterThanOrEqual(Number(boundaryPublished!.checkpoint));
  });

  it('proof never lands without a proposed parent so no checkpoint submission is attempted', async () => {
    // Same as the no-parent variant above but with the proof never landing. The proven pin fires
    // (no parent + prune is due) but the publisher's preCheck rejects the propose, so no
    // checkpoint is published for the boundary slot.
    await setupTest({ aztecProofSubmissionEpochs: 1 });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const events = collectSequencerEvents(sequencers);

    const { boundarySlot } = await computeBoundarySlot();
    const slotN = SlotNumber(Number(boundarySlot) - 1);
    logger.warn(`Pausing proposing for slot ${slotN}`);

    for (const sequencer of sequencers) {
      sequencer.updateConfig({ pauseProposingForSlots: [slotN] });
    }

    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;
    proverDelayer.cancelNextTx();
    await proverNode.getProverNode()!.start();

    await waitPastBoundary(boundarySlot);

    assertBoundaryDidNotPropose(events, boundarySlot);

    const boundaryPreparing = events.preparing.filter(p => Number(p.targetSlot) === Number(boundarySlot));
    expect(boundaryPreparing.length).toBeGreaterThan(0);
    expect(boundaryPreparing.every(p => !p.hadProposedParent)).toBe(true);

    // See the parent test for the reasoning: a subsequent slot's propose triggers the on-chain
    // prune in-tx, so the first post-boundary checkpoint lands within a couple of slots.
    const firstPostBoundary = await waitForFirstCheckpointAfterBoundary(events, boundarySlot);
    expect(Number(firstPostBoundary.slot)).toBeLessThanOrEqual(Number(boundarySlot) + 2);
  });
});
