import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, EpochNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { retryUntil } from '@aztec/foundation/retry';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { OffenseType } from '@aztec/slasher';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getPrivateKeyFromIndex } from '../../fixtures/utils.js';
import { waitForPendingTxCount } from '../../fixtures/wait_helpers.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { awaitCommitteeExists } from './setup.js';

const TEST_TIMEOUT = 1_000_000;

jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 3;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 36;
const BLOCK_DURATION_MS = 8_000;
const BLOCKS_PER_CHECKPOINT = 3;
const BAD_BLOCK_INDEX_WITHIN_CHECKPOINT = 1;
const BAD_SLOT_COMPLETION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const LAZY_ATTESTATION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const OFFENSE_DETECTION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const INVALID_BLOCK_REMOVAL_TIMEOUT = AZTEC_SLOT_DURATION * 3;

type BlockProposedEvent = Parameters<SequencerEvents['block-proposed']>[0];
type SlashOffense = Awaited<ReturnType<AztecNodeService['getSlashOffenses']>>[number];

function findSlashOffense(offenses: SlashOffense[], validator: EthAddress, offenseType: OffenseType, slot: SlotNumber) {
  return offenses.find(
    offense =>
      offense.validator.equals(validator) &&
      offense.offenseType === offenseType &&
      offense.epochOrSlot === BigInt(slot),
  );
}

// Validators are keyed from `getPrivateKeyFromIndex(i + 3)` (the `buildMockGossipValidators` convention),
// so the signer for validator `index` is derived from the same key its node signs proposals with.
function getAttesterSigner(validatorIndex: number) {
  const privateKey = getPrivateKeyFromIndex(validatorIndex + 3)!;
  return new Secp256k1Signer(Buffer32.fromBuffer(privateKey));
}

async function makeEquivocatedBlockProposal({
  blockNumber,
  targetSlot,
  signer,
  signatureContext,
}: {
  blockNumber: number;
  targetSlot: SlotNumber;
  signer: Secp256k1Signer;
  signatureContext: CoordinationSignatureContext;
}) {
  return await makeBlockProposal({
    blockHeader: makeBlockHeader(0xa521, {
      blockNumber: BlockNumber(blockNumber),
      slotNumber: targetSlot,
    }),
    indexWithinCheckpoint: IndexWithinCheckpoint(BAD_BLOCK_INDEX_WITHIN_CHECKPOINT),
    txHashes: [TxHash.random()],
    archiveRoot: Fr.random(),
    signer,
    signatureContext,
  });
}

// Deploys `numTxs` fresh schnorr accounts (one per block of the checkpoint) through the bad proposer node,
// paying with the funded hardcoded account. The wallet is repointed at `node` so the txs land in that
// node's mempool.
async function submitDeploymentTxsWithoutWaiting(test: MultiNodeTestContext, node: AztecNodeService, numTxs: number) {
  const wallet = test.context.wallet as TestWallet;
  wallet.updateNode(node);
  const from = test.context.accounts[0];

  const txHashes = [];
  for (let i = 0; i < numTxs; i++) {
    const accountManager = await wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random());
    const deployMethod = await accountManager.getDeployMethod();
    const { txHash } = await deployMethod.send({ from, wait: NO_WAIT });
    txHashes.push(txHash);
  }
  return txHashes;
}

async function getBlockHash(node: AztecNodeService, blockNumber: number) {
  const block = await node.getBlockData(BlockNumber(blockNumber));
  return block ? (await block.header.hash()).toString() : undefined;
}

