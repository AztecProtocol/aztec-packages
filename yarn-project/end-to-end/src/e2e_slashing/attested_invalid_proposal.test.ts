import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { getPXEConfig } from '@aztec/pxe/server';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { OffenseType } from '@aztec/slasher';
import { TopicType } from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { P2PNetworkTest } from '../e2e_p2p/p2p_network.js';
import { awaitCommitteeExists } from '../e2e_p2p/shared.js';
import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { SchnorrHardcodedKeyAccountContract } from '../fixtures/schnorr_hardcoded_account_contract.js';
import { createNode } from '../fixtures/setup_p2p_test.js';
import { TestWallet } from '../test-wallet/test_wallet.js';

const TEST_TIMEOUT = 1_000_000;

jest.setTimeout(TEST_TIMEOUT);

const NUM_VALIDATORS = 3;
const BOOT_NODE_UDP_PORT = 4700;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 36;
const BLOCK_DURATION_MS = 8_000;
const BAD_BLOCK_INDEX_WITHIN_CHECKPOINT = 2;
const BAD_SLOT_COMPLETION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const LAZY_ATTESTATION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const OFFENSE_DETECTION_TIMEOUT = AZTEC_SLOT_DURATION * 3;
const WORLD_STATE_PURGE_TIMEOUT = AZTEC_SLOT_DURATION * 3;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'attested-invalid-proposal-'));

type BlockProposedEvent = Parameters<SequencerEvents['block-proposed']>[0];

async function submitDeploymentTxsWithoutWaiting(node: AztecNodeService, t: P2PNetworkTest, numTxs: number) {
  const wallet = await TestWallet.create(
    node,
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const fundedAccountManager = await wallet.createAccount({
    secret: t.fundedAccount.secret,
    salt: t.fundedAccount.salt,
    contract: new SchnorrHardcodedKeyAccountContract(),
  });

  const txHashes = [];
  for (let i = 0; i < numTxs; i++) {
    const accountManager = await wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random());
    const deployMethod = await accountManager.getDeployMethod();
    const { txHash } = await deployMethod.send({ from: fundedAccountManager.address, wait: NO_WAIT });
    txHashes.push(txHash);
  }
  return txHashes;
}

async function getArchiveLeafHash(node: AztecNodeService, blockNumber: number) {
  const leaf = await (node as TestAztecNodeService).worldStateSynchronizer
    .getCommitted()
    .getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
  return leaf?.toString();
}

async function advanceToEpochBeforePipelinedTargetSlot({
  epochCache,
  cheatCodes,
  targetProposer,
  logger,
  maxAttempts = 30,
}: {
  epochCache: EpochCacheInterface;
  cheatCodes: RollupCheatCodes;
  targetProposer: EthAddress;
  logger: P2PNetworkTest['logger'];
  maxAttempts?: number;
}): Promise<{ targetEpoch: EpochNumber; targetSlot: SlotNumber }> {
  const { epochDuration } = await cheatCodes.getConfig();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentEpoch = await cheatCodes.getEpoch();
    const nextEpoch = Number(currentEpoch) + 1;
    const firstSlotOfNextEpoch = nextEpoch * Number(epochDuration);
    const pipelinedTargetSlot = SlotNumber(firstSlotOfNextEpoch + 1);
    const proposer = await epochCache.getProposerAttesterAddressInSlot(pipelinedTargetSlot);

    logger.info(
      `Checking pipelined target slot ${pipelinedTargetSlot} in epoch ${nextEpoch} for proposer ${targetProposer}`,
      { proposer: proposer?.toString() },
    );

    if (proposer?.equals(targetProposer)) {
      return { targetEpoch: EpochNumber(nextEpoch), targetSlot: pipelinedTargetSlot };
    }

    await cheatCodes.advanceToNextEpoch();
  }

  throw new Error(`Target proposer ${targetProposer.toString()} not found after ${maxAttempts} epoch attempts`);
}

