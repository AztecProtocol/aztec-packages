import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { OffenseType } from '@aztec/slasher';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import {
  AZTEC_SLOT_DURATION,
  NUM_VALIDATORS,
  advanceToEpochBeforeProposer,
  awaitCommitteeExists,
  awaitOffenseDetected,
  aztecEpochDuration,
  baseSlashingOpts,
  slashingRoundSize,
  slashingUnit,
} from './setup.js';

/**
 * Slashing on validator equivocation. Two malicious nodes share the same validator key but use
 * DIFFERENT coinbase addresses, so both detect they are proposers for the same slot, race to propose,
 * and produce proposals with different archives. Honest validators receive both proposals over the
 * mock-gossip bus and record the equivocation.
 *
 * The two suites differ only in whether the malicious nodes also attest to both proposals:
 *   - `duplicate proposal`: the malicious nodes equivocate but do not double-attest. Honest nodes
 *     record a DUPLICATE_PROPOSAL offense for the shared key.
 *   - `duplicate attestation`: the malicious nodes additionally run with `attestToEquivocatedProposals`,
 *     so they attest to BOTH proposals they see. This exercises DUPLICATE_PROPOSAL as a side effect but
 *     the suite asserts specifically that DUPLICATE_ATTESTATION is recorded.
 *
 * The two node-setup configs (the extra `slashDuplicateAttestationPenalty` and the
 * `attestToEquivocatedProposals` flag) differ per case, so each runs in its own describe with its own
 * `beforeEach`/`afterEach` rather than sharing one setup.
 *
 * Setup: MultiNodeTestContext on the in-memory mock-gossip bus (no real libp2p). 4 validators, ethSlot=8s,
 * aztecSlot=24s, epoch=2, proofSubEpochs=1024, minTxsPerBlock=0, inboxLag=2 (v5 always enforces the timetable).
 */

/**
 * Drives an equivocation scenario to the point where at least `waitUntilOffenseCount` offenses are
 * detected on the first honest node, and returns the actors + collected offenses for the caller to
 * assert on. Creates two malicious nodes sharing validator index 0 (distinct coinbases) plus two honest
 * nodes, finds the malicious proposer's slot, starts sequencers, and warps to it.
 */
async function runEquivocationScenario(
  test: MultiNodeTestContext,
  {
    attestToEquivocatedProposals,
    waitUntilOffenseCount,
  }: { attestToEquivocatedProposals: boolean; waitUntilOffenseCount: number },
): Promise<{
  nodes: AztecNodeService[];
  epochCache: EpochCacheInterface;
  maliciousAddress: EthAddress;
  honestNode: AztecNodeService;
}> {
  const cheatCodes = test.context.cheatCodes.rollup;
  const { rollup } = await test.getSlashingContracts();

  // Jump forward to an epoch in the future such that the validator set is not empty
  await cheatCodes.advanceToEpoch(EpochNumber(4));
  await cheatCodes.debugRollup();

  test.logger.warn('Creating nodes');

  // Use validator index 0 for the "malicious" proposer validator key
  const maliciousProposerIndex = 0;
  const maliciousAddress = test.addressAt(maliciousProposerIndex);
  test.logger.warn(`Malicious proposer address: ${maliciousAddress.toString()}`);

  // Create two nodes with the SAME validator key but DIFFERENT coinbase addresses so their proposals
  // have different content for the same slot. With `attestToEquivocatedProposals` they also attest to
  // both proposals, producing duplicate attestations.
  const maliciousConfig = (coinbase: EthAddress) => ({
    coinbase,
    broadcastEquivocatedProposals: true, // Don't abort checkpoint building on duplicate block proposals
    dontStartSequencer: true,
    // Prevent HA peer proposals from being added to the archiver, so both malicious nodes build their
    // own blocks instead of one yielding to the other.
    skipPushProposedBlocksToArchiver: true,
    ...(attestToEquivocatedProposals ? { attestToEquivocatedProposals: true } : {}),
  });

  const maliciousNode1 = await test.createValidatorNodeAt(maliciousProposerIndex, maliciousConfig(EthAddress.random()));
  const maliciousNode2 = await test.createValidatorNodeAt(maliciousProposerIndex, maliciousConfig(EthAddress.random()));

  // Create honest nodes with unique validator keys (indices 1 and 2)
  test.logger.warn('Creating honest nodes');
  const honestNode1 = await test.createValidatorNodeAt(1, { dontStartSequencer: true });
  const honestNode2 = await test.createValidatorNodeAt(2, { dontStartSequencer: true });

  const nodes = [maliciousNode1, maliciousNode2, honestNode1, honestNode2];

  await awaitCommitteeExists({ rollup, logger: test.logger });

  // Find an epoch where the malicious proposer is selected, stopping one epoch before so we have time
  // to start sequencers before the target epoch arrives.
  const epochCache = (honestNode1 as TestAztecNodeService).epochCache;
  const { targetEpoch, targetSlot } = await advanceToEpochBeforeProposer({
    epochCache,
    cheatCodes,
    targetProposer: maliciousAddress,
    logger: test.logger,
  });

  // Start all sequencers while still one epoch before the target
  test.logger.warn('Starting all sequencers');
  await Promise.all(nodes.map(n => n.getSequencer()!.start()));

  // Now warp to one slot before the target epoch — sequencers are already running. The helper picks a
  // target slot at least one slot into the epoch, so warping here (rather than to the epoch start)
  // leaves the freshly-started sequencers a full warm-up slot before the pipelined build for the
  // malicious slot begins. Without that margin the duplicate proposals serialize past the slot
  // boundary and receivers reject them as late, so no equivocation is produced.
  test.logger.warn(`Advancing to one slot before target epoch ${targetEpoch} (target slot ${targetSlot})`);
  await cheatCodes.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

  test.logger.warn('Waiting for offenses to be detected...');
  await awaitOffenseDetected({
    epochDuration: aztecEpochDuration,
    logger: test.logger,
    nodeAdmin: honestNode1,
    slashingRoundSize,
    waitUntilOffenseCount,
    timeoutSeconds: AZTEC_SLOT_DURATION * 16,
  });

  return { nodes, epochCache, maliciousAddress, honestNode: honestNode1 };
}