async function advanceToEpochBeforePipelinedTargetSlot({
  epochCache,
  cheatCodes,
  targetProposer,
  logger,
  maxAttempts = 100,
}: {
  epochCache: EpochCacheInterface;
  cheatCodes: RollupCheatCodes;
  targetProposer: EthAddress;
  logger: MultiNodeTestContext['logger'];
  maxAttempts?: number;
}): Promise<{ targetEpoch: EpochNumber; targetSlot: SlotNumber }> {
  const { epochDuration } = await cheatCodes.getConfig();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentEpoch = await cheatCodes.getEpoch();
    const nextEpoch = Number(currentEpoch) + 1;
    const firstSlotOfNextEpoch = nextEpoch * Number(epochDuration);
    // The prior pipelined target can start first after the epoch warp and consume the bad proposer config.
    const priorPipelinedTargetSlot = SlotNumber(firstSlotOfNextEpoch);
    const pipelinedTargetSlot = SlotNumber(firstSlotOfNextEpoch + 1);
    const priorProposer = await epochCache.getProposerAttesterAddressInSlot(priorPipelinedTargetSlot);
    const proposer = await epochCache.getProposerAttesterAddressInSlot(pipelinedTargetSlot);

    logger.info(
      `Checking pipelined target slot ${pipelinedTargetSlot} in epoch ${nextEpoch} for proposer ${targetProposer}`,
      { proposer: proposer?.toString(), priorPipelinedTargetSlot, priorProposer: priorProposer?.toString() },
    );

    if (proposer?.equals(targetProposer) && !priorProposer?.equals(targetProposer)) {
      return { targetEpoch: EpochNumber(nextEpoch), targetSlot: pipelinedTargetSlot };
    }

    await cheatCodes.advanceToNextEpoch();
  }

  throw new Error(`Target proposer ${targetProposer.toString()} not found after ${maxAttempts} epoch attempts`);
}