describe('e2e_slashing_attested_invalid_proposal', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[] = [];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_slashing_attested_invalid_proposal',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 2,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        aztecProofSubmissionEpochs: 1024,
        slashInactivityConsecutiveEpochThreshold: 32,
        mockGossipSubNetwork: true,
        minTxsPerBlock: 1,
        maxTxsPerBlock: 1,
        minBlocksForCheckpoint: 3,
        maxBlocksPerCheckpoint: 3,
        publishTxsWithProposals: true,
        enforceTimeTable: true,
        blockDurationMs: BLOCK_DURATION_MS,
        l1PublishingTime: 2,
        attestationPropagationTime: 0.5,
        enableProposerPipelining: true,
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

  it('creates a checkpoint proposal with a third invalid block that receives a lazy attestation', async () => {
    const { rollup } = await t.getContracts();

    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await t.ctx.cheatCodes.rollup.debugRollup();

    const badProposerNode = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
        invalidBlockProposalIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 1,
      t.bootstrapNodeEnr,
      0,
      t.genesis,
      `${DATA_DIR}-0`,
      shouldCollectMetrics(),
    );

    const lazyValidatorNode = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
        skipProposalSlotValidation: true,
        skipCheckpointProposalValidation: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 2,
      t.bootstrapNodeEnr,
      1,
      t.genesis,
      `${DATA_DIR}-1`,
      shouldCollectMetrics(),
    );

    const honestValidatorNode = await createNode(
      {
        ...t.ctx.aztecNodeConfig,
        dontStartSequencer: true,
        skipProposalSlotValidation: true,
      },
      t.ctx.dateProvider!,
      BOOT_NODE_UDP_PORT + 3,
      t.bootstrapNodeEnr,
      2,
      t.genesis,
      `${DATA_DIR}-2`,
      shouldCollectMetrics(),
    );

    nodes = [badProposerNode, lazyValidatorNode, honestValidatorNode];

    const badProposer = t.validators[0].attester;
    const lazyValidator = t.validators[1].attester;
    const honestValidator = t.validators[2].attester;
    t.logger.warn('Created invalid proposal slashing scenario actors', {
      badProposer: badProposer.toString(),
      lazyValidator: lazyValidator.toString(),
      honestValidator: honestValidator.toString(),
    });

    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS, 30, 0.1, [
      TopicType.tx,
      TopicType.block_proposal,
      TopicType.checkpoint_proposal,
      TopicType.checkpoint_attestation,
    ]);
    await awaitCommitteeExists({ rollup, logger: t.logger });

    const epochCache = (honestValidatorNode as TestAztecNodeService).epochCache;
    const { targetEpoch, targetSlot } = await advanceToEpochBeforePipelinedTargetSlot({
      epochCache,
      cheatCodes: t.ctx.cheatCodes.rollup,
      targetProposer: badProposer,
      logger: t.logger,
    });

    const txHashes = await submitDeploymentTxsWithoutWaiting(badProposerNode, t, 3);
    t.logger.warn(`Submitted ${txHashes.length} transactions for the three-block checkpoint`, {
      txHashes: txHashes.map(txHash => txHash.toString()),
      targetEpoch,
      targetSlot,
    });

    await retryUntil(
      async () => {
        const pendingTxCount = await badProposerNode.getPendingTxCount();
        t.logger.info(`Bad proposer pending tx count is ${pendingTxCount}`);
        return pendingTxCount >= 3;
      },
      'bad proposer pending txs',
      AZTEC_SLOT_DURATION,
      0.5,
    );

    const badProposerBlockProposedEvents: BlockProposedEvent[] = [];
    badProposerNode
      .getSequencer()!
      .getSequencer()
      .on('block-proposed', (args: BlockProposedEvent) => {
        if (Number(args.slot) !== Number(targetSlot)) {
          return;
        }

        badProposerBlockProposedEvents.push(args);
        t.logger.warn('Captured bad proposer block-proposed event', {
          ...args,
          blockHash: args.blockHash.toString(),
        });
      });

    await Promise.all(nodes.map(node => node.getSequencer()!.start()));

    t.logger.warn(`Advancing to epoch ${targetEpoch}; bad proposer should build for slot ${targetSlot}`);
    await t.ctx.cheatCodes.rollup.advanceToEpoch(targetEpoch);

    const badCheckpointBlockHashes = await retryUntil(
      async () => {
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

        t.logger.warn('Waiting for bad proposer block-proposed events for invalid checkpoint', {
          targetSlot,
          badBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
          proposedBlocks,
          badBlock,
        });

        return proposedBlocks.length >= BAD_BLOCK_INDEX_WITHIN_CHECKPOINT + 1 && badBlock ? proposedBlocks : undefined;
      },
      'bad proposer invalid checkpoint block-proposed events',
      AZTEC_SLOT_DURATION,
      1,
    );
    const badBlock = badCheckpointBlockHashes.find(
      block => block.indexWithinCheckpoint === BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
    );
    t.logger.warn('Captured invalid checkpoint blocks from bad proposer block-proposed events', {
      targetSlot,
      badBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
      badBlock,
      badCheckpointBlockHashes,
    });

    await retryUntil(
      async () => {
        const currentSlot = await rollup.getSlotNumber();
        return currentSlot >= targetSlot + 1;
      },
      'wait for invalid checkpoint proposal slot to complete',
      BAD_SLOT_COMPLETION_TIMEOUT,
      1,
    );

    const lazyAttestations = await retryUntil(
      async () => {
        const attestations = await lazyValidatorNode.getP2P().getCheckpointAttestationsForSlot(targetSlot);
        const lazyValidatorAttestations = attestations.filter(attestation =>
          attestation.getSender()?.equals(lazyValidator),
        );
        t.logger.warn('Waiting for lazy validator attestation before checking assertions', {
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
    let offenses = await honestValidatorNode.getSlashOffenses('all');
    t.logger.warn('Observed state after invalid checkpoint proposal scenario', {
      targetSlot,
      invalidBlockIndexWithinCheckpoint: BAD_BLOCK_INDEX_WITHIN_CHECKPOINT,
      lazyNodeAttestationCount: lazyAttestations.length,
      lazyNodeAttesters: lazyAttestations.map(attestation => attestation.getSender()?.toString()),
      honestNodeAttestationCount: honestAttestations.length,
      honestNodeAttesters: honestAttestations.map(attestation => attestation.getSender()?.toString()),
      offenses,
    });

    const expectedSlashOffenses = [
      {
        description: 'bad proposer broadcasted invalid block proposal',
        validator: badProposer,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
      },
      {
        description: 'lazy validator attested to invalid checkpoint proposal',
        validator: lazyValidator,
        offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
      },
    ];

    const findExpectedOffense = (validator: EthAddress, offenseType: OffenseType) =>
      offenses.find(
        offense =>
          offense.validator.equals(validator) &&
          offense.offenseType === offenseType &&
          offense.epochOrSlot === BigInt(targetSlot),
      );

    await retryUntil(
      async () => {
        offenses = await honestValidatorNode.getSlashOffenses('all');
        t.logger.warn('Waiting for expected slash offenses on honest validator', {
          targetSlot,
          offenses,
        });
        return expectedSlashOffenses.every(
          ({ validator, offenseType }) => findExpectedOffense(validator, offenseType) !== undefined,
        );
      },
      'honest validator slash offenses for invalid proposal attestation',
      OFFENSE_DETECTION_TIMEOUT,
      1,
    );

    for (const { description, validator, offenseType } of expectedSlashOffenses) {
      const offense = findExpectedOffense(validator, offenseType);
      expect(offense).toBeDefined();
      expect(offense!.amount).toBeGreaterThan(0n);
      t.logger.warn(`Observed expected slash offense: ${description}`, { offense });
    }

    const getWorldStateBadCheckpointHashes = () =>
      Promise.all(
        nodes.map(async (node, nodeIndex) => ({
          nodeIndex,
          blocks: await Promise.all(
            badCheckpointBlockHashes.map(async block => ({
              ...block,
              worldStateHash: await getArchiveLeafHash(node, block.number),
            })),
          ),
        })),
      );

    const purgedWorldStateHashes = await retryUntil(
      async () => {
        const worldStateHashes = await getWorldStateBadCheckpointHashes();
        t.logger.warn('Waiting for invalid checkpoint blocks to be purged from world states', {
          targetSlot,
          worldStateHashes,
        });
        return worldStateHashes.every(nodeState => nodeState.blocks.every(block => block.worldStateHash !== block.hash))
          ? worldStateHashes
          : undefined;
      },
      'invalid checkpoint purge from all world states',
      WORLD_STATE_PURGE_TIMEOUT,
      1,
    );

    for (const nodeState of purgedWorldStateHashes) {
      for (const block of nodeState.blocks) {
        expect(block.worldStateHash).not.toEqual(block.hash);
      }
    }
  });
});
