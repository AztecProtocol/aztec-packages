import { getBlobsPerL1Block, getPrefixedEthBlobCommitments } from '@aztec/blob-lib';
import { makeRandomBlob } from '@aztec/blob-lib/testing';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { BlobWithIndex } from '@aztec/blob-sink/types';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig, InboxContract, RollupContract, type ViemPublicClient } from '@aztec/ethereum';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields/fields';
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
import { InboxLeaf } from '@aztec/stdlib/messaging';
import {
  makeAndSignCommitteeAttestationsAndSigners,
  makeAttestationFromCheckpoint,
  makeStateReference,
} from '@aztec/stdlib/testing';
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
  const rollupAddress = EthAddress.ZERO;
  const inboxAddress = EthAddress.ZERO;
  const registryAddress = EthAddress.ZERO;

  const mockL1BlockNumbers = (...nums: bigint[]) => {
    // During each archiver sync, we read the block number 3 times, so this ensures all three reads are consistent across the run.
    for (const blockNum of nums) {
      publicClient.getBlockNumber
        .mockResolvedValueOnce(blockNum)
        .mockResolvedValueOnce(blockNum)
        .mockResolvedValueOnce(blockNum);
    }
    publicClient.getBlockNumber.mockResolvedValue(nums.at(-1)!);
  };

  const makeBlock = async (blockNumber: number, txsPerBlock: number, maxEffects?: number) => {
    const block = await L2BlockNew.random(blockNumber, {
      txsPerBlock,
      state: makeStateReference(0x100),
      makeTxOptions: txIndex => ({
        numPublicCallsPerTx: blockNumber + 1,
        numPublicLogsPerCall: 2,
        numPrivateLogs: blockNumber + txIndex,
        maxEffects,
      }),
    });
    block.header.globalVariables.timestamp = BigInt(now + Number(ETHEREUM_SLOT_DURATION) * (blockNumber + 1));

    return block;
  };

  const makeCheckpoints = async (
    numCheckpoints: number,
    {
      numBlocksPerCheckpoint = 1,
      txsPerBlock = 4,
      checkpointStartNumber = CheckpointNumber(1),
      blockStartNumber = 1,
      maxEffects = 0,
    } = {},
  ) => {
    return await Promise.all(
      Array.from({ length: numCheckpoints }, async (_, i) => {
        const checkpointNumber = CheckpointNumber(i + checkpointStartNumber);
        const startBlockNumber = i * numBlocksPerCheckpoint + blockStartNumber;
        const checkpoint = await Checkpoint.random(checkpointNumber, { numBlocks: 0 });
        checkpoint.blocks = await Promise.all(
          Array.from({ length: numBlocksPerCheckpoint }, (_, i) =>
            makeBlock(startBlockNumber + i, txsPerBlock, maxEffects),
          ),
        );
        checkpoint.header.timestamp = checkpoint.blocks.at(-1)!.timestamp;
        return checkpoint;
      }),
    );
  };

  let publicClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobSinkClient: MockProxy<BlobSinkClientInterface>;
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
  let messagesRollingHash: Buffer16;
  let totalMessagesInserted: number;

  let checkpointProposedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'CheckpointProposed'>[];
  let l2MessageSentLogs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[];

  // Maps from block archive to the corresponding txs, versioned blob hashes, and blobs
  // REFACTOR: we should have a single method that creates all these artifacts, as well as the l2 proposed event
  let allRollupTxs: Map<`0x${string}`, Transaction>;
  let allVersionedBlobHashes: Map<`0x${string}`, `0x${string}`[]>;
  let allBlobs: Map<`0x${string}`, BlobWithIndex[]>;

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
    publicClient.getBlock.mockImplementation((async (args: { blockNumber?: bigint } = {}) => {
      args.blockNumber ??= await publicClient.getBlockNumber();
      return {
        number: args.blockNumber,
        timestamp: BigInt(args.blockNumber) * ETHEREUM_SLOT_DURATION + BigInt(now),
        hash: Buffer32.fromBigInt(BigInt(args.blockNumber)).toString(),
      } as FormattedBlock;
    }) as any);

    blobSinkClient = mock<BlobSinkClientInterface>();
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

    archiver = new Archiver(
      publicClient,
      { rollupAddress, inboxAddress, registryAddress },
      archiverStore,
      { pollingIntervalMs: 1000, batchSize: 1000, maxAllowedEthClientDriftSeconds: 300 },
      blobSinkClient,
      epochCache,
      dateProvider,
      instrumentation,
      l1Constants,
    );

    checkpoints = await makeCheckpoints(3);

    // TODO(palla/archiver) Instead of guessing the archiver requests with mockResolvedValueOnce,
    // we should use a mock implementation that returns the expected value based on the input.

    publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) =>
      Promise.resolve(args.hash ? (allRollupTxs.get(args.hash) as any) : undefined),
    );

    blobSinkClient.getBlobSidecar.mockImplementation((blockId: `0x${string}`, _requestedBlobHashes?: Buffer[]) =>
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
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvent(98n, 1n, 0n);
    makeMessageSentEvent(99n, 1n, 1n);
    makeCheckpointProposedEvent(101n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);

    makeMessageSentEvent(2504n, 2n, 0n);
    makeMessageSentEvent(2505n, 2n, 1n);
    makeMessageSentEvent(2505n, 2n, 2n);
    makeMessageSentEvent(2506n, 3n, 0n);
    makeCheckpointProposedEvent(2507n, 2n, checkpoints[1].archive.root.toString(), blobHashes[1]);
    makeCheckpointProposedEvent(2508n, 3n, checkpoints[2].archive.root.toString(), blobHashes[2]);

    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(2))
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(6));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));

    await archiver.start(false);

    // Wait until checkpoint 3 is processed. If this won't happen the test will fail with timeout.
    await waitUntilArchiverCheckpoint(CheckpointNumber(3));

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));

    expect(await archiver.getL1ToL2Messages(1)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2)).toHaveLength(3);
    expect(await archiver.getL1ToL2Messages(3)).toHaveLength(1);

    // Expect logs to correspond to what is set by L2Block.random(...)
    for (const checkpoint of checkpoints) {
      for (const block of checkpoint.blocks) {
        const blockNumber = block.number;

        const privateLogs = await archiver.getPrivateLogs(blockNumber, 1);
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
    expect((await archiver.getCheckpoints(CheckpointNumber(1), 100)).map(b => b.number)).toEqual([1, 2, 3]);
    // Get only proven checkpoints
    expect((await archiver.getCheckpoints(CheckpointNumber(1), 100, true)).map(b => b.number)).toEqual([1]);
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

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(2));

    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, 2n, checkpoints[1].archive.root.toString(), blobHashes[1]);
    makeCheckpointProposedEvent(90n, 3n, badArchive, [badBlobHash]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      2n,
      checkpoints[1].archive.root.toString(),
      GENESIS_ROOT,
    ]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(b => makeBlobsFromCheckpoint(b));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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

    // Add the attestations from the signers to all 3 good checkpoints
    checkpoints.map(c => makeRollupTx(c, signers));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);
    checkpoints.map(c => makeBlobsFromCheckpoint(c));
    const goodCheckpoints = [...checkpoints];

    // We create two bad checkpoints with checkpointNumber 2, and one bad checkpoint with checkpointNumber 3
    const checkpointStartNumber = CheckpointNumber(2);
    const badCheckpoints = [
      ...(await makeCheckpoints(1, { checkpointStartNumber, blockStartNumber: 2 })), // Bad checkpoint 2
      ...(await makeCheckpoints(2, { checkpointStartNumber, blockStartNumber: 2 })), // Bad checkpoint 2b and 3
    ];
    // And define bad checkpoints with attestations from random signers
    badCheckpoints.map(c => makeRollupTx(c, times(3, Secp256k1Signer.random)));
    const badBlobHashes = badCheckpoints.map(makeVersionedBlobHashes);
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
    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, 2n, badCheckpoints[0].archive.root.toString(), badBlobHashes[0]);
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
    makeCheckpointProposedEvent(85n, 2n, badCheckpoints[1].archive.root.toString(), badBlobHashes[1]);
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
    makeCheckpointProposedEvent(88n, 3n, badCheckpoints[2].archive.root.toString(), badBlobHashes[2]);
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
    makeCheckpointProposedEvent(94n, 2n, goodCheckpoints[1].archive.root.toString(), blobHashes[1]);
    makeCheckpointProposedEvent(95n, 3n, goodCheckpoints[2].archive.root.toString(), blobHashes[2]);
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

  it('skip event search if no changes found', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');

    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const numCheckpointsInTest = 2;

    const rollupTxs = checkpoints.map(c => makeRollupTx(c));
    const blobHashes = checkpoints.map(makeVersionedBlobHashes);

    mockL1BlockNumbers(50n, 100n);

    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, 2n, checkpoints[1].archive.root.toString(), blobHashes[1]);
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, checkpoints[1].archive.root.toString(), GENESIS_ROOT]);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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

    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, 2n, checkpoints[1].archive.root.toString(), blobHashes[1]);

    // We will return status at first to have an empty round, then as if we have 2 pending checkpoints, and finally
    // Just a single pending checkpoint returning a "failure" for the expected pending checkpoint
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, checkpoints[1].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, checkpoints[0].archive.root.toString(), Fr.ZERO.toString()]);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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
    expect(await archiver.getCheckpoint(CheckpointNumber(2))).resolves.toBeUndefined;

    expect(await archiver.getPrivateLogs(2, 1)).toEqual([]);
    expect((await archiver.getPublicLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
    expect((await archiver.getContractClassLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
  }, 10_000);

  it('handles updated messages due to L1 reorg', async () => {
    let l1BlockNumber = 110n;
    publicClient.getBlockNumber.mockImplementation(() => Promise.resolve(l1BlockNumber++));

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    // Creates messages for checkpoints 1 and 3, across L1 blocks 100 and 101
    makeMessageSentEvent(100n, 1n, 0n);
    makeMessageSentEvent(100n, 1n, 1n);
    makeMessageSentEvent(101n, 3n, 0n);
    makeMessageSentEvent(101n, 3n, 1n);
    makeMessageSentEvent(101n, 3n, 2n);
    makeMessageSentEvent(101n, 3n, 3n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(5));

    await archiver.start(false);

    await retryUntil(() => archiver.getL1ToL2Messages(3).then(msgs => msgs.length === 4), 'sync', 10, 0.1);

    expect(await archiver.getL1ToL2Messages(1)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2)).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(3)).toHaveLength(4);
    expect(await archiver.getL1ToL2Messages(4)).toHaveLength(0);

    // Drops the last 2 messages from checkpoint 3, and adds new messages for checkpoints 4 and 5
    // Note the overlap in L1 blocks, to test reinsertion of messages
    logger.warn(`Reorging L1 to L2 messages`);
    l2MessageSentLogs.splice(4);
    messagesRollingHash = Buffer16.fromString(l2MessageSentLogs.at(-1)!.args.rollingHash);
    const { leaf: msg40 } = makeMessageSentEvent(101n, 4n, 0n);
    const { leaf: msg50 } = makeMessageSentEvent(101n, 5n, 0n);
    const { leaf: msg51 } = makeMessageSentEvent(102n, 5n, 1n);
    expect(l2MessageSentLogs).toHaveLength(7);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(7));

    await retryUntil(() => archiver.getL1ToL2Messages(5).then(msgs => msgs.length === 2), 're-sync', 10, 0.1);

    expect(await archiver.getL1ToL2Messages(1)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2)).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(3)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(4)).toHaveLength(1);
    expect(await archiver.getL1ToL2Messages(5)).toHaveLength(2);

    expect((await archiver.getL1ToL2Messages(4)).map(leaf => leaf.toString())).toEqual(
      [msg40].map(leaf => leaf.toString()),
    );
    expect((await archiver.getL1ToL2Messages(5)).map(leaf => leaf.toString())).toEqual(
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
    makeCheckpointProposedEvent(l1BlockForCheckpoint, 1n, checkpoint.archive.root.toString(), blobHashes);
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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
    makeCheckpointProposedEvent(l1BlockForCheckpoint, 1n, checkpoint.archive.root.toString(), blobHashes);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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
    makeCheckpointProposedEvent(l1BlockForCheckpoint, 1n, checkpoint.archive.root.toString(), blobHashes);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromCheckpoints = checkpoints.map(c => makeBlobsFromCheckpoint(c));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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
    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    blobsFromCheckpoints.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

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

    makeCheckpointProposedEvent(70n, 1n, checkpoints[0].archive.root.toString(), blobHashes[0]);
    makeCheckpointProposedEvent(80n, 2n, checkpoints[1].archive.root.toString(), blobHashes[1]);

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
    makeCheckpointProposedEvent(100n, 3n, checkpoints[2].archive.root.toString(), blobHashes[2]);
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
    await expect(() => archiver.syncImmediate()).rejects.toThrow(InitialBlockNumberNotSequentialError);
    await archiver.syncImmediate();
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(3));
  });

  it('ignore checkpoint if blob fields are not encoded correctly', async () => {
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    const checkpoint = checkpoints[0];
    const rollupTx = makeRollupTx(checkpoint);

    mockL1BlockNumbers(100n);

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, checkpoint.archive.root.toString(), GENESIS_ROOT]);

    const randomBlob = new BlobWithIndex(makeRandomBlob(3), 0);
    const randomBlobHash = randomBlob.blob.getEthVersionedBlobHash();

    makeCheckpointProposedEvent(70n, 1n, checkpoint.archive.root.toString(), [`0x${randomBlobHash.toString()}`]);

    // Mock getBlobSidecar to return a random blob instead of the expected one
    blobSinkClient.getBlobSidecar.mockResolvedValueOnce([randomBlob]);

    publicClient.getTransaction.mockResolvedValueOnce(rollupTx);

    await archiver.start(false);

    // Give it some time to attempt processing
    await sleep(1000);

    // Should still be at checkpoint 0 since the blob processing failed
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));
  }, 10_000);

  it('can process checkpoint containing multiple blobs', async () => {
    expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(0));

    // Create a checkpoint with large blob data that requires multiple blobs
    const [checkpoint] = await makeCheckpoints(1, { numBlocksPerCheckpoint: 1, txsPerBlock: 5, maxEffects: 100 });
    checkpoints = [checkpoint];
    const blobHashes = makeVersionedBlobHashes(checkpoint);
    expect(blobHashes.length).toBeGreaterThan(1);

    const rollupTx = makeRollupTx(checkpoint);

    mockL1BlockNumbers(100n);

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, checkpoint.archive.root.toString(), GENESIS_ROOT]);

    makeCheckpointProposedEvent(70n, 1n, checkpoint.archive.root.toString(), blobHashes);

    const blobsFromCheckpoint = makeBlobsFromCheckpoint(checkpoint);
    expect(blobsFromCheckpoint.length).toBeGreaterThan(1);
    blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobsFromCheckpoint);

    publicClient.getTransaction.mockResolvedValueOnce(rollupTx);

    await archiver.start(false);

    // Wait until checkpoint 1 is processed. If this won't happen the test will fail with timeout.
    const expectedCheckpointNumber = CheckpointNumber(1);
    await waitUntilArchiverCheckpoint(expectedCheckpointNumber);

    expect(await archiver.getCheckpointNumber()).toEqual(expectedCheckpointNumber);

    // Verify the checkpoint was synced successfully
    const syncedCheckpoint = await archiver.getCheckpoint(expectedCheckpointNumber);
    expect(syncedCheckpoint).toBeDefined();
    // The tx effects should be the decoded correctly from the blobs
    expect(syncedCheckpoint!.blocks.map(b => b.body.txEffects)).toEqual(checkpoint.blocks.map(b => b.body.txEffects));
  }, 10_000);

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
    checkpointNumber: bigint,
    archive: `0x${string}`,
    versionedBlobHashes: `0x${string}`[],
  ) => {
    const log = {
      blockNumber: l1BlockNum,
      args: { checkpointNumber, archive, versionedBlobHashes },
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
  const makeMessageSentEvent = (l1BlockNum: bigint, checkpointNumber: bigint, indexInSubtree: bigint) => {
    const index = indexInSubtree + InboxLeaf.smallestIndexFromL2Block(Number(checkpointNumber));
    const leaf = Fr.random();
    messagesRollingHash = updateRollingHash(messagesRollingHash, leaf);
    totalMessagesInserted++;

    const log = {
      blockNumber: l1BlockNum,
      blockHash: Buffer32.fromBigInt(l1BlockNum).toString(),
      args: {
        checkpointNumber,
        index,
        hash: leaf.toString(),
        rollingHash: messagesRollingHash.toString(),
      },
      transactionHash: `0x${l1BlockNum}`,
    } as Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>;
    l2MessageSentLogs.push(log);
    return { log, leaf, index };
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
            target: EthAddress.ZERO.toString(),
            callData: rollupInput,
            allowFailure: false,
          },
        ],
      ],
    });
    const tx = { input: multiCallInput, hash: archive, blockHash: archive } as Transaction<bigint, number>;
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
   * Blob response to be returned from the blob sink based on the expected checkpoint.
   * @param checkpoint - The checkpoint.
   * @returns The blobs.
   */
  const makeBlobsFromCheckpoint = (checkpoint: Checkpoint) => {
    const blobFields = checkpoint.toBlobFields();
    const blobs = getBlobsPerL1Block(blobFields).map((blob, index) => new BlobWithIndex(blob, index));
    allBlobs.set(checkpoint.archive.root.toString(), blobs);
    return blobs;
  };
});
