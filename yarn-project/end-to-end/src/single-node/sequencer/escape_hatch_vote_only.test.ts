import { CheatCodes, EthCheatCodes } from '@aztec/aztec/testing';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { EscapeHatchAbi } from '@aztec/l1-artifacts/EscapeHatchAbi';
import { EscapeHatchBytecode } from '@aztec/l1-artifacts/EscapeHatchBytecode';
import { EscapeHatchStorage } from '@aztec/l1-artifacts/EscapeHatchStorage';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';
import type { SequencerClient, SequencerEvents } from '@aztec/sequencer-client';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { getPrivateKeyFromIndex } from '../../fixtures/utils.js';
import { setupBlockProducer } from '../setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';

const OPEN_THE_HATCH = true;

// Run at the PIPELINING_SETUP_OPTS fast profile (eth=4s, aztec=12s). Every escape-hatch parameter below
// is in epochs/slots (counts), not wall-clock seconds, so the open/closed-window math and the per-slot
// vote-count assertions are invariant to slot duration — only the wall-clock cost of living through the
// vote slots changes. The body has no proving-deadline assertion (aztecProofSubmissionEpochs=15), so the
// eth<8 fast timing budgets are safe.
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 12;
const AZTEC_EPOCH_DURATION = 4;
const ROUND_SIZE = AZTEC_EPOCH_DURATION * 64;
const QUORUM_SIZE = ROUND_SIZE - 1; // Don't matter if almost impossible, not what we test
const COMMITTEE_SIZE = 4;

const ESCAPE_HATCH_FREQUENCY = 17n;
const ESCAPE_HATCH_ACTIVE_DURATION = 16n;

jest.setTimeout(1000 * 60 * 5);

