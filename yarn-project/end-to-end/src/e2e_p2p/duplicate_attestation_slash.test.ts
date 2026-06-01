import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { bufferToHex } from '@aztec/foundation/string';
import { OffenseType } from '@aztec/slasher';
import { TopicType } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { privateKeyToAccount } from 'viem/accounts';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createNode } from '../fixtures/setup_p2p_test.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { P2PNetworkTest } from './p2p_network.js';
import { advanceToEpochBeforeProposer, awaitCommitteeExists, awaitOffenseDetected } from './shared.js';

const TEST_TIMEOUT = 600_000; // 10 minutes

jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4600;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 8;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 3;
const BLOCK_DURATION = 4;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-attestation-slash-'));

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
 */
describe('e2e_p2p_duplicate_attestation_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  // Small slashing unit so we don't kick anyone out
  const slashingUnit = BigInt(1e14);
  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const aztecEpochDuration = 2;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_duplicate_attestation_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        slashInactivityConsecutiveEpochThreshold: 32, // effectively do not slash for inactivity
        minTxsPerBlock: 0, // always be building
        mockGossipSubNetwork: true, // do not worry about p2p connectivity issues
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
        enforceTimeTable: true,
        blockDurationMs: BLOCK_DURATION * 1000,
        l1PublishingTime: 1,
        slashDuplicateProposalPenalty: slashingUnit,
        slashDuplicateAttestationPenalty: slashingUnit,
        slashingOffsetInRounds: 1,
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const debugRollup = async () => {
    await t.ctx.cheatCodes.rollup.debugRollup();
  };

  it('slashes validator who sends duplicate attestations', async () => {
    const { rollup } = await t.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    t.logger.warn('Creating nodes');

    // Get the attester private key that will be shared between two malicious proposer nodes
    // We'll use validator index 0 for the "malicious" proposer validator key
    const maliciousProposerIndex = 0;
    const maliciousProposerPrivateKey = getPrivateKeyFromIndex(
      ATTESTER_PRIVATE_KEYS_START_INDEX + maliciousProposerIndex,
    )!;
    const maliciousProposerAddress = EthAddress.fromString(
      privateKeyToAccount(`0x${maliciousProposerPrivateKey.toString('hex')}`).address,
    );

    t.logger.warn(`Malicious proposer address: ${maliciousProposerAddress.toString()}`);

    // Create two nodes with the SAME validator key but DIFFERENT coinbase addresses
    // This will cause them to create proposals with different content for the same slot
    // Additionally, enable attestToEquivocatedProposals so they will attest to BOTH proposals
    const maliciousProposerPrivateKeyHex = bufferToHex(maliciousProposerPrivateKey);
    const coinbase1 = EthAddress.random();
    const coinbase2 = EthAddress.random();

    t.logger.warn(`Creating malicious proposer node 1 with coinbase ${coinbase1.toString()}`);
    const maliciousNode1 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        validatorPrivateKey: maliciousProposerPrivateKeyHex,
        coinbase: coinbase1,
        attestToEquivocatedProposals: true, // Attest to all proposals - creates duplicate attestations
        broadcastEquivocatedProposals: true, // Don't abort checkpoint building on duplicate block proposals
        dontStartSequencer: true,
        // Prevent HA peer proposals from being added to the archiver, so both
        // malicious nodes build their own blocks instead of one yielding to the other.
        skipPushProposedBlocksToArchiver: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 1,
      t.bootstrapNodeEnr,
      maliciousProposerIndex,
      t.genesis,
      `${DATA_DIR}-0`,
      shouldCollectMetrics(),
    );

    t.logger.warn(`Creating malicious proposer node 2 with coinbase ${coinbase2.toString()}`);
    const maliciousNode2 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        validatorPrivateKey: maliciousProposerPrivateKeyHex,
        coinbase: coinbase2,
        attestToEquivocatedProposals: true, // Attest to all proposals - creates duplicate attestations
        broadcastEquivocatedProposals: true, // Don't abort checkpoint building on duplicate block proposals
        dontStartSequencer: true,
        // Prevent HA peer proposals from being added to the archiver, so both
        // malicious nodes build their own blocks instead of one yielding to the other.
        skipPushProposedBlocksToArchiver: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 2,
      t.bootstrapNodeEnr,
      maliciousProposerIndex,
      t.genesis,
      `${DATA_DIR}-1`,
      shouldCollectMetrics(),
    );

    // Create honest nodes with unique validator keys (indices 1 and 2)
    t.logger.warn('Creating honest nodes');
    const honestNode1 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 3,
      t.bootstrapNodeEnr,
      1,
      t.genesis,
      `${DATA_DIR}-2`,
      shouldCollectMetrics(),
    );
    const honestNode2 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 4,
      t.bootstrapNodeEnr,
      2,
      t.genesis,
      `${DATA_DIR}-3`,
      shouldCollectMetrics(),
    );

    nodes = [maliciousNode1, maliciousNode2, honestNode1, honestNode2];

    // Wait for P2P mesh on all needed topics before starting sequencers
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS, 30, 0.1, [
      TopicType.tx,
      TopicType.block_proposal,
      TopicType.checkpoint_proposal,
    ]);
    await awaitCommitteeExists({ rollup, logger: t.logger });

    // Find an epoch where the malicious proposer is selected, stopping one epoch before
    // so we have time to start sequencers before the target epoch arrives
    const epochCache = (honestNode1 as TestAztecNodeService).epochCache;
    const { targetEpoch, targetSlot } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: t.ctx.cheatCodes.rollup,
      targetProposer: maliciousProposerAddress,
      logger: t.logger,
    });

    // Start all sequencers while still one epoch before the target
    t.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running. The helper
    // picks a target slot at least one slot into the epoch, so warping here (rather than to the
    // epoch start) leaves the freshly-started sequencers a full warm-up slot before the pipelined
    // build for the malicious slot begins. Without that margin the duplicate proposals serialize
    // past the slot boundary and receivers reject them as late, so the malicious nodes never get to
    // attest to both and no duplicate attestation is produced.
    t.logger.warn(`Advancing to one slot before target epoch ${targetEpoch} (target slot ${targetSlot})`);
    await t.ctx.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offenses to be detected
    // We expect BOTH duplicate proposal AND duplicate attestation offenses
    // The malicious proposer nodes create duplicate proposals (same key, different coinbase)
    // The malicious proposer nodes also create duplicate attestations (attestToEquivocatedProposals enabled)
    t.logger.warn('Waiting for duplicate attestation offense to be detected...');
    const offenses = await awaitOffenseDetected({
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      logger: t.logger,
      nodeAdmin: honestNode1, // Use honest node to check for offenses
      slashingRoundSize,
      waitUntilOffenseCount: 2, // Wait for both duplicate proposal and duplicate attestation
      timeoutSeconds: AZTEC_SLOT_DURATION * 16,
    });

    t.logger.warn(`Collected offenses`, { offenses });

    // Verify we have detected the duplicate attestation offense
    const duplicateAttestationOffenses = offenses.filter(
      offense => offense.offenseType === OffenseType.DUPLICATE_ATTESTATION,
    );
    const duplicateProposalOffenses = offenses.filter(
      offense => offense.offenseType === OffenseType.DUPLICATE_PROPOSAL,
    );

    t.logger.info(`Found ${duplicateAttestationOffenses.length} duplicate attestation offenses`);
    t.logger.info(`Found ${duplicateProposalOffenses.length} duplicate proposal offenses`);

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
      t.logger.info(`Offense slot ${offenseSlot}: committee includes attester ${maliciousProposerAddress.toString()}`);
      expect(committeeInfo.committee?.map(addr => addr.toString())).toContain(maliciousProposerAddress.toString());
    }

    t.logger.warn('Duplicate attestation offense correctly detected and recorded');
  });
});
