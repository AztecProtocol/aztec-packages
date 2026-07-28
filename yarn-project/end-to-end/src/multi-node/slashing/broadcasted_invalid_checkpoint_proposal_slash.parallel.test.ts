import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { BlockNumber, EpochNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { OffenseType } from '@aztec/slasher';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import {
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getPrivateKeyFromIndex } from '../../fixtures/utils.js';
import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import {
  SENTINEL_TIMING,
  type SlashOffense,
  advanceToEpochBeforeProposer,
  awaitCommitteeExists,
  findSlashOffense,
} from './setup.js';

const TEST_TIMEOUT = 1_000_000;

jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 2;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const AZTEC_SLOT_DURATION = SENTINEL_TIMING.aztecSlotDuration;
const SLASHING_QUORUM = 5;
const SLASHING_ROUND_SIZE = 8;
const TERMINAL_BLOCK_INDEX = IndexWithinCheckpoint(1);
const HIGHER_BLOCK_INDEX = IndexWithinCheckpoint(2);

// Validators are keyed from `getPrivateKeyFromIndex(i + 3)` (the `buildMockGossipValidators` convention),
// so the signer for validator `index` is derived from the same key its node signs proposals with.
function getAttesterSigner(validatorIndex: number) {
  const privateKey = getPrivateKeyFromIndex(validatorIndex + 3)!;
  return new Secp256k1Signer(Buffer32.fromBuffer(privateKey));
}

function findBroadcastedInvalidCheckpointOffense(
  offenses: SlashOffense[],
  validator: EthAddress,
  slot: SlotNumber,
): SlashOffense | undefined {
  return findSlashOffense(offenses, validator, OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL, slot);
}

async function awaitBroadcastedInvalidCheckpointOffense({
  node,
  validator,
  slot,
}: {
  node: AztecNodeService;
  validator: EthAddress;
  slot: SlotNumber;
}) {
  return await retryUntil(
    async () => {
      const offenses = await node.getSlashOffenses('all');
      return findBroadcastedInvalidCheckpointOffense(offenses, validator, slot);
    },
    `A-520 offense for slot ${slot}`,
    AZTEC_SLOT_DURATION * 3,
    1,
  );
}

async function awaitAnyBroadcastedInvalidCheckpointOffense({
  nodes,
  validator,
}: {
  nodes: AztecNodeService[];
  validator: EthAddress;
}) {
  return await retryUntil(
    async () => {
      const offenses = (await Promise.all(nodes.map(node => node.getSlashOffenses('all')))).flat();
      const matchingOffenses = offenses.filter(
        offense =>
          offense.validator.equals(validator) &&
          offense.offenseType === OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
      );
      return matchingOffenses.length > 0 ? matchingOffenses : undefined;
    },
    `broadcasted invalid checkpoint proposal offense for ${validator}`,
    AZTEC_SLOT_DURATION * 12,
    1,
  );
}

async function expectNoBroadcastedInvalidCheckpointOffense({
  node,
  validator,
  slot,
}: {
  node: AztecNodeService;
  validator: EthAddress;
  slot: SlotNumber;
}) {
  // The watcher polls every second with this test's slot timing; wait long enough
  // for the closed slot to be scanned before asserting no offense was recorded.
  await sleep(2_000);
  const offenses = await node.getSlashOffenses('all');
  expect(findBroadcastedInvalidCheckpointOffense(offenses, validator, slot)).toBeUndefined();
}

async function awaitRetainedProposalsForSlot({
  node,
  slot,
  blockCount,
  checkpointCount,
}: {
  node: AztecNodeService;
  slot: SlotNumber;
  blockCount: number;
  checkpointCount: number;
}) {
  return await retryUntil(
    async () => {
      const proposals = await node.getP2P().getProposalsForSlot(slot);
      return proposals.blockProposals.length === blockCount && proposals.checkpointProposals.length === checkpointCount
        ? proposals
        : undefined;
    },
    `retained proposals for slot ${slot}`,
    5,
    0.2,
  );
}

async function makeBlock({
  signer,
  signatureContext,
  targetSlot,
  indexWithinCheckpoint,
  seed,
}: {
  signer: Secp256k1Signer;
  signatureContext: CoordinationSignatureContext;
  targetSlot: SlotNumber;
  indexWithinCheckpoint: IndexWithinCheckpoint;
  seed: number;
}) {
  return await makeBlockProposal({
    blockHeader: makeBlockHeader(seed, {
      blockNumber: BlockNumber(seed),
      slotNumber: targetSlot,
    }),
    indexWithinCheckpoint,
    txHashes: [TxHash.random()],
    archiveRoot: Fr.random(),
    signer,
    signatureContext,
  });
}

async function makeInvalidCheckpointProposals({
  signer,
  signatureContext,
  targetSlot,
  seed,
  includeTerminalBlockAsLastBlock = false,
}: {
  signer: Secp256k1Signer;
  signatureContext: CoordinationSignatureContext;
  targetSlot: SlotNumber;
  seed: number;
  includeTerminalBlockAsLastBlock?: boolean;
}) {
  const earlierBlock = await makeBlock({
    signer,
    signatureContext,
    targetSlot,
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
    seed,
  });
  const terminalBlock = await makeBlock({
    signer,
    signatureContext,
    targetSlot,
    indexWithinCheckpoint: TERMINAL_BLOCK_INDEX,
    seed: seed + 1,
  });
  const higherBlock = await makeBlock({
    signer,
    signatureContext,
    targetSlot,
    indexWithinCheckpoint: HIGHER_BLOCK_INDEX,
    seed: seed + 2,
  });
  const checkpoint = await makeCheckpointProposal({
    signer,
    checkpointHeader: makeCheckpointHeader(seed, { slotNumber: targetSlot }),
    archiveRoot: terminalBlock.archive,
    lastBlock: includeTerminalBlockAsLastBlock
      ? {
          blockHeader: terminalBlock.blockHeader,
          indexWithinCheckpoint: terminalBlock.indexWithinCheckpoint,
          txHashes: terminalBlock.txHashes,
        }
      : undefined,
    signatureContext,
  });

  return { earlierBlock, terminalBlock, higherBlock, checkpoint };
}

// Tests slashing of a validator that broadcasts an invalid checkpoint proposal. Uses MultiNodeTestContext
// on the in-memory mock-gossip bus (no real libp2p). Nodes created via createValidatorNodeAt. Timing:
// ethSlot=4s, aztecSlot=8s, epoch=2, committee=2. Three it() cases cover: checkpoint truncated below
// own block, mismatched header (live sequencer path), and valid checkpoint with delayed higher-index
// block.
describe('multi-node/slashing/broadcasted_invalid_checkpoint_proposal_slash', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[] = [];

  const slashingUnit = BigInt(1e14);

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      ...SENTINEL_TIMING,
      sentinelEnabled: false, // reuse only the fast 8s-slot timing; this test does not use the sentinel
      blockDurationMs: 2000,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      aztecProofSubmissionEpochs: 1024,
      minTxsPerBlock: 0,
      slashingQuorum: SLASHING_QUORUM,
      slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / SENTINEL_TIMING.aztecEpochDuration,
      slashAmountSmall: slashingUnit,
      slashAmountMedium: slashingUnit * 2n,
      slashAmountLarge: slashingUnit * 3n,
      slashDataWithholdingPenalty: 0n,
      slashInactivityPenalty: 0n,
      slashBroadcastedInvalidBlockPenalty: 0n,
      slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
      slashDuplicateProposalPenalty: 0n,
      slashDuplicateAttestationPenalty: 0n,
      slashProposeInvalidAttestationsPenalty: 0n,
      slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty: 0n,
      slashAttestInvalidCheckpointProposalPenalty: 0n,
      slashUnknownPenalty: 0n,
      slashSelfAllowed: true,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });
  });

  afterEach(async () => {
    await test.teardown();
  });

  const setupNodeAndValidator = async () => {
    const { rollup } = await test.getSlashingContracts();

    await test.context.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await test.context.cheatCodes.rollup.debugRollup();

    const node = await test.createValidatorNodeAt(0, {
      dontStartSequencer: true,
      minTxsPerBlock: 0,
      slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
      slashSelfAllowed: true,
    });
    nodes = [node];

    await retryUntil(() => node.isReady(), 'node ready', 30, 0.5);
    await awaitCommitteeExists({ rollup, logger: test.logger });

    const currentSlot = await rollup.getSlotNumber();
    expect(currentSlot).toBeGreaterThan(2);

    const signer = getAttesterSigner(0);
    const validator = test.addressAt(0);
    const signatureContext: CoordinationSignatureContext = {
      chainId: test.context.config.l1ChainId,
      rollupAddress: test.context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };

    return { node, currentSlot, signer, validator, signatureContext };
  };

  // Manually broadcasts three block proposals for a past slot, then broadcasts a checkpoint that
  // references only the earlier block (truncated below the terminal block). Asserts that
  // awaitBroadcastedInvalidCheckpointOffense detects a BROADCASTED_INVALID_CHECKPOINT_PROPOSAL offense.
  it('slashes a validator that broadcasts a checkpoint truncated below its own retained block proposal', async () => {
    const { node, currentSlot, signer, validator, signatureContext } = await setupNodeAndValidator();
    const targetSlot = SlotNumber(Number(currentSlot) - 2);

    const alreadyRetainedProposals = await makeInvalidCheckpointProposals({
      signer,
      signatureContext,
      targetSlot,
      seed: 0xa520,
    });

    await node.getP2P().broadcastProposal(alreadyRetainedProposals.earlierBlock);
    await node.getP2P().broadcastProposal(alreadyRetainedProposals.terminalBlock);
    await node.getP2P().broadcastProposal(alreadyRetainedProposals.higherBlock);
    await node.getP2P().broadcastCheckpointProposal(alreadyRetainedProposals.checkpoint);

    const firstProposals = await awaitRetainedProposalsForSlot({
      node,
      slot: targetSlot,
      blockCount: 3,
      checkpointCount: 1,
    });
    expect(firstProposals.blockProposals.map(proposal => proposal.getSender()?.toString())).toEqual([
      validator.toString(),
      validator.toString(),
      validator.toString(),
    ]);
    expect(firstProposals.checkpointProposals[0].getSender()?.toString()).toEqual(validator.toString());

    const firstOffense = await awaitBroadcastedInvalidCheckpointOffense({
      node,
      validator,
      slot: targetSlot,
    });
    expect(firstOffense.amount).toEqual(slashingUnit);
  });

  // Runs a full sequencer cycle using broadcastInvalidCheckpointProposalOnly nodes; the invalid
  // proposer broadcasts a checkpoint whose header does not match its own block. Honest nodes observe
  // the offense via awaitAnyBroadcastedInvalidCheckpointOffense.
  it('slashes a validator that broadcasts a checkpoint with a mismatched header', async () => {
    const { rollup } = await test.getSlashingContracts();

    await test.context.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await test.context.cheatCodes.rollup.debugRollup();

    const invalidProposerNodes = [
      await test.createValidatorNodeAt(0, {
        broadcastInvalidCheckpointProposalOnly: true,
        dontStartSequencer: true,
        minTxsPerBlock: 0,
        slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
        slashSelfAllowed: true,
      }),
    ];
    const honestNodes = await Promise.all(
      Array.from({ length: NUM_VALIDATORS - 1 }, (_, i) =>
        test.createValidatorNodeAt(i + 1, {
          dontStartSequencer: true,
          minTxsPerBlock: 0,
          slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
          slashSelfAllowed: true,
        }),
      ),
    );
    nodes = [...invalidProposerNodes, ...honestNodes];

    await awaitCommitteeExists({ rollup, logger: test.logger });

    const invalidProposer = invalidProposerNodes[0].getSequencer()!.validatorAddresses![0];
    const epochCache = (honestNodes[0] as TestAztecNodeService).epochCache;
    const { targetEpoch } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: test.context.cheatCodes.rollup,
      targetProposer: invalidProposer,
      logger: test.logger,
    });

    await Promise.all(nodes.map(node => node.getSequencer()!.start()));
    await test.context.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    const offenses = await awaitAnyBroadcastedInvalidCheckpointOffense({
      nodes: honestNodes,
      validator: invalidProposer,
    });

    test.logger.warn(`Collected broadcasted invalid checkpoint proposal offenses`, { offenses });
    expect(offenses.length).toBeGreaterThan(0);
    for (const offense of offenses) {
      expect(offense.validator.toString()).toEqual(invalidProposer.toString());
      expect(offense.offenseType).toEqual(OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL);
      expect(offense.amount).toEqual(slashingUnit);
      expect(offense.epochOrSlot > 0n).toBe(true);
    }
  });

  // Broadcasts a checkpoint that includes the terminal block in its lastBlock field (valid at first).
  // Asserts no offense is recorded. Then broadcasts a higher-index block proposal, making the
  // checkpoint invalid retroactively, and asserts the offense is now detected.
  it('does not slash a valid checkpoint whose lastBlock supplies the terminal proposal until a delayed higher-index block is retained', async () => {
    const { node, currentSlot, signer, validator, signatureContext } = await setupNodeAndValidator();
    const targetSlot = SlotNumber(Number(currentSlot) - 2);
    const lateHigherBlockProposals = await makeInvalidCheckpointProposals({
      signer,
      signatureContext,
      targetSlot,
      seed: 0xa530,
      includeTerminalBlockAsLastBlock: true,
    });

    await node.getP2P().broadcastProposal(lateHigherBlockProposals.earlierBlock);
    await node.getP2P().broadcastCheckpointProposal(lateHigherBlockProposals.checkpoint);

    const validProposals = await awaitRetainedProposalsForSlot({
      node,
      slot: targetSlot,
      blockCount: 2,
      checkpointCount: 1,
    });
    expect(validProposals.blockProposals.map(proposal => proposal.getSender()?.toString())).toEqual([
      validator.toString(),
      validator.toString(),
    ]);
    const terminalProposal = validProposals.blockProposals.find(
      proposal => proposal.indexWithinCheckpoint === TERMINAL_BLOCK_INDEX,
    );
    expect(terminalProposal?.archive.toString()).toEqual(lateHigherBlockProposals.terminalBlock.archive.toString());
    expect(terminalProposal?.getSender()?.toString()).toEqual(validator.toString());
    expect(validProposals.checkpointProposals[0].getSender()?.toString()).toEqual(validator.toString());
    await expectNoBroadcastedInvalidCheckpointOffense({ node, validator, slot: targetSlot });

    await node.getP2P().broadcastProposal(lateHigherBlockProposals.higherBlock);

    const invalidProposals = await awaitRetainedProposalsForSlot({
      node,
      slot: targetSlot,
      blockCount: 3,
      checkpointCount: 1,
    });
    expect(invalidProposals.blockProposals.map(proposal => proposal.getSender()?.toString())).toEqual([
      validator.toString(),
      validator.toString(),
      validator.toString(),
    ]);

    const offense = await awaitBroadcastedInvalidCheckpointOffense({
      node,
      validator,
      slot: targetSlot,
    });
    expect(offense.amount).toEqual(slashingUnit);
  });
});