// Tests the sequencer's behavior during an EscapeHatch voting window. One node running a 4-validator
// committee with pipelining opts (ethSlot=4s, aztecSlot=12s, epoch=4, proofSubEpochs=15). The
// beforeEach deploys a custom EscapeHatch L1 contract and wires it into the rollup. Timing driven by
// cheatCodes.rollup.advanceToEpoch + retryUntil waits.
// Setup: setupBlockProducer (no prover node) with { ...PIPELINING_SETUP_OPTS, overridden slots,
// aztecTargetCommitteeSize=4 }.
describe('single-node/sequencer/escape_hatch_vote_only', () => {
  let logger: Logger;
  let test: SingleNodeTestContext;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let cheatCodes: CheatCodes;
  let ethCheatCodes: EthCheatCodes;
  let rollup: RollupContract;
  let governanceProposer: GovernanceProposerContract;
  let newGovernanceProposerPayloadAddress: EthAddress;
  let sequencerClient: SequencerClient | undefined;

  const escapeHatchProposerAddress = EthAddress.fromString('0x0000000000000000000000000000000000000001');

  beforeEach(async () => {
    const validatorOffset = 10;
    const validators = times(COMMITTEE_SIZE, i => {
      const privateKey = `0x${getPrivateKeyFromIndex(i + validatorOffset)!.toString('hex')}` as const;
      const account = privateKeyToAccount(privateKey);
      const address = EthAddress.fromString(account.address);
      expect(address).not.toBe(escapeHatchProposerAddress);
      return { attester: address, withdrawer: address, privateKey };
    });

    test = await setupBlockProducer({
      ...PIPELINING_SETUP_OPTS,
      numberOfAccounts: 1,
      anvilAccounts: 10,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      initialValidators: validators.map(v => ({ ...v, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) })),
      validatorPrivateKeys: new SecretValue(validators.map(v => v.privateKey)),
      governanceProposerRoundSize: ROUND_SIZE,
      governanceProposerQuorum: QUORUM_SIZE,
      // Inherit the PIPELINING_SETUP_OPTS fast slot durations (eth=4s, aztec=12s, blockDurationMs=3000).
      // These slots are restated as named constants so the retryUntil timeouts below scale with them.
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      blockDurationMs: 3000,
      aztecEpochDuration: AZTEC_EPOCH_DURATION,
      // Keep pruning far away for this test.
      aztecProofSubmissionEpochs: 15, // needed so ACTIVE_DURATION=2 is a valid EscapeHatch config
      automineL1Setup: true,
      // Pipelining opts — exercise the §6 B5 fix (tryVoteWhenEscapeHatchOpen signing/submitting for targetSlot).
      // inboxLag: 2 so the sequencer sources L1->L2 messages from a sealed checkpoint when building for slot+1.
      inboxLag: 2,
    });

    ({
      logger,
      aztecNodeAdmin,
      deployL1ContractsValues,
      cheatCodes,
      ethCheatCodes,
      sequencer: sequencerClient,
    } = test.context);

    const { l1Client, l1ContractAddresses } = deployL1ContractsValues;
    rollup = RollupContract.getFromL1ContractsValues(deployL1ContractsValues);
    governanceProposer = new GovernanceProposerContract(
      l1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );

    // Deploy a new governance proposer payload so we can observe signals for it.
    const payloadDeployment = await deployL1Contract(
      l1Client,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [l1ContractAddresses.registryAddress.toString(), l1ContractAddresses.gseAddress!.toString()],
      { salt: '0x2a' },
    );
    newGovernanceProposerPayloadAddress = payloadDeployment.address;
    logger.warn(`Deployed governance proposer payload at ${newGovernanceProposerPayloadAddress}`);

    // Deploy escape hatch with a deterministic open/closed epoch window.
    const lagInHatches = 1n;
    const proposingExitDelay = 0n;
    const bondSize = 1n;
    const withdrawalTax = 0n;
    const failedHatchPunishment = 0n;

    const escapeHatchDeployment = await deployL1Contract(
      l1Client,
      EscapeHatchAbi,
      EscapeHatchBytecode,
      [
        rollup.address.toString(),
        l1ContractAddresses.stakingAssetAddress.toString(),
        bondSize,
        withdrawalTax,
        failedHatchPunishment,
        ESCAPE_HATCH_FREQUENCY,
        ESCAPE_HATCH_ACTIVE_DURATION,
        lagInHatches,
        proposingExitDelay,
      ],
      { salt: '0x6a' },
    );
    const escapeHatchAddress = escapeHatchDeployment.address;
    logger.warn(`Deployed escape hatch at ${escapeHatchAddress}`);

    // Wire escape hatch into the rollup (owner-only).
    await cheatCodes.rollup.asOwner(async (owner, rollupAsOwner) => {
      const hash = await rollupAsOwner.write.setEscapeHatch([escapeHatchAddress.toString()], { account: owner });
      await l1Client.waitForTransactionReceipt({ hash });
    });
  });

  afterEach(() => test.teardown());

  // Verifies that when the escape hatch is open the sequencer casts governance votes every slot without
  // building blocks or checkpoints, and that no failure events are emitted in the vote-only window.
  // Waits two full epochs via retryUntil, then checks vote count >= slots elapsed and checkpoint count = 0.
  it('casts governance signals and advances checkpoints while escape hatch is closed', async () => {
    const sequencer = sequencerClient!.getSequencer();

    // Enable voting from the sequencer.
    await aztecNodeAdmin!.setConfig({
      governanceProposerPayload: newGovernanceProposerPayloadAddress,
      minTxsPerBlock: 0,
    });

    // We need to set it for hatch 1, and then make a time jump. We do this such that we don't pollute the epoch cache.
    // The warp must happen before we attach failure-event listeners, because any checkpoint proposal in flight at warp
    // time will fail (its propose tx becomes invalid after the L1 timestamp jump) — that is a test-setup artifact, not
    // a behavior we are asserting on.
    if (OPEN_THE_HATCH) {
      await ethCheatCodes.store(
        await rollup.getEscapeHatchAddress(),
        ethCheatCodes.keccak256(BigInt(EscapeHatchStorage.find(s => s.label === '$designatedProposer')!.slot), 1n),
        escapeHatchProposerAddress.toField().toBigInt(),
      );
      expect(await rollup.isEscapeHatchOpen(EpochNumber(Number(ESCAPE_HATCH_FREQUENCY)))).toBeTruthy();

      logger.info(`Advancing to epoch ${ESCAPE_HATCH_FREQUENCY}`);

      await cheatCodes.rollup.advanceToEpoch(EpochNumber(Number(ESCAPE_HATCH_FREQUENCY)), {
        offset: -ETHEREUM_SLOT_DURATION,
      });
    }

    // Set up event listeners to track sequencer behavior during the vote-only window
    const failEvents: Array<{ type: keyof SequencerEvents; args: any }> = [];
    const blockProposedEvents: Array<{ blockNumber: any; slot: any }> = [];
    const checkpointPublishedEvents: Array<{ checkpoint: any; slot: any }> = [];

    // Track failure events that indicate problems
    const failEventTypes: (keyof SequencerEvents)[] = [
      'block-build-failed',
      'checkpoint-publish-failed',
      'proposer-rollup-check-failed',
      'checkpoint-error',
      'header-validation-failed',
    ];

    failEventTypes.forEach(eventType => {
      sequencer.on(eventType, (args: Parameters<SequencerEvents[typeof eventType]>[0]) => {
        // Filter out SequencerTooSlowError as it's expected in slow CI environments when escape hatch is open.
        // The sequencer may be too slow to vote after sync checks, which is acceptable since we're not building blocks.
        if (eventType === 'checkpoint-error') {
          const checkpointErrorArgs = args as Parameters<SequencerEvents['checkpoint-error']>[0];
          if (checkpointErrorArgs.error.name === 'SequencerTooSlowError') {
            logger.debug(`Ignoring SequencerTooSlowError (expected in slow CI environments)`, checkpointErrorArgs);
            return;
          }
        }
        failEvents.push({ type: eventType, args });
        logger.error(`Sequencer emitted failure event: ${String(eventType)}`, args);
      });
    });

    // Track block building attempts (should not happen when escape hatch is open)
    sequencer.on('block-proposed', (args: Parameters<SequencerEvents['block-proposed']>[0]) => {
      blockProposedEvents.push({ blockNumber: args.blockNumber, slot: args.slot });
      logger.warn(`Sequencer proposed block when escape hatch should be open`, args);
    });

    // Track checkpoint publishing (should not happen when escape hatch is open)
    sequencer.on('checkpoint-published', (args: Parameters<SequencerEvents['checkpoint-published']>[0]) => {
      checkpointPublishedEvents.push({ checkpoint: args.checkpoint, slot: args.slot });
      logger.warn(`Sequencer published checkpoint when escape hatch should be open`, args);
    });

    const getStats = async () => ({
      slot: await rollup.getSlotNumber(),
      epoch: await rollup.getEpochNumberForSlotNumber(await rollup.getSlotNumber()),
      pending: await rollup.getCheckpointNumber(),
      proven: await rollup.getProvenCheckpointNumber(),
      votes: Number(
        await governanceProposer.getPayloadSignals(rollup.address, 0n, newGovernanceProposerPayloadAddress.toString()),
      ),
    });

    const initialStats = await getStats();

    // We will wait until epochs advance
    // REFACTOR: retryUntil on epoch arithmetic should be replaced with a cheatCodes.rollup.waitForEpoch helper
    await retryUntil(
      async () =>
        (await rollup.getEpochNumberForSlotNumber(await rollup.getSlotNumber())) >= initialStats.epoch + EpochNumber(2),
      'epoch to advance',
      AZTEC_SLOT_DURATION * AZTEC_EPOCH_DURATION * 3,
      1,
    );

    // Snapshot the slot we will assert against now; under proposer pipelining the sequencer signs a vote in build
    // slot N for target slot N+1 and submits it at the start of N+1, so the votes corresponding to slots up through
    // `slotAtMeasurement` lag the current slot by one. Wait for the L1 slot to advance one more so the last
    // in-flight vote (signed for `slotAtMeasurement`) has time to mine before we count votes.
    const slotAtMeasurement = await rollup.getSlotNumber();
    const slotsPassed = slotAtMeasurement - initialStats.slot;
    expect(slotsPassed).toBeGreaterThan(0);
    const drainTarget = slotAtMeasurement + 2;
    // REFACTOR: retryUntil on slot polling should be replaced with a rollup slot-wait helper
    await retryUntil(
      () => rollup.getSlotNumber().then(s => s >= drainTarget),
      'pipelined vote drain',
      AZTEC_SLOT_DURATION * 4,
      1,
    );

    const finalStats = await getStats();
    expect(finalStats.votes - initialStats.votes).toBeGreaterThanOrEqual(slotsPassed);
    if (OPEN_THE_HATCH) {
      expect(finalStats.pending - initialStats.pending).toBe(0);

      // When escape hatch is open, sequencer should only vote, not build blocks nor checkpoints, but there should also be no failures.
      // Filter out events corresponding to pre-warp slots — they are checkpoint proposals that were in flight when
      // the test warped past their target slot and whose L1 propose tx then fails. That's a setup artifact of the
      // warp, not behavior we are asserting on in the vote-only window.
      const inVoteOnlyWindow = <T extends { slot?: any; args?: { slot?: any } }>(e: T) => {
        const slotValue = (e as any).slot ?? (e as any).args?.slot;
        return slotValue === undefined || Number(slotValue) >= Number(initialStats.slot);
      };
      expect(blockProposedEvents.filter(inVoteOnlyWindow)).toEqual([]);
      expect(failEvents.filter(inVoteOnlyWindow)).toEqual([]);
      expect(checkpointPublishedEvents.filter(inVoteOnlyWindow)).toEqual([]);
    } else {
      expect(finalStats.pending - initialStats.pending).toBeGreaterThanOrEqual(slotsPassed);
    }
  });
});
