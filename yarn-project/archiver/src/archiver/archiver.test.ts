import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { InboxContract, MULTI_CALL_3_ADDRESS, RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2BlockNew,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { InboxLeaf, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import {
  makeAndSignCommitteeAttestationsAndSigners,
  makeAttestationFromCheckpoint,
  makeStateReference,
  mockCheckpointAndMessages,
} from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import assert from 'assert';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type FormattedBlock,
  type GetBlockReturnType,
  type Log,
  type Transaction,
  encodeFunctionData,
  multicall3Abi,
  toHex,
} from 'viem';

import { Archiver } from './archiver.js';
import type { ArchiverDataStore } from './archiver_store.js';
import { InitialBlockNumberNotSequentialError, InitialCheckpointNumberNotSequentialError } from './errors.js';
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

    const contractAddresses = {
      rollupAddress,
      inboxAddress,
      registryAddress,
      governanceProposerAddress,
      slashFactoryAddress,
      slashingProposerAddress,
    };

    archiver = new Archiver(
      publicClient,
      debugClient,
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

    // TODO(palla/archiver) Instead of guessing the archiver requests with mockResolvedValueOnce,
    // we should use a mock implementation that returns the expected value based on the input.

    publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) =>
      Promise.resolve(args.hash ? (allRollupTxs.get(args.hash) as any) : undefined),
    );

    blobClient.getBlobSidecar.mockImplementation((blockId: `0x${string}`, _requestedBlobHashes?: Buffer[]) =>
      Promise.resolve(allBlobs.get(blockId) || []),
    );

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
    (archiver as any).rollup = rollupWrapper;

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
    (archiver as any).inbox = inboxWrapper;

    l2MessageSentLogs = [];
    checkpointProposedLogs = [];
    allRollupTxs = new Map();
    allVersionedBlobHashes = new Map();
    allBlobs = new Map();
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  it('syncs l1 to l2 messages and checkpoints', async () => {
    expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(0));

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    mockL1BlockNumbers(2500n, 2510n, 2520n);

    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoints[0].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValue([
        1n,
        checkpoints[0].archive.root.toString(),
        3n,
        checkpoints[2].archive.root.toString(),
        checkpoints[0].archive.root.toString(),
      ]);

    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvents(98n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeCheckpointProposedEvent(101n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);

    makeMessageSentEvents(2504n, checkpoints[1].number, messagesPerCheckpoint[1]);
    makeCheckpointProposedEvent(2507n, checkpoints[1].number, checkpoints[1].archive.root.toString(), blobHashes[1]);

    makeMessageSentEvents(2511n, checkpoints[2].number, messagesPerCheckpoint[2]);
    makeCheckpointProposedEvent(2515n, checkpoints[2].number, checkpoints[2].archive.root.toString(), blobHashes[2]);

    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length))
      .mockResolvedValueOnce(
        makeInboxStateFromMsgCount(messagesPerCheckpoint[1].length + messagesPerCheckpoint[2].length),
      );

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));

    await archiver.start(false);

    // Wait until checkpoint 3 is processed. If this won't happen the test will fail with timeout.
    await waitUntilArchiverCheckpoint(CheckpointNumber(3));

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

    expect(await archiver.getL1ToL2Messages(checkpoints[0].number)).toEqual(messagesPerCheckpoint[0]);
    expect(await archiver.getL1ToL2Messages(checkpoints[1].number)).toEqual(messagesPerCheckpoint[1]);
    expect(await archiver.getL1ToL2Messages(checkpoints[2].number)).toEqual(messagesPerCheckpoint[2]);

    // Expect logs to correspond to what is set by L2Block.random(...)
    for (const checkpoint of checkpoints) {
      for (const block of checkpoint.blocks) {
        const blockNumber = block.number;

        const privateLogs = (await archiver.getBlock(blockNumber))!.toL2Block().getPrivateLogs();
        const expectedTotalNumPrivateLogs = block.body.txEffects.reduce(
          (acc, txEffect) => acc + txEffect.privateLogs.length,
          0,
        );
        expect(privateLogs.length).toBe(expectedTotalNumPrivateLogs);

        const publicLogs = (await archiver.getPublicLogs({ fromBlock: blockNumber, toBlock: blockNumber + 1 })).logs;
        const expectedTotalNumPublicLogs = block.body.txEffects.reduce(
          (acc, txEffect) => acc + txEffect.publicLogs.length,
          0,
        );
        expect(publicLogs.length).toBe(expectedTotalNumPublicLogs);

        const contractClassLogs = await archiver.getContractClassLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber + 1,
        });
        const expectedTotalNumContractClassLogs = block.body.txEffects.reduce(
          (acc, txEffect) => acc + txEffect.contractClassLogs.length,
          0,
        );
        expect(contractClassLogs.logs.length).toBe(expectedTotalNumContractClassLogs);
      }
    }

    // Check last proven checkpoint number
    expect(await archiver.getProvenCheckpointNumber()).toBe(CheckpointNumber(1));

    // Get checkpoints
    expect((await archiver.getPublishedCheckpoints(CheckpointNumber(1), 100)).map(b => b.checkpoint.number)).toEqual([
      1, 2, 3,
    ]);
  }, 10_000);

  it('ignores checkpoint 3 because it has been pruned', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'warn');

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const numCheckpointsInTest = 2;

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    // Here we set the current L1 block number to 102. L1 to L2 messages after this should not be read.
    publicClient.getBlockNumber.mockResolvedValue(102n);

    const badArchive = Fr.random().toString();
    const badBlobHash = Fr.random().toString();

    makeMessageSentEvents(50n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeMessageSentEvents(60n, checkpoints[1].number, messagesPerCheckpoint[1]);
    makeMessageSentEvents(66n, checkpoints[2].number, messagesPerCheckpoint[2]);
    mockInbox.read.getState.mockResolvedValue(
      makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
    );

    makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, checkpoints[1].number, checkpoints[1].archive.root.toString(), blobHashes[1]);
    makeCheckpointProposedEvent(90n, checkpoints[2].number, badArchive, [badBlobHash]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      checkpoints[1].archive.root.toString(),
      GENESIS_ROOT,
    ]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(b => makeBlobsFromCheckpoint(b));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    const expectedCheckpointNumber = CheckpointNumber(numCheckpointsInTest);
    await waitUntilArchiverCheckpoint(expectedCheckpointNumber);

    expect(await archiver.getCheckpointNumber()).toEqual(expectedCheckpointNumber);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringMatching(/archive root mismatch/i), {
      actual: badArchive,
      expected: checkpoints[2].archive.root.toString(),
    });
  }, 10_000);

  it('ignores checkpoints because of invalid attestations', async () => {
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    // Setup a committee of 3 signers
    mockRollupRead.getTargetCommitteeSize.mockResolvedValue(3n);
    const signers = times(3, Secp256k1Signer.random);
    const committee = signers.map(signer => signer.address);
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee } as EpochCommitteeInfo);

    // Setup spy to listen for InvalidBlockDetected events
    const invalidBlockDetectedSpy = jest.fn();
    archiver.on(L2BlockSourceEvents.InvalidAttestationsBlockDetected, invalidBlockDetectedSpy);

    // Add messages for all good checkpoints
    messagesPerCheckpoint.map((messages, i) =>
      makeMessageSentEvents(50n + BigInt(i) * 3n, checkpoints[i].number, messages),
    );
    mockInbox.read.getState.mockResolvedValue(
      makeInboxStateFromMsgCount(messagesPerCheckpoint.reduce((acc, curr) => acc + curr.length, 0)),
    );

    // Add the attestations from the signers to all 3 good checkpoints
    checkpoints.map(c => makeRollupTx(c, signers));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);
    checkpoints.map(c => makeBlobsFromCheckpoint(c));
    const goodCheckpoints = [...checkpoints];

    // We create two bad checkpoints with checkpointNumber 2, and one bad checkpoint with checkpointNumber 3
    // They need to chain from checkpoint 1's last block archive to pass the archive consistency check
    const checkpointStartNumber = CheckpointNumber(2);
    const checkpoint1LastBlockArchive = goodCheckpoints[0].blocks[goodCheckpoints[0].blocks.length - 1].archive;
    const badCheckpointsAndMessages = [
      ...(await makeCheckpointsAndMessages(1, {
        checkpointStartNumber,
        blockStartNumber: 2,
        numL1ToL2Messages: 0,
        previousArchive: checkpoint1LastBlockArchive,
      })), // Bad checkpoint 2
      ...(await makeCheckpointsAndMessages(2, {
        checkpointStartNumber,
        blockStartNumber: 2,
        numL1ToL2Messages: 0,
        previousArchive: checkpoint1LastBlockArchive,
      })), // Bad checkpoint 2b and 3
    ];
    const badCheckpoints = badCheckpointsAndMessages.map(c => c.checkpoint);
    // And define bad checkpoints with attestations from random signers
    badCheckpoints.map(c => makeRollupTx(c, times(3, Secp256k1Signer.random)));
    const badBlobHashes = badCheckpoints.map(c => makeVersionedBlobHashes(c));
    badCheckpoints.map(c => makeBlobsFromCheckpoint(c));

    checkpoints.forEach(c =>
      logger.warn(`Created valid checkpoint ${c.number} with root ${c.archive.root.toString()}`),
    );
    badCheckpoints.forEach(c =>
      logger.warn(`Created invalid checkpoint ${c.number} with root ${c.archive.root.toString()}`),
    );

    // Return the archive root for the bad checkpoint 2 when L1 is queried
    checkpoints[1] = badCheckpoints[0];

    // During the first archiver loop, we fetch checkpoint 1 and the bad checkpoint 2 with bad attestations
    publicClient.getBlockNumber.mockResolvedValue(82n);
    makeCheckpointProposedEvent(70n, CheckpointNumber(1), checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, CheckpointNumber(2), badCheckpoints[0].archive.root.toString(), badBlobHashes[0]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      badCheckpoints[0].archive.root.toString(),
      GENESIS_ROOT,
    ]);

    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    expect(await archiver.getPendingChainValidationStatus()).toEqual(
      expect.objectContaining({
        valid: false,
        reason: 'invalid-attestation',
        invalidIndex: 0,
        committee,
      }),
    );

    // Check that InvalidBlockDetected event was emitted for the bad block
    expect(invalidBlockDetectedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
        validationResult: expect.objectContaining({
          valid: false,
          reason: 'invalid-attestation',
          invalidIndex: 0,
          block: expect.objectContaining({ blockNumber: 2 }),
        }),
      }),
    );

    // Another loop, where a proposer invalidates the invalid checkpoint 2, but proposes another invalid checkpoint 2 (2b)
    logger.warn(`Adding new checkpoint 2 with bad attestations`);
    publicClient.getBlockNumber.mockResolvedValue(85n);
    makeCheckpointProposedEvent(85n, CheckpointNumber(2), badCheckpoints[1].archive.root.toString(), badBlobHashes[1]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      badCheckpoints[1].archive.root.toString(),
      checkpoints[0].archive.root.toString(),
    ]);
    checkpoints[1] = badCheckpoints[1];

    // Our chain validation status should be updated to point to the new bad checkpoint 2b
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    let validationStatus = await archiver.getPendingChainValidationStatus();
    assert(!validationStatus.valid);
    expect(validationStatus.block.blockNumber).toEqual(2);
    expect(validationStatus.block.archive.toString()).toEqual(badCheckpoints[1].archive.root.toString());

    // Now another loop, where we propose a checkpoint 3 with bad attestations
    logger.warn(`Adding new checkpoint 3 with bad attestations`);
    publicClient.getBlockNumber.mockResolvedValue(90n);
    makeCheckpointProposedEvent(88n, CheckpointNumber(3), badCheckpoints[2].archive.root.toString(), badBlobHashes[2]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      3n,
      badCheckpoints[2].archive.root.toString(),
      checkpoints[0].archive.root.toString(),
    ]);
    checkpoints[2] = badCheckpoints[2];

    // We should still be at checkpoint 1, and the pending chain validation status should still be invalid and point to checkpoint 2b
    // since we want the archiver to always return the earliest checkpoint with invalid attestations
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    validationStatus = await archiver.getPendingChainValidationStatus();
    assert(!validationStatus.valid);
    expect(validationStatus.block.blockNumber).toEqual(2);
    expect(validationStatus.block.archive.toString()).toEqual(badCheckpoints[1].archive.root.toString());

    // Check that InvalidBlockDetected event was also emitted for bad block 3
    expect(invalidBlockDetectedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
        validationResult: expect.objectContaining({
          valid: false,
          reason: 'invalid-attestation',
          invalidIndex: 0,
          block: expect.objectContaining({ blockNumber: 3 }),
        }),
      }),
    );

    // Should have been called three times total: bad checkpoint 2, bad checkpoint 2b, and bad checkpoint 3
    expect(invalidBlockDetectedSpy).toHaveBeenCalledTimes(3);

    // Now we go for another loop, where proper checkpoints 2 and 3 are proposed with correct attestations
    // IRL there would be an "Invalidated" event, but we are not currently relying on it
    logger.warn(`Adding new checkpoints 2 and 3 with correct attestations`);
    publicClient.getBlockNumber.mockResolvedValue(100n);
    makeCheckpointProposedEvent(94n, CheckpointNumber(2), goodCheckpoints[1].archive.root.toString(), blobHashes[1]);
    makeCheckpointProposedEvent(95n, CheckpointNumber(3), goodCheckpoints[2].archive.root.toString(), blobHashes[2]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      3n,
      goodCheckpoints[2].archive.root.toString(),
      goodCheckpoints[0].archive.root.toString(),
    ]);
    checkpoints = goodCheckpoints;

    // Now we should move to checkpoint 3
    await archiver.syncImmediate();
    await waitUntilArchiverCheckpoint(CheckpointNumber(3));
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

    // And checkpoint 2 should return the proper one
    const [checkpoint2] = await archiver.getPublishedCheckpoints(CheckpointNumber(2), 1);
    expect(checkpoint2.checkpoint.number).toEqual(2);
    expect(checkpoint2.checkpoint.archive.root.toString()).toEqual(checkpoints[1].archive.root.toString());
    expect(checkpoint2.attestations.length).toEqual(3);

    // With a valid pending chain validation status
    expect(await archiver.getPendingChainValidationStatus()).toEqual(expect.objectContaining({ valid: true }));
  }, 10_000);

  it('stop processing if one of the checkpoints has a mismatch inHash', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'fatal');

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    // Here we set the current L1 block number to 102. L1 to L2 messages after this should not be read.
    publicClient.getBlockNumber.mockResolvedValue(102n);

    makeMessageSentEvents(50n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeMessageSentEvents(60n, checkpoints[1].number, messagesPerCheckpoint[1]);
    // Only the first message will be synced. The rest have larger L1 block numbers than 102n.
    makeMessageSentEvents(102n, checkpoints[2].number, messagesPerCheckpoint[2]);
    const computedInHash = computeInHashFromL1ToL2Messages(messagesPerCheckpoint[2].slice(0, 1));
    mockInbox.read.getState.mockResolvedValue(
      makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length + 1),
    );

    checkpoints.forEach((c, i) =>
      makeCheckpointProposedEvent(70n + BigInt(i) * 10n, c.number, c.archive.root.toString(), blobHashes[i]),
    );
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      checkpoints[2].archive.root.toString(),
      GENESIS_ROOT,
    ]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(b => makeBlobsFromCheckpoint(b));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Give it some time to attempt processing
    await sleep(1000);

    // Should still be at checkpoint 0 since the error prevent the batch of checkpoints from being processed.
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Mismatch inHash for checkpoint 3/i),
      expect.objectContaining({
        computedInHash,
        publishedInHash: checkpoints[2].header.contentCommitment.inHash,
      }),
    );
  }, 10_000);

  it('skip event search if no changes found', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const numCheckpointsInTest = 2;

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    mockL1BlockNumbers(50n, 100n);

    makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, checkpoints[1].number, checkpoints[1].archive.root.toString(), blobHashes[1]);
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, checkpoints[1].archive.root.toString(), GENESIS_ROOT]);

    makeMessageSentEvents(60n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeMessageSentEvents(66n, checkpoints[1].number, messagesPerCheckpoint[1]);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    const expectedCheckpointNumber = CheckpointNumber(numCheckpointsInTest);
    await waitUntilArchiverCheckpoint(expectedCheckpointNumber);

    expect(await archiver.getCheckpointNumber()).toEqual(expectedCheckpointNumber);
    expect(loggerSpy).toHaveBeenCalledWith(`No checkpoints to retrieve from 1 to 50, no checkpoints on chain`);
  }, 10_000);

  it('handles L2 reorg', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');
    const allCheckpoints = [...checkpoints];
    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    publicClient.getBlockNumber.mockResolvedValue(50n);

    makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, checkpoints[1].number, checkpoints[1].archive.root.toString(), blobHashes[1]);

    // We will return status at first to have an empty round, then as if we have 2 pending checkpoints, and finally
    // Just a single pending checkpoint returning a "failure" for the expected pending checkpoint
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, checkpoints[1].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoints[0].archive.root.toString(), Fr.ZERO.toString()]);

    makeMessageSentEvents(60n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeMessageSentEvents(66n, checkpoints[1].number, messagesPerCheckpoint[1]);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    logger.warn(`Initial sync with no checkpoints to retrieve`);
    await archiver.syncImmediate();
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(`No checkpoints to retrieve from 1 to 50`));
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    logger.warn(`Expecting sync to checkpoint 2`);
    publicClient.getBlockNumber.mockResolvedValue(90n);
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

    logger.warn(`Expecting prune back to checkpoint 1`);
    publicClient.getBlockNumber.mockResolvedValue(95n);
    checkpoints = checkpoints.slice(0, 1); // Keep only checkpoint 1 as the valid checkpoint
    await archiver.syncImmediate();
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(`L2 prune has been detected`), expect.anything());
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

    const txHash = allCheckpoints[1].blocks[0].body.txEffects[0].txHash;
    expect(await archiver.getTxEffect(txHash)).resolves.toBeUndefined;
    expect(await archiver.getPublishedCheckpoints(CheckpointNumber(2), 1)).toEqual([]);

    expect((await archiver.getPublicLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
    expect((await archiver.getContractClassLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
  }, 10_000);

  it('handles updated messages due to L1 reorg', async () => {
    let l1BlockNumber = 110n;
    publicClient.getBlockNumber.mockImplementation(() => Promise.resolve(l1BlockNumber++));

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    // Creates messages for checkpoints 1 and 3, across L1 blocks 100 and 101
    makeMessageSentEvent(100n, CheckpointNumber(1), 0n, Fr.random());
    makeMessageSentEvent(100n, CheckpointNumber(1), 1n, Fr.random());
    makeMessageSentEvent(101n, CheckpointNumber(3), 0n, Fr.random());
    makeMessageSentEvent(101n, CheckpointNumber(3), 1n, Fr.random());
    makeMessageSentEvent(101n, CheckpointNumber(3), 2n, Fr.random());
    makeMessageSentEvent(101n, CheckpointNumber(3), 3n, Fr.random());
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(5));

    await archiver.start(false);

    await retryUntil(
      () => archiver.getL1ToL2Messages(CheckpointNumber(3)).then(msgs => msgs.length === 4),
      'sync',
      10,
      0.1,
    );

    expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(4);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(0);

    // Drops the last 2 messages from checkpoint 3, and adds new messages for checkpoints 4 and 5
    // Note the overlap in L1 blocks, to test reinsertion of messages
    logger.warn(`Reorging L1 to L2 messages`);
    l2MessageSentLogs.splice(4);
    messagesRollingHash = Buffer16.fromString(l2MessageSentLogs.at(-1)!.args.rollingHash);
    const { leaf: msg40 } = makeMessageSentEvent(101n, CheckpointNumber(4), 0n, Fr.random());
    const { leaf: msg50 } = makeMessageSentEvent(101n, CheckpointNumber(5), 0n, Fr.random());
    const { leaf: msg51 } = makeMessageSentEvent(102n, CheckpointNumber(5), 1n, Fr.random());
    expect(l2MessageSentLogs).toHaveLength(7);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(7));

    await retryUntil(
      () => archiver.getL1ToL2Messages(CheckpointNumber(5)).then(msgs => msgs.length === 2),
      're-sync',
      10,
      0.1,
    );

    expect(await archiver.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(1);
    expect(await archiver.getL1ToL2Messages(CheckpointNumber(5))).toHaveLength(2);

    expect((await archiver.getL1ToL2Messages(CheckpointNumber(4))).map(leaf => leaf.toString())).toEqual(
      [msg40].map(leaf => leaf.toString()),
    );
    expect((await archiver.getL1ToL2Messages(CheckpointNumber(5))).map(leaf => leaf.toString())).toEqual(
      [msg50, msg51].map(leaf => leaf.toString()),
    );
  });

  it('reports an epoch as pending if the current checkpoint is not in the last slot of the epoch', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const notLastL2SlotInEpoch = epochDuration - 2;
    const l1BlockForCheckpoint = l1StartBlock + BigInt((notLastL2SlotInEpoch * slotDuration) / ethereumSlotDuration);
    expect(notLastL2SlotInEpoch).toEqual(2);

    logger.info(`Syncing checkpoint on slot ${notLastL2SlotInEpoch} mined in L1 block ${l1BlockForCheckpoint}`);
    const checkpoint = checkpoints[0];
    checkpoint.header.slotNumber = SlotNumber(notLastL2SlotInEpoch);
    checkpoints = [checkpoint];
    const blobHashes = makeVersionedBlobHashes(checkpoint);

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForCheckpoint);
    mockRollup.read.status.mockResolvedValueOnce([
      0n,
      GENESIS_ROOT,
      1n,
      checkpoint.archive.root.toString(),
      GENESIS_ROOT,
    ]);
    makeCheckpointProposedEvent(
      l1BlockForCheckpoint,
      checkpoint.number,
      checkpoint.archive.root.toString(),
      blobHashes,
    );
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvents(1n, checkpoint.number, messagesPerCheckpoint[0]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);

    // Wait until checkpoint 1 is processed
    await waitUntilArchiverCheckpoint(CheckpointNumber(1));

    // Epoch should not be complete
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);
  });

  it('reports an epoch as complete if the current checkpoint is in the last slot of the epoch', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL2SlotInEpoch = epochDuration - 1;
    const l1BlockForCheckpoint = l1StartBlock + BigInt((lastL2SlotInEpoch * slotDuration) / ethereumSlotDuration);
    expect(lastL2SlotInEpoch).toEqual(3);

    logger.info(`Syncing checkpoint on slot ${lastL2SlotInEpoch} mined in L1 block ${l1BlockForCheckpoint}`);
    const checkpoint = checkpoints[0];
    checkpoint.header.slotNumber = SlotNumber(lastL2SlotInEpoch);
    checkpoints = [checkpoint];
    const blobHashes = makeVersionedBlobHashes(checkpoint);

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForCheckpoint);
    mockRollup.read.status.mockResolvedValueOnce([
      0n,
      GENESIS_ROOT,
      1n,
      checkpoint.archive.root.toString(),
      GENESIS_ROOT,
    ]);
    makeCheckpointProposedEvent(
      l1BlockForCheckpoint,
      checkpoint.number,
      checkpoint.archive.root.toString(),
      blobHashes,
    );

    makeMessageSentEvents(1n, checkpoint.number, messagesPerCheckpoint[0]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);

    // Wait until checkpoint 1 is processed
    await waitUntilArchiverCheckpoint(CheckpointNumber(1));

    // Epoch should be complete once checkpoint 1 was synced
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
  });

  it('reports an epoch as pending if the current L1 block is not the last one on the epoch and no checkpoint landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const notLastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 2n;
    expect(notLastL1BlockForEpoch).toEqual(6n);

    logger.info(`Syncing archiver to L1 block ${notLastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValue(notLastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);
  });

  it('reports an epoch as complete if the current L1 block is the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;
    expect(lastL1BlockForEpoch).toEqual(7n);

    logger.info(`Syncing archiver to L1 block ${lastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12631
  it('reports an epoch as complete due to timestamp only once all its checkpoints have been synced', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const l2Slot = 1;
    const l1BlockForCheckpoint = l1StartBlock + BigInt((l2Slot * slotDuration) / ethereumSlotDuration);
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;

    logger.info(`Syncing epoch 0 with checkpoint on slot ${l2Slot} mined in L1 block ${l1BlockForCheckpoint}`);
    const checkpoint = checkpoints[0];
    checkpoint.header.slotNumber = SlotNumber(l2Slot);
    checkpoints = [checkpoint];
    const blobHashes = makeVersionedBlobHashes(checkpoint);

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([
      0n,
      GENESIS_ROOT,
      1n,
      checkpoint.archive.root.toString(),
      GENESIS_ROOT,
    ]);
    makeCheckpointProposedEvent(
      l1BlockForCheckpoint,
      checkpoint.number,
      checkpoint.archive.root.toString(),
      blobHashes,
    );

    makeMessageSentEvents(1n, checkpoint.number, messagesPerCheckpoint[0]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(false);
    while (!(await archiver.isEpochComplete(EpochNumber(0)))) {
      // No sleep, we want to know exactly when the epoch completes
    }

    // Once epoch is flagged as complete, checkpoint number must be 1
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
    expect(await archiver.isEpochComplete(EpochNumber(0))).toBe(true);
  });

  it('starts new loop if latest L1 block has advanced beyond what a non-archive L1 node tracks', async () => {
    publicClient.getBlockNumber.mockResolvedValueOnce(2000n).mockResolvedValueOnce(2400n);
    await expect((archiver as any).sync(true)).rejects.toThrow(/more than 128 blocks behind/i);
  });

  it('throws if ethereum node is not synced at startup', async () => {
    const maxAllowedDelay = 300; // maxAllowedEthClientDriftSeconds from config
    const currentTime = BigInt(dateProvider.nowInSeconds());
    const oldBlockTimestamp = currentTime - BigInt(maxAllowedDelay + 100); // Block is too old

    // Mock getBlock to return a block with an old timestamp
    publicClient.getBlock.mockResolvedValueOnce({
      number: 1000n,
      timestamp: oldBlockTimestamp,
      hash: Buffer32.random().toString(),
    } as GetBlockReturnType);

    await expect(archiver.start(false)).rejects.toThrow(/Ethereum node is out of sync/);
  });

  it('initial sync does not complete until archiver catches up with latest L1 block', async () => {
    const rollupTxs = checkpoints.slice(0, 1).map(c => makeRollupTx(c));
    const blobHashes = checkpoints.slice(0, 1).map(makeVersionedBlobHashes);
    const blobsFromCheckpoints = checkpoints.slice(0, 1).map(c => makeBlobsFromCheckpoint(c));

    // We track how many times getBlockNumber is called to simulate L1 advancing during sync
    publicClient.getBlockNumber
      .mockResolvedValueOnce(100n)
      .mockResolvedValueOnce(100n)
      .mockResolvedValueOnce(100n)
      .mockResolvedValue(103n);

    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      1n,
      checkpoints[0].archive.root.toString(),
      GENESIS_ROOT,
    ]);
    makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    blobsFromCheckpoints.forEach(blobs => blobClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvents(1n, checkpoints[0].number, messagesPerCheckpoint[0]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

    // Expect first checkpoint to be synced
    await archiver.syncImmediate();

    // Initial sync should not be complete yet because L1 advanced during sync
    // The check is: currentL1BlockNumber + 1n >= getBlockNumber()
    // We synced up to 100, but latest is 103, so 100 + 1 >= 103 is false
    expect(archiver.isInitialSyncComplete()).toBe(false);

    // Trigger another sync - this time L1 stays at 103
    await archiver.syncImmediate();

    // Now initial sync should be complete (103 + 1 >= 103)
    await retryUntil(() => Promise.resolve(archiver.isInitialSyncComplete()), 'initial sync complete', 10, 0.1);
    expect(archiver.isInitialSyncComplete()).toBe(true);
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/13604
  it('handles a checkpoint gap due to a spurious L2 prune', async () => {
    expect(await archiver.getBlockNumber()).toEqual(0);

    const _rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);
    const _blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));

    // Return the corresponding archive roots for the current blocks
    const allCheckpoints = [...checkpoints];
    checkpoints = allCheckpoints.slice(0, 2);

    // Start at L1 block 90, we'll advance this every time we want the archiver to do something
    publicClient.getBlockNumber.mockResolvedValue(90n);

    // Status first returns the two checkpoints, only so that it then "forgets" the initial checkpoint to add it back later
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      checkpoints[1].archive.root.toString(),
      GENESIS_ROOT,
    ]);

    // No messages for this test
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));

    makeCheckpointProposedEvent(70n, checkpoints[0].number, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, checkpoints[1].number, checkpoints[1].archive.root.toString(), blobHashes[1]);
    makeMessageSentEvents(60n, checkpoints[0].number, messagesPerCheckpoint[0]);
    makeMessageSentEvents(65n, checkpoints[1].number, messagesPerCheckpoint[1]);
    mockInbox.read.getState.mockResolvedValueOnce(
      makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length + messagesPerCheckpoint[1].length),
    );

    // Wait until the archiver gets to the target checkpoint
    logger.warn(`Expecting sync to checkpoint 2`);
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));

    // And now the rollup contract suddenly forgets about the last checkpoint, so the archiver rolls back
    // This is the spurious prune that the archiver needs to recover from on the next iteration
    // We presume this happens because of L1 reorgs or more likely faulty L1 RPC providers
    const ZERO = Fr.ZERO.toString();
    publicClient.getBlockNumber.mockResolvedValue(95n);
    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, checkpoints[0].archive.root.toString(), ZERO]);
    checkpoints = allCheckpoints.slice(0, 1);
    logger.warn(`Expecting sync to checkpoint 1`);
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

    // But it was just a fluke, and the rollup keeps advancing. We even get checkpoint 3, which triggers
    // the archiver's "Rolling back L1 sync point..." handler when trying to insert it with checkpoint 2 missing.
    checkpoints = allCheckpoints.slice(0, 3);
    publicClient.getBlockNumber.mockResolvedValue(105n);
    makeCheckpointProposedEvent(100n, checkpoints[2].number, checkpoints[2].archive.root.toString(), blobHashes[2]);
    makeMessageSentEvents(90n, checkpoints[2].number, messagesPerCheckpoint[2]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[2].length));

    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      3n,
      checkpoints[2].archive.root.toString(),
      checkpoints[0].archive.root.toString(),
    ]);

    // Then the archiver must reprocess the old checkpoint to get to the new one
    // The first sync iteration throws a non-sequential error and triggers the rollback,
    // then the second sync iteration should succeed with the updated syncpoint.
    logger.warn(`Expecting sync to checkpoint 3`);
    await expect(() => archiver.syncImmediate()).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));
  });

  it('stop processing checkpoint if blob fields are not encoded correctly', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'fatal');

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const checkpoint = checkpoints[0];
    const rollupTx = makeRollupTx(checkpoint);

    mockL1BlockNumbers(100n);

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, checkpoint.archive.root.toString(), GENESIS_ROOT]);

    const randomBlob = makeRandomBlob(3);
    const randomBlobHash = randomBlob.getEthVersionedBlobHash();

    makeCheckpointProposedEvent(70n, checkpoint.number, checkpoint.archive.root.toString(), [
      `0x${randomBlobHash.toString()}`,
    ]);
    makeMessageSentEvents(60n, checkpoint.number, messagesPerCheckpoint[0]);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messagesPerCheckpoint[0].length));

    // Mock getBlobSidecar to return a random blob instead of the expected one
    blobClient.getBlobSidecar.mockResolvedValueOnce([randomBlob]);

    publicClient.getTransaction.mockResolvedValueOnce(rollupTx);

    await archiver.start(false);

    // Give it some time to attempt processing
    await sleep(1000);

    // Should still be at checkpoint 0 since the blob processing failed
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    expect(loggerSpy).toHaveBeenCalledWith(expect.stringMatching(/incorrect encoding of blob fields/i));
  }, 10_000);

  it('can process checkpoint containing multiple blobs', async () => {
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    // Create a checkpoint with large blob data that requires multiple blobs
    const [{ checkpoint, messages }] = await makeCheckpointsAndMessages(1, {
      numBlocksPerCheckpoint: 1,
      txsPerBlock: 5,
      maxEffects: 100,
    });
    checkpoints = [checkpoint];
    const blobHashes = makeVersionedBlobHashes(checkpoint);
    expect(blobHashes.length).toBeGreaterThan(1);

    const rollupTx = makeRollupTx(checkpoint);

    mockL1BlockNumbers(100n);

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, checkpoint.archive.root.toString(), GENESIS_ROOT]);

    makeCheckpointProposedEvent(70n, checkpoint.number, checkpoint.archive.root.toString(), blobHashes);
    makeMessageSentEvents(60n, checkpoint.number, messages);
    mockInbox.read.getState.mockResolvedValueOnce(makeInboxStateFromMsgCount(messages.length));

    const blobsFromCheckpoint = makeBlobsFromCheckpoint(checkpoint);
    expect(blobsFromCheckpoint.length).toBeGreaterThan(1);
    blobClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint);

    publicClient.getTransaction.mockResolvedValueOnce(rollupTx);

    await archiver.start(false);

    // Wait until checkpoint 1 is processed. If this won't happen the test will fail with timeout.
    const expectedCheckpointNumber = CheckpointNumber(1);
    await waitUntilArchiverCheckpoint(expectedCheckpointNumber);

    expect(await archiver.getCheckpointNumber()).toEqual(expectedCheckpointNumber);

    // Verify the checkpoint was synced successfully
    const syncedCheckpoints = await archiver.getPublishedCheckpoints(expectedCheckpointNumber, 1);
    expect(syncedCheckpoints).toBeDefined();
    expect(syncedCheckpoints.length).toBeGreaterThan(0);
    expect(syncedCheckpoints[0]).toBeDefined();
    expect(syncedCheckpoints[0].checkpoint.blocks.length).toBe(1);
    // The tx effects should be the decoded correctly from the blobs
    expect(syncedCheckpoints[0].checkpoint.blocks.map(b => b.body.txEffects)).toEqual(
      checkpoint.blocks.map(b => b.body.txEffects),
    );
  }, 10_000);

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

      // Now add blocks for checkpoint 2 via addBlock (simulating local block production)
      const checkpoint2 = checkpoints[1];
      for (const block of checkpoint2.blocks) {
        await archiver.addBlock(block);
      }

      // Verify blocks are retrievable but not yet checkpointed
      const lastBlockInCheckpoint2 = checkpoint2.blocks[checkpoint2.blocks.length - 1].number;
      expect(await archiver.getBlockNumber()).toEqual(lastBlockInCheckpoint2);
      expect(await archiver.getSynchedCheckpointNumber()).toEqual(CheckpointNumber(1));

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

      const checkpointedBlock = await archiver.getCheckpointedBlock(BlockNumber(firstNewBlockNumber));
      expect(checkpointedBlock).toBeDefined();
      expect(checkpointedBlock!.checkpointNumber).toEqual(2);
    }, 10_000);
  });

  // TODO(palla/reorg): Add a unit test for the archiver handleEpochPrune
  xit('handles an upcoming L2 prune', () => {});

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
      .map(signer => makeAttestationFromCheckpoint(checkpoint, signer))
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
