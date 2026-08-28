import type { ArchiverDataSource } from '@aztec/archiver';
import { MockL1ToL2MessageSource } from '@aztec/archiver/test';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { GlobalVariables } from '@aztec/aztec.js/tx';
import { createBlobClient } from '@aztec/blob-client/client';
import {
  BatchedBlob,
  BatchedBlobAccumulator,
  Blob,
  getBlobsPerL1Block,
  getPrefixedEthBlobCommitments,
} from '@aztec/blob-lib';
import {
  GENESIS_ARCHIVE_ROOT,
  MAX_L1_TO_L2_MSGS_PER_BLOCK,
  MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
  MAX_NULLIFIERS_PER_TX,
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
} from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { type L1ContractsConfig, getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import {
  GovernanceProposerContract,
  InboxContract,
  type MessageSentLog,
  RollupContract,
  SimulationOverridesBuilder,
} from '@aztec/ethereum/contracts';
import { type DeployAztecL1ContractsArgs, deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { TxUtilsState, createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { EthCheatCodesWithState, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { Anvil } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { range } from '@aztec/foundation/array';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Secp256k1Signer, flipSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { hexToBuffer } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList, protocolContractsHash } from '@aztec/protocol-contracts';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import {
  type BlockData,
  type BlockQuery,
  type BlocksQuery,
  Body,
  type CheckpointsQuery,
  type CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2Block,
  type L2Tips,
  Signature,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import {
  type L1RollupConstants,
  getNextL1SlotTimestamp,
  getSlotStartBuildTimestamp,
} from '@aztec/stdlib/epoch-helpers';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import {
  CheckpointProposal,
  ConsensusPayload,
  CheckpointAttestation as P2PCheckpointAttestation,
  getHashedSignaturePayloadTypedData,
  orderAttestations,
} from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { fr, mockProcessedTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import type { BlockHeader, CheckpointGlobalVariables, ProcessedTx } from '@aztec/stdlib/tx';
import { NativeWorldStateService, ServerWorldStateSynchronizer, type WorldStateConfig } from '@aztec/world-state';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type Address, encodeFunctionData, getAbiItem, getAddress, multicall3Abi } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { type SequencerClientConfig, getConfigEnvVars } from '../config.js';
import { immediateEligibility } from '../sequencer/inbox_bucket_eligibility.js';
import { selectInboxBucketForBlock } from '../sequencer/inbox_bucket_selector.js';
import { sendL1ToL2Message } from './l1_to_l2_messaging.js';
import { SequencerPublisherMetrics } from './sequencer-publisher-metrics.js';
import { SequencerPublisher } from './sequencer-publisher.js';
import { writeJson } from './write_json.js';

// To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
// If you have issues with RPC_URL, it is likely that you need to set the RPC_URL in the shell as well
// If running ANVIL locally, you can use ETHEREUM_HOSTS="http://0.0.0.0:8545"

// Accounts 4 and 5 of Anvil default startup with mnemonic: 'test test test test test test test test test test test junk'
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createLogger('integration_l1_publisher');

// Compose the publisher's config from sequencer-client's own env getter plus the L1 contracts
// config (for lagInEpochsForValidatorSet, which is not part of SequencerClientConfig). This avoids
// depending on @aztec/aztec-node, which would create a sequencer-client <-> aztec-node cycle.
const config: SequencerClientConfig & L1ContractsConfig = { ...getL1ContractsConfigEnvVars(), ...getConfigEnvVars() };

// Several consecutive checkpoints, each consuming the L1->L2 messages sent while it was being built, so real
// messages are genuinely consumed and validated on L1.
const numberOfConsecutiveBlocks = 3;

jest.setTimeout(1000000);

// Low-level integration tests for SequencerPublisher: building checkpoints, publishing with and
// without attestations, handling L1 tx cancellation/speedup, and invalidating bad checkpoints.
// Custom wiring: starts its own anvil directly via startAnvil(), deploys L1 contracts, builds a
// real NativeWorldStateService + ServerWorldStateSynchronizer, and creates a SequencerPublisher
// directly — no AztecNodeService, no PXE. EthCheatCodesWithState drives time. Each describe block
// has its own beforeEach calling the local setup() function.
describe('L1Publisher integration', () => {
  let l1Client: ExtendedViemWalletClient;
  let l1ContractAddresses: L1ContractAddresses;
  let deployerAccount: PrivateKeyAccount;
  let l1Constants: L1RollupConstants;

  let governanceProposerContract: GovernanceProposerContract;

  let rollupAddress: Address;

  let rollup: RollupContract;

  let publisher: SequencerPublisher;

  let builderDb: NativeWorldStateService;

  // Backs the blockSource mock's streaming L1->L2 message queries. The world-state synchronizer reconstructs each
  // block's consumed message bundle from Inbox buckets when it syncs a block back, so the test
  // registers one bucket per published block here (see buildAndPublishBlock).
  let messageSource: MockL1ToL2MessageSource;

  // The header of the last block
  let prevHeader: BlockHeader;

  let minFee: GasFees;

  let blockSource: MockProxy<ArchiverDataSource>;
  let blocks: L2Block[] = [];

  const chainId = createEthereumChain(config.l1RpcUrls, config.l1ChainId).chainInfo.id;

  let coinbase: EthAddress;
  let feeRecipient: AztecAddress;
  let version: number;
  let validators: Secp256k1Signer[];
  let committee: EthAddress[] | undefined;
  let proposer: EthAddress | undefined;

  let dateProvider: TestDateProvider;
  let ethCheatCodes: EthCheatCodesWithState;
  let rollupCheatCodes: RollupCheatCodes;
  let worldStateSynchronizer: ServerWorldStateSynchronizer;
  let epochCache: EpochCache;

  let rpcUrl: string;
  let anvil: Anvil;
  const getSignatureContext = () => ({
    chainId,
    rollupAddress: l1ContractAddresses.rollupAddress,
  });
  const makeCheckpointAttestationForCurrentContext = (checkpoint: Checkpoint, signer: Secp256k1Signer) => {
    const signatureContext = getSignatureContext();
    const payload = ConsensusPayload.fromCheckpoint(checkpoint, signatureContext);
    const attestationDigest = getHashedSignaturePayloadTypedData(payload);
    const proposal = new CheckpointProposal(
      checkpoint.header,
      checkpoint.archive.root,
      checkpoint.feeAssetPriceModifier,
      Signature.empty(),
      signatureContext,
    );
    const proposalDigest = getHashedSignaturePayloadTypedData(proposal);
    return new P2PCheckpointAttestation(payload, signer.sign(attestationDigest), signer.sign(proposalDigest));
  };
  const signAttestationsAndSigners = (
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    signer: Secp256k1Signer,
  ) => signer.sign(getHashedSignaturePayloadTypedData(attestationsAndSigners));

  const progressTimeBySlot = async (slotsToJump = 1) => {
    const currentTime = (await l1Client.getBlock()).timestamp;
    const currentSlot = await rollup.getSlotNumber();
    const targetSlot = SlotNumber(currentSlot + slotsToJump);
    const timestamp = await rollup.getTimestampForSlot(targetSlot);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp), { resetBlockInterval: true });
    }
  };

  // Warp the chain forward so that the current L2 slot matches `targetSlot`, and resync the
  // dateProvider so `epochCache.getSlotNow()` (used by the bundle-level eth_simulateV1 and the
  // L1 tx mine timestamp) also lands on `targetSlot`. The rollup contract rejects header slots
  // that don't match block.timestamp, so the test must align both the chain and the date
  // provider to the header's slot before calling sendRequests.
  const progressToSlot = async (targetSlot: bigint) => {
    const currentSlot = await rollup.getSlotNumber();
    if (BigInt(targetSlot) > BigInt(currentSlot)) {
      await progressTimeBySlot(Number(BigInt(targetSlot) - BigInt(currentSlot)));
    }
    // Always resync the dateProvider so `epochCache.getSlotNow()` matches L1's block.timestamp.
    // `sendRequests` derives its bundle-simulate timestamp from `getCurrentL2Slot()`, so if the
    // dateProvider lags the chain the simulate runs at a stale slot and the rollup rejects the
    // header with `HeaderLib__InvalidSlotNumber`.
    await ethCheatCodes.syncDateProvider();
  };

  const getPipelinedProposalSlot = () =>
    rollup.getSlotAt(
      getNextL1SlotTimestamp(dateProvider.nowInSeconds(), l1Constants) + BigInt(config.aztecSlotDuration),
    );

  let port = 8545; // We increase the port for each test to avoid anvil conflicts
  const setup = async (deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = {}) => {
    ({ rpcUrl, anvil } = await startAnvil({ port: port++ }));
    config.l1RpcUrls = [rpcUrl];

    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, l1Client } = await deployAztecL1Contracts(rpcUrl, deployerPK, foundry.id, {
      ...getL1ContractsConfigEnvVars(),
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
      genesisArchiveRoot: deployL1ContractsArgs.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
      aztecTargetCommitteeSize: 0,
      slasherEnabled: false,
      ...deployL1ContractsArgs,
    }));

    dateProvider = new TestDateProvider();
    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls, dateProvider);

    rollupAddress = getAddress(l1ContractAddresses.rollupAddress.toString());

    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);

    // Set up contract instances
    rollup = new RollupContract(l1Client, l1ContractAddresses.rollupAddress);

    l1Constants = {
      ...(await rollup.getRollupConstants()),
      ethereumSlotDuration: config.ethereumSlotDuration,
    };

    builderDb = await NativeWorldStateService.tmp();
    blocks = [];
    // World-state derives block 0's hash from its initial header (which depends on prefilled state and
    // genesisTimestamp), not from the static GENESIS_BLOCK_HEADER_HASH constant. The mock must report the
    // same hash so L2BlockStream's reorg-search at genesis sees matching local/source hashes.
    const initialHeader = builderDb.getInitialHeader();
    const initialHeaderHash = (await initialHeader.hash()).toString();
    const genesisArchiveSnapshot = new AppendOnlyTreeSnapshot(
      deployL1ContractsArgs.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
      1,
    );
    const genesisBlock = new L2Block(
      genesisArchiveSnapshot,
      initialHeader,
      Body.empty(),
      CheckpointNumber.ZERO,
      IndexWithinCheckpoint(0),
    );
    const genesisBlockData: BlockData = {
      header: initialHeader,
      archive: genesisArchiveSnapshot,
      blockHash: await initialHeader.hash(),
      checkpointNumber: CheckpointNumber.ZERO,
      indexWithinCheckpoint: IndexWithinCheckpoint(0),
    };
    // Seed the genesis sentinel bucket (seq 0, no messages) so the world-state synchronizer can resolve a
    // totalMsgCount of 0 to a bucket when reconstructing the first block's message bundle.
    messageSource = new MockL1ToL2MessageSource(0);
    messageSource.setInboxBucket(
      {
        seq: 0n,
        inboxRollingHash: Fr.ZERO,
        totalMsgCount: 0n,
        timestamp: 0n,
        msgCount: 0,
        lastMessageIndex: 0n,
        l1BlockNumber: 0n,
        l1BlockHash: Buffer32.ZERO,
      },
      [],
    );
    blockSource = mock<ArchiverDataSource>({
      getBlocks(query: BlocksQuery) {
        if (!('from' in query)) {
          return Promise.resolve([]);
        }
        return Promise.resolve(blocks.slice(query.from - 1, query.from - 1 + query.limit));
      },
      getBlock(query: BlockQuery) {
        if ('number' in query && Number(query.number) === 0) {
          return Promise.resolve(genesisBlock);
        }
        return Promise.resolve(undefined);
      },
      async getBlockData(query: BlockQuery) {
        if ('number' in query && Number(query.number) === 0) {
          return genesisBlockData;
        }
        // The block stream's reorg-detection walk asks the source for the hash of blocks the world state
        // already holds (via header.hash()) before extending past them, so serve every block we've built
        // -- not just genesis. Otherwise syncing past block 1 aborts with "Source has no data for a block
        // at or below its proposed tip", which blocks proposing a third consecutive checkpoint.
        const block = 'number' in query ? blocks.find(b => Number(b.number) === Number(query.number)) : undefined;
        if (!block) {
          return undefined;
        }
        return {
          header: block.header,
          archive: block.archive,
          blockHash: await block.header.hash(),
          checkpointNumber: CheckpointNumber.fromBlockNumber(block.number),
          indexWithinCheckpoint: IndexWithinCheckpoint(0),
        };
      },
      async getCheckpoints(query: CheckpointsQuery) {
        // Test uses 1-block-per-checkpoint, so we find block by checkpoint number
        const from = 'from' in query ? query.from : undefined;
        const block = from !== undefined ? blocks.find(b => Number(b.number) === Number(from)) : undefined;
        if (!block) {
          return Promise.resolve([]);
        }
        const checkpoint = new Checkpoint(
          block.archive,
          CheckpointHeader.random({ lastArchiveRoot: block.header.lastArchive.root }),
          [block],
          from!,
        );
        return [
          new PublishedCheckpoint(
            checkpoint,
            new L1PublishedData(BigInt(block.number), BigInt(block.number), (await block.hash()).toString()),
            [],
          ),
        ];
      },
      async getL2Tips(): Promise<L2Tips> {
        const latestBlock = blocks.at(-1);
        const blockId = latestBlock
          ? { number: latestBlock.number, hash: (await latestBlock.hash()).toString() }
          : { number: BlockNumber.ZERO, hash: initialHeaderHash };
        // Test uses 1-block-per-checkpoint, so checkpoint number equals block number
        const tipId = {
          block: blockId,
          checkpoint: { number: CheckpointNumber.fromBlockNumber(blockId.number), hash: blockId.hash },
        };

        return {
          proposed: blockId,
          checkpointed: tipId,
          proven: tipId,
          finalized: tipId,
        };
      },
      getBlockNumber(): Promise<BlockNumber> {
        return Promise.resolve(BlockNumber(blocks.at(-1)?.number ?? BlockNumber.ZERO));
      },
      // Streaming L1->L2 message reconstruction: the world-state synchronizer resolves each
      // block's consumed message bundle from the Inbox buckets registered per published block in buildAndPublishBlock.
      getInboxBucketByTotalMsgCount(totalMsgCount: bigint) {
        return messageSource.getInboxBucketByTotalMsgCount(totalMsgCount);
      },
      getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint) {
        return messageSource.getL1ToL2MessagesBetweenBuckets(fromExclusive, toInclusive);
      },
    });

    const worldStateConfig: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 10000,
      worldStateDbMapSizeKb: 10 * 1024 * 1024,
      worldStateCheckpointHistory: 0,
    };
    worldStateSynchronizer = new ServerWorldStateSynchronizer(builderDb, blockSource, worldStateConfig);
    await worldStateSynchronizer.start();

    const sequencerL1Client = createExtendedL1Client(config.l1RpcUrls, sequencerPK, foundry);
    const l1TxUtils = createL1TxUtils(
      sequencerL1Client,
      { logger, dateProvider, kzg: Blob.getViemKzgInstance() },
      config,
    );
    const rollupContract = new RollupContract(sequencerL1Client, l1ContractAddresses.rollupAddress.toString());
    const slashingProposerContract = await rollupContract.getSlashingProposer();
    governanceProposerContract = new GovernanceProposerContract(
      sequencerL1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );
    epochCache = await EpochCache.create(l1ContractAddresses.rollupAddress, config, { dateProvider });
    const blobClient = createBlobClient();
    const sequencerPublisherMetrics: MockProxy<SequencerPublisherMetrics> = mock<SequencerPublisherMetrics>();

    publisher = new SequencerPublisher(
      {
        l1ChainId: chainId,
        ethereumSlotDuration: config.ethereumSlotDuration,
        aztecSlotDuration: config.aztecSlotDuration,
        sequencerPublisherPreviousL1BlockWaitTimeoutMs: config.sequencerPublisherPreviousL1BlockWaitTimeoutMs,
        sequencerPublisherPreviousL1BlockWaitPollIntervalMs: config.sequencerPublisherPreviousL1BlockWaitPollIntervalMs,
      },
      {
        blobClient,
        l1TxUtils,
        rollupContract,
        epochCache,
        governanceProposerContract,
        slashingProposerContract,
        dateProvider,
        metrics: sequencerPublisherMetrics,
        lastActions: {},
      },
    );

    coinbase = config.coinbase || EthAddress.random();
    feeRecipient = config.feeRecipient || (await AztecAddress.random());
    version = Number(await rollup.getVersion());

    const fork = await worldStateSynchronizer.fork();

    prevHeader = fork.getInitialHeader();
    await fork.close();

    const ts = (await l1Client.getBlock()).timestamp;
    minFee = new GasFees(0, await rollup.getManaMinFeeAt(ts, true));

    // We jump two epochs such that the committee can be setup.
    await rollupCheatCodes.advanceToEpoch(EpochNumber(config.lagInEpochsForValidatorSet + 1));
    await rollupCheatCodes.setupEpoch();

    ({ committee } = await epochCache.getCommittee());
    const { currentSlot } = epochCache.getCurrentAndNextSlot();
    proposer = await epochCache.getProposerAttesterAddressInSlot(currentSlot);
    logger.warn(`Current epoch committee and proposer`, { committee, proposer });
  };

  afterEach(async () => {
    await tryStop(anvil);
    await tryStop(worldStateSynchronizer);
  });

  const makeProcessedTx = (seed = 0x1): Promise<ProcessedTx> =>
    mockProcessedTx({
      anchorBlockHeader: prevHeader,
      chainId: fr(chainId),
      version: fr(version),
      vkTreeRoot: getVKTreeRoot(),
      gasSettings: GasSettings.fallback({
        gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
        maxFeesPerGas: minFee,
      }),
      protocolContracts: ProtocolContractsList,
      seed,
    });

  const sendToL2 = (content: Fr, recipient: AztecAddress): Promise<Fr> =>
    sendL1ToL2Message({ content, secretHash: Fr.ZERO, recipient }, { l1Client, l1ContractAddresses }).then(
      ({ msgHash }) => msgHash,
    );

  /**
   * Build a checkpoint with a single block using the LightweightCheckpointBuilder.
   * This properly computes all checkpoint header fields (blobsHash, blockHeadersHash, inboxRollingHash,
   * epochOutHash, etc.). `previousInboxRollingHash` is the previous checkpoint's rolling hash (zero at genesis), so
   * the header's `inboxRollingHash` continues the on-chain Inbox chain over `l1ToL2Messages`.
   */
  const buildCheckpoint = async (
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[] = [],
    previousInboxRollingHash: Fr = Fr.ZERO,
  ): Promise<Checkpoint> => {
    await worldStateSynchronizer.syncImmediate();
    const tempFork = await worldStateSynchronizer.fork(BlockNumber(globalVariables.blockNumber - 1));

    const checkpointConstants: CheckpointGlobalVariables = {
      chainId: globalVariables.chainId,
      version: globalVariables.version,
      slotNumber: globalVariables.slotNumber,
      timestamp: globalVariables.timestamp,
      coinbase: globalVariables.coinbase,
      feeRecipient: globalVariables.feeRecipient,
      gasFees: globalVariables.gasFees,
    };

    // Test uses 1-block-per-checkpoint
    const checkpointNumber = CheckpointNumber.fromBlockNumber(globalVariables.blockNumber);
    const builder = LightweightCheckpointBuilder.startNewCheckpoint(
      checkpointNumber,
      checkpointConstants,
      previousCheckpointOutHashes,
      previousInboxRollingHash,
      tempFork,
    );

    await builder.applyEffectsAndSealBlock(globalVariables, txs, l1ToL2Messages);
    const checkpoint = await builder.completeCheckpoint();

    await tempFork.close();
    return checkpoint;
  };

  const buildSingleCheckpoint = async (
    opts: { l1ToL2Messages?: Fr[]; blockNumber?: BlockNumber; slot?: SlotNumber } = {},
  ) => {
    // By default a single checkpoint consumes no Inbox messages (bucketHint 0 against the genesis bucket).
    const l1ToL2Messages = opts.l1ToL2Messages ?? [];

    const txs = await Promise.all([makeProcessedTx(0x1000), makeProcessedTx(0x2000)]);
    const ts = (await l1Client.getBlock()).timestamp;
    const slot = opts.slot ?? (await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration)));
    const timestamp = await rollup.getTimestampForSlot(slot);
    const globalVariables = new GlobalVariables(
      new Fr(chainId),
      new Fr(version),
      opts.blockNumber ?? BlockNumber(1),
      slot,
      timestamp,
      coinbase,
      feeRecipient,
      new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true)),
    );
    const checkpoint = await buildCheckpoint(globalVariables, txs, l1ToL2Messages);
    return { checkpoint, l1ToL2Messages };
  };

  const buildSingleCheckpointForPipelinedProposer = async (
    opts: { l1ToL2Messages?: Fr[]; blockNumber?: BlockNumber } = {},
  ) => {
    const slot = await getPipelinedProposalSlot();
    proposer = await epochCache.getProposerAttesterAddressInSlot(slot);
    return buildSingleCheckpoint({ ...opts, slot });
  };

  describe('block building', () => {
    beforeEach(async () => {
      // This suite proposes consecutive checkpoints, each consuming the streaming-Inbox messages sent while it was
      // being built, so real messages are genuinely consumed and validated on L1.
      await setup();
    });

    const buildAndPublishBlock = async (numTxs: number, jsonFileNamePrefix: string) => {
      const archiveInRollup_ = await rollup.archive();
      expect(hexToBuffer(archiveInRollup_.toString())).toEqual(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer());

      const l1BlockNumber = await l1Client.getBlockNumber();

      // random recipient address, just kept consistent for easy testing ts/sol.
      const recipientAddress = AztecAddress.fromStringUnsafe(
        '0x1647b194c649f5dd01d7c832f89b0f496043c9150797923ea89e93d5ac619a93',
      );

      // Streaming Inbox consumption: the L1 Rollup only lets a checkpoint consume Inbox buckets
      // that have aged past the censorship cutoff (the build frame start, `toTimestamp(slot - 1)` minus one L1 slot),
      // measured in L1 time, not whole checkpoints. Each checkpoint mirrors the real Inbox buckets into messageSource,
      // then reuses the production `selectInboxBucketForBlock` (which mirrors `ProposeLib.validateInboxConsumption`) to
      // pick exactly the buckets it must consume, deriving the consumed bundle, the propose bucket hint, and the header
      // rolling hash from that one selection so header, world state, and L1 agree by construction.
      const inbox = new InboxContract(l1Client, l1ContractAddresses.inboxAddress);
      // Every message sent to the Inbox, in insertion order, so each bucket's leaves can be mirrored into messageSource.
      const allSentMessages: Fr[] = [];
      let mirroredThroughSeq = 0n;
      let mirroredThroughTotal = 0n;
      // The last Inbox bucket this checkpoint chain has consumed through; genesis sentinel to start.
      let parent = { seq: 0n, totalMsgCount: 0n };
      let previousInboxRollingHash = Fr.ZERO;
      const blobFieldsPerCheckpoint: Fr[][] = [];
      // The below batched blob is used for testing different epochs with 1..numberOfConsecutiveBlocks blocks on L1.
      // For real usage, always collect ALL epoch blobs first then call .batch().
      let currentBatch: BatchedBlob | undefined;

      for (let i = 0; i < numberOfConsecutiveBlocks; i++) {
        // With just one l1 client (serial sending) this takes too much time to send MAX_L1_TO_L2_MSGS_PER_CHECKPOINT
        // and causes a chain prune
        const l1ToL2Content = range(Math.min(16, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT), 128 * i + 1 + 0x400).map(fr);

        // Uncached: viem caches getBlockNumber for its polling interval, and a stale head here would leave the
        // MessageSent query below short of the blocks the sends land in.
        const l1BlockBeforeSending = await l1Client.getBlockNumber({ cacheTime: 0 });
        const sentThisCheckpoint: Fr[] = [];
        for (let j = 0; j < l1ToL2Content.length; j++) {
          sentThisCheckpoint.push(await sendToL2(l1ToL2Content[j], recipientAddress));
        }
        allSentMessages.push(...sentThisCheckpoint);

        // Mirror the Inbox's new buckets (seq, timestamp, rolling hash, totals) and their leaves into messageSource,
        // so the selector, the world-state synchronizer, and L1 all read the same bucket state.
        const currentBucketSeq = await inbox.getCurrentBucketSeq();
        // The MessageSent log of a bucket's first message names the L1 block the bucket was opened in, which is
        // what the archiver records for it.
        const openingLogs = new Map<bigint, MessageSentLog>();
        const l1BlockAfterSending = await l1Client.getBlockNumber({ cacheTime: 0 });
        for (const log of await inbox.getMessageSentEvents(l1BlockBeforeSending, l1BlockAfterSending)) {
          if (!openingLogs.has(log.args.bucketSeq)) {
            openingLogs.set(log.args.bucketSeq, log);
          }
        }
        for (let seq = mirroredThroughSeq + 1n; seq <= currentBucketSeq; seq++) {
          const bucket = await inbox.getBucket(seq);
          const openingLog = openingLogs.get(seq);
          if (openingLog === undefined) {
            throw new Error(`No MessageSent log found for inbox bucket ${seq}`);
          }
          const bucketMessages = allSentMessages.slice(Number(mirroredThroughTotal), Number(bucket.totalMsgCount));
          messageSource.setInboxBucket(
            {
              seq,
              inboxRollingHash: bucket.rollingHash,
              totalMsgCount: bucket.totalMsgCount,
              timestamp: bucket.timestamp,
              msgCount: Number(bucket.msgCount),
              lastMessageIndex: bucket.totalMsgCount - 1n,
              l1BlockNumber: openingLog.l1BlockNumber,
              l1BlockHash: openingLog.l1BlockHash,
            },
            bucketMessages,
          );
          mirroredThroughTotal = bucket.totalMsgCount;
        }
        mirroredThroughSeq = currentBucketSeq;

        // Ensure that each transaction has unique (non-intersecting nullifier values)
        const totalNullifiersPerBlock = 4 * MAX_NULLIFIERS_PER_TX;
        const txs = await timesParallel(numTxs, txIndex =>
          makeProcessedTx(totalNullifiersPerBlock * i + MAX_NULLIFIERS_PER_TX * (txIndex + 1)),
        );

        const ts = (await l1Client.getBlock()).timestamp;
        const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
        const timestamp = await rollup.getTimestampForSlot(slot);

        const globalVariables = new GlobalVariables(
          new Fr(chainId),
          new Fr(version),
          BlockNumber(i + 1), // block number
          slot,
          timestamp,
          coinbase,
          feeRecipient,
          new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true)),
        );

        // Reuse the production streaming selector to pick the buckets this single-block (hence last-block) checkpoint
        // must consume, then derive the consumed bundle, the propose bucket hint, and the rolling-hash cursor from
        // that one selection so the header, world state, and L1 all agree.
        const previousSlotStart = await rollup.getTimestampForSlot(SlotNumber(slot - 1));
        const cutoffTimestamp = previousSlotStart - BigInt(config.ethereumSlotDuration);
        const selection = await selectInboxBucketForBlock({
          messageSource,
          // Anvil mines on demand, so a bucket's opening L1 block gains a descendant only when the next transaction
          // is sent; the harness consumes every bucket it has, anchored at the cutoff so each block's expected
          // message set stays pinned to the slot it belongs to.
          now: cutoffTimestamp,
          isEligible: immediateEligibility,
          ethereumSlotDuration: config.ethereumSlotDuration,
          parent,
          checkpointStartTotalMsgCount: parent.totalMsgCount,
          perBlockCap: MAX_L1_TO_L2_MSGS_PER_BLOCK,
          perCheckpointCap: MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
          isLastBlock: true,
          cutoffTimestamp,
        });
        const currentL1ToL2Messages = selection.consume ? selection.bundle : [];
        const bucketHint = selection.consume ? selection.bucket.seq : parent.seq;

        const checkpoint = await buildCheckpoint(
          globalVariables,
          txs,
          currentL1ToL2Messages,
          [],
          previousInboxRollingHash,
        );
        previousInboxRollingHash = checkpoint.header.inboxRollingHash;
        const block = checkpoint.blocks[0];
        if (selection.consume) {
          parent = { seq: selection.bucket.seq, totalMsgCount: selection.bucket.totalMsgCount };
        }

        const totalManaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.billedGas.l2Gas)), Fr.ZERO);
        expect(totalManaUsed.toBigInt()).toEqual(block.header.totalManaUsed.toBigInt());

        prevHeader = block.header;

        const checkpointBlobFields = checkpoint.toBlobFields();
        const blockBlobs = await getBlobsPerL1Block(checkpointBlobFields);

        let prevBlobAccumulatorHash = (await rollup.getCurrentBlobCommitmentsHash()).toBuffer();

        blocks.push(block);
        blobFieldsPerCheckpoint.push(checkpointBlobFields);

        // Batch the blobs so far, so they can be used in the L1 unit tests:
        currentBatch = await BatchedBlobAccumulator.batch(blobFieldsPerCheckpoint);

        await writeJson(
          `${jsonFileNamePrefix}_${block.number}`,
          checkpoint.header,
          block,
          l1ToL2Content,
          blockBlobs,
          currentBatch,
          recipientAddress,
          deployerAccount.address,
        );

        await publisher.enqueueProposeCheckpoint(
          checkpoint,
          CommitteeAttestationsAndSigners.empty(getSignatureContext()),
          Signature.empty(),
          bucketHint,
        );
        // Align chain time so the bundle simulate and the L1 send both run at the header's slot.
        await progressToSlot(BigInt(checkpoint.header.slotNumber));
        await publisher.sendRequests();

        const logs = await l1Client.getLogs({
          address: rollupAddress,
          event: getAbiItem({
            abi: RollupAbi,
            name: 'CheckpointProposed',
          }),
          fromBlock: l1BlockNumber + 1n,
        });
        expect(logs).toHaveLength(i + 1);
        expect(logs[i].args.checkpointNumber).toEqual(BigInt(i + 1));
        const thisCheckpointNumber = checkpoint.number;
        const prevCheckpointNumber = CheckpointNumber(thisCheckpointNumber - 1);
        const isFirstCheckpointOfEpoch =
          thisCheckpointNumber == CheckpointNumber(1) ||
          (await rollup.getEpochNumberForCheckpoint(thisCheckpointNumber)) >
            (await rollup.getEpochNumberForCheckpoint(prevCheckpointNumber));
        // If we are at the first blob of the epoch, we must initialize the hash:
        prevBlobAccumulatorHash = isFirstCheckpointOfEpoch ? Buffer.alloc(0) : prevBlobAccumulatorHash;
        const currentBlobAccumulatorHash = (await rollup.getCurrentBlobCommitmentsHash()).toBuffer();
        let expectedBlobAccumulatorHash = prevBlobAccumulatorHash;
        blockBlobs
          .map(b => b.commitment)
          .forEach(c => {
            expectedBlobAccumulatorHash = sha256ToField([expectedBlobAccumulatorHash, c]).toBuffer();
          });
        expect(currentBlobAccumulatorHash).toEqual(expectedBlobAccumulatorHash);

        const ethTx = await l1Client.getTransaction({
          hash: logs[i].transactionHash!,
        });
        const expectedRollupData = encodeFunctionData({
          abi: RollupAbi,
          functionName: 'propose',
          args: [
            {
              header: checkpoint.header.toViem(),
              archive: `0x${block.archive.root.toBuffer().toString('hex')}`,
              oracleInput: {
                feeAssetPriceModifier: 0n,
              },
              bucketHint,
            },
            CommitteeAttestationsAndSigners.packAttestations([]),
            [],
            Signature.empty().toViemSignature(),
            getPrefixedEthBlobCommitments(blockBlobs),
          ],
        });
        const expectedData = encodeFunctionData({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          args: [
            [
              {
                target: rollupAddress,
                callData: expectedRollupData,
                allowFailure: true,
              },
            ],
          ],
        });
        expect(ethTx.input).toEqual(expectedData);

        // Make sure that time have progressed to the next slot!
        await progressTimeBySlot();
      }
    };

    it.each([
      [0, 'empty_checkpoint'],
      [1, 'single_tx_checkpoint'],
      [4, 'mixed_checkpoint'],
    ])(
      `builds ${numberOfConsecutiveBlocks} blocks of %i bloated txs building on each other`,
      async (numTxs: number, jsonFileNamePrefix: string) => {
        await buildAndPublishBlock(numTxs, jsonFileNamePrefix);
      },
    );
  });

  describe('with attestations', () => {
    beforeEach(async () => {
      validators = [new Secp256k1Signer(Buffer32.fromString(sequencerPK)), ...times(2, Secp256k1Signer.random)];
      await setup({
        aztecTargetCommitteeSize: 3,
        initialValidators: validators
          .map(v => v.address)
          .map(address => ({
            attester: address,
            withdrawer: address,
            bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
          })),
      });
    });

    const expectPublishCheckpoint = async (
      checkpoint: Checkpoint,
      attestations: CommitteeAttestation[],
      signature: Signature,
    ) => {
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        new CommitteeAttestationsAndSigners(attestations, getSignatureContext()),
        signature,
        0n,
      );
      // Align chain time so the bundle simulate and the L1 send both run at the header's slot.
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual([]);
    };

    it('publishes a block with attestations', async () => {
      const { checkpoint } = await buildSingleCheckpointForPipelinedProposer();
      const block = checkpoint.blocks[0];

      const checkpointAttestations = validators.map(v => makeCheckpointAttestationForCurrentContext(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAt(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateCheckpointHeader(checkpoint.header);

      const proposerSigner = validators.find(v => v.address.equals(proposer!));

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations, getSignatureContext());
      const attestationsAndSignersSignature = signAttestationsAndSigners(attestationsAndSigners, proposerSigner!);

      await expectPublishCheckpoint(checkpoint, attestations, attestationsAndSignersSignature);
    });

    it('fails to publish a block without the proposer attestation', async () => {
      const { checkpoint } = await buildSingleCheckpointForPipelinedProposer();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationForCurrentContext(checkpoint, v));

      // Reverse attestations to break proposer attestation
      const attestations = orderAttestations(checkpointAttestations, committee!).reverse();
      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations, getSignatureContext());

      const canPropose = await publisher.canProposeAt(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateCheckpointHeader(checkpoint.header);

      // Enqueue no longer simulates — the bundle simulate at send time drops the failing propose
      // and sendRequests returns undefined (no surviving actions). The drop is reported via a
      // warn log carrying the on-chain revert reason (raw hex selector since the propose request
      // has no ABI attached).
      const loggerWarnSpy = jest.spyOn((publisher as any).log, 'warn');
      await publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, Signature.empty(), 0n);
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result).toBeUndefined();
      // 0xca8d5954 == ValidatorSelection__InvalidCommitteeCommitment selector
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Bundle entry dropped: action reverted in sim',
        expect.objectContaining({
          action: 'propose',
          returnData: expect.stringMatching(/^0xca8d5954/),
        }),
      );
    });

    it('rejects flipped proposer signature', async () => {
      const { checkpoint } = await buildSingleCheckpointForPipelinedProposer();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationForCurrentContext(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAt(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateCheckpointHeader(checkpoint.header);

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations, getSignatureContext());
      const attestationsAndSignersSignature = signAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      // Enqueue no longer simulates — the bundle simulate at send time drops the failing propose
      // and sendRequests returns undefined.
      const loggerWarnSpy = jest.spyOn((publisher as any).log, 'warn');
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        attestationsAndSigners,
        flipSignature(attestationsAndSignersSignature),
        0n,
      );
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result).toBeUndefined();
      // 0xd78bce0c == ECDSAInvalidSignatureS selector
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Bundle entry dropped: action reverted in sim',
        expect.objectContaining({
          action: 'propose',
          returnData: expect.stringMatching(/^0xd78bce0c/),
        }),
      );
    });

    it('rejects signature with invalid recovery value', async () => {
      const { checkpoint } = await buildSingleCheckpointForPipelinedProposer();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationForCurrentContext(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAt(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateCheckpointHeader(checkpoint.header);

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations, getSignatureContext());
      const attestationsAndSignersSignature = signAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      logger.warn(`Original v value: ${attestationsAndSignersSignature.v}`);

      // Move v-value from 27-28 to 0-1
      const wrongV = attestationsAndSignersSignature.v - 27;
      const wrongSig = new Signature(attestationsAndSignersSignature.r, attestationsAndSignersSignature.s, wrongV);

      // Enqueue no longer simulates — the bundle simulate at send time drops the failing propose
      // and sendRequests returns undefined.
      const loggerWarnSpy = jest.spyOn((publisher as any).log, 'warn');
      await publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, wrongSig, 0n);
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result).toBeUndefined();
      // 0xf645eedf == ECDSAInvalidSignature selector
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Bundle entry dropped: action reverted in sim',
        expect.objectContaining({
          action: 'propose',
          returnData: expect.stringMatching(/^0xf645eedf/),
        }),
      );
    });

    it('publishes a block invalidating the previous one', async () => {
      const { checkpoint: badCheckpoint } = await buildSingleCheckpointForPipelinedProposer();
      const badBlock = badCheckpoint.blocks[0];

      // Publish the first invalid block
      const badCheckpointAttestations = validators
        .filter(v => v.address.equals(proposer!))
        .map(v => makeCheckpointAttestationForCurrentContext(badCheckpoint, v));
      const badAttestations = orderAttestations(badCheckpointAttestations, committee!);

      const badAttestationsAndSigners = new CommitteeAttestationsAndSigners(badAttestations, getSignatureContext());
      const badAttestationsAndSignersSignature = signAttestationsAndSigners(
        badAttestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      await expectPublishCheckpoint(badCheckpoint, badAttestations, badAttestationsAndSignersSignature);
      await progressTimeBySlot();

      logger.warn(`Published bad block ${badBlock.number} with archive root ${badBlock.archive.root}`);

      // Prepare for invalidating the previous one and publish the same block with proper attestations
      const { checkpoint } = await buildSingleCheckpointForPipelinedProposer({ blockNumber: BlockNumber(1) });
      const block = checkpoint.blocks[0];
      expect(block.number).toEqual(badBlock.number);
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationForCurrentContext(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      // Check we can invalidate the checkpoint
      logger.warn('Checking simulate invalidate checkpoint');
      const invalidateRequest = await publisher.simulateInvalidateCheckpoint({
        valid: false,
        committee: committee!,
        checkpoint: checkpoint.toCheckpointInfo(),
        attestors: [],
        attestations: badAttestations,
        verbatimAttestations: CommitteeAttestationsAndSigners.packAttestations(badAttestations),
        epoch: EpochNumber(1),
        seed: 1n,
        reason: 'insufficient-attestations',
      });
      expect(invalidateRequest).toBeDefined();
      const forcePendingCheckpointNumber = invalidateRequest?.forcePendingCheckpointNumber;
      expect(forcePendingCheckpointNumber).toEqual(0);
      const invalidationSimulationOverridesPlan = new SimulationOverridesBuilder()
        .withChainTips({ pending: forcePendingCheckpointNumber ?? CheckpointNumber.ZERO })
        .build();

      // We cannot propose directly, we need to assume the previous checkpoint is invalidated
      const genesis = new Fr(GENESIS_ARCHIVE_ROOT);
      logger.warn(`Checking can propose at next eth block on top of genesis ${genesis}`);
      expect(await publisher.canProposeAt(genesis, proposer!)).toBeUndefined();
      const canPropose = await publisher.canProposeAt(genesis, proposer!, invalidationSimulationOverridesPlan);
      expect(canPropose?.slot).toEqual(block.header.getSlot());

      // Same for validation
      logger.warn('Checking validate checkpoint header');
      await expect(publisher.validateCheckpointHeader(checkpoint.header)).rejects.toThrow(/Rollup__InvalidArchive/);
      await publisher.validateCheckpointHeader(checkpoint.header, invalidationSimulationOverridesPlan);

      // At this point I'm gonna need to propose the correct signature ye? So confused actually here.
      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations, getSignatureContext());
      const attestationsAndSignersSignature = signAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      // Invalidate and propose
      logger.warn('Enqueuing requests to invalidate and propose the checkpoint');
      publisher.enqueueInvalidateCheckpoint(invalidateRequest);
      await publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, attestationsAndSignersSignature, 0n);
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result!.successfulActions).toEqual(['invalidate-by-insufficient-attestations', 'propose']);
      expect(result!.failedActions).toEqual([]);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await setup();
    });

    it(`succeeds proposing new block when vote fails`, async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];

      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        CommitteeAttestationsAndSigners.empty(getSignatureContext()),
        Signature.empty(),
        0n,
      );
      await publisher.enqueueGovernanceCastSignal(
        l1ContractAddresses.rollupAddress,
        block.slot,
        EthAddress.random(),
        (_payload: any) => Promise.resolve(Signature.random().toString()),
      );

      const result = await publisher.sendRequests();

      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual(['governance-signal']);
    });

    it(`shows propose custom errors if tx simulation fails`, async () => {
      // Set up different l1-to-l2 messages than the ones on the inbox, so the checkpoint's inboxRollingHash does not
      // match the referenced Inbox bucket and the submission reverts at the streaming-consumption check.
      const l1ToL2Messages = new Array(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT).fill(new Fr(1n));
      const { checkpoint } = await buildSingleCheckpoint({ l1ToL2Messages });

      // Enqueue no longer simulates per action — the bundle simulate at send time drops the
      // failing propose and reports the on-chain revert reason via a warn log.
      const loggerWarnSpy = jest.spyOn((publisher as any).log, 'warn');
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        CommitteeAttestationsAndSigners.empty(getSignatureContext()),
        Signature.empty(),
        0n,
      );
      await progressToSlot(BigInt(checkpoint.header.slotNumber));
      const result = await publisher.sendRequests();
      expect(result).toBeUndefined();
      // 0xed1f7bb5 == Rollup__InvalidInboxRollingHash selector
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Bundle entry dropped: action reverted in sim',
        expect.objectContaining({
          action: 'propose',
          returnData: expect.stringMatching(/^0xed1f7bb5/),
        }),
      );
    });
  });

  describe('timeouts', () => {
    let initialL2Slot: bigint;
    let sendRequestsResult: Awaited<ReturnType<SequencerPublisher['sendRequests']>> | null;

    beforeEach(async () => {
      sendRequestsResult = null;

      await setup({ aztecSlotDuration: 48 });

      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setBlockInterval(config.ethereumSlotDuration);
      initialL2Slot = BigInt(await rollup.getSlotNumber());
    });

    const getProposeTxTimeoutAt = (checkpoint: Checkpoint) => {
      const { slotDuration: aztecSlotDuration } = l1Constants;
      const txTimeoutAt = new Date(
        (Number(getSlotStartBuildTimestamp(checkpoint.slot, l1Constants)) + Number(aztecSlotDuration)) * 1000,
      );
      logger.warn(`Setting tx timeout at ${txTimeoutAt.toISOString()} (${txTimeoutAt.getTime()})`);
      return txTimeoutAt;
    };

    const sendRequests = async () => {
      void publisher
        .sendRequests()
        .then(r => (sendRequestsResult = r ?? null))
        .catch(err => {
          sendRequestsResult = null;
          return err;
        });

      // Wait until the publish tx is sent
      await retryUntil(() => ethCheatCodes.getTxPoolStatus().then(s => s.pending > 0), 'tx sent', 20, 0.1);
    };

    const enqueueProposeL2Checkpoint = async (checkpoint: Checkpoint) => {
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        CommitteeAttestationsAndSigners.empty(getSignatureContext()),
        Signature.empty(),
        0n,
        { txTimeoutAt: getProposeTxTimeoutAt(checkpoint) },
      );
    };

    it(`cancels block proposal when the L2 slot ends`, async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      await enqueueProposeL2Checkpoint(checkpoint);
      await sendRequests();

      // Advance one L1 block at a time without mining the publish tx.
      // While we are on the same L2 slot, sendRequests should not resolve.
      while (true) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
        const currentL2Slot = await rollup.getSlotNumber();
        const { slot: nextL2Slot } = epochCache.getEpochAndSlotInNextL1Slot();
        logger.warn(`L2 slot in next L1 slot is ${nextL2Slot}`, { nextL2Slot, currentL2Slot, initialL2Slot });

        // Make sure we give enough time to the l1 tx utils to process
        await sleep(1000);

        if (nextL2Slot > initialL2Slot) {
          expect(sendRequestsResult).toBeNull();
          break;
        }
      }

      // The publisher should now be in cancelled state
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.CANCELLED, 'state is cancelled', 3, 0.1);

      // Now allow the cancellation to be mined, check that we transition to MINED, and the last tx was indeed a cancellation.
      await ethCheatCodes.mine();
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'state is mined', 2, 0.1);
      const lastBlock = await l1Client.getBlock({ includeTransactions: true });
      const cancelTx = lastBlock.transactions.at(-1);
      expect(cancelTx).toBeDefined();
      expect(cancelTx?.input).toEqual('0x');
      expect(cancelTx?.value).toEqual(0n);
      const cancelTxReceipt = await l1Client.getTransactionReceipt({ hash: cancelTx!.hash });
      expect(cancelTxReceipt.status).toEqual('success');
    });

    it(`speeds up block proposal if not mined`, async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      await enqueueProposeL2Checkpoint(checkpoint);
      await sendRequests();

      const [initialTx] = await ethCheatCodes.getTxPoolContents();
      expect(initialTx).toBeDefined();

      // After N L1 blocks, the publisher should have bumped the gas and resent the tx
      const l1SlotsUntilSpeedUp = 1;
      for (let i = 0; i < l1SlotsUntilSpeedUp; i++) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
      }

      // We should now be in speed-up state
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.SPEED_UP, 'speed up', 2, 0.1);
      const [speedUpTx] = await ethCheatCodes.getTxPoolContents();
      expect(speedUpTx).toBeDefined();
      expect(speedUpTx!.hash).not.toEqual(initialTx!.hash);
      expect(BigInt(speedUpTx!.maxFeePerGas!)).toBeGreaterThan(BigInt(initialTx!.maxFeePerGas!));
      expect(BigInt(speedUpTx!.maxPriorityFeePerGas!)).toBeGreaterThan(BigInt(initialTx!.maxPriorityFeePerGas!));

      // Now mine an L1 block with txs, and see that we transition to MINED state
      await ethCheatCodes.mine();
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'state is mined', 2, 0.1);
      const lastBlock = await l1Client.getBlock({ includeTransactions: true });
      const minedTx = lastBlock.transactions.find(t => t.hash === speedUpTx!.hash);
      expect(minedTx).toBeDefined();
      const minedTxReceipt = await l1Client.getTransactionReceipt({ hash: minedTx!.hash });
      expect(minedTxReceipt.status).toEqual('success');
      expect(await rollup.getCheckpointNumber()).toEqual(checkpoint.number);
    });

    it(`can send two consecutive proposals if the first one times out`, async () => {
      const { checkpoint: checkpoint1 } = await buildSingleCheckpoint();
      await enqueueProposeL2Checkpoint(checkpoint1);
      await sendRequests();

      const [initialTx] = await ethCheatCodes.getTxPoolContents();
      expect(initialTx).toBeDefined();

      // Let the proposal timeout by mining empty blocks until we're past the L2 slot
      while (true) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
        const { slot: nextL2Slot } = epochCache.getEpochAndSlotInNextL1Slot();

        // Wait for state to transition and give the publisher time to process
        await sleep(1000);

        // The publisher should now be in cancelled state
        if (nextL2Slot > initialL2Slot) {
          await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.CANCELLED, 'state is cancelled', 3, 0.1);
          expect(sendRequestsResult).toBeNull();
          break;
        }
      }

      // The cancellation should still be on the pool
      expect(await ethCheatCodes.getTxPoolStatus()).toEqual({ pending: 1, queued: 0 });

      // Now we should be able to send a second proposal
      const { checkpoint: checkpoint2 } = await buildSingleCheckpoint({ blockNumber: BlockNumber(1) });
      const block2 = checkpoint2.blocks[0];
      expect(BigInt(block2.slot)).toEqual(initialL2Slot + 1n);
      sendRequestsResult = undefined;
      await enqueueProposeL2Checkpoint(checkpoint2);
      // Align chain time so the bundle simulate at send time runs at slot N+1 (matches the
      // checkpoint2 header). Without this the bundle simulate (which uses getSlotNow()) sees
      // the wrong slot and drops the propose entry.
      await progressToSlot(BigInt(checkpoint2.header.slotNumber));
      await sendRequests();

      // Wait for the new proposal to be sent to the pool. The progressToSlot warp above may have
      // already mined the cancellation from the first proposal, so the pool may hold either the
      // cancel-and-new-propose (two entries) or just the new propose (one entry).
      await retryUntil(
        () => ethCheatCodes.getTxPoolStatus().then(s => s.queued + s.pending >= 1),
        'tx queued',
        20,
        0.1,
      );

      // Mine a block
      await ethCheatCodes.mine();

      // Wait for completion
      await retryUntil(() => !!sendRequestsResult, 'request resolved', 5, 0.1);
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'mined', 10, 0.1);

      // The second proposal should succeed
      expect(sendRequestsResult).not.toBeNull();
      expect(sendRequestsResult!.successfulActions).toEqual(['propose']);
      expect(sendRequestsResult!.failedActions).toEqual([]);
      expect(await rollup.getCheckpointNumber()).toEqual(checkpoint2.number);
      const rollupBlock = await rollup.getCheckpoint(checkpoint2.number);
      expect(rollupBlock.slotNumber).toEqual(block2.slot);
    });
  });
});
