import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { OffenseType } from '@aztec/slasher';

import { advanceToEpochBeforeProposer, awaitCommitteeExists, awaitOffenseDetected } from '../../../e2e_p2p/shared.js';
import { ValidatorRegistrationHarness } from '../../validator_registration_harness.js';
import { AZTEC_SLOT_DURATION, aztecEpochDuration, baseHarnessOpts, slashingRoundSize, slashingUnit } from './setup.js';

/**
 * Test that slashing occurs when a validator sends duplicate attestations (equivocation).
 *
 * The setup of the test is as follows:
 * 1. Create 4 validator nodes total:
 *    - 2 honest validators with unique keys
 *    - 2 "malicious proposer" validators that share the SAME validator key but have DIFFERENT coinbase addresses
 *      (these will create duplicate proposals for the same slot)
 *    - The malicious proposer validators also have `attestToEquivocatedProposals: true` which makes them attest
 *      to BOTH proposals when they receive them - this is the attestation equivocation we want to detect
 * 2. The two nodes with the same proposer key will both detect they are proposers for the same slot and race to propose
 * 3. Since they have different coinbase addresses, their proposals will have different archives (different content)
 * 4. The malicious attester nodes (with attestToEquivocatedProposals enabled) will attest to BOTH proposals
 * 5. Honest validators will detect the duplicate attestations and emit a slash event
 *
 * NOTE: This test triggers BOTH duplicate proposal (from malicious proposers sharing a key) AND duplicate attestation
 * (from the malicious proposers attesting to multiple proposals). We verify specifically that the duplicate
 * attestation offense is recorded.
 *
 * Setup: MultiNodeTestContext via ValidatorRegistrationHarness on the in-memory mock-gossip bus (no real
 * libp2p). 4 validators, ethSlot=8s, aztecSlot=24s, epoch=2, proofSubEpochs=1024, minTxsPerBlock=0, inboxLag=2
 * (v5 always enforces the timetable).
 */