describe('multi-node/slashing/duplicate_attestation', () => {
  let test: MultiNodeTestContext;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      ...baseSlashingOpts,
      slashDuplicateAttestationPenalty: slashingUnit,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });
  });

  afterEach(async () => {
    await test.teardown();
  });

  // Two malicious nodes share a validator key and both attest to each other's proposals
  // (attestToEquivocatedProposals). Honest nodes detect the DUPLICATE_ATTESTATION offense and verify the
  // offending attester is the shared key's address, and that the address is in that slot's committee.
  // Also exercises DUPLICATE_PROPOSAL as a side effect but asserts specifically on DUPLICATE_ATTESTATION.
  it('slashes validator who sends duplicate attestations', async () => {
    // Wait for both the duplicate proposal and the duplicate attestation offense.
    const { epochCache, maliciousAddress, honestNode } = await runEquivocationScenario(test, {
      attestToEquivocatedProposals: true,
      waitUntilOffenseCount: 2,
    });

    const offenses = await honestNode.getSlashOffenses('all');
    test.logger.warn(`Collected offenses`, { offenses });

    const duplicateAttestationOffenses = offenses.filter(
      offense => offense.offenseType === OffenseType.DUPLICATE_ATTESTATION,
    );
    test.logger.info(`Found ${duplicateAttestationOffenses.length} duplicate attestation offenses`);

    // We should have at least one duplicate attestation offense, all from the malicious proposer address
    // (they are the ones with attestToEquivocatedProposals enabled).
    expect(duplicateAttestationOffenses.length).toBeGreaterThan(0);
    for (const offense of duplicateAttestationOffenses) {
      expect(offense.offenseType).toEqual(OffenseType.DUPLICATE_ATTESTATION);
      expect(offense.validator.toString()).toEqual(maliciousAddress.toString());
    }

    // For each duplicate attestation offense, the attester for that slot is the malicious validator.
    for (const offense of duplicateAttestationOffenses) {
      const offenseSlot = SlotNumber(Number(offense.epochOrSlot));
      const committeeInfo = await epochCache.getCommittee(offenseSlot);
      test.logger.info(`Offense slot ${offenseSlot}: committee includes attester ${maliciousAddress.toString()}`);
      expect(committeeInfo.committee?.map(addr => addr.toString())).toContain(maliciousAddress.toString());
    }

    test.logger.warn('Duplicate attestation offense correctly detected and recorded');
  });
});

describe('multi-node/slashing/duplicate_proposal', () => {
  let test: MultiNodeTestContext;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      ...baseSlashingOpts,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });
  });

  afterEach(async () => {
    await test.teardown();
  });

  // Two malicious nodes share a validator key but have different coinbase addresses so their proposals
  // differ. Honest nodes receive both proposals via mock gossip, detect the equivocation, and record a
  // DUPLICATE_PROPOSAL offense. The test collects offenses from all nodes (equivocation may only be
  // observed by whichever node processed both proposals before the slot closed) and asserts the offense
  // is attributed to the shared key's address and that the address is the slot's proposer.
  it('slashes validator who sends duplicate proposals', async () => {
    const { nodes, epochCache, maliciousAddress } = await runEquivocationScenario(test, {
      attestToEquivocatedProposals: false,
      waitUntilOffenseCount: 1,
    });

    // Poll every node for DUPLICATE_PROPOSAL offenses, retrying briefly so any node that detected the
    // duplicate after the initial offense was collected has time to flush it through the slasher's
    // offenses-collector. Under proposer pipelining, checkpoint proposals are broadcast at the slot
    // boundary while receivers' wall clocks may have advanced past the build slot — when that happens,
    // honest nodes reject the gossip with "invalid slot number" before duplicate detection runs, so
    // DUPLICATE_PROPOSAL is only observed by whichever node processed both proposals in time.
    const proposalOffenses = await test.waitForOffenseOnNodes(
      nodes,
      o => o.offenseType === OffenseType.DUPLICATE_PROPOSAL,
      { mode: 'any', timeout: AZTEC_SLOT_DURATION * 4 },
    );

    test.logger.warn(`Collected duplicate proposal offenses`, { proposalOffenses });
    expect(proposalOffenses.length).toBeGreaterThan(0);
    for (const offense of proposalOffenses) {
      expect(offense.validator.toString()).toEqual(maliciousAddress.toString());
    }

    // Verify that for each offense, the proposer for that slot is the malicious validator.
    for (const offense of proposalOffenses) {
      const offenseSlot = SlotNumber(Number(offense.epochOrSlot));
      const proposerForSlot = await epochCache.getProposerAttesterAddressInSlot(offenseSlot);
      test.logger.info(`Offense slot ${offenseSlot}: proposer is ${proposerForSlot?.toString()}`);
      expect(proposerForSlot?.toString()).toEqual(maliciousAddress.toString());
    }

    test.logger.warn('Duplicate proposal offense correctly detected and recorded');
  });
});
