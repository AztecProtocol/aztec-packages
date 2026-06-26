import { createArchiverStore, registerProtocolContracts } from '@aztec/archiver';
import { makeInboxMessages } from '@aztec/archiver/test';
import { type NoopL1Archiver, createNoopL1Archiver } from '@aztec/archiver/test/noop-l1';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type EpochCache, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { TestEpochCache } from '@aztec/epoch-cache/test';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { Hex } from '@aztec/foundation/string';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { type KeyStore, KeystoreManager } from '@aztec/node-keystore';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import type { P2P, PeerId } from '@aztec/p2p';
import { TestTxProvider } from '@aztec/p2p/test-helpers';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation, GENESIS_BLOCK_HEADER_HASH, L2Block } from '@aztec/stdlib/block';
import { CheckpointReexecutionTracker, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { type BlockProposal, CheckpointProposal } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { BlockHeader, type CheckpointGlobalVariables, Tx } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { ServerWorldStateSynchronizer } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';
import { getGenesisValues } from '@aztec/world-state/testing';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { hashTypedData } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

import { CheckpointBuilder, FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { ValidatorClient } from './validator.js';

jest.setTimeout(60_000);

describe('ValidatorClient Integration', () => {
  // Constants for L1
  const l1Constants: L1RollupConstants = {
    l1GenesisTime: 0n,
    slotDuration: 24,
    epochDuration: 16,
    ethereumSlotDuration: 12,
    proofSubmissionEpochs: 2,
    l1StartBlock: 0n,
    targetCommitteeSize: 48,
    rollupManaLimit: 200_000_000,
  };

  const emptyL1ToL2Messages: Fr[] = [];
  const emptyPreviousCheckpointOutHashes: Fr[] = [];

  type ValidatorContext = {
    worldStateDb: NativeWorldStateService;
    archiver: NoopL1Archiver;
    synchronizer: ServerWorldStateSynchronizer;
    checkpointsBuilder: FullNodeCheckpointsBuilder;
    p2pClient: MockProxy<P2P>;
    validator: ValidatorClient;
  };

  let slotNumber: SlotNumber;
  let chainId: Fr;
  let version: Fr;

  let epochCache: TestEpochCache;
  let rollupAddress: EthAddress;
  let genesisArchiveRoot: Fr;
  let genesis: GenesisData;
  let genesisBlockHeader: BlockHeader;
  let proposerSigner: Secp256k1Signer;
  let proposerPrivateKey: Hex<32>;
  let validatorSigner: Secp256k1Signer;
  let validatorPrivateKey: Hex<32>;
  let dateProvider: ManualDateProvider;
  let txProvider: TestTxProvider;
  let keyStoreManager: KeystoreManager;
  let blobClient: MockProxy<BlobClientInterface>;
  let logger: Logger;
  let feePayerAddresses: AztecAddress[];

  let attestor: ValidatorContext;
  let proposer: ValidatorContext;

  const mockPeerId = { toString: () => 'test-peer' } as PeerId;

  const getBuildSlot = (targetSlot: SlotNumber) => SlotNumber(targetSlot - PROPOSER_PIPELINING_SLOT_OFFSET);

  const setBuildTimeForSlot = (targetSlot: SlotNumber) => {
    const buildSlot = getBuildSlot(targetSlot);
    dateProvider.setTime(Number(getTimestampForSlot(buildSlot, l1Constants)) * 1000);
    epochCache.setCurrentSlot(buildSlot);
  };

  /** Creates a new validator and dependencies */
  const createValidatorContext = async (privateKey: Hex<32>): Promise<ValidatorContext> => {
    // Create archiver store and NoopL1Archiver
    const archiverStore = await createArchiverStore(
      {
        archiverStoreMapSizeKb: 1024 * 1024,
        dataDirectory: undefined,
        dataStoreMapSizeKb: 1024 * 1024,
      },
      GENESIS_BLOCK_HEADER_HASH,
    );
    await registerProtocolContracts(archiverStore);

    // Construct world-state first so we can pass its initial header to the archiver, mirroring
    // production wiring (see aztec-node/server.ts). Both sides must agree on the genesis hash for
    // L2BlockStream's `areBlockHashesEqualAt` check to succeed at block 0.
    const wsConfig = {
      rollupAddress,
      worldStateBlockCheckIntervalMS: 20,
      worldStateBlockRequestBatchSize: 10,
      worldStateDbMapSizeKb: 1024 * 1024,
      worldStateCheckpointHistory: 0,
    };
    const worldStateDb = await NativeWorldStateService.tmp(true, genesis);
    const archiver = await createNoopL1Archiver(
      archiverStore,
      { ...l1Constants, genesisArchiveRoot },
      undefined,
      worldStateDb.getInitialHeader(),
      dateProvider,
    );
    await archiver.start();

    const synchronizer = new ServerWorldStateSynchronizer(worldStateDb, archiver, wsConfig);
    await synchronizer.start();

    // Create real checkpoints builder
    const checkpointsBuilder = new FullNodeCheckpointsBuilder(
      {
        l1GenesisTime: l1Constants.l1GenesisTime,
        slotDuration: l1Constants.slotDuration,
        l1ChainId: chainId.toNumber(),
        rollupVersion: version.toNumber(),
        rollupManaLimit: 200_000_000,
        txPublicSetupAllowListExtend: [],
      },
      synchronizer,
      archiver,
      dateProvider,
    );

    // Create mock p2p client
    const p2pClient = mock<P2P>();
    p2pClient.getCheckpointAttestationsForSlot.mockResolvedValue([]);
    p2pClient.broadcastCheckpointAttestations.mockResolvedValue();
    p2pClient.getTxStatus.mockResolvedValue('pending');
    p2pClient.hasTxsInPool.mockImplementation(txHashes => Promise.resolve(txHashes.map(() => true)));

    // Create keystore with private key
    const keyStore: KeyStore = {
      schemaVersion: 1,
      slasher: undefined,
      prover: undefined,
      remoteSigner: undefined,
      validators: [
        {
          attester: [privateKey],
          feeRecipient: AztecAddress.ZERO,
          coinbase: undefined,
          remoteSigner: undefined,
          publisher: [],
        },
      ],
    };
    keyStoreManager = new KeystoreManager(keyStore);

    // Create and start validator
    const validator = await ValidatorClient.new(
      {
        rollupAddress,
        l1ChainId: chainId.toNumber(),
        validatorPrivateKeys: new SecretValue([privateKey]),
        attestationPollingIntervalMs: 100,
        blockDurationMs: 3000,
        disableValidator: false,
        disabledValidators: [],
        slashBroadcastedInvalidBlockPenalty: 10n,
        slashBroadcastedInvalidCheckpointProposalPenalty: 10n,
        slashDuplicateProposalPenalty: 10n,
        slashDuplicateAttestationPenalty: 10n,
        slashAttestInvalidCheckpointProposalPenalty: 10n,
        haSigningEnabled: false,
        skipCheckpointProposalValidation: false,
        skipPushProposedBlocksToArchiver: false,
        dataStoreMapSizeKb: 128 * 1024,
        nodeId: 'test-node',
        pollingIntervalMs: 100,
        signingTimeoutMs: 3000,
      },
      checkpointsBuilder,
      synchronizer,
      epochCache as unknown as EpochCache,
      p2pClient,
      archiver,
      archiver,
      txProvider,
      keyStoreManager,
      blobClient,
      new CheckpointReexecutionTracker(),
      dateProvider,
    );

    await validator.start();

    return {
      worldStateDb,
      archiver,
      synchronizer,
      checkpointsBuilder,
      p2pClient,
      validator,
    };
  };

  type BlockProposalResult = { block: L2Block; proposal: BlockProposal };

  /** Builds a new block proposal with the given txs and l1-to-l2 messages */
  const buildBlockProposal = async (
    checkpointBuilder: CheckpointBuilder,
    blockNumber: BlockNumber,
    cpNumber: CheckpointNumber,
    txs: Tx[] = [],
    l1ToL2Messages: Fr[] = [],
  ): Promise<{ block: L2Block; proposal: BlockProposal }> => {
    const inHash = computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const blockTimestamp = getTimestampForSlot(checkpointBuilder.getConstantData().slotNumber, l1Constants);
    const { block, usedTxs } = await checkpointBuilder.buildBlock(txs, blockNumber, blockTimestamp, {
      isBuildingProposal: true,
      maxBlocksPerCheckpoint: 1,
      perBlockAllocationMultiplier: 1.2,
      minValidTxs: 0,
    });

    const proposal = await proposer.validator.createBlockProposal(
      block.header,
      cpNumber,
      block.indexWithinCheckpoint,
      inHash,
      block.archive.root,
      usedTxs,
      proposerSigner.address,
      {},
    );

    logger.warn(`Built block proposal for block ${blockNumber}`, { ...block.toBlockInfo() });
    return { block, proposal };
  };

  let txCount = 0;
  /** Builds mock transactions with pre-funded fee payers. */
  const buildTxs = async (numTxs: number, anchorBlockHeader?: BlockHeader): Promise<Tx[]> => {
    const txs = await timesAsync(numTxs, () => {
      const feePayer = feePayerAddresses[txCount % feePayerAddresses.length];
      return mockTx(++txCount + 1000, {
        chainId,
        version,
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertibleNullifiers: 0,
        numberOfRevertiblePublicCallRequests: 0,
        hasPublicTeardownCallRequest: false,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        anchorBlockHeader: anchorBlockHeader ?? genesisBlockHeader,
        gasLimits: new Gas(100_000, 1_000_000),
        gasUsed: new Gas(10_000, 100_000),
        maxFeesPerGas: new GasFees(1e12, 1e12),
        feePayer,
      });
    });
    txProvider.seed(txs);
    for (const tx of txs) {
      logger.debug(`Built and seeded tx ${tx.getTxHash().toString()} with feePayer ${tx.data.feePayer.toString()}`);
    }
    return txs;
  };

  /**
   * Builds a complete checkpoint with the specified number of blocks.
   * @param getTxsForBlock - Callback to get txs for each block, receives block number and previously built blocks.
   */
  const buildCheckpoint = async (
    checkpointNumber: CheckpointNumber,
    slot: SlotNumber,
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[],
    startBlockNumber: BlockNumber,
    blockCount: number,
    getTxsForBlock: (blockNumber: BlockNumber, previousBlocks: BlockProposalResult[]) => Promise<Tx[]> | Tx[],
  ): Promise<{
    blocks: BlockProposalResult[];
    checkpoint: Awaited<ReturnType<CheckpointBuilder['completeCheckpoint']>>;
    proposal: Awaited<ReturnType<typeof proposer.validator.createCheckpointProposal>>;
    l1ToL2Messages: Fr[];
    globalVariables: CheckpointGlobalVariables;
  }> => {
    const globalVariables: CheckpointGlobalVariables = {
      chainId: new Fr(1),
      version: new Fr(1),
      coinbase: EthAddress.random(),
      feeRecipient: await AztecAddress.random(),
      gasFees: GasFees.empty(),
      slotNumber: slot,
      timestamp: BigInt(Date.now()),
    };

    await using fork = await proposer.worldStateDb.fork();
    const builder = await proposer.checkpointsBuilder.startCheckpoint(
      checkpointNumber,
      globalVariables,
      0n,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      fork,
    );

    const blocks: BlockProposalResult[] = [];
    for (let i = 0; i < blockCount; i++) {
      const blockNumber = BlockNumber(startBlockNumber + i);
      const txs = await getTxsForBlock(blockNumber, blocks);
      const block = await buildBlockProposal(builder, blockNumber, checkpointNumber, txs, l1ToL2Messages);
      blocks.push(block);
    }

    const checkpoint = await builder.completeCheckpoint();

    const proposal = await proposer.validator.createCheckpointProposal(
      checkpoint.header,
      checkpoint.archive.root,
      checkpointNumber,
      0n,
      undefined,
      proposerSigner.address,
      {},
    );

    return { blocks, checkpoint, proposal, l1ToL2Messages, globalVariables };
  };

  /** Validates blocks by calling the validator client in the attestor. */
  const attestorValidateBlocks = async (blocks: BlockProposalResult[]) => {
    for (const block of blocks) {
      logger.warn(`Validating block proposal ${block.proposal.blockNumber}`);
      expect(await attestor.validator.validateBlockProposal(block.proposal, mockPeerId)).toBe(true);
    }
  };

  beforeEach(async () => {
    // Setup common values
    slotNumber = SlotNumber(1);
    chainId = new Fr(1);
    version = new Fr(1);

    // Setup signers with explicit private keys
    proposerPrivateKey = generatePrivateKey() as Hex<32>;
    proposerSigner = new Secp256k1Signer(Buffer32.fromString(proposerPrivateKey));
    validatorPrivateKey = generatePrivateKey() as Hex<32>;
    validatorSigner = new Secp256k1Signer(Buffer32.fromString(validatorPrivateKey));

    // Set up common dependencies
    logger = createLogger('validator:test');
    rollupAddress = EthAddress.random();
    dateProvider = new ManualDateProvider();
    txProvider = new TestTxProvider();
    blobClient = mock<BlobClientInterface>();
    blobClient.canUpload.mockReturnValue(false);
    epochCache = new TestEpochCache(l1Constants)
      .setCommittee([validatorSigner.address])
      .setProposer(proposerSigner.address)
      .setCurrentSlot(getBuildSlot(slotNumber));
    setBuildTimeForSlot(slotNumber);

    // Generate fee payer addresses and pre-fund them
    feePayerAddresses = await Promise.all(Array.from({ length: 10 }, () => AztecAddress.random()));
    const genesisValues = await getGenesisValues(feePayerAddresses);
    genesisArchiveRoot = genesisValues.genesisArchiveRoot;
    genesis = genesisValues.genesis;

    // Create validator clients
    logger.warn(`Setting up validator contexts`);
    attestor = await createValidatorContext(validatorPrivateKey);
    proposer = await createValidatorContext(proposerPrivateKey);
    // Get genesis block header from world state (archiver.getBlockHeader(0) returns undefined by design)
    genesisBlockHeader = proposer.worldStateDb.getInitialHeader();
    logger.warn(`Setup complete`);

    // Re-anchor the clock AFTER setup. setBuildTimeForSlot above runs before the
    // (IPC-backed, multi-second) world-state spawns; reexecution's deadline is the
    // slot end, so without this the real wall-clock spent spawning aztec-wsdb can
    // push us past the deadline before the test body runs. Reset here so each test
    // validates with a full slot budget regardless of setup duration.
    setBuildTimeForSlot(slotNumber);
  });

  afterEach(async () => {
    logger.warn(`Stopping validator contexts`);
    for (const { validator, synchronizer, archiver, worldStateDb } of [attestor, proposer]) {
      await tryStop(validator);
      await tryStop(synchronizer);
      await tryStop(archiver);
      await tryStop(worldStateDb);
    }
  });

  describe('happy path', () => {
    it('validates multiple blocks and attests to checkpoint', async () => {
      const { blocks, proposal } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        3,
        () => buildTxs(2),
      );

      await attestorValidateBlocks(blocks);

      const attestations = await attestor.validator.attestToCheckpointProposal(proposal, mockPeerId);
      expect(attestations).toBeDefined();
      expect(attestations).toHaveLength(1);
      expect(attestations![0].getSender()).toEqual(validatorSigner.address);

      // Verify blocks are in archiver and hashes match
      await attestor.archiver.syncImmediate();
      const attestorBlocks = await attestor.archiver.getBlocks({ from: BlockNumber(1), limit: 3 });
      expect(attestorBlocks.length).toBe(3);

      const attestorBlockHashes = await Promise.all(attestorBlocks.map(b => b.header.hash()));
      const expectedBlockHashes = await Promise.all(blocks.map(b => b.block.header.hash()));
      expect(attestorBlockHashes).toEqual(expectedBlockHashes);
    });

    it('validates and attests with txs anchored to proposed blocks and non-empty l1-to-l2 messages', async () => {
      // Create l1 to l2 messages and seed them into the archivers
      const l1ToL2Messages = makeInboxMessages(4, { messagesPerCheckpoint: 4 });
      await proposer.archiver.dataStores.messages.addL1ToL2Messages(l1ToL2Messages);
      await attestor.archiver.dataStores.messages.addL1ToL2Messages(l1ToL2Messages);

      // Build txs anchored to the previously proposed block
      const { blocks, proposal } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        l1ToL2Messages.map(m => m.leaf),
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        3,
        (_blockNumber: BlockNumber, previousBlocks: BlockProposalResult[]) =>
          buildTxs(2, previousBlocks.at(-1)?.block.header),
      );

      await attestorValidateBlocks(blocks);

      const attestations = await attestor.validator.attestToCheckpointProposal(proposal, mockPeerId);
      expect(attestations).toBeDefined();
      expect(attestations).toHaveLength(1);
      expect(attestations![0].getSender()).toEqual(validatorSigner.address);

      // Verify blocks are in archiver and hashes match
      await attestor.archiver.syncImmediate();
      const attestorBlocks = await attestor.archiver.getBlocks({ from: BlockNumber(1), limit: 3 });
      expect(attestorBlocks.length).toBe(3);

      const attestorBlockHashes = await Promise.all(attestorBlocks.map(b => b.header.hash()));
      const expectedBlockHashes = await Promise.all(blocks.map(b => b.block.header.hash()));
      expect(attestorBlockHashes).toEqual(expectedBlockHashes);
    });

    it('validates second checkpoint using previousCheckpointOutHashes', async () => {
      // Build and publish the first checkpoint
      const { blocks: blocks1, checkpoint: checkpoint1 } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        2,
        () => buildTxs(2),
      );

      // Publish checkpoint 1 to both archivers
      const publishedCheckpoint1 = PublishedCheckpoint.from({
        checkpoint: checkpoint1,
        l1: new L1PublishedData(1n, BigInt(Math.floor(Date.now() / 1000)), Buffer32.random().toString()),
        attestations: [CommitteeAttestation.random()],
      });
      await attestor.archiver.addCheckpoints([publishedCheckpoint1]);
      await proposer.archiver.addCheckpoints([publishedCheckpoint1]);

      // Sync proposer's world state before building next checkpoint
      await proposer.synchronizer.syncImmediate(BlockNumber(2));

      // Advance to slot 2
      const slot2 = SlotNumber(2);
      setBuildTimeForSlot(slot2);

      // Build second checkpoint referencing the first
      const { blocks: blocks2, proposal: proposal2 } = await buildCheckpoint(
        CheckpointNumber(2),
        slot2,
        emptyL1ToL2Messages,
        [checkpoint1.getCheckpointOutHash()],
        BlockNumber(3),
        2,
        () => buildTxs(2),
      );

      await attestorValidateBlocks(blocks2);

      const attestations = await attestor.validator.attestToCheckpointProposal(proposal2, mockPeerId);
      expect(attestations).toBeDefined();
      expect(attestations).toHaveLength(1);

      // Verify all blocks are in archiver
      await attestor.archiver.syncImmediate();
      const attestorBlocks = await attestor.archiver.getBlocks({ from: BlockNumber(1), limit: 4 });
      expect(attestorBlocks.length).toBe(4);

      const attestorBlockHashes = await Promise.all(attestorBlocks.map(b => b.header.hash()));
      const expectedBlockHashes = await Promise.all([...blocks1, ...blocks2].map(b => b.block.header.hash()));
      expect(attestorBlockHashes).toEqual(expectedBlockHashes);
    });
  });

  describe('failure conditions', () => {
    it('refuses to attest to checkpoint if not all block proposals were processed', async () => {
      // Build 3 blocks but only validate 2
      const { blocks, proposal } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        3,
        () => buildTxs(2),
      );

      // Only validate first 2 blocks
      await attestorValidateBlocks(blocks.slice(0, 2));

      // Advance past slot 1's attestation deadline so the validator's bounded wait for the
      // never-synced terminal block (block 3) times out at once instead of polling the full window.
      dateProvider.setTime(Number(getTimestampForSlot(SlotNumber(slotNumber + 1), l1Constants)) * 1000);

      // Attestation should fail because block 3 wasn't validated
      // The validator will timeout waiting for block with matching archive
      const attestations = await attestor.validator.attestToCheckpointProposal(proposal, mockPeerId);
      expect(attestations).toBeUndefined();
    });

    it('refuses to attest to checkpoint with archive mismatch', async () => {
      const { blocks, checkpoint } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        2,
        () => buildTxs(2),
      );

      // Create a checkpoint proposal with wrong archive root directly, bypassing the
      // validator's anti-equivocation guard (which prevents two proposals for the same slot)
      const badProposal = await CheckpointProposal.createProposalFromSigner(
        checkpoint.header,
        Fr.random(), // Wrong archive root
        CheckpointNumber(1),
        0n,
        undefined,
        { chainId: chainId.toNumber(), rollupAddress },
        typedData => Promise.resolve(proposerSigner.sign(Buffer32.fromString(hashTypedData(typedData)))),
      );

      await attestorValidateBlocks(blocks);

      // Advance past slot 1's attestation deadline so the validator's bounded wait for a block
      // matching the (random) archive times out at once instead of polling the full window.
      dateProvider.setTime(Number(getTimestampForSlot(SlotNumber(slotNumber + 1), l1Constants)) * 1000);

      // Attestation should fail because archive doesn't match any block
      const attestations = await attestor.validator.attestToCheckpointProposal(badProposal, mockPeerId);
      expect(attestations).toBeUndefined();
    });

    it('refuses block proposal with wrong slot', async () => {
      const { blocks } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        1,
        () => buildTxs(2),
      );

      // Advance time to slot 2 but keep the proposal from slot 1
      const slot2 = SlotNumber(2);
      dateProvider.setTime(Number(getTimestampForSlot(slot2, l1Constants)) * 1000);
      epochCache.setCurrentSlot(slot2);

      // Block proposal validator should reject the old proposal
      const isValid = await attestor.validator.validateBlockProposal(blocks[0].proposal, mockPeerId);
      expect(isValid).toBe(false);
    });

    it('rejects block that would exceed checkpoint mana limit', async () => {
      const { blocks } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        emptyL1ToL2Messages,
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        3,
        () => buildTxs(2),
      );

      // Measure total mana used by the first two blocks
      const manaFirstTwo =
        blocks[0].block.header.totalManaUsed.toNumber() + blocks[1].block.header.totalManaUsed.toNumber();

      // Set rollupManaLimit to only cover the first two blocks' actual mana.
      // Block 3 re-execution will have 0 remaining mana, so the actual gas check
      // in the public processor will reject all txs, producing a tx count mismatch.
      attestor.checkpointsBuilder.updateConfig({ rollupManaLimit: manaFirstTwo });

      // Blocks 1 and 2 should validate successfully
      await attestorValidateBlocks(blocks.slice(0, 2));

      // Block 3 should fail: remaining checkpoint mana is 0, so the processor
      // stops after the first tx's actual gas exceeds the limit.
      const isValid = await attestor.validator.validateBlockProposal(blocks[2].proposal, mockPeerId);
      expect(isValid).toBe(false);
    });

    it('refuses block proposal with mismatching l1 to l2 messages', async () => {
      const l1ToL2Messages = makeInboxMessages(4, { messagesPerCheckpoint: 4 });
      await proposer.archiver.dataStores.messages.addL1ToL2Messages(l1ToL2Messages);

      const otherL1ToL2Messages = makeInboxMessages(4, { messagesPerCheckpoint: 4 });
      await attestor.archiver.dataStores.messages.addL1ToL2Messages(otherL1ToL2Messages);

      const { blocks } = await buildCheckpoint(
        CheckpointNumber(1),
        slotNumber,
        l1ToL2Messages.map(m => m.leaf),
        emptyPreviousCheckpointOutHashes,
        BlockNumber(1),
        1,
        () => buildTxs(2),
      );

      // Advance time to slot 2 but keep the proposal from slot 1
      const slot2 = SlotNumber(2);
      dateProvider.setTime(Number(getTimestampForSlot(slot2, l1Constants)) * 1000);
      epochCache.setCurrentSlot(slot2);

      // Block proposal validator should reject the old proposal
      const isValid = await attestor.validator.validateBlockProposal(blocks[0].proposal, mockPeerId);
      expect(isValid).toBe(false);
    });
  });
});
