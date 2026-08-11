import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { OffenseType } from '@aztec/slasher';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { SENTINEL_TIMING, advanceToEpochBeforeProposer, awaitCommitteeExists } from './setup.js';

const NUM_VALIDATORS = 4;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const AZTEC_SLOT_DURATION = SENTINEL_TIMING.aztecSlotDuration;

const slashingUnit = BigInt(1e18);
const slashingQuorum = 3;
const slashingRoundSize = 4;

/**
 * Test that slashing occurs when a validator broadcasts an invalid block proposal.
 *
 * The setup of the test is as follows:
 * 1. Create 4 validator nodes
 * 2. Configure one node to broadcast invalid block proposals
 * 3. Set a non-zero slashing amount for BROADCASTED_INVALID_BLOCK_PROPOSAL
 * 4. Wait for the committee to be formed
 * 5. Send a transaction that will trigger a block proposal
 * 6. Expect that the invalid proposer gets slashed
 *
 * Setup: MultiNodeTestContext on the in-memory mock-gossip bus (no real libp2p). 4 validators,
 * ethSlot=4s, aztecSlot=8s, epoch=2, proofSubEpochs=1024 (no pruning), minTxsPerBlock=0, inboxLag=2.
 */
describe('multi-node/slashing/broadcasted_invalid_block_proposal_slash', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];

  // Slashing amount should be enough to kick validators out.
  const slashingAmount = slashingUnit * 3n;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      ...SENTINEL_TIMING,
      sentinelEnabled: false, // reuse only the fast 8s-slot timing; this test does not use the sentinel
      blockDurationMs: 2000,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      inboxLag: 2,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      slashInactivityConsecutiveEpochThreshold: 32, // effectively do not slash for inactivity
      minTxsPerBlock: 0, // always be building
      slashingQuorum,
      slashingRoundSizeInEpochs: slashingRoundSize / SENTINEL_TIMING.aztecEpochDuration,
      slashAmountSmall: slashingUnit,
      slashAmountMedium: slashingUnit * 2n,
      slashAmountLarge: slashingUnit * 3n,
      slashBroadcastedInvalidBlockPenalty: slashingAmount,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });
  });

  afterEach(async () => {
    await test.teardown();
  });

  const debugRollup = async () => {
    await test.context.cheatCodes.rollup.debugRollup();
  };

  // Verifies the BROADCASTED_INVALID_BLOCK_PROPOSAL slash path: one node sends bad block proposals while
  // honest nodes detect the offense, collect it across the committee, and trigger an on-chain slash.
  // The test finds a slot where the malicious node is proposer, then confirms the slash amount and
  // attester address are recorded on L1.
  it('slashes validator who broadcasts invalid block proposal', async () => {
    const { rollup } = await test.getSlashingContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await test.context.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);

    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - slashingAmount).toBeLessThan(biggestEjection);

    test.logger.warn('Creating nodes');

    // Create the invalid proposer (validator index 0). Keep its sequencer stopped until every node
    // has been created; otherwise (under proposer pipelining) the invalid proposer can publish its
    // sole bad block to slot N before the honest nodes are listening, and they will reject the
    // proposal as "invalid slot number" instead of slashing it.
    const invalidProposerIndex = 0;
    const invalidProposerAddress = test.addressAt(invalidProposerIndex);
    test.logger.warn(`Invalid proposer address: ${invalidProposerAddress.toString()}`);

    const invalidProposerNode = await test.createValidatorNodeAt(invalidProposerIndex, {
      broadcastInvalidBlockProposal: true,
      dontStartSequencer: true,
    });

    // Create remaining honest nodes, also with sequencers stopped, for the same reason.
    const honestNodes = await Promise.all(
      [1, 2, 3].map(index =>
        test.createValidatorNodeAt(index, { dontStartSequencer: true, skipBroadcastProposals: true }),
      ),
    );

    nodes = [invalidProposerNode, ...honestNodes];

    await awaitCommitteeExists({ rollup, logger: test.logger });

    // Find an epoch where the invalid proposer is selected, stopping one epoch before so
    // we have time to start sequencers before the target epoch arrives.
    const { targetEpoch } = await advanceToEpochBeforeProposer({
      epochCache: test.epochCache,
      cheatCodes: test.context.cheatCodes.rollup,
      targetProposer: invalidProposerAddress,
      logger: test.logger,
    });

    // Start all sequencers while still one epoch before the target
    test.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running.
    // Under proposer pipelining, the invalid proposer begins building for the first slot
    // of the target epoch one slot earlier; warping to the start of the epoch would force
    // the bad proposal to serialize past the slot boundary, after which honest receivers
    // reject it as late.
    test.logger.warn(`Advancing to one slot before target epoch ${targetEpoch}`);
    await test.context.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offense to be detected. Under proposer pipelining, the invalid block proposal is
    // broadcast at the slot boundary while a receiver's wall clock may have already advanced
    // past the build slot. Honest sequencers are running so their validator clients emit offenses,
    // but they do not broadcast proposals until after the offense is detected.
    const invalidBlockOffenses = await retryUntil(
      async () => {
        const allOffenses = (await Promise.all(nodes.map(n => n.getSlashOffenses('all')))).flat();
        const filtered = allOffenses.filter(o => o.offenseType === OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL);
        if (filtered.length > 0) {
          return filtered;
        }
      },
      'broadcasted invalid block proposal offense',
      AZTEC_SLOT_DURATION * 16,
    );

    test.logger.warn(`Collected broadcasted invalid block proposal offenses`, { invalidBlockOffenses });
    expect(invalidBlockOffenses.length).toBeGreaterThan(0);
    for (const offense of invalidBlockOffenses) {
      expect(offense.validator.toString()).toEqual(invalidProposerAddress.toString());
    }

    // Check slash is recorded on chain
    const slashPromise = promiseWithResolvers<{ amount: bigint; attester: EthAddress }>();
    rollup.listenToSlash(args => {
      test.logger.warn(`Slashed ${args.attester.toString()}`);
      slashPromise.resolve(args);
    });

    test.logger.warn('Re-enabling honest proposal broadcasts');
    await Promise.all(honestNodes.map(n => n.setConfig({ skipBroadcastProposals: false })));

    const { amount, attester } = await slashPromise.promise;
    expect(invalidProposerAddress.toString()).toEqual(attester.toString());
    expect(amount).toEqual(slashingAmount);
  });
});
