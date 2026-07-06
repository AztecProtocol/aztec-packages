import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { OffenseType } from '@aztec/slasher';
import { TopicType } from '@aztec/stdlib/consensus';

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
const BOOT_NODE_UDP_PORT = 4500;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 8;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 3;
const BLOCK_DURATION = 4;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-proposal-slash-'));

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
 */
describe('e2e_p2p_duplicate_proposal_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  // Small slashing unit so we don't kick anyone out
  const slashingUnit = BigInt(1e14);
  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const aztecEpochDuration = 2;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_duplicate_proposal_slash',
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
        slashDuplicateProposalPenalty: slashingUnit,
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

  it('slashes validator who sends duplicate proposals', async () => {
    const { rollup } = await t.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    t.logger.warn('Creating nodes');

    // Get the attester private key that will be shared between two malicious nodes
    // We'll use validator index 0 for the "malicious" validator key
    const maliciousValidatorIndex = 0;
    const maliciousValidatorPrivateKey = getPrivateKeyFromIndex(
      ATTESTER_PRIVATE_KEYS_START_INDEX + maliciousValidatorIndex,
    )!;
    const maliciousValidatorAddress = EthAddress.fromString(
      privateKeyToAccount(`0x${maliciousValidatorPrivateKey.toString('hex')}`).address,
    );

    t.logger.warn(`Malicious proposer address: ${maliciousValidatorAddress.toString()}`);

    // Create two nodes with the SAME validator key but DIFFERENT coinbase addresses
    // This will cause them to create proposals with different content for the same slot
    const maliciousPrivateKeyHex = bufferToHex(maliciousValidatorPrivateKey);
    const coinbase1 = EthAddress.random();
    const coinbase2 = EthAddress.random();

    t.logger.warn(`Creating malicious node 1 with coinbase ${coinbase1.toString()}`);
    const maliciousNode1 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        validatorPrivateKey: maliciousPrivateKeyHex,
        coinbase: coinbase1,
        broadcastEquivocatedProposals: true,
        dontStartSequencer: true,
        // Prevent HA peer proposals from being added to the archiver, so both
        // malicious nodes build their own blocks instead of one yielding to the other.
        skipPushProposedBlocksToArchiver: true,
      },
      t.ctx.dateProvider,
      BOOT_NODE_UDP_PORT + 1,
      t.bootstrapNodeEnr,
      maliciousValidatorIndex,
      t.genesis,
      `${DATA_DIR}-0`,
      shouldCollectMetrics(),
    );

    t.logger.warn(`Creating malicious node 2 with coinbase ${coinbase2.toString()}`);
    const maliciousNode2 = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        validatorPrivateKey: maliciousPrivateKeyHex,
        coinbase: coinbase2,
        broadcastEquivocatedProposals: true,
        dontStartSequencer: true,
        // Prevent HA peer proposals from being added to the archiver, so both
        // malicious nodes build their own blocks instead of one yielding to the other.
        skipPushProposedBlocksToArchiver: true,
      },
      t.ctx.dateProvider,
      BOOT_NODE_UDP_PORT + 2,
      t.bootstrapNodeEnr,
      maliciousValidatorIndex,
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
      t.ctx.dateProvider,
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
      t.ctx.dateProvider,
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
      targetProposer: maliciousValidatorAddress,
      logger: t.logger,
    });

    // Start all sequencers while still one epoch before the target
    t.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running.
    // Under proposer pipelining, the malicious proposers begin building for their slot one slot
    // earlier; warping to the start of the epoch would force both AVM-heavy duplicate proposals to
    // serialize past the slot boundary, after which honest receivers reject them as late. The helper
    // picks a target slot at least one slot into the epoch, so warping here leaves a full warm-up
    // slot before the build begins rather than starting it at the exact instant of the warp.
    t.logger.warn(`Advancing to one slot before target epoch ${targetEpoch} (target slot ${targetSlot})`);
    await t.ctx.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offense to be detected. Under proposer pipelining, checkpoint proposals are broadcast
    // at the slot boundary while the receivers' wall clocks may have already advanced past the build
    // slot — when that happens, honest nodes reject the gossip with "invalid slot number" before
    // duplicate detection runs, so DUPLICATE_PROPOSAL is only observed by whichever node managed to
    // process both proposals while still in the build slot (often the other malicious node, since
    // they receive each other's broadcasts immediately). We therefore collect offenses from every
    // node in the network and assert that at least one of them recorded the duplicate proposal.
    t.logger.warn('Waiting for duplicate proposal offense to be detected...');
    await awaitOffenseDetected({
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      logger: t.logger,
      nodeAdmin: honestNode1,
      slashingRoundSize,
      waitUntilOffenseCount: 1,
      timeoutSeconds: AZTEC_SLOT_DURATION * 16,
    });

    // Poll every node for DUPLICATE_PROPOSAL offenses, retrying briefly so any node that detected
    // the duplicate after the initial offense was collected has time to flush it through the
    // slasher's offenses-collector.
    const proposalOffenses = await retryUntil(
      async () => {
        const allOffenses = (await Promise.all(nodes.map(n => n.getSlashOffenses('all')))).flat();
        const filtered = allOffenses.filter(o => o.offenseType === OffenseType.DUPLICATE_PROPOSAL);
        if (filtered.length > 0) {
          return filtered;
        }
      },
      'duplicate proposal offense',
      AZTEC_SLOT_DURATION * 4,
    );

    t.logger.warn(`Collected duplicate proposal offenses`, { proposalOffenses });
    expect(proposalOffenses.length).toBeGreaterThan(0);
    for (const offense of proposalOffenses) {
      expect(offense.validator.toString()).toEqual(maliciousValidatorAddress.toString());
    }

    // Verify that for each offense, the proposer for that slot is the malicious validator
    for (const offense of proposalOffenses) {
      const offenseSlot = SlotNumber(Number(offense.epochOrSlot));
      const proposerForSlot = await epochCache.getProposerAttesterAddressInSlot(offenseSlot);
      t.logger.info(`Offense slot ${offenseSlot}: proposer is ${proposerForSlot?.toString()}`);
      expect(proposerForSlot?.toString()).toEqual(maliciousValidatorAddress.toString());
    }

    t.logger.warn('Duplicate proposal offense correctly detected and recorded');
  });
});