// Tests slashing of a validator that attests to an invalid checkpoint proposal. Uses MultiNodeTestContext
// on the in-memory mock-gossip bus (no real libp2p). Three validator nodes via createValidatorNodeAt.
// Timing: ethSlot=4s, aztecSlot=36s, epoch=2, committee=3. RollupCheatCodes.advanceToEpoch drives
// progress; retryUntil waits for attestations and offenses.
describe('multi-node/slashing/attested_invalid_proposal', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[] = [];

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      anvilSlotsInAnEpoch: 4,
      listenAddress: '127.0.0.1',
      aztecEpochDuration: 2,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      aztecProofSubmissionEpochs: 1024,
      slashInactivityConsecutiveEpochThreshold: 32,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      minBlocksForCheckpoint: BLOCKS_PER_CHECKPOINT,
      maxBlocksPerCheckpoint: BLOCKS_PER_CHECKPOINT,
      publishTxsWithProposals: true,
      blockDurationMs: BLOCK_DURATION_MS,
      attestationPropagationTime: 0.5,
      slashDuplicateProposalPenalty: 1n,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });
  });

  afterEach(async () => {
    await test.teardown();
  });

  async function createInvalidProposalSlashingScenario({
    badProposerConfig = {},
    corruptBlockProposal = true,
    expectBadProposerOffense = true,
    expectedBadProposerOffenseType = OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
  }: {
    badProposerConfig?: Partial<Parameters<MultiNodeTestContext['createValidatorNodeAt']>[1]>;
    corruptBlockProposal?: boolean;
    expectBadProposerOffense?: boolean;
    expectedBadProposerOffenseType?: OffenseType;
  } = {}) {
    const { rollup } = await test.getSlashingContracts();

    await test.context.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await test.context.cheatCodes.rollup.debugRollup();

    const badProposerNode = await test.createValidatorNodeAt(0, {
      dontStartSequencer: true,
      ...(corruptBlockProposal ? { invalidBlockProposalIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT } : {}),
      ...badProposerConfig,
    });

    const lazyValidatorNode = await test.createValidatorNodeAt(1, {
      dontStartSequencer: true,
      skipProposalSlotValidation: true,
      skipCheckpointProposalValidation: true,
    });

    const honestValidatorNode = await test.createValidatorNodeAt(2, {
      dontStartSequencer: true,
      skipProposalSlotValidation: true,
    });

    nodes = [badProposerNode, lazyValidatorNode, honestValidatorNode];

    const badProposer = test.addressAt(0);
    const lazyValidator = test.addressAt(1);
    const honestValidator = test.addressAt(2);
    test.logger.warn('Created invalid proposal slashing scenario actors', {
      badProposer: badProposer.toString(),
      lazyValidator: lazyValidator.toString(),
      honestValidator: honestValidator.toString(),
    });

    await awaitCommitteeExists({ rollup, logger: test.logger });

    const epochCache = (honestValidatorNode as TestAztecNodeService).epochCache;
    const { targetEpoch, targetSlot } = await advanceToEpochBeforePipelinedTargetSlot({
      epochCache,
      cheatCodes: test.context.cheatCodes.rollup,
      targetProposer: badProposer,
      logger: test.logger,
    });

    const txHashes = await submitDeploymentTxsWithoutWaiting(test, badProposerNode, BLOCKS_PER_CHECKPOINT);
    test.logger.warn(`Submitted ${txHashes.length} transactions for the checkpoint`, {
      txHashes: txHashes.map(txHash => txHash.toString()),
      targetEpoch,
      targetSlot,
    });

    await waitForPendingTxCount(badProposerNode, 3, { timeout: AZTEC_SLOT_DURATION, interval: 0.5 });

    const badProposerBlockProposedEvents: BlockProposedEvent[] = [];
    badProposerNode
      .getSequencer()!
      .getSequencer()
      .on('block-proposed', (args: BlockProposedEvent) => {
        if (Number(args.slot) !== Number(targetSlot)) {
          return;
        }

        badProposerBlockProposedEvents.push(args);
        test.logger.warn('Captured bad proposer block-proposed event', {
          ...args,
          blockHash: args.blockHash.toString(),
        });
      });

    await Promise.all(nodes.map(node => node.getSequencer()!.start()));

    test.logger.warn(`Advancing to epoch ${targetEpoch}; bad proposer should build for slot ${targetSlot}`);
    await test.context.cheatCodes.rollup.advanceToEpoch(targetEpoch);

    const badCheckpointBlockHashes = await retryUntil(
      () => {
        const blocksByNumber = new Map(
          badProposerBlockProposedEvents.map(event => [
            event.blockNumber.toString(),
            {
              number: Number(event.blockNumber),
              checkpointNumber: Number(event.checkpointNumber),
              indexWithinCheckpoint: Number(event.indexWithinCheckpoint),
              hash: event.blockHash.toString(),
            },
          ]),
        );
        const proposedBlocks = [...blocksByNumber.values()].sort(
          (a, b) => a.indexWithinCheckpoint - b.indexWithinCheckpoint,
        );
        const badBlock = proposedBlocks.find(
          block => block.indexWithinCheckpoint === BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
        );

        test.logger.warn('Waiting for bad proposer block-proposed events for invalid checkpoint', {
          targetSlot,
          badBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
          proposedBlocks,
          badBlock,
        });

        return proposedBlocks.length >= BLOCKS_PER_CHECKPOINT && badBlock ? proposedBlocks : undefined;
      },
      'bad proposer invalid checkpoint block-proposed events',
      AZTEC_SLOT_DURATION,
      1,
    );
    const badBlock = badCheckpointBlockHashes.find(
      block => block.indexWithinCheckpoint === BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
    );
    test.logger.warn('Captured invalid checkpoint blocks from bad proposer block-proposed events', {
      targetSlot,
      badBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
      badBlock,
      badCheckpointBlockHashes,
    });

    const lazyAttestations = await retryUntil(
      async () => {
        const attestations = await lazyValidatorNode.getP2P().getCheckpointAttestationsForSlot(targetSlot);
        const lazyValidatorAttestations = attestations.filter(attestation =>
          attestation.getSender()?.equals(lazyValidator),
        );
        test.logger.warn('Waiting for lazy validator attestation before checking assertions', {
          targetSlot,
          attestationCount: attestations.length,
          lazyValidatorAttestationCount: lazyValidatorAttestations.length,
          attesters: attestations.map(attestation => attestation.getSender()?.toString()),
        });
        return lazyValidatorAttestations.length > 0 ? attestations : undefined;
      },
      'lazy validator checkpoint attestation',
      LAZY_ATTESTATION_TIMEOUT,
      1,
    );
    const honestAttestations = await honestValidatorNode.getP2P().getCheckpointAttestationsForSlot(targetSlot);
    const initialOffenses = await honestValidatorNode.getSlashOffenses('all');
    test.logger.warn('Observed state after invalid checkpoint proposal scenario', {
      targetSlot,
      invalidBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
      lazyNodeAttestationCount: lazyAttestations.length,
      lazyNodeAttesters: lazyAttestations.map(attestation => attestation.getSender()?.toString()),
      honestNodeAttestationCount: honestAttestations.length,
      honestNodeAttesters: honestAttestations.map(attestation => attestation.getSender()?.toString()),
      offenses: initialOffenses,
    });

    const expectedSlashOffenses = [
      ...(expectBadProposerOffense
        ? [
            {
              description:
                expectedBadProposerOffenseType === OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL
                  ? 'bad proposer broadcasted invalid checkpoint proposal'
                  : 'bad proposer broadcasted invalid block proposal',
              validator: badProposer,
              offenseType: expectedBadProposerOffenseType,
            },
          ]
        : []),
      {
        description: 'lazy validator attested to invalid checkpoint proposal',
        validator: lazyValidator,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
      },
    ];

    const offensesWithExpectedSlashes = await retryUntil(
      async () => {
        const currentOffenses = await honestValidatorNode.getSlashOffenses('all');
        test.logger.warn('Waiting for expected slash offenses on honest validator', {
          targetSlot,
          offenses: currentOffenses,
        });
        return expectedSlashOffenses.every(
          ({ validator, offenseType }) =>
            findSlashOffense(currentOffenses, validator, offenseType, targetSlot) !== undefined,
        )
          ? currentOffenses
          : undefined;
      },
      'honest validator slash offenses for invalid proposal attestation',
      OFFENSE_DETECTION_TIMEOUT,
      1,
    );

    for (const { description, validator, offenseType } of expectedSlashOffenses) {
      const offense = findSlashOffense(offensesWithExpectedSlashes, validator, offenseType, targetSlot)!;
      expect(offense.amount).toBeGreaterThan(0n);
      test.logger.warn(`Observed expected slash offense: ${description}`, { offense });
    }

    return {
      rollup,
      badProposerNode,
      lazyValidatorNode,
      honestValidatorNode,
      badProposer,
      lazyValidator,
      honestValidator,
      targetSlot,
      badCheckpointBlockHashes,
    };
  }

  // Runs createInvalidProposalSlashingScenario with broadcastInvalidCheckpointProposalOnly=true so
  // the bad proposer broadcasts a bad checkpoint proposal but no bad block proposal. Asserts the lazy
  // attester receives an ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL offense; bad proposer is not slashed.
  it('slashes a lazy attester for an invalid checkpoint proposal', async () => {
    await createInvalidProposalSlashingScenario({
      badProposerConfig: {
        broadcastInvalidCheckpointProposalOnly: true,
      },
      corruptBlockProposal: false,
      expectBadProposerOffense: false,
    });
  });

  // Runs createInvalidProposalSlashingScenario with broadcastEquivocatedProposals=true so the bad
  // proposer equivocates. Asserts lazy attester is initially slashed; then broadcasts a delayed
  // equivocated proposal and verifies the attestation offense is cleared and a DUPLICATE_PROPOSAL
  // offense replaces it on the honest node.
  it('slashes a lazy attester for an invalid checkpoint and clears it on delayed equivocation', async () => {
    const {
      rollup,
      badProposerNode,
      honestValidatorNode,
      badProposer,
      lazyValidator,
      targetSlot,
      badCheckpointBlockHashes,
    } = await createInvalidProposalSlashingScenario({
      badProposerConfig: {
        broadcastEquivocatedProposals: true,
      },
    });

    await retryUntil(
      async () => {
        const currentSlot = await rollup.getSlotNumber();
        test.logger.warn('Waiting for invalid checkpoint proposal slot to complete', {
          targetSlot,
          currentSlot,
        });
        return currentSlot >= targetSlot + 1 ? currentSlot : undefined;
      },
      'wait for invalid checkpoint proposal slot to complete',
      BAD_SLOT_COMPLETION_TIMEOUT,
      1,
    );

    const getNodeBadCheckpointHashes = () =>
      Promise.all(
        nodes.map(async (node, nodeIndex) => ({
          nodeIndex,
          blocks: await Promise.all(
            badCheckpointBlockHashes.map(async block => ({
              ...block,
              nodeBlockHash: await getBlockHash(node, block.number),
            })),
          ),
        })),
      );

    const nodeBlockHashes = await retryUntil(
      async () => {
        const currentNodeBlockHashes = await getNodeBadCheckpointHashes();
        test.logger.warn('Waiting for invalid checkpoint blocks to be absent from node block data', {
          targetSlot,
          nodeBlockHashes: currentNodeBlockHashes,
        });
        return currentNodeBlockHashes.every(nodeState =>
          nodeState.blocks.every(block => block.nodeBlockHash !== block.hash),
        )
          ? currentNodeBlockHashes
          : undefined;
      },
      'invalid checkpoint blocks absent from node block data',
      INVALID_BLOCK_REMOVAL_TIMEOUT,
      1,
    );

    for (const nodeState of nodeBlockHashes) {
      for (const block of nodeState.blocks) {
        expect(block.nodeBlockHash).not.toEqual(block.hash);
      }
    }

    const badBlock = badCheckpointBlockHashes.find(
      block => block.indexWithinCheckpoint === BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
    );
    expect(badBlock).toBeDefined();

    const equivocatedProposal = await makeEquivocatedBlockProposal({
      blockNumber: badBlock!.number,
      targetSlot,
      signer: getAttesterSigner(0),
      signatureContext: {
        chainId: test.context.config.l1ChainId,
        rollupAddress: test.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
      },
    });

    test.logger.warn('Broadcasting delayed equivocated block proposal for already-slashed slot', {
      targetSlot,
      indexWithinCheckpoint: equivocatedProposal.indexWithinCheckpoint,
      payloadHash: equivocatedProposal.getPayloadHash().toString(),
      proposer: equivocatedProposal.getSender()?.toString(),
    });
    await badProposerNode.getP2P().broadcastProposal(equivocatedProposal);

    const offensesAfterClear = await retryUntil(
      async () => {
        const currentOffenses = await honestValidatorNode.getSlashOffenses('all');
        const badAttestationOffense = findSlashOffense(
          currentOffenses,
          lazyValidator,
          OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
          targetSlot,
        );
        const duplicateProposalOffense = findSlashOffense(
          currentOffenses,
          badProposer,
          OffenseType.DUPLICATE_PROPOSAL,
          targetSlot,
        );

        test.logger.warn('Waiting for delayed equivocation to clear bad attestation slash', {
          targetSlot,
          badAttestationOffense,
          duplicateProposalOffense,
          currentOffenses,
        });

        return !badAttestationOffense && duplicateProposalOffense ? currentOffenses : undefined;
      },
      'bad attestation slash cleared after delayed block proposal equivocation',
      OFFENSE_DETECTION_TIMEOUT,
      1,
    );

    expect(
      findSlashOffense(
        offensesAfterClear,
        lazyValidator,
        OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        targetSlot,
      ),
    ).toBeUndefined();
    expect(
      findSlashOffense(offensesAfterClear, badProposer, OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL, targetSlot),
    ).toBeDefined();
    expect(findSlashOffense(offensesAfterClear, badProposer, OffenseType.DUPLICATE_PROPOSAL, targetSlot)).toBeDefined();
  });
});
