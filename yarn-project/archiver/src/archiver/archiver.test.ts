import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { InboxContract, MULTI_CALL_3_ADDRESS, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation, CommitteeAttestationsAndSigners, L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import {
  makeAndSignCommitteeAttestationsAndSigners,
  makeCheckpointAttestationFromCheckpoint,
  makeStateReference,
  mockCheckpointAndMessages,
} from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';
import { type FormattedBlock, type Log, type Transaction, encodeFunctionData, multicall3Abi, toHex } from 'viem';

import { Archiver } from './archiver.js';
import type { ArchiverDataStore } from './archiver_store.js';
import { InitialBlockNumberNotSequentialError } from './errors.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { KVArchiverDataStore } from './kv_archiver_store/kv_archiver_store.js';
import { updateRollingHash } from './structs/inbox_message.js';

interface MockRollupContractRead {
  /** Returns the target committee size */
  getTargetCommitteeSize: () => Promise<bigint>;
  /** Returns the rollup version. */
  getVersion: () => Promise<bigint>;
  /** Given a checkpoint number, returns the archive. */
  archiveAt: (args: readonly [bigint]) => Promise<`0x${string}`>;
  /** Given a checkpoint number, returns provenCheckpointNumber, provenArchive, pendingCheckpointNumber, pendingArchive, archiveForLocalPendingCheckpointNumber, provenEpochNumber. */
  status: (args: readonly [bigint]) => Promise<[bigint, `0x${string}`, bigint, `0x${string}`, `0x${string}`]>;
}

interface MockInboxContractRead {
  getState: () => Promise<{ rollingHash: `0x${string}`; totalMessagesInserted: bigint; inProgress: bigint }>;
}

interface MockRollupContractEvents {
  CheckpointProposed: (
    filter: any,
    range: { fromBlock: bigint; toBlock: bigint },
  ) => Promise<Log<bigint, number, false, undefined, true, typeof RollupAbi, 'CheckpointProposed'>[]>;
}

interface MockInboxContractEvents {
  MessageSent: (
    filter: any,
    range: { fromBlock: bigint; toBlock: bigint },
  ) => Promise<Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[]>;
}

describe('Archiver', () => {
  const rollupAddress = EthAddress.random();
  const inboxAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashFactoryAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();

  const mockL1BlockNumbers = (...l1BlockNumbers: bigint[]) => {
    // During each archiver sync, we read the block number 3 times, so this ensures all three reads are consistent across the run.
    for (const blockNum of l1BlockNumbers) {
      publicClient.getBlockNumber
        .mockResolvedValueOnce(blockNum)
        .mockResolvedValueOnce(blockNum)
        .mockResolvedValueOnce(blockNum);
    }
    publicClient.getBlockNumber.mockResolvedValue(l1BlockNumbers.at(-1)!);
  };

  const makeCheckpointsAndMessages = async (
    numCheckpoints: number,
    {
      numBlocksPerCheckpoint = 1,
      txsPerBlock = 4,
      checkpointStartNumber = CheckpointNumber(1),
      blockStartNumber = 1,
      numL1ToL2Messages = 3,
      maxEffects = 0,
      previousArchive,
    }: {
      numBlocksPerCheckpoint?: number;
      txsPerBlock?: number;
      checkpointStartNumber?: CheckpointNumber;
      blockStartNumber?: number;
      numL1ToL2Messages?: number;
      maxEffects?: number;
      previousArchive?: AppendOnlyTreeSnapshot;
    } = {},
  ) => {
    // Create checkpoints sequentially to chain archive roots properly.
    // Each checkpoint's first block's lastArchive must equal the previous block's archive.
    const results: { checkpoint: Checkpoint; messages: Fr[]; lastArchive: AppendOnlyTreeSnapshot | undefined }[] = [];
    let lastArchive = previousArchive;
    for (let i = 0; i < numCheckpoints; i++) {
      const checkpointNumber = CheckpointNumber(i + checkpointStartNumber);
      const startBlockNumber = BlockNumber(i * numBlocksPerCheckpoint + blockStartNumber);
      const endBlockNumber = BlockNumber(startBlockNumber + numBlocksPerCheckpoint - 1);
      const result = await mockCheckpointAndMessages(checkpointNumber, {
        startBlockNumber,
        numBlocks: numBlocksPerCheckpoint,
        txsPerBlock,
        numL1ToL2Messages,
        timestamp: BigInt(now + Number(ETHEREUM_SLOT_DURATION) * (endBlockNumber + 1)),
        previousArchive: lastArchive,
        makeBlockOptions: blockNumber => ({
          // State reference can't be random. The nextAvailableLeafIndex of the note hash tree must be big enough to
          // avoid error when computing the dataStartIndexForBlock in LogStore.
          state: makeStateReference(0x100),
          timestamp: BigInt(now + Number(ETHEREUM_SLOT_DURATION) * (blockNumber + 1)),
          txOptions: {
            numPublicCallsPerTx: blockNumber + 1,
            numPublicLogsPerCall: 2,
            maxEffects,
          },
          makeTxOptions: txIndex => ({
            numPrivateLogs: blockNumber + txIndex,
          }),
        }),
      });
      lastArchive = result.lastArchive;
      results.push(result);
    }
    return results;
  };

  let publicClient: MockProxy<ViemPublicClient>;
  let debugClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobClient: MockProxy<BlobClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let dateProvider: TestDateProvider;
  let archiverStore: ArchiverDataStore;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let now: number;

  let mockRollupRead: MockProxy<MockRollupContractRead>;
  let mockInboxRead: MockProxy<MockInboxContractRead>;
  let mockRollupEvents: MockProxy<MockRollupContractEvents>;
  let mockInboxEvents: MockProxy<MockInboxContractEvents>;
  let mockRollup: {
    read: typeof mockRollupRead;
    getEvents: typeof mockRollupEvents;
    address: string;
  };
  let mockInbox: {
    read: typeof mockInboxRead;
    getEvents: typeof mockInboxEvents;
  };
  let archiver: Archiver;

  let checkpoints: Checkpoint[];
  let messagesPerCheckpoint: Fr[][];
  let messagesRollingHash: Buffer16;
  let totalMessagesInserted: number;

  let checkpointProposedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'CheckpointProposed'>[];
  let l2MessageSentLogs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[];

  // Maps from block archive to the corresponding txs, versioned blob hashes, and blobs
  // REFACTOR: we should have a single method that creates all these artifacts, as well as the l2 proposed event
  let allRollupTxs: Map<`0x${string}`, Transaction>;
  let allVersionedBlobHashes: Map<`0x${string}`, `0x${string}`[]>;
  let allBlobs: Map<`0x${string}`, Blob[]>;

  let logger: Logger;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT).toString();
  const ETHEREUM_SLOT_DURATION = BigInt(DefaultL1ContractsConfig.ethereumSlotDuration);

  beforeEach(async () => {
    logger = createLogger('archiver:test');
    messagesRollingHash = Buffer16.ZERO;
    totalMessagesInserted = 0;
    dateProvider = new TestDateProvider();
    now = +new Date();
    publicClient = mock<ViemPublicClient>();
    publicClient.getChainId.mockResolvedValue(1);
    // Default getBlockNumber mock - tests can override this with mockL1BlockNumbers() or their own mock
    publicClient.getBlockNumber.mockResolvedValue(0n);
    publicClient.getBlock.mockImplementation((async (args: { blockNumber?: bigint } = {}) => {
      args.blockNumber ??= await publicClient.getBlockNumber();
      return {
        number: args.blockNumber,
        timestamp: BigInt(args.blockNumber) * ETHEREUM_SLOT_DURATION + BigInt(now),
        hash: Buffer32.fromBigInt(BigInt(args.blockNumber)).toString(),
      } as FormattedBlock;
    }) as any);

    // Debug client uses the same mock as public client for tests
    debugClient = publicClient;

    blobClient = mock<BlobClientInterface>();
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });
    archiverStore = new KVArchiverDataStore(await openTmpStore('archiver_test'), 1000);
    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };

    // Initialize global collections first
    l2MessageSentLogs = [];
    checkpointProposedLogs = [];
    allRollupTxs = new Map();
    allVersionedBlobHashes = new Map();
    allBlobs = new Map();

    publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) =>
      Promise.resolve(args.hash ? (allRollupTxs.get(args.hash) as any) : undefined),
    );

    blobClient.getBlobSidecar.mockImplementation((blockId: `0x${string}`, _requestedBlobHashes?: Buffer[]) =>
      Promise.resolve(allBlobs.get(blockId) || []),
    );

    // Create mock rollup contract
    mockRollupRead = mock<MockRollupContractRead>();
    mockRollupRead.archiveAt.mockImplementation((args: readonly [bigint]) =>
      Promise.resolve(checkpoints[Number(args[0] - 1n)]?.archive.root.toString() ?? Fr.ZERO.toString()),
    );
    mockRollupRead.getVersion.mockImplementation(() => Promise.resolve(1n));
    mockRollupEvents = mock<MockRollupContractEvents>();
    mockRollupEvents.CheckpointProposed.mockImplementation((_filter: any, { fromBlock, toBlock }) =>
      Promise.resolve(
        checkpointProposedLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock),
      ),
    );
    mockRollup = {
      read: mockRollupRead,
      getEvents: mockRollupEvents,
      address: rollupAddress.toString(),
    };
    const rollupWrapper = new RollupContract(publicClient, rollupAddress.toString());
    (rollupWrapper as any).rollup = mockRollup;

    // Create mock inbox contract
    mockInboxRead = mock<MockInboxContractRead>();
    mockInboxRead.getState.mockImplementation(() =>
      Promise.resolve({
        rollingHash: messagesRollingHash.toString(),
        totalMessagesInserted: BigInt(totalMessagesInserted),
        inProgress: 0n,
      }),
    );
    mockInboxEvents = mock<MockInboxContractEvents>();
    mockInboxEvents.MessageSent.mockImplementation(
      (filter: { hash?: string }, opts: { fromBlock?: bigint; toBlock?: bigint } = {}) =>
        Promise.resolve(
          l2MessageSentLogs.filter(
            log =>
              (!filter.hash || log.args.hash === filter.hash) &&
              (!opts.fromBlock || log.blockNumber! >= opts.fromBlock) &&
              (!opts.toBlock || log.blockNumber! <= opts.toBlock),
          ),
        ),
    );
    mockInbox = {
      read: mockInboxRead,
      getEvents: mockInboxEvents,
    };
    const inboxWrapper = new InboxContract(publicClient, inboxAddress.toString());
    (inboxWrapper as any).inbox = mockInbox;

    const contractAddresses = {
      registryAddress,
      governanceProposerAddress,
      slashFactoryAddress,
      slashingProposerAddress,
    };

    archiver = new Archiver(
      publicClient,
      debugClient,
      rollupWrapper,
      inboxWrapper,
      contractAddresses,
      archiverStore,
      {
        pollingIntervalMs: 1000,
        batchSize: 1000,
        maxAllowedEthClientDriftSeconds: 300,
        ethereumAllowNoDebugHosts: true,
      },
      blobClient,
      epochCache,
      dateProvider,
      instrumentation,
      l1Constants,
    );

    // Create checkpoints starting from the genesis archive root so that archive roots chain correctly
    const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
    ({ checkpoints, messagesPerCheckpoint } = (
      await makeCheckpointsAndMessages(3, { previousArchive: genesisArchive })
    ).reduce(
      (acc, { checkpoint, messages, lastArchive: la }) => {
        acc.checkpoints.push(checkpoint);
        acc.messagesPerCheckpoint.push(messages);
        acc.lastArchive = la;
        return acc;
      },
      { checkpoints: [], messagesPerCheckpoint: [], lastArchive: undefined } as {
        checkpoints: Checkpoint[];
        messagesPerCheckpoint: Fr[][];
        lastArchive: AppendOnlyTreeSnapshot | undefined;
      },
    ));
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  describe('getPublishedCheckpoints', () => {
    it('returns published checkpoints with full checkpoint data', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get all checkpoints starting from 1
      const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 10);
      expect(publishedCheckpoints.length).toBe(3);
      expect(publishedCheckpoints.map(c => c.checkpoint.number)).toEqual([1, 2, 3]);

      // Each checkpoint should have blocks
      publishedCheckpoints.forEach((pc, i) => {
        expect(pc.checkpoint.blocks.length).toBeGreaterThan(0);
        expect(pc.checkpoint.archive.root.toString()).toEqual(checkpoints[i].archive.root.toString());
        expect(pc.l1).toBeDefined();
      });
    }, 10_000);

    it('respects the limit parameter', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get only 2 checkpoints starting from 1
      const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 2);
      expect(publishedCheckpoints.length).toBe(2);
      expect(publishedCheckpoints.map(c => c.checkpoint.number)).toEqual([1, 2]);
    }, 10_000);

    it('respects the starting checkpoint number', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get checkpoints starting from 2
      const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(2), 10);
      expect(publishedCheckpoints.length).toBe(2);
      expect(publishedCheckpoints.map(c => c.checkpoint.number)).toEqual([2, 3]);
    }, 10_000);

    it('returns empty array when no checkpoints exist', async () => {
      mockL1BlockNumbers(100n);
      mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);
      mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));

      await archiver.start(false);

      const publishedCheckpoints = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 10);
      expect(publishedCheckpoints).toEqual([]);
    }, 10_000);
  });

  describe('getCheckpointsForEpoch', () => {
    it('returns checkpoints for a specific epoch based on slot numbers', async () => {
      // l1Constants has epochDuration: 4, so epoch 0 has slots 0-3
      // We'll create checkpoints with specific slot numbers to test filtering

      // Create checkpoints with specific slots, chaining archive roots
      const [{ checkpoint: cp1, messages: msgs1, lastArchive: archive1 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(1),
        blockStartNumber: 1,
      });
      cp1.header.slotNumber = SlotNumber(1); // Epoch 0

      const [{ checkpoint: cp2, messages: msgs2, lastArchive: archive2 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(2),
        blockStartNumber: 2,
        previousArchive: archive1,
      });
      cp2.header.slotNumber = SlotNumber(3); // Epoch 0

      const [{ checkpoint: cp3, messages: msgs3 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(3),
        blockStartNumber: 3,
        previousArchive: archive2,
      });
      cp3.header.slotNumber = SlotNumber(5); // Epoch 1

      checkpoints = [cp1, cp2, cp3];
      messagesPerCheckpoint = [msgs1, msgs2, msgs3];

      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get checkpoints for epoch 0 (slots 0-3)
      const epoch0Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(0));
      expect(epoch0Checkpoints.length).toBe(2);
      expect(epoch0Checkpoints.map(c => c.number)).toEqual([1, 2]);

      // Get checkpoints for epoch 1 (slots 4-7)
      const epoch1Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(1));
      expect(epoch1Checkpoints.length).toBe(1);
      expect(epoch1Checkpoints.map(c => c.number)).toEqual([3]);
    }, 10_000);

    it('returns empty array for epoch with no checkpoints', async () => {
      // Create a checkpoint in epoch 0
      const [{ checkpoint: cp1, messages: msgs1 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(1),
        blockStartNumber: 1,
      });
      cp1.header.slotNumber = SlotNumber(2); // Epoch 0

      checkpoints = [cp1];
      messagesPerCheckpoint = [msgs1];

      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        1n,
        checkpoints[0].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
      makeMessageSentEvents(60n, checkpoints[0].number, messagesPerCheckpoint[0]);
      mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(1));

      // Get checkpoints for epoch 1 (slots 4-7) - should be empty
      const epoch1Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(1));
      expect(epoch1Checkpoints).toEqual([]);
    }, 10_000);

    it('returns checkpoints in correct order (ascending by checkpoint number)', async () => {
      // Create multiple checkpoints in the same epoch, chaining archive roots
      const [{ checkpoint: cp1, messages: msgs1, lastArchive: archive1 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(1),
        blockStartNumber: 1,
      });
      cp1.header.slotNumber = SlotNumber(0); // Epoch 0

      const [{ checkpoint: cp2, messages: msgs2, lastArchive: archive2 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(2),
        blockStartNumber: 2,
        previousArchive: archive1,
      });
      cp2.header.slotNumber = SlotNumber(1); // Epoch 0

      const [{ checkpoint: cp3, messages: msgs3 }] = await makeCheckpointsAndMessages(1, {
        checkpointStartNumber: CheckpointNumber(3),
        blockStartNumber: 3,
        previousArchive: archive2,
      });
      cp3.header.slotNumber = SlotNumber(2); // Epoch 0

      checkpoints = [cp1, cp2, cp3];
      messagesPerCheckpoint = [msgs1, msgs2, msgs3];

      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get checkpoints for epoch 0 - should be in ascending order
      const epoch0Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(0));
      expect(epoch0Checkpoints.length).toBe(3);
      expect(epoch0Checkpoints.map(c => c.number)).toEqual([1, 2, 3]);
    }, 10_000);
  });

  describe('addBlock (L2BlockSink)', () => {
    // State reference needs to be valid for LogStore's dataStartIndexForBlock calculation
    // All blocks use checkpoint number 1 since they're being added to the initial checkpoint
    const makeBlock = (blockNumber: BlockNumber, indexIntoCheckpoint = 0, previousArchive?: AppendOnlyTreeSnapshot) =>
      L2BlockNew.random(blockNumber, {
        checkpointNumber: CheckpointNumber(1),
        state: makeStateReference(0x100),
        indexWithinCheckpoint: indexIntoCheckpoint,
        ...(previousArchive ? { lastArchive: previousArchive } : {}),
      });

    // Genesis archive for the first block
    const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);

    // Setup minimal L1 mocks needed for sync loop to run
    const setupMinimalL1Mocks = () => {
      // Use mockResolvedValue (not mockL1BlockNumbers) so it can handle unlimited sync iterations
      publicClient.getBlockNumber.mockResolvedValue(100n);
      mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);
      mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));
    };

    it('adds a block to the store', async () => {
      setupMinimalL1Mocks();
      const block = await makeBlock(BlockNumber(1), 0, genesisArchive);
      await archiver.addBlock(block);

      const retrievedBlock = await archiver.getL2BlockNew(BlockNumber(1));
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.number).toEqual(BlockNumber(1));
      expect((await retrievedBlock!.header.hash()).toString()).toEqual((await block.header.hash()).toString());
    });

    it('adds multiple blocks incrementally', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);
      const block3 = await makeBlock(BlockNumber(3), 2, block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      const retrievedBlock1 = await archiver.getL2BlockNew(BlockNumber(1));
      const retrievedBlock2 = await archiver.getL2BlockNew(BlockNumber(2));
      const retrievedBlock3 = await archiver.getL2BlockNew(BlockNumber(3));

      expect(retrievedBlock1!.number).toEqual(BlockNumber(1));
      expect(retrievedBlock2!.number).toEqual(BlockNumber(2));
      expect(retrievedBlock3!.number).toEqual(BlockNumber(3));
    });

    it('rejects blocks with non-incremental block number (gap)', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block3 = await makeBlock(BlockNumber(3), 2, block1.archive); // Skip block 2

      await archiver.addBlock(block1);

      // Block 3 should be rejected because block 2 is missing
      await expect(archiver.addBlock(block3)).rejects.toThrow(InitialBlockNumberNotSequentialError);
    });

    it('rejects blocks with duplicate block numbers', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Adding block 2 again shoud be rejected
      await expect(archiver.addBlock(block2)).rejects.toThrow(InitialBlockNumberNotSequentialError);
    });

    it('rejects first block if not starting from block 1', async () => {
      setupMinimalL1Mocks();

      const block5 = await makeBlock(BlockNumber(5), 0, genesisArchive);

      // First block must be block 1
      await expect(archiver.addBlock(block5)).rejects.toThrow();
    });

    it('allows block number to start from 1 (initial block)', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);

      await archiver.addBlock(block1);

      const retrievedBlock = await archiver.getL2BlockNew(BlockNumber(1));
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.number).toEqual(BlockNumber(1));
    });

    it('retrieves multiple blocks with getL2BlocksNew', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);
      const block3 = await makeBlock(BlockNumber(3), 2, block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 3);
      expect(blocks.length).toEqual(3);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
      expect(await blocks[2].hash()).toEqual(await block3.hash());
    });

    it('retrieves blocks with limit in getL2BlocksNew', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);
      const block3 = await makeBlock(BlockNumber(3), 2, block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Request only 2 blocks starting from block 1
      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 2);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });

    it('retrieves blocks starting from middle with getL2BlocksNew', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);
      const block3 = await makeBlock(BlockNumber(3), 2, block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Start from block 2
      const blocks = await archiver.getL2BlocksNew(BlockNumber(2), 2);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block2.hash());
      expect(await blocks[1].hash()).toEqual(await block3.hash());
    });

    it('returns empty array when requesting blocks beyond available range', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);

      await archiver.addBlock(block1);

      // Request blocks starting from block 5 (which doesn't exist)
      const blocks = await archiver.getL2BlocksNew(BlockNumber(5), 3);
      expect(blocks).toEqual([]);
    });

    it('returns partial results when limit exceeds available blocks', async () => {
      setupMinimalL1Mocks();
      const block1 = await makeBlock(BlockNumber(1), 0, genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), 1, block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Request 10 blocks but only 2 are available
      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 10);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });

    it('blocks added via addBlock become checkpointed when checkpoint syncs from L1', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const checkpoint1 = checkpoints[0];
      const rollupTx1 = makeRollupTx(checkpoint1);
      const blobHashes1 = makeVersionedBlobHashes(checkpoint1);
      const blobsFromCheckpoint1 = makeBlobsFromCheckpoint(checkpoint1);

      mockL1BlockNumbers(100n, 200n);

      mockRollup.read.status
        .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoint1.archive.root.toString(), GENESIS_ROOT])
        .mockResolvedValue([
          1n,
          checkpoint1.archive.root.toString(),
          2n,
          checkpoints[1].archive.root.toString(),
          checkpoint1.archive.root.toString(),
        ]);

      makeCheckpointProposedEvent(70n, checkpoint1.number, checkpoint1.archive.root.toString(), blobHashes1);
      makeMessageSentEvents(60n, checkpoint1.number, messagesPerCheckpoint[0]);
      mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

      publicClient.getTransaction.mockResolvedValueOnce(rollupTx1);
      blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint1);

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(1));

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = checkpoint1.blocks[checkpoint1.blocks.length - 1].number;

      // Verify L2Tips after syncing checkpoint 1: proposed and checkpointed should both be at checkpoint 1
      const tipsAfterCheckpoint1 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint1.proposed.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Now add blocks for checkpoint 2 via addBlock (simulating local block production)
      const checkpoint2 = checkpoints[1];
      for (const block of checkpoint2.blocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are retrievable but not yet checkpointed
      const lastBlockInCheckpoint2 = checkpoint2.blocks[checkpoint2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify L2Tips after adding blocks: proposed advances but checkpointed stays at checkpoint 1
      const tipsAfterAddBlock = await archiver.getL2Tips();
      expect(tipsAfterAddBlock.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterAddBlock.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterAddBlock.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // getCheckpointedBlock should return undefined for the new blocks since checkpoint 2 hasn't synced
      const firstNewBlockNumber = lastBlockInCheckpoint1 + 1;
      const uncheckpointedBlock = await archiver.getCheckpointedBlock(BlockNumber(firstNewBlockNumber));
      expect(uncheckpointedBlock).toBeUndefined();

      // But getL2BlockNew should work (it retrieves both checkpointed and uncheckpointed blocks)
      const block = await archiver.getL2BlockNew(BlockNumber(firstNewBlockNumber));
      expect(block).toBeDefined();

      // Now sync checkpoint 2 from L1
      const rollupTx2 = makeRollupTx(checkpoint2);
      const blobHashes2 = makeVersionedBlobHashes(checkpoint2);
      const blobsFromCheckpoint2 = makeBlobsFromCheckpoint(checkpoint2);

      makeCheckpointProposedEvent(170n, checkpoint2.number, checkpoint2.archive.root.toString(), blobHashes2);
      makeMessageSentEvents(160n, checkpoint2.number, messagesPerCheckpoint[1]);
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length),
      );

      publicClient.getTransaction.mockResolvedValueOnce(rollupTx2);
      blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint2);

      await waitUntilArchiverCheckpoint(CheckpointNumber(2));

      // Now the blocks should be checkpointed
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2: proposed and checkpointed should both be at checkpoint 2
      const tipsAfterCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      // getCheckpointedBlock should now work for the new blocks
      const checkpointedBlock = await archiver.getCheckpointedBlock(BlockNumber(firstNewBlockNumber));
      expect(checkpointedBlock).toBeDefined();
      expect(checkpointedBlock!.checkpointNumber).toEqual(2);
    }, 10_000);

    it('blocks added via checkpoints can not be added via addblocks', async () => {
      // First, sync checkpoint 1 from L1 to establish a baseline
      const checkpoint1 = checkpoints[0];
      const rollupTx1 = makeRollupTx(checkpoint1);
      const blobHashes1 = makeVersionedBlobHashes(checkpoint1);
      const blobsFromCheckpoint1 = makeBlobsFromCheckpoint(checkpoint1);

      mockL1BlockNumbers(100n, 200n);

      mockRollup.read.status
        .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoint1.archive.root.toString(), GENESIS_ROOT])
        .mockResolvedValue([
          1n,
          checkpoint1.archive.root.toString(),
          2n,
          checkpoints[1].archive.root.toString(),
          checkpoint1.archive.root.toString(),
        ]);

      makeCheckpointProposedEvent(70n, checkpoint1.number, checkpoint1.archive.root.toString(), blobHashes1);
      makeMessageSentEvents(60n, checkpoint1.number, messagesPerCheckpoint[0]);
      mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

      publicClient.getTransaction.mockResolvedValueOnce(rollupTx1);
      blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint1);

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(1));

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const blockAlreadySyncedFromCheckpoint = checkpoint1.blocks[checkpoint1.blocks.length - 1];

      // Now try and add one of the blocks via the addBlocks method. It should throw
      await expect(archiver.addBlock(blockAlreadySyncedFromCheckpoint)).rejects.toThrow(
        InitialBlockNumberNotSequentialError,
      );
    }, 10_000);

    it('can add more blocks after checkpoint syncs and then sync another checkpoint', async () => {
      // Sync the first checkpoint normally
      const checkpoint1 = checkpoints[0];
      const rollupTx1 = makeRollupTx(checkpoint1);
      const blobHashes1 = makeVersionedBlobHashes(checkpoint1);
      const blobsFromCheckpoint1 = makeBlobsFromCheckpoint(checkpoint1);

      mockL1BlockNumbers(100n, 200n);

      mockRollup.read.status
        .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoint1.archive.root.toString(), GENESIS_ROOT])
        .mockResolvedValue([
          1n,
          checkpoint1.archive.root.toString(),
          2n,
          checkpoints[1].archive.root.toString(),
          checkpoint1.archive.root.toString(),
        ]);

      makeCheckpointProposedEvent(70n, checkpoint1.number, checkpoint1.archive.root.toString(), blobHashes1);
      makeMessageSentEvents(60n, checkpoint1.number, messagesPerCheckpoint[0]);
      mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

      publicClient.getTransaction.mockResolvedValueOnce(rollupTx1);
      blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint1);

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(1));

      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));
      const lastBlockInCheckpoint1 = checkpoint1.blocks[checkpoint1.blocks.length - 1].number;

      // Verify L2Tips after syncing checkpoint 1: proposed and checkpointed at checkpoint 1
      const tipsAfterCheckpoint1 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint1.proposed.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterCheckpoint1.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // Now add more blocks via addBlock (simulating local block production ahead of L1)
      const checkpoint2 = checkpoints[1];
      for (const block of checkpoint2.blocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are retrievable
      const lastBlockInCheckpoint2 = checkpoint2.blocks[checkpoint2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);

      // But checkpoint number should still be 1
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify L2Tips after adding blocks: proposed advances, checkpointed stays at checkpoint 1
      const tipsAfterAddBlock = await archiver.getL2Tips();
      expect(tipsAfterAddBlock.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterAddBlock.checkpointed.block.number).toEqual(lastBlockInCheckpoint1);
      expect(tipsAfterAddBlock.checkpointed.checkpoint.number).toEqual(CheckpointNumber(1));

      // New blocks should not be checkpointed yet
      const firstNewBlockNumber = lastBlockInCheckpoint1 + 1;
      const uncheckpointedBlock = await archiver.getCheckpointedBlock(BlockNumber(firstNewBlockNumber));
      expect(uncheckpointedBlock).toBeUndefined();

      // Now sync checkpoint 2 from L1
      const rollupTx2 = makeRollupTx(checkpoint2);
      const blobHashes2 = makeVersionedBlobHashes(checkpoint2);
      const blobsFromCheckpoint2 = makeBlobsFromCheckpoint(checkpoint2);

      makeCheckpointProposedEvent(170n, checkpoint2.number, checkpoint2.archive.root.toString(), blobHashes2);
      makeMessageSentEvents(160n, checkpoint2.number, messagesPerCheckpoint[1]);
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length),
      );

      publicClient.getTransaction.mockResolvedValueOnce(rollupTx2);
      blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint2);

      await waitUntilArchiverCheckpoint(CheckpointNumber(2));

      // Now all blocks should be checkpointed
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Verify L2Tips after syncing checkpoint 2: both proposed and checkpointed at checkpoint 2
      const tipsAfterCheckpoint2 = await archiver.getL2Tips();
      expect(tipsAfterCheckpoint2.proposed.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.block.number).toEqual(lastBlockInCheckpoint2);
      expect(tipsAfterCheckpoint2.checkpointed.checkpoint.number).toEqual(CheckpointNumber(2));

      const checkpointedBlock = await archiver.getCheckpointedBlock(BlockNumber(firstNewBlockNumber));
      expect(checkpointedBlock).toBeDefined();
      expect(checkpointedBlock!.checkpointNumber).toEqual(2);
    }, 10_000);
  });

  // TODO(palla/reorg): Add a unit test for the archiver handleEpochPrune
  xit('handles an upcoming L2 prune', () => {});

  describe('getCheckpointedBlocks', () => {
    it('returns checkpointed blocks with checkpoint info', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get checkpointed blocks starting from block 1
      const checkpointedBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 100);

      // Should return all blocks from all checkpoints
      const expectedBlocks = checkpoints.flatMap(c => c.blocks);
      expect(checkpointedBlocks.length).toBe(expectedBlocks.length);

      // Verify blocks are returned in correct order and have correct checkpoint info
      let blockIndex = 0;
      for (let cpIdx = 0; cpIdx < checkpoints.length; cpIdx++) {
        const checkpoint = checkpoints[cpIdx];
        for (let i = 0; i < checkpoint.blocks.length; i++) {
          const cb = checkpointedBlocks[blockIndex];
          const expectedBlock = checkpoint.blocks[i];

          // Verify block number matches
          expect(cb.block.number).toBe(expectedBlock.number);

          // Verify checkpoint number is correct
          expect(cb.checkpointNumber).toBe(checkpoint.number);

          // Verify archive root matches (more reliable than hash which depends on L1-to-L2 messages)
          expect(cb.block.archive.root.toString()).toBe(expectedBlock.archive.root.toString());

          // Verify L1 published data is present
          expect(cb.l1).toBeDefined();
          expect(cb.l1.blockNumber).toBeGreaterThan(0n);

          blockIndex++;
        }
      }
    }, 10_000);

    it('respects the limit parameter', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get only 2 checkpointed blocks starting from block 1 (out of 3 total)
      const checkpointedBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 2);
      expect(checkpointedBlocks.length).toBe(2);

      // Verify exact block numbers (blocks 1 and 2)
      expect(checkpointedBlocks[0].block.number).toBe(BlockNumber(1));
      expect(checkpointedBlocks[1].block.number).toBe(BlockNumber(2));

      // Verify archive roots match original checkpoint blocks
      expect(checkpointedBlocks[0].block.archive.root.toString()).toBe(
        checkpoints[0].blocks[0].archive.root.toString(),
      );
      expect(checkpointedBlocks[1].block.archive.root.toString()).toBe(
        checkpoints[1].blocks[0].archive.root.toString(),
      );

      // Verify checkpoint numbers (block 1 is from checkpoint 1, block 2 is from checkpoint 2)
      expect(checkpointedBlocks[0].checkpointNumber).toBe(1);
      expect(checkpointedBlocks[1].checkpointNumber).toBe(2);
    }, 10_000);

    it('returns blocks starting from specified block number', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      mockRollup.read.status.mockResolvedValue([
        0n,
        GENESIS_ROOT,
        3n,
        checkpoints[2].archive.root.toString(),
        GENESIS_ROOT,
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get blocks starting from block 2 (skip block 1, get blocks 2 and 3)
      const checkpointedBlocks = await archiver.getCheckpointedBlocks(BlockNumber(2), 10);

      // Should return 2 blocks (blocks 2 and 3 - since there are only 3 blocks total, 1 per checkpoint)
      expect(checkpointedBlocks.length).toBe(2);

      // Verify block numbers are sequential starting from 2
      expect(checkpointedBlocks[0].block.number).toBe(BlockNumber(2));
      expect(checkpointedBlocks[1].block.number).toBe(BlockNumber(3));

      // Verify checkpoint numbers (block 2 is from checkpoint 2, block 3 is from checkpoint 3)
      expect(checkpointedBlocks[0].checkpointNumber).toBe(2);
      expect(checkpointedBlocks[1].checkpointNumber).toBe(3);

      // Verify archive roots match expected blocks from checkpoints
      expect(checkpointedBlocks[0].block.archive.root.toString()).toBe(
        checkpoints[1].blocks[0].archive.root.toString(),
      );
      expect(checkpointedBlocks[1].block.archive.root.toString()).toBe(
        checkpoints[2].blocks[0].archive.root.toString(),
      );
    }, 10_000);

    it('returns empty array when no checkpointed blocks exist', async () => {
      mockL1BlockNumbers(100n);
      mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);
      mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));

      await archiver.start(false);

      const checkpointedBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 10);
      expect(checkpointedBlocks).toEqual([]);
    }, 10_000);

    it('filters by proven status when proven=true', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      // Set checkpoint 1 as proven (provenCheckpointNumber = 1)
      mockRollup.read.status.mockResolvedValue([
        1n, // provenCheckpointNumber
        checkpoints[0].archive.root.toString(), // provenArchive
        3n, // pendingCheckpointNumber
        checkpoints[2].archive.root.toString(), // pendingArchive
        checkpoints[0].archive.root.toString(), // archiveForLocalPendingCheckpointNumber
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get all checkpointed blocks without proven filter
      const allBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 100);
      const totalBlocks = checkpoints.reduce((acc, c) => acc + c.blocks.length, 0);
      expect(allBlocks.length).toBe(totalBlocks);

      // Get only proven checkpointed blocks (should only include blocks from checkpoint 1)
      const provenBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 100, true);
      const checkpoint1Blocks = checkpoints[0].blocks;
      expect(provenBlocks.length).toBe(checkpoint1Blocks.length);

      // Verify all proven blocks are from checkpoint 1 and match expected blocks
      for (let i = 0; i < provenBlocks.length; i++) {
        const cb = provenBlocks[i];
        expect(cb.checkpointNumber).toBe(1);
        expect(cb.block.number).toBe(checkpoint1Blocks[i].number);

        // Verify archive root matches (more reliable than hash which depends on L1-to-L2 messages)
        expect(cb.block.archive.root.toString()).toBe(checkpoint1Blocks[i].archive.root.toString());
      }

      // Verify the last proven block number matches the last block of checkpoint 1
      const lastProvenBlock = provenBlocks[provenBlocks.length - 1];
      const lastCheckpoint1Block = checkpoint1Blocks[checkpoint1Blocks.length - 1];
      expect(lastProvenBlock.block.number).toBe(lastCheckpoint1Block.number);
    }, 10_000);
  });

  describe('getL2BlocksNew with proven filter', () => {
    it('filters by proven status when proven=true', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      // Set checkpoint 1 as proven (provenCheckpointNumber = 1)
      mockRollup.read.status.mockResolvedValue([
        1n, // provenCheckpointNumber
        checkpoints[0].archive.root.toString(), // provenArchive
        3n, // pendingCheckpointNumber
        checkpoints[2].archive.root.toString(), // pendingArchive
        checkpoints[0].archive.root.toString(), // archiveForLocalPendingCheckpointNumber
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      // Get all blocks without proven filter
      const allBlocks = await archiver.getL2BlocksNew(BlockNumber(1), 100);
      const totalBlocks = checkpoints.reduce((acc, c) => acc + c.blocks.length, 0);
      expect(allBlocks.length).toBe(totalBlocks);

      // Get only proven blocks (should only include blocks from checkpoint 1)
      const provenBlocks = await archiver.getL2BlocksNew(BlockNumber(1), 100, true);
      const checkpoint1Blocks = checkpoints[0].blocks;
      expect(provenBlocks.length).toBe(checkpoint1Blocks.length);

      // Verify block numbers match checkpoint 1 blocks
      for (let i = 0; i < provenBlocks.length; i++) {
        expect(provenBlocks[i].number).toBe(checkpoint1Blocks[i].number);

        // Verify archive root matches (more reliable than hash which depends on L1-to-L2 messages)
        expect(provenBlocks[i].archive.root.toString()).toBe(checkpoint1Blocks[i].archive.root.toString());
      }

      // Verify the last proven block is the last block of checkpoint 1
      const lastProvenBlockNumber = checkpoint1Blocks[checkpoint1Blocks.length - 1].number;
      expect(provenBlocks[provenBlocks.length - 1].number).toBe(lastProvenBlockNumber);

      // Verify no unproven blocks are included
      const unprovenBlockNumbers = checkpoints.slice(1).flatMap(c => c.blocks.map(b => b.number));
      provenBlocks.forEach(b => {
        expect(unprovenBlockNumbers).not.toContain(b.number);
      });
    }, 10_000);

    it('returns all blocks when proven=false or undefined', async () => {
      const rollupTxs = checkpoints.map(c => makeRollupTx(c));
      const blobHashes = checkpoints.map(makeVersionedBlobHashes);

      mockL1BlockNumbers(100n);

      // Set checkpoint 1 as proven
      mockRollup.read.status.mockResolvedValue([
        1n,
        checkpoints[0].archive.root.toString(),
        3n,
        checkpoints[2].archive.root.toString(),
        checkpoints[0].archive.root.toString(),
      ]);

      checkpoints.forEach((c, i) =>
        makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
      );
      messagesPerCheckpoint.forEach((messages, i) =>
        makeMessageSentEvents(60n + BigInt(i) * 5n, checkpoints[i].number, messages),
      );
      mockInbox.read.getState.mockResolvedValue(
        makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
      );

      rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
      const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
      blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

      await archiver.start(false);
      await waitUntilArchiverCheckpoint(CheckpointNumber(3));

      const expectedBlocks = checkpoints.flatMap(c => c.blocks);
      const totalBlocks = expectedBlocks.length;

      // Get blocks with proven=false - should include all blocks
      const blocksProvenFalse = await archiver.getL2BlocksNew(BlockNumber(1), 100, false);
      expect(blocksProvenFalse.length).toBe(totalBlocks);

      // Verify all block numbers are present
      for (let i = 0; i < blocksProvenFalse.length; i++) {
        expect(blocksProvenFalse[i].number).toBe(expectedBlocks[i].number);
      }

      // Get blocks with proven=undefined - should include all blocks
      const blocksProvenUndefined = await archiver.getL2BlocksNew(BlockNumber(1), 100);
      expect(blocksProvenUndefined.length).toBe(totalBlocks);

      // Verify all block numbers match
      for (let i = 0; i < blocksProvenUndefined.length; i++) {
        expect(blocksProvenUndefined[i].number).toBe(expectedBlocks[i].number);
      }

      // Verify blocks include unproven blocks (from checkpoints 2 and 3)
      const unprovenBlockNumbers = checkpoints.slice(1).flatMap(c => c.blocks.map(b => b.number));
      const returnedBlockNumbers = blocksProvenFalse.map(b => b.number);
      unprovenBlockNumbers.forEach(unprovenNum => {
        expect(returnedBlockNumbers).toContain(unprovenNum);
      });
    }, 10_000);
  });

  const waitUntilArchiverCheckpoint = async (checkpointNumber: CheckpointNumber) => {
    logger.info(`Waiting for archiver to sync to checkpoint ${checkpointNumber}`);
    await retryUntil(() => archiver.getSynchedCheckpointNumber().then(n => n === checkpointNumber), 'sync', 10, 0.1);
  };

  /** Makes a fake Inbox state assuming this many messages have been created. */
  const makeInboxStateFromMsgCount = (msgCount: number) => {
    return {
      rollingHash: msgCount === 0 ? Buffer16.ZERO.toString() : l2MessageSentLogs[msgCount - 1].args.rollingHash,
      totalMessagesInserted: BigInt(msgCount),
      inProgress: 0n,
    };
  };

  /**
   * Makes a fake CheckpointProposed event for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param checkpointNumber - Checkpoint number.
   */
  const makeCheckpointProposedEvent = (
    l1BlockNum: bigint,
    checkpointNumber: CheckpointNumber,
    archive: `0x${string}`,
    versionedBlobHashes: `0x${string}`[],
  ) => {
    const log = {
      blockNumber: l1BlockNum,
      blockHash: Buffer32.fromBigInt(l1BlockNum).toString(),
      args: { checkpointNumber: BigInt(checkpointNumber), archive, versionedBlobHashes },
      transactionHash: archive,
    } as unknown as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'CheckpointProposed'>;
    checkpointProposedLogs.push(log);
  };

  /**
   * Makes fake L1ToL2 MessageSent events for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param checkpointNumber - The checkpoint number for which the message was included.
   * @param indexInSubtree - the index in the l2Block's subtree in the L1 to L2 Messages Tree.
   */
  const makeMessageSentEvent = (
    l1BlockNum: bigint,
    checkpointNumber: CheckpointNumber,
    indexInSubtree: bigint,
    leaf: Fr,
  ) => {
    const index = indexInSubtree + InboxLeaf.smallestIndexForCheckpoint(checkpointNumber);
    messagesRollingHash = updateRollingHash(messagesRollingHash, leaf);
    totalMessagesInserted++;

    const log = {
      blockNumber: l1BlockNum,
      blockHash: Buffer32.fromBigInt(l1BlockNum).toString(),
      args: {
        checkpointNumber: BigInt(checkpointNumber),
        index,
        hash: leaf.toString(),
        rollingHash: messagesRollingHash.toString(),
      },
      transactionHash: `0x${l1BlockNum}`,
    } as Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>;
    l2MessageSentLogs.push(log);
    return { log, leaf, index };
  };

  const makeMessageSentEvents = (fromL1BlockNum: bigint, checkpointNumber: CheckpointNumber, messages: Fr[]) => {
    return messages.map((msg, index) =>
      makeMessageSentEvent(fromL1BlockNum + BigInt(index), checkpointNumber, BigInt(index), msg),
    );
  };

  /**
   * Makes a fake rollup tx for testing purposes.
   * @param checkpoint - The checkpoint.
   * @returns A fake tx with calldata that corresponds to calling process in the Rollup contract.
   */
  const makeRollupTx = (checkpoint: Checkpoint, signers: Secp256k1Signer[] = []) => {
    const attestations = signers
      .map(signer => makeCheckpointAttestationFromCheckpoint(checkpoint, signer))
      .map(attestation => CommitteeAttestation.fromSignature(attestation.signature))
      .map(committeeAttestation => committeeAttestation.toViem());
    const header = checkpoint.header.toViem();
    const blobInput = getPrefixedEthBlobCommitments(getBlobsPerL1Block(checkpoint.toBlobFields()));
    const archive = toHex(checkpoint.archive.root.toBuffer());
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(
      attestations.map(attestation => CommitteeAttestation.fromViem(attestation)),
    );

    const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
      attestationsAndSigners,
      signers[0],
    );
    const rollupInput = encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args: [
        {
          header,
          archive,
          oracleInput: { feeAssetPriceModifier: 0n },
        },
        attestationsAndSigners.getPackedAttestations(),
        attestationsAndSigners.getSigners().map(signer => signer.toString()),
        attestationsAndSignersSignature.toViemSignature(),
        blobInput,
      ],
    });

    const multiCallInput = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [
        [
          {
            target: rollupAddress.toString(),
            callData: rollupInput,
            allowFailure: false,
          },
        ],
      ],
    });
    const tx = {
      input: multiCallInput,
      hash: archive,
      blockHash: archive,
      to: MULTI_CALL_3_ADDRESS as `0x${string}`,
    } as Transaction<bigint, number>;
    allRollupTxs.set(checkpoint.archive.root.toString(), tx);
    return tx;
  };

  /**
   * Makes versioned blob hashes for testing purposes.
   * @param checkpoint - The checkpoint.
   * @returns Versioned blob hashes.
   */
  const makeVersionedBlobHashes = (checkpoint: Checkpoint): `0x${string}`[] => {
    const blobFields = checkpoint.toBlobFields();
    const blobs = getBlobsPerL1Block(blobFields);
    const blobHashes = blobs.map(b => b.getEthVersionedBlobHash()).map(bufferToHex);
    allVersionedBlobHashes.set(checkpoint.archive.root.toString(), blobHashes);
    return blobHashes;
  };

  /**
   * Blob response to be returned from the blob client based on the expected checkpoint.
   * @param checkpoint - The checkpoint.
   * @returns The blobs.
   */
  const makeBlobsFromCheckpoint = (checkpoint: Checkpoint) => {
    const blobFields = checkpoint.toBlobFields();
    const blobs = getBlobsPerL1Block(blobFields);
    allBlobs.set(checkpoint.archive.root.toString(), blobs);
    return blobs;
  };
});
