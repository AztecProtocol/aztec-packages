import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { OffenseType } from '@aztec/slasher';

import { advanceToEpochBeforeProposer, awaitCommitteeExists, awaitOffenseDetected } from '../../e2e_p2p/shared.js';
import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import {
  AZTEC_SLOT_DURATION,
  NUM_VALIDATORS,
  aztecEpochDuration,
  baseSlashingOpts,
  slashingRoundSize,
} from './setup.js';

/**
 * Test that slashing occurs when a validator sends duplicate proposals (equivocation).
 *
 * The setup of the test is as follows:
 * 1. Create 4 validator nodes total:
 *    - 2 honest validators with unique keys
 *    - 2 "malicious" validators that share the SAME validator key but have DIFFERENT coinbase addresses
 * 2. The two nodes with the same key will both detect they are proposers for the same slot and naturally race to propose
 * 3. Since they have different coinbase addresses, their proposals will have different archives (different content)
 * 4. Other validators will detect the duplicate and emit a slash event
 *
 * Setup: MultiNodeTestContext on the in-memory mock-gossip bus (no real libp2p). 4 validators, ethSlot=8s,
 * aztecSlot=24s, epoch=2, proofSubEpochs=1024, minTxsPerBlock=0, inboxLag=2 (v5 always enforces the timetable).
 */
describe('multi-node/slashing/duplicate_proposal', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];

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

  const cheatCodes = () => test.context.cheatCodes;

  const debugRollup = async () => {
    await cheatCodes().rollup.debugRollup();
  };

  // Two malicious nodes share a validator key but have different coinbase addresses so their proposals
  // differ. Honest nodes receive both proposals via mock gossip, detect the equivocation, and record a
  // DUPLICATE_PROPOSAL offense. The test collects offenses from all nodes (equivocation may only be
  // observed by whichever node processed both proposals before the slot closed) and asserts the offense
  // is attributed to the shared key's address.
  it('slashes validator who sends duplicate proposals', async () => {
    const { rollup } = await test.getSlashingContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await cheatCodes().rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    test.logger.warn('Creating nodes');

    // Use validator index 0 for the "malicious" validator key
    const maliciousValidatorIndex = 0;
    const maliciousValidatorAddress = test.addressAt(maliciousValidatorIndex);

    test.logger.warn(`Malicious proposer address: ${maliciousValidatorAddress.toString()}`);

    // Create two nodes with the SAME validator key but DIFFERENT coinbase addresses
    // This will cause them to create proposals with different content for the same slot
    const coinbase1 = EthAddress.random();
    const coinbase2 = EthAddress.random();

    test.logger.warn(`Creating malicious node 1 with coinbase ${coinbase1.toString()}`);
    const maliciousNode1 = await test.createValidatorNodeAt(maliciousValidatorIndex, {
      coinbase: coinbase1,
      broadcastEquivocatedProposals: true,
      dontStartSequencer: true,
      // Prevent HA peer proposals from being added to the archiver, so both
      // malicious nodes build their own blocks instead of one yielding to the other.
      skipPushProposedBlocksToArchiver: true,
    });

    test.logger.warn(`Creating malicious node 2 with coinbase ${coinbase2.toString()}`);
    const maliciousNode2 = await test.createValidatorNodeAt(maliciousValidatorIndex, {
      coinbase: coinbase2,
      broadcastEquivocatedProposals: true,
      dontStartSequencer: true,
      // Prevent HA peer proposals from being added to the archiver, so both
      // malicious nodes build their own blocks instead of one yielding to the other.
      skipPushProposedBlocksToArchiver: true,
    });

    // Create honest nodes with unique validator keys (indices 1 and 2)
    test.logger.warn('Creating honest nodes');
    const honestNode1 = await test.createValidatorNodeAt(1, { dontStartSequencer: true });
    const honestNode2 = await test.createValidatorNodeAt(2, { dontStartSequencer: true });

    nodes = [maliciousNode1, maliciousNode2, honestNode1, honestNode2];

    await awaitCommitteeExists({ rollup, logger: test.logger });

    // Find an epoch where the malicious proposer is selected, stopping one epoch before
    // so we have time to start sequencers before the target epoch arrives
    const epochCache = (honestNode1 as TestAztecNodeService).epochCache;
    const { targetEpoch, targetSlot } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: cheatCodes().rollup,
      targetProposer: maliciousValidatorAddress,
      logger: test.logger,
    });

    // Start all sequencers while still one epoch before the target
    test.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running.
    // Under proposer pipelining, the malicious proposers begin building for their slot one slot
    // earlier; warping to the start of the epoch would force both AVM-heavy duplicate proposals to
    // serialize past the slot boundary, after which honest receivers reject them as late. The helper
    // picks a target slot at least one slot into the epoch, so warping here leaves a full warm-up
    // slot before the build begins rather than starting it at the exact instant of the warp.
    test.logger.warn(`Advancing to one slot before target epoch ${targetEpoch} (target slot ${targetSlot})`);
    await cheatCodes().rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offense to be detected. Under proposer pipelining, checkpoint proposals are broadcast
    // at the slot boundary while the receivers' wall clocks may have already advanced past the build
    // slot — when that happens, honest nodes reject the gossip with "invalid slot number" before
    // duplicate detection runs, so DUPLICATE_PROPOSAL is only observed by whichever node managed to
    // process both proposals while still in the build slot (often the other malicious node, since
    // they receive each other's broadcasts immediately). We therefore collect offenses from every
    // node in the network and assert that at least one of them recorded the duplicate proposal.
    test.logger.warn('Waiting for duplicate proposal offense to be detected...');
    await awaitOffenseDetected({
      epochDuration: aztecEpochDuration,
      logger: test.logger,
      nodeAdmin: honestNode1,
      slashingRoundSize,
      waitUntilOffenseCount: 1,
      timeoutSeconds: AZTEC_SLOT_DURATION * 16,
    });

    // Poll every node for DUPLICATE_PROPOSAL offenses, retrying briefly so any node that detected
    // the duplicate after the initial offense was collected has time to flush it through the
    // slasher's offenses-collector.
    const proposalOffenses = await test.waitForOffenseOnNodes(
      nodes,
      o => o.offenseType === OffenseType.DUPLICATE_PROPOSAL,
      { mode: 'any', timeout: AZTEC_SLOT_DURATION * 4 },
    );

    test.logger.warn(`Collected duplicate proposal offenses`, { proposalOffenses });
    expect(proposalOffenses.length).toBeGreaterThan(0);
    for (const offense of proposalOffenses) {
      expect(offense.validator.toString()).toEqual(maliciousValidatorAddress.toString());
    }

    // Verify that for each offense, the proposer for that slot is the malicious validator
    for (const offense of proposalOffenses) {
      const offenseSlot = SlotNumber(Number(offense.epochOrSlot));
      const proposerForSlot = await epochCache.getProposerAttesterAddressInSlot(offenseSlot);
      test.logger.info(`Offense slot ${offenseSlot}: proposer is ${proposerForSlot?.toString()}`);
      expect(proposerForSlot?.toString()).toEqual(maliciousValidatorAddress.toString());
    }

    test.logger.warn('Duplicate proposal offense correctly detected and recorded');
  });
});