describe('multi-node/slashing/equivocation/duplicate_attestation', () => {
  let harness: ValidatorRegistrationHarness;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    harness = await ValidatorRegistrationHarness.create({
      ...baseHarnessOpts,
      slashDuplicateAttestationPenalty: slashingUnit,
    });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  const cheatCodes = () => harness.context.context.cheatCodes;

  const debugRollup = async () => {
    await cheatCodes().rollup.debugRollup();
  };

  // Two malicious nodes share a validator key and both attest to each other's proposals
  // (attestToEquivocatedProposals:true). Honest nodes detect the DUPLICATE_ATTESTATION offense and verify
  // the offending attester is the shared key's address. Also exercises DUPLICATE_PROPOSAL as a side effect
  // but asserts specifically that DUPLICATE_ATTESTATION is recorded.
  it('slashes validator who sends duplicate attestations', async () => {
    const { rollup } = await harness.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await cheatCodes().rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    harness.logger.warn('Creating nodes');

    // Use validator index 0 for the "malicious" proposer validator key
    const maliciousProposerIndex = 0;
    const maliciousProposerAddress = harness.addressAt(maliciousProposerIndex);

    harness.logger.warn(`Malicious proposer address: ${maliciousProposerAddress.toString()}`);

    // Create two nodes with the SAME validator key but DIFFERENT coinbase addresses
    // This will cause them to create proposals with different content for the same slot
    // Additionally, enable attestToEquivocatedProposals so they will attest to BOTH proposals
    const coinbase1 = EthAddress.random();
    const coinbase2 = EthAddress.random();

    harness.logger.warn(`Creating malicious proposer node 1 with coinbase ${coinbase1.toString()}`);
    const maliciousNode1 = await harness.createValidatorNode(maliciousProposerIndex, {
      coinbase: coinbase1,
      attestToEquivocatedProposals: true, // Attest to all proposals - creates duplicate attestations
      broadcastEquivocatedProposals: true, // Don't abort checkpoint building on duplicate block proposals
      dontStartSequencer: true,
      // Prevent HA peer proposals from being added to the archiver, so both
      // malicious nodes build their own blocks instead of one yielding to the other.
      skipPushProposedBlocksToArchiver: true,
    });

    harness.logger.warn(`Creating malicious proposer node 2 with coinbase ${coinbase2.toString()}`);
    const maliciousNode2 = await harness.createValidatorNode(maliciousProposerIndex, {
      coinbase: coinbase2,
      attestToEquivocatedProposals: true, // Attest to all proposals - creates duplicate attestations
      broadcastEquivocatedProposals: true, // Don't abort checkpoint building on duplicate block proposals
      dontStartSequencer: true,
      // Prevent HA peer proposals from being added to the archiver, so both
      // malicious nodes build their own blocks instead of one yielding to the other.
      skipPushProposedBlocksToArchiver: true,
    });

    // Create honest nodes with unique validator keys (indices 1 and 2)
    harness.logger.warn('Creating honest nodes');
    const honestNode1 = await harness.createValidatorNode(1, { dontStartSequencer: true });
    const honestNode2 = await harness.createValidatorNode(2, { dontStartSequencer: true });

    nodes = [maliciousNode1, maliciousNode2, honestNode1, honestNode2];

    await awaitCommitteeExists({ rollup, logger: harness.logger });

    // Find an epoch where the malicious proposer is selected, stopping one epoch before
    // so we have time to start sequencers before the target epoch arrives
    const epochCache = (honestNode1 as TestAztecNodeService).epochCache;
    const { targetEpoch, targetSlot } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: cheatCodes().rollup,
      targetProposer: maliciousProposerAddress,
      logger: harness.logger,
    });

    // Start all sequencers while still one epoch before the target
    harness.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running. The helper
    // picks a target slot at least one slot into the epoch, so warping here (rather than to the
    // epoch start) leaves the freshly-started sequencers a full warm-up slot before the pipelined
    // build for the malicious slot begins. Without that margin the duplicate proposals serialize
    // past the slot boundary and receivers reject them as late, so the malicious nodes never get to
    // attest to both and no duplicate attestation is produced.
    harness.logger.warn(`Advancing to one slot before target epoch ${targetEpoch} (target slot ${targetSlot})`);
    await cheatCodes().rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offenses to be detected
    // We expect BOTH duplicate proposal AND duplicate attestation offenses
    // The malicious proposer nodes create duplicate proposals (same key, different coinbase)
    // The malicious proposer nodes also create duplicate attestations (attestToEquivocatedProposals enabled)
    harness.logger.warn('Waiting for duplicate attestation offense to be detected...');
    const offenses = await awaitOffenseDetected({
      epochDuration: aztecEpochDuration,
      logger: harness.logger,
      nodeAdmin: honestNode1, // Use honest node to check for offenses
      slashingRoundSize,
      waitUntilOffenseCount: 2, // Wait for both duplicate proposal and duplicate attestation
      timeoutSeconds: AZTEC_SLOT_DURATION * 16,
    });

    harness.logger.warn(`Collected offenses`, { offenses });

    // Verify we have detected the duplicate attestation offense
    const duplicateAttestationOffenses = offenses.filter(
      offense => offense.offenseType === OffenseType.DUPLICATE_ATTESTATION,
    );
    const duplicateProposalOffenses = offenses.filter(
      offense => offense.offenseType === OffenseType.DUPLICATE_PROPOSAL,
    );

    harness.logger.info(`Found ${duplicateAttestationOffenses.length} duplicate attestation offenses`);
    harness.logger.info(`Found ${duplicateProposalOffenses.length} duplicate proposal offenses`);

    // We should have at least one duplicate attestation offense
    expect(duplicateAttestationOffenses.length).toBeGreaterThan(0);

    // Verify the duplicate attestation offense is from the malicious proposer address
    // (since they are the ones with attestToEquivocatedProposals enabled)
    for (const offense of duplicateAttestationOffenses) {
      expect(offense.offenseType).toEqual(OffenseType.DUPLICATE_ATTESTATION);
      expect(offense.validator.toString()).toEqual(maliciousProposerAddress.toString());
    }

    // Verify that for each duplicate attestation offense, the attester for that slot is the malicious validator
    for (const offense of duplicateAttestationOffenses) {
      const offenseSlot = SlotNumber(Number(offense.epochOrSlot));
      const committeeInfo = await epochCache.getCommittee(offenseSlot);
      harness.logger.info(
        `Offense slot ${offenseSlot}: committee includes attester ${maliciousProposerAddress.toString()}`,
      );
      expect(committeeInfo.committee?.map(addr => addr.toString())).toContain(maliciousProposerAddress.toString());
    }

    harness.logger.warn('Duplicate attestation offense correctly detected and recorded');
  });
});
