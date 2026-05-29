import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
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
import fs from 'fs';
import os from 'os';
import path from 'path';

import { P2PNetworkTest } from '../e2e_p2p/p2p_network.js';
import { advanceToEpochBeforeProposer, awaitCommitteeExists } from '../e2e_p2p/shared.js';
import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';

const TEST_TIMEOUT = 1_000_000;

jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 2;
const BOOT_NODE_UDP_PORT = 4900;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_EPOCH_DURATION = 2;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * AZTEC_EPOCH_DURATION;
const SLASHING_QUORUM = 5;
const SLASHING_ROUND_SIZE = 8;
const TERMINAL_BLOCK_INDEX = IndexWithinCheckpoint(1);
const HIGHER_BLOCK_INDEX = IndexWithinCheckpoint(2);

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcasted-invalid-checkpoint-proposal-slash-'));

type SlashOffense = Awaited<ReturnType<AztecNodeService['getSlashOffenses']>>[number];

function getAttesterSigner(validatorIndex: number) {
  const privateKey = getPrivateKeyFromIndex(ATTESTER_PRIVATE_KEYS_START_INDEX + validatorIndex)!;
  return new Secp256k1Signer(Buffer32.fromBuffer(privateKey));
}

function findBroadcastedInvalidCheckpointOffense(
  offenses: SlashOffense[],
  validator: string,
  slot: SlotNumber,
): SlashOffense | undefined {
  return offenses.find(
    offense =>
      offense.validator.toString() === validator &&
      offense.offenseType === OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL &&
      offense.epochOrSlot === BigInt(slot),
  );
}

async function awaitBroadcastedInvalidCheckpointOffense({
  node,
  validator,
  slot,
}: {
  node: AztecNodeService;
  validator: string;
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
  validator: string;
}) {
  return await retryUntil(
    async () => {
      const offenses = (await Promise.all(nodes.map(node => node.getSlashOffenses('all')))).flat();
      const matchingOffenses = offenses.filter(
        offense =>
          offense.validator.toString() === validator &&
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
  validator: string;
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

describe('e2e_slashing_broadcasted_invalid_checkpoint_proposal_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[] = [];

  const slashingUnit = BigInt(1e14);

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_slashing_broadcasted_invalid_checkpoint_proposal_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration: AZTEC_EPOCH_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        aztecProofSubmissionEpochs: 1024,
        minTxsPerBlock: 0,
        enableProposerPipelining: true,
        inboxLag: 2,
        mockGossipSubNetwork: true,
        slashingQuorum: SLASHING_QUORUM,
        slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / AZTEC_EPOCH_DURATION,
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
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    if (t.monitor) {
      await t.teardown();
    }
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const setupNodeAndValidator = async () => {
    const { rollup } = await t.getContracts();

    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await t.ctx.cheatCodes.rollup.debugRollup();

    const node = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
        minTxsPerBlock: 0,
        enableProposerPipelining: true,
        slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
        slashSelfAllowed: true,
      },
      t.ctx.dateProvider,
      BOOT_NODE_UDP_PORT + 1,
      t.bootstrapNodeEnr,
      0,
      t.genesis,
      `${DATA_DIR}-0`,
      shouldCollectMetrics(),
    );
    nodes = [node];

    await retryUntil(() => node.isReady(), 'node ready', 30, 0.5);
    await awaitCommitteeExists({ rollup, logger: t.logger });

    const currentSlot = await rollup.getSlotNumber();
    expect(currentSlot).toBeGreaterThan(2);

    const signer = getAttesterSigner(0);
    const validator = t.validators[0].attester.toString();
    const signatureContext: CoordinationSignatureContext = {
      chainId: t.ctx.aztecNodeConfig.l1ChainId,
      rollupAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    };

    return { node, currentSlot, signer, validator, signatureContext };
  };

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
      validator,
      validator,
      validator,
    ]);
    expect(firstProposals.checkpointProposals[0].getSender()?.toString()).toEqual(validator);

    const firstOffense = await awaitBroadcastedInvalidCheckpointOffense({
      node,
      validator,
      slot: targetSlot,
    });
    expect(firstOffense.amount).toEqual(slashingUnit);
  });

  it('slashes a validator that broadcasts a checkpoint with a mismatched header', async () => {
    const { rollup } = await t.getContracts();

    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await t.ctx.cheatCodes.rollup.debugRollup();

    const invalidProposerNodes = await createNodes(
      {
        ...t.ctx.aztecNodeConfig,
        broadcastInvalidCheckpointProposalOnly: true,
        dontStartSequencer: true,
        minTxsPerBlock: 0,
        slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
        slashSelfAllowed: true,
      },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      0,
    );
    const honestNodes = await createNodes(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
        minTxsPerBlock: 0,
        slashBroadcastedInvalidCheckpointProposalPenalty: slashingUnit,
        slashSelfAllowed: true,
      },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS - 1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      1,
    );
    nodes = [...invalidProposerNodes, ...honestNodes];

    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);
    await awaitCommitteeExists({ rollup, logger: t.logger });

    const invalidProposer = invalidProposerNodes[0].getSequencer()!.validatorAddresses![0];
    const epochCache = (honestNodes[0] as TestAztecNodeService).epochCache;
    const { targetEpoch } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: t.ctx.cheatCodes.rollup,
      targetProposer: invalidProposer,
      logger: t.logger,
    });

    await Promise.all(nodes.map(node => node.getSequencer()!.start()));
    await t.ctx.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    const offenses = await awaitAnyBroadcastedInvalidCheckpointOffense({
      nodes: honestNodes,
      validator: invalidProposer.toString(),
    });

    t.logger.warn(`Collected broadcasted invalid checkpoint proposal offenses`, { offenses });
    expect(offenses.length).toBeGreaterThan(0);
    for (const offense of offenses) {
      expect(offense.validator.toString()).toEqual(invalidProposer.toString());
      expect(offense.offenseType).toEqual(OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL);
      expect(offense.amount).toEqual(slashingUnit);
      expect(offense.epochOrSlot > 0n).toBe(true);
    }
  });

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
      validator,
      validator,
    ]);
    const terminalProposal = validProposals.blockProposals.find(
      proposal => proposal.indexWithinCheckpoint === TERMINAL_BLOCK_INDEX,
    );
    expect(terminalProposal?.archive.toString()).toEqual(lateHigherBlockProposals.terminalBlock.archive.toString());
    expect(terminalProposal?.getSender()?.toString()).toEqual(validator);
    expect(validProposals.checkpointProposals[0].getSender()?.toString()).toEqual(validator);
    await expectNoBroadcastedInvalidCheckpointOffense({ node, validator, slot: targetSlot });

    await node.getP2P().broadcastProposal(lateHigherBlockProposals.higherBlock);

    const invalidProposals = await awaitRetainedProposalsForSlot({
      node,
      slot: targetSlot,
      blockCount: 3,
      checkpointCount: 1,
    });
    expect(invalidProposals.blockProposals.map(proposal => proposal.getSender()?.toString())).toEqual([
      validator,
      validator,
      validator,
    ]);

    const offense = await awaitBroadcastedInvalidCheckpointOffense({
      node,
      validator,
      slot: targetSlot,
    });
    expect(offense.amount).toEqual(slashingUnit);
  });
});
