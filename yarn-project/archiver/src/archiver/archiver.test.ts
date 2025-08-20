import { Blob } from '@aztec/blob-lib';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { BlobWithIndex } from '@aztec/blob-sink/types';
import { GENESIS_ARCHIVE_ROOT, GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import {
  DefaultL1ContractsConfig,
  InboxContract,
  RollupContract,
  type ViemPublicClient,
  type ViemRollupStatus,
} from '@aztec/ethereum';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex, withoutHexPrefix } from '@aztec/foundation/string';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation, L2Block, L2BlockSourceEvents } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { PrivateLog } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { makeBlockAttestationFromBlock } from '@aztec/stdlib/testing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import assert from 'assert';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type FormattedBlock, type Log, type Transaction, encodeFunctionData, multicall3Abi } from 'viem';

import { Archiver } from './archiver.js';
import type { ArchiverDataStore } from './archiver_store.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { KVArchiverDataStore } from './kv_archiver_store/kv_archiver_store.js';
import { updateRollingHash } from './structs/inbox_message.js';

interface MockRollupContractRead {
  /** Returns the target committee size */
  getTargetCommitteeSize: () => Promise<bigint>;
  /** Returns the rollup version. */
  getVersion: () => Promise<bigint>;
  /** Given an L2 block number, returns the archive. */
  archiveAt: (args: readonly [bigint]) => Promise<`0x${string}`>;
  /** Given an L2 block number, returns the block. */
  getBlock: (args: readonly [bigint]) => Promise<{
    archive: `0x${string}`;
    headerHash: `0x${string}`;
    blobCommitmentsHash: `0x${string}`;
    slotNumber: bigint;
    feeHeader: {
      excessMana: bigint;
      feeAssetPriceNumerator: bigint;
      manaUsed: bigint;
    };
  }>;
  /** Given an L2 block number, returns provenBlockNumber, provenArchive, pendingBlockNumber, pendingHeaderHash, headerHashOfMyBlock, provenEpochNumber, isMyBlockStale. */
  status: (args: readonly [bigint]) => Promise<ViemRollupStatus>;
  /** Checks if a block header hash is stale (beyond circular storage). */
  isBlockHeaderHashStale: (args: readonly [bigint]) => Promise<boolean>;
}

interface MockInboxContractRead {
  getState: () => Promise<{ rollingHash: `0x${string}`; totalMessagesInserted: bigint; inProgress: bigint }>;
}

interface MockRollupContractEvents {
  L2BlockProposed: (
    filter: any,
    range: { fromBlock: bigint; toBlock: bigint },
  ) => Promise<Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[]>;
  L2ProofVerified: (
    filter: any,
    range: { fromBlock: bigint; toBlock: bigint },
  ) => Promise<Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2ProofVerified'>[]>;
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
  const blockNumbers = [1, 2, 3];
  const txsPerBlock = 4;

  const getNumPrivateLogsForTx = (blockNumber: number, txIndex: number) => txIndex + blockNumber;
  const getNumPrivateLogsForBlock = (blockNumber: number) =>
    Array(txsPerBlock)
      .fill(0)
      .map((_, i) => getNumPrivateLogsForTx(blockNumber, i))
      .reduce((accum, num) => accum + num, 0);

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

  const makeBlock = async (blockNumber: number) => {
    const block = await L2Block.random(blockNumber, txsPerBlock, blockNumber + 1, 2);
    block.header.globalVariables.timestamp = BigInt(now + Number(ETHEREUM_SLOT_DURATION) * (blockNumber + 1));
    block.body.txEffects.forEach((txEffect, i) => {
      txEffect.privateLogs = times(getNumPrivateLogsForTx(block.number, i), () => PrivateLog.random());
    });
    return block;
  };

  let publicClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobSinkClient: MockProxy<BlobSinkClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let archiverStore: ArchiverDataStore;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32 };
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

  let blocks: L2Block[];
  let messagesRollingHash: Buffer16;
  let totalMessagesInserted: number;
  let headerHashes: Fr[];
  let proverIds: EthAddress[];

  let l2BlockProposedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[];
  let l2MessageSentLogs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[];
  let l2ProofVerifiedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2ProofVerified'>[];

  let logger: Logger;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT).toString();
  const GENESIS_HEADER_HASH = new Fr(GENESIS_BLOCK_HEADER_HASH).toString();
  const ETHEREUM_SLOT_DURATION = BigInt(DefaultL1ContractsConfig.ethereumSlotDuration);

  beforeEach(async () => {
    logger = createLogger('archiver:test');
    messagesRollingHash = Buffer16.ZERO;
    totalMessagesInserted = 0;
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
    };

    archiver = new Archiver(
      publicClient,
      { rollupAddress, inboxAddress, registryAddress },
      archiverStore,
      { pollingIntervalMs: 1000, batchSize: 1000 },
      blobSinkClient,
      epochCache,
      instrumentation,
      l1Constants,
    );

    blocks = await Promise.all(blockNumbers.map(makeBlock));
    proverIds = blocks.map(_ => EthAddress.random());
    blocks.forEach((block, i) => {
      block.header.globalVariables.timestamp = BigInt(now + Number(ETHEREUM_SLOT_DURATION) * (i + 1));
      block.body.txEffects.forEach((txEffect, i) => {
        txEffect.privateLogs = times(getNumPrivateLogsForTx(block.number, i), () => PrivateLog.random());
      });
    });
    headerHashes = blocks.map(b => b.header.toPropose().hash());

    // TODO(palla/archiver) Instead of guessing the archiver requests with mockResolvedValueOnce,
    // we should use a mock implementation that returns the expected value based on the input.

    // blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));
    // blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    // blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    // rollupTxs = await Promise.all(blocks.map(b => makeRollupTx(b)));
    // publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) => {
    //   const index = parseInt(withoutHexPrefix(args.hash!));
    //   if (index > blocks.length) {
    //     throw new Error(`Transaction not found: ${args.hash}`);
    //   }
    //   return Promise.resolve(rollupTxs[index - 1]);
    // });

    // blobSinkClient.getBlobSidecar.mockImplementation((_blockId: string, requestedBlobHashes?: Buffer[]) => {
    //   const blobs = [];
    //   for (const requestedBlobHash of requestedBlobHashes!) {
    //     for (let i = 0; i < blobHashes.flat().length; i++) {
    //       const blobHash = blobHashes.flat()[i];
    //       if (blobHash === bufferToHex(requestedBlobHash)) {
    //         blobs.push(blobsFromBlocks.flat()[i]);
    //       }
    //     }
    //   }
    //   return Promise.resolve(blobs);
    // });

    mockRollupRead = mock<MockRollupContractRead>();
    mockRollupRead.archiveAt.mockImplementation((args: readonly [bigint]) =>
      Promise.resolve(blocks[Number(args[0] - 1n)].archive.root.toString()),
    );
    mockRollupRead.getBlock.mockImplementation((args: readonly [bigint]) => {
      const blockIndex = Number(args[0] - 1n);
      const block = blocks[blockIndex];
      return Promise.resolve({
        archive: block.archive.root.toString() as `0x${string}`,
        headerHash: headerHashes[blockIndex].toString() as `0x${string}`,
        blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
        slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
        feeHeader: {
          excessMana: 0n,
          feeAssetPriceNumerator: 0n,
          manaUsed: 0n,
        },
      });
    });
    mockRollupRead.getVersion.mockImplementation(() => Promise.resolve(1n));
    mockRollupRead.isBlockHeaderHashStale.mockImplementation((_args: readonly [bigint]) => Promise.resolve(false));
    mockRollupEvents = mock<MockRollupContractEvents>();
    mockRollupEvents.L2BlockProposed.mockImplementation((_filter: any, { fromBlock, toBlock }) =>
      Promise.resolve(l2BlockProposedLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock)),
    );
    mockRollupEvents.L2ProofVerified.mockImplementation((_filter: any, { fromBlock, toBlock }) => {
      return Promise.resolve(
        l2ProofVerifiedLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock),
      );
    });

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
    l2BlockProposedLogs = [];
    l2ProofVerifiedLogs = [];
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  it('syncs l1 to l2 messages and blocks', async () => {
    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const submitProofTxs = await Promise.all(
      blocks.map(b => {
        const previousArchive =
          b.header.getBlockNumber() <= 1
            ? Fr.fromHexString(GENESIS_ROOT)
            : blocks[b.header.getBlockNumber() - 2].archive.root;
        return makeProofSubmissionTx(b, previousArchive, proverIds[b.header.getBlockNumber() - 1]);
      }),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    mockL1BlockNumbers(2500n, 2510n, 2520n);

    mockRollup.read.status
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 1n,
        pendingHeaderHash: headerHashes[0].toString(),
        headerHashOfMyBlock: GENESIS_HEADER_HASH,
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus)
      .mockResolvedValue({
        provenBlockNumber: 1n,
        provenArchive: blocks[0].archive.root.toString(),
        pendingBlockNumber: 3n,
        pendingHeaderHash: headerHashes[2].toString(),
        headerHashOfMyBlock: headerHashes[0].toString(),
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus);

    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvent(98n, 1, 0n);
    makeMessageSentEvent(99n, 1, 1n);
    makeL2BlockProposedEvent(
      101n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2ProofVerifiedEvent(103n, 1, proverIds[0]);

    makeMessageSentEvent(2504n, 2, 0n);
    makeMessageSentEvent(2505n, 2, 1n);
    makeMessageSentEvent(2505n, 2, 2n);
    makeMessageSentEvent(2506n, 3, 0n);
    makeL2BlockProposedEvent(
      2507n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );
    makeL2BlockProposedEvent(
      2509n,
      3n,
      headerHashes[2].toString() as `0x${string}`,
      headerHashes[1].toString() as `0x${string}`,
      blobHashes[2],
    );
    makeL2ProofVerifiedEvent(2508n, 2, proverIds[1]);
    makeL2ProofVerifiedEvent(2510n, 3, proverIds[2]);

    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(2))
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(6));

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        return Promise.resolve(submitProofTxs[index - 1]);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);

    await archiver.start(false);
    // Wait until block 3 is processed. If this won't happen the test will fail with timeout.
    await waitUntilArchiverBlock(3);
    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(3);

    expect(await archiver.getL1ToL2Messages(1)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2)).toHaveLength(3);
    expect(await archiver.getL1ToL2Messages(3)).toHaveLength(1);

    // Expect logs to correspond to what is set by L2Block.random(...)
    for (let i = 0; i < blockNumbers.length; i++) {
      const blockNumber = blockNumbers[i];

      const privateLogs = await archiver.getPrivateLogs(blockNumber, 1);
      expect(privateLogs.length).toBe(getNumPrivateLogsForBlock(blockNumber));

      const publicLogs = (await archiver.getPublicLogs({ fromBlock: blockNumber, toBlock: blockNumber + 1 })).logs;
      const expectedTotalNumPublicLogs = 4 * (blockNumber + 1) * 2;
      expect(publicLogs.length).toEqual(expectedTotalNumPublicLogs);
    }

    for (const x of blockNumbers) {
      const expectedTotalNumContractClassLogs = 4;
      const contractClassLogs = await archiver.getContractClassLogs({ fromBlock: x, toBlock: x + 1 });
      expect(contractClassLogs.logs.length).toEqual(expectedTotalNumContractClassLogs);
    }

    // Check last proven block number
    const provenBlockNumber = await archiver.getProvenBlockNumber();
    expect(provenBlockNumber).toEqual(1);

    // Check getting only proven blocks
    expect((await archiver.getBlocks(1, 100)).map(b => b.number)).toEqual([1, 2, 3]);
    expect((await archiver.getBlocks(1, 100, true)).map(b => b.number)).toEqual([1]);
  }, 10_000);

  it('ignores block 3 because it has been pruned', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'warn');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );

    const submitProofTxs = await Promise.all(
      blocks.map(b => {
        const previousArchive =
          b.header.getBlockNumber() <= 1
            ? Fr.fromHexString(GENESIS_ROOT)
            : blocks[b.header.getBlockNumber() - 2].archive.root;
        return makeProofSubmissionTx(b, previousArchive, proverIds[b.header.getBlockNumber() - 1]);
      }),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    // Here we set the current L1 block number to 102. L1 to L2 messages after this should not be read.
    publicClient.getBlockNumber.mockResolvedValue(102n);

    const badHeaderHash = Fr.random().toString();
    const badBlobHash = Fr.random().toString();

    makeMessageSentEvent(66n, 1, 0n);
    makeMessageSentEvent(68n, 1, 1n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(2));

    // Create L2BlockProposed events for blocks 1 and 2 with correct header hashes
    makeL2BlockProposedEvent(
      70n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2ProofVerifiedEvent(71n, 1, proverIds[0]);
    makeL2BlockProposedEvent(
      80n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );
    makeL2ProofVerifiedEvent(81n, 2, proverIds[1]);
    makeL2BlockProposedEvent(90n, 3n, badHeaderHash as `0x${string}`, headerHashes[1].toString() as `0x${string}`, [
      badBlobHash,
    ]);

    // Mock status to indicate only blocks 1-2 are valid (pendingBlockNumber = 2)
    // No blocks are proven (provenBlockNumber = 0, provenArchive = GENESIS_ROOT)
    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 2n,
      pendingHeaderHash: headerHashes[1].toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        return Promise.resolve(submitProofTxs[index - 1]);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);
    // Expect warning about ignoring block due to header hash mismatch (prune detected)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Ignoring L2 block.*due to.*header hash mismatch/i),
      expect.any(Object),
    );
  }, 10_000);

  it('ignores blocks because of invalid attestations', async () => {
    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    // Setup a committee of 3 signers
    mockRollupRead.getTargetCommitteeSize.mockResolvedValue(3n);
    const signers = times(3, Secp256k1Signer.random);
    const committee = signers.map(signer => signer.address);
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee } as EpochCommitteeInfo);

    // Setup spy to listen for InvalidBlockDetected events
    const invalidBlockDetectedSpy = jest.fn();
    archiver.on(L2BlockSourceEvents.InvalidAttestationsBlockDetected, invalidBlockDetectedSpy);

    // Add the attestations from the signers to all 3 blocks
    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          signers,
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));

    // And define bad blocks with attestations from random signers
    const makeBadBlock = async (blockNumber: number, parentHeaderHash: `0x${string}`) => {
      const badBlock = await makeBlock(blockNumber);
      badBlock.archive.root = new Fr(0x1000 + blockNumber);
      const badBlockRollupTx = await makeRollupTx(badBlock, times(3, Secp256k1Signer.random), parentHeaderHash);
      const badBlockBlobHashes = await makeVersionedBlobHashes(badBlock);
      const badBlockBlobs = await makeBlobsFromBlock(badBlock);
      return [badBlock, badBlockRollupTx, badBlockBlobHashes, badBlockBlobs] as const;
    };

    const [badBlock2, badBlock2RollupTx, badBlock2BlobHashes, badBlock2Blobs] = await makeBadBlock(
      2,
      headerHashes[0].toString() as `0x${string}`,
    );
    const [badBlock3, badBlock3RollupTx, badBlock3BlobHashes, badBlock3Blobs] = await makeBadBlock(
      3,
      blocks[1].header.toPropose().hash().toString() as `0x${string}`,
    );

    // Return the archive root for the bad block 2 when L1 is queried
    mockRollupRead.archiveAt.mockImplementation((args: readonly [bigint]) =>
      Promise.resolve((args[0] === 2n ? badBlock2 : blocks[Number(args[0] - 1n)]).archive.root.toString()),
    );

    mockRollupRead.getBlock.mockImplementation((args: readonly [bigint]) => {
      const n = Number(args[0]);
      const blockIndex = n - 1;
      if (n === 2) {
        const block = badBlock2;
        return Promise.resolve({
          archive: block.archive.root.toString() as `0x${string}`,
          headerHash: block.header.toPropose().hash().toString() as `0x${string}`,
          blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
          slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
          feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
        });
      }
      const block = blocks[blockIndex];
      return Promise.resolve({
        archive: block.archive.root.toString() as `0x${string}`,
        headerHash: headerHashes[blockIndex].toString() as `0x${string}`,
        blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
        slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
        feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
      });
    });

    blocks.forEach(b => logger.warn(`Created valid block ${b.number} with root ${b.archive.root.toString()}`));
    logger.warn(`Created invalid block 2 with root ${badBlock2.archive.root.toString()}`);
    logger.warn(`Created invalid block 3 with root ${badBlock3.archive.root.toString()}`);

    // During the first archiver loop, we fetch block 1 and the block 2 with bad attestations
    publicClient.getBlockNumber.mockResolvedValue(85n);
    makeL2BlockProposedEvent(
      70n,
      1n,
      blocks[0].header.toPropose().hash().toString(),
      GENESIS_HEADER_HASH,
      blobHashes[0],
    );
    makeL2BlockProposedEvent(
      80n,
      2n,
      badBlock2.header.toPropose().hash().toString(),
      blocks[0].header.toPropose().hash().toString(),
      badBlock2BlobHashes,
    );
    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 2n,
      pendingHeaderHash: badBlock2.header.toPropose().hash().toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      switch (args.hash) {
        case '0x1-propose':
          return Promise.resolve(rollupTxs[0]);
        case '0x2-propose':
          return Promise.resolve(badBlock2RollupTx);
        case '0x3-propose':
          return Promise.resolve(badBlock3RollupTx);
        default:
          throw new Error(`Unexpected tx hash ${args.hash}`);
      }
    }) as any);
    blobSinkClient.getBlobSidecar
      .mockResolvedValueOnce(blobsFromBlocks[0])
      .mockResolvedValueOnce(badBlock2Blobs)
      .mockResolvedValueOnce(badBlock3Blobs);

    // Start archiver, the bad block 2 should not be synced
    await archiver.start(true);
    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(1);
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
        validationResult: expect.objectContaining({ valid: false, reason: 'invalid-attestation', invalidIndex: 0 }),
      }),
    );

    // Now another loop, where we propose a block 3 with bad attestations
    logger.warn(`Adding new block 3 with bad attestations`);
    publicClient.getBlockNumber.mockResolvedValue(90n);
    // For this phase, ignore block 2 by returning a mismatching headerHash (so retrieval skips it),
    // and include bad header for block 3 so it gets retrieved and validated.
    mockRollupRead.getBlock.mockImplementation((args: readonly [bigint]) => {
      const n = Number(args[0]);
      const blockIndex = n - 1;
      if (n === 2) {
        const block = blocks[1];
        return Promise.resolve({
          archive: block.archive.root.toString() as `0x${string}`,
          headerHash: headerHashes[1].toString() as `0x${string}`,
          blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
          slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
          feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
        });
      }
      if (n === 3) {
        const block = badBlock3;
        return Promise.resolve({
          archive: block.archive.root.toString() as `0x${string}`,
          headerHash: block.header.toPropose().hash().toString() as `0x${string}`,
          blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
          slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
          feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
        });
      }
      const block = blocks[blockIndex];
      return Promise.resolve({
        archive: block.archive.root.toString() as `0x${string}`,
        headerHash: headerHashes[blockIndex].toString() as `0x${string}`,
        blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
        slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
        feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
      });
    });
    makeL2BlockProposedEvent(
      85n,
      3n,
      badBlock3.header.toPropose().hash().toString(),
      blocks[1].header.toPropose().hash().toString(),
      badBlock3BlobHashes,
    );
    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 3n,
      pendingHeaderHash: badBlock3.header.toPropose().hash().toString(),
      headerHashOfMyBlock: headerHashes[0].toString(),
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    // getTransaction/blob sidecar already mapped above

    // We should still be at block 1, and the pending chain validation status should still be invalid and point to block 2
    // since we want the archiver to always return the earliest block with invalid attestations
    await archiver.syncImmediate();
    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(1);
    const validationStatus = await archiver.getPendingChainValidationStatus();
    assert(!validationStatus.valid);
    expect(validationStatus.block.block.number).toEqual(2);
    // expect(validationStatus.block.block.archive.root.toString()).toEqual(badBlock2.archive.root.toString());
    expect(validationStatus.block.block.header.toPropose().hash().toString()).toEqual(
      badBlock2.header.toPropose().hash().toString(),
    );

    // Check that InvalidBlockDetected event was also emitted for bad block 3
    expect(invalidBlockDetectedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: L2BlockSourceEvents.InvalidAttestationsBlockDetected,
        validationResult: expect.objectContaining({ valid: false, reason: 'invalid-attestation', invalidIndex: 0 }),
      }),
    );

    // Should have been called twice total (for blocks 2 and 3)
    expect(invalidBlockDetectedSpy).toHaveBeenCalledTimes(2);

    // Now we go for another loop, where proper blocks 2 and 3 are proposed with correct attestations
    // IRL there would be an "Invalidated" event, but we are not currently relying on it
    logger.warn(`Adding new blocks 2 and 3 with correct attestations`);
    publicClient.getBlockNumber.mockResolvedValue(100n);
    // Restore on-chain header hashes to valid blocks 2 and 3
    mockRollupRead.getBlock.mockImplementation((args: readonly [bigint]) => {
      const n = Number(args[0]);
      const blockIndex = n - 1;
      const block = blocks[blockIndex];
      return Promise.resolve({
        archive: block.archive.root.toString() as `0x${string}`,
        headerHash: headerHashes[blockIndex].toString() as `0x${string}`,
        blobCommitmentsHash: block.header.contentCommitment.blobsHash.toString() as `0x${string}`,
        slotNumber: BigInt(block.header.globalVariables.slotNumber.toBigInt()),
        feeHeader: { excessMana: 0n, feeAssetPriceNumerator: 0n, manaUsed: 0n },
      });
    });
    makeL2BlockProposedEvent(
      94n,
      2n,
      blocks[1].header.toPropose().hash().toString(),
      GENESIS_HEADER_HASH,
      blobHashes[1],
    );
    makeL2BlockProposedEvent(
      95n,
      3n,
      blocks[2].header.toPropose().hash().toString(),
      blocks[1].header.toPropose().hash().toString(),
      blobHashes[2],
    );
    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 3n,
      pendingHeaderHash: headerHashes[2].toString(),
      headerHashOfMyBlock: headerHashes[0].toString(),
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    publicClient.getTransaction.mockResolvedValueOnce(rollupTxs[1]).mockResolvedValueOnce(rollupTxs[2]);
    blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobsFromBlocks[1]).mockResolvedValueOnce(blobsFromBlocks[2]);
    mockRollupRead.archiveAt.mockImplementation((args: readonly [bigint]) =>
      Promise.resolve(blocks[Number(args[0] - 1n)].archive.root.toString()),
    );

    // Now we should move to block 3
    await archiver.syncImmediate();
    await waitUntilArchiverBlock(3);
    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(3);

    // And block 2 should return the proper one
    const [block2] = await archiver.getPublishedBlocks(2, 1);
    expect(block2.block.number).toEqual(2);
    expect(block2.block.header.toPropose().hash().toString()).toEqual(headerHashes[1].toString());
    expect(block2.attestations.length).toEqual(3);

    // With a valid pending chain validation status
    expect(await archiver.getPendingChainValidationStatus()).toEqual(expect.objectContaining({ valid: true }));
  }, 10_000);

  it('skip event search if no changes found', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const submitProofTxs = await Promise.all(
      blocks.map(b => {
        const previousArchive =
          b.header.getBlockNumber() <= 1
            ? Fr.fromHexString(GENESIS_ROOT)
            : blocks[b.header.getBlockNumber() - 2].archive.root;
        return makeProofSubmissionTx(b, previousArchive, proverIds[b.header.getBlockNumber() - 1]);
      }),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    mockL1BlockNumbers(50n, 100n);

    makeL2BlockProposedEvent(
      70n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2ProofVerifiedEvent(71n, 1, proverIds[0]);
    makeL2BlockProposedEvent(
      80n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );
    makeL2ProofVerifiedEvent(81n, 2, proverIds[1]);
    mockRollup.read.status
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 0n,
        pendingHeaderHash: GENESIS_HEADER_HASH,
        headerHashOfMyBlock: GENESIS_HEADER_HASH,
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus)
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 2n,
        pendingHeaderHash: headerHashes[1].toString(),
        headerHashOfMyBlock: GENESIS_HEADER_HASH,
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus);

    makeMessageSentEvent(66n, 1, 0n);
    makeMessageSentEvent(68n, 1, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        return Promise.resolve(submitProofTxs[index - 1]);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);
    expect(loggerSpy).toHaveBeenCalledWith(`No blocks to retrieve from 1 to 50, no blocks on chain`);
  }, 10_000);

  it('handles L2 reorg', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');
    const loggerWarnSpy = jest.spyOn((archiver as any).log, 'warn');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    let mockedBlockNum = 0n;
    publicClient.getBlockNumber.mockImplementation(() => {
      mockedBlockNum += 50n;
      return Promise.resolve(mockedBlockNum);
    });

    makeL2BlockProposedEvent(
      70n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2BlockProposedEvent(
      80n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );

    // We will return status at first to have an empty round, then as if we have 2 pending blocks, and finally
    // Just a single pending block returning a "failure" for the expected pending block
    mockRollup.read.status
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 0n,
        pendingHeaderHash: GENESIS_HEADER_HASH,
        headerHashOfMyBlock: GENESIS_HEADER_HASH,
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus)
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 2n,
        pendingHeaderHash: headerHashes[1].toString(),
        headerHashOfMyBlock: GENESIS_HEADER_HASH,
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus)
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 1n,
        pendingHeaderHash: headerHashes[0].toString(),
        headerHashOfMyBlock: Fr.ZERO.toString(),
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus) // Fr.ZERO = mismatch, not stale
      // Additional status calls for unwinding logic:
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 1n,
        pendingHeaderHash: headerHashes[0].toString(),
        headerHashOfMyBlock: Fr.ZERO.toString(),
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus) // status(2) → block 2 doesn't exist but not stale
      .mockResolvedValueOnce({
        provenBlockNumber: 0n,
        provenArchive: GENESIS_ROOT,
        pendingBlockNumber: 1n,
        pendingHeaderHash: headerHashes[0].toString(),
        headerHashOfMyBlock: headerHashes[0].toString(),
        provenEpochNumber: 0n,
        isBlockHeaderHashStale: false,
      } as ViemRollupStatus); // status(1) → block 1 exists

    makeMessageSentEvent(66n, 1, 0n);
    makeMessageSentEvent(68n, 1, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        throw new Error(`No proof transaction found: ${args.hash}`);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);

    expect(loggerSpy).toHaveBeenCalledWith(`No blocks to retrieve from 1 to 50, no blocks on chain`);

    // Lets take a look to see if we can find re-org stuff!
    await sleep(2000);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      `Unwound 1 block from L2 block 2 back to block 1 due to L1 pending block moved backwards. Updated L2 latest block is 1.`,
    );

    // Should also see the block number be reduced
    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest - 1);

    const txHash = blocks[1].body.txEffects[0].txHash;
    expect(await archiver.getTxEffect(txHash)).resolves.toBeUndefined;
    expect(await archiver.getBlock(2)).resolves.toBeUndefined;

    expect(await archiver.getPrivateLogs(2, 1)).toEqual([]);
    expect((await archiver.getPublicLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
    expect((await archiver.getContractClassLogs({ fromBlock: 2, toBlock: 3 })).logs).toEqual([]);
  }, 10_000);

  it('handles updated messages due to L1 reorg', async () => {
    let l1BlockNumber = 110n;
    publicClient.getBlockNumber.mockImplementation(() => Promise.resolve(l1BlockNumber++));

    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 0n,
      pendingHeaderHash: GENESIS_ROOT,
      headerHashOfMyBlock: GENESIS_ROOT,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);

    // Creates messages for L2 blocks 1 and 3, across L1 blocks 100 and 101
    makeMessageSentEvent(100n, 1, 0n);
    makeMessageSentEvent(100n, 1, 1n);
    makeMessageSentEvent(101n, 3, 0n);
    makeMessageSentEvent(101n, 3, 1n);
    makeMessageSentEvent(101n, 3, 2n);
    makeMessageSentEvent(101n, 3, 3n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(5));

    await archiver.start(false);

    await retryUntil(() => archiver.getL1ToL2Messages(3).then(msgs => msgs.length === 4), 'sync', 10, 0.1);

    expect(await archiver.getL1ToL2Messages(1)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2)).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(3)).toHaveLength(4);
    expect(await archiver.getL1ToL2Messages(4)).toHaveLength(0);

    // Drops the last 2 messages from L2 block 3, and adds new messages for L2 blocks 4 and 5
    // Note the overlap in L1 blocks, to test reinsertion of messages
    logger.warn(`Reorging L1 to L2 messages`);
    l2MessageSentLogs.splice(4);
    messagesRollingHash = Buffer16.fromString(l2MessageSentLogs.at(-1)!.args.rollingHash);
    const { leaf: msg40 } = makeMessageSentEvent(101n, 4, 0n);
    const { leaf: msg50 } = makeMessageSentEvent(101n, 5, 0n);
    const { leaf: msg51 } = makeMessageSentEvent(102n, 5, 1n);
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

  it('handles retroactive proof updates for existing blocks', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'info');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const submitProofTxs = await Promise.all(
      blocks.map(b => {
        const previousArchive =
          b.header.getBlockNumber() <= 1
            ? Fr.fromHexString(GENESIS_ROOT)
            : blocks[b.header.getBlockNumber() - 2].archive.root;
        return makeProofSubmissionTx(b, previousArchive, proverIds[b.header.getBlockNumber() - 1]);
      }),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    // Phase 1: Sync blocks WITHOUT proofs (they'll get stored with Fr.ZERO archive roots)
    mockL1BlockNumbers(100n, 200n);

    makeL2BlockProposedEvent(
      150n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2BlockProposedEvent(
      160n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );

    // No proof events yet - blocks will be stored with Fr.ZERO archive roots
    mockRollup.read.status.mockResolvedValue({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 2n,
      pendingHeaderHash: headerHashes[1].toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);

    makeMessageSentEvent(140n, 1, 0n);
    makeMessageSentEvent(145n, 1, 1n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(2));

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        // No proof transactions available yet
        throw new Error(`No proof transaction found: ${args.hash}`);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);

    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);
    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);

    // Verify blocks were stored with zero archive roots initially
    const block1 = await archiver.getBlock(1);
    const block2 = await archiver.getBlock(2);
    expect(block1?.archive.root.equals(Fr.ZERO)).toBe(true);
    expect(block2?.archive.root.equals(Fr.ZERO)).toBe(true);

    // Phase 2: Now proof events come in for the existing blocks
    mockL1BlockNumbers(250n);

    // Add proof events for blocks that were already synced
    makeL2ProofVerifiedEvent(220n, 1, proverIds[0]);
    makeL2ProofVerifiedEvent(230n, 2, proverIds[1]);

    // Mock proof transactions to be available now
    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const indexAndType = args.hash?.split('-');
      const index = Number(indexAndType?.[0]);
      const type = indexAndType?.[1];
      if (type === 'proof') {
        return Promise.resolve(submitProofTxs[index - 1]);
      } else {
        return Promise.resolve(rollupTxs[index - 1]);
      }
    }) as any);

    // Trigger another sync to process the proof events
    await archiver.syncImmediate();
    await sleep(200); // Allow time for the sync to complete

    // Verify blocks were updated with the correct archive roots
    const updatedBlock1 = await archiver.getBlock(1);
    const updatedBlock2 = await archiver.getBlock(2);
    expect(updatedBlock1?.archive.root.equals(blocks[0].archive.root)).toBe(true);
    expect(updatedBlock2?.archive.root.equals(blocks[1].archive.root)).toBe(true);

    // Verify we got the log messages about updating the blocks
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Updated block 1 with proven archive root/),
      expect.any(Object),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Updated block 2 with proven archive root/),
      expect.any(Object),
    );
  }, 10_000);

  it('reports an epoch as pending if the current L2 block is not in the last slot of the epoch', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const notLastL2SlotInEpoch = epochDuration - 2;
    const l1BlockForL2Block = l1StartBlock + BigInt((notLastL2SlotInEpoch * slotDuration) / ethereumSlotDuration);
    expect(notLastL2SlotInEpoch).toEqual(2);

    logger.info(`Syncing L2 block on slot ${notLastL2SlotInEpoch} mined in L1 block ${l1BlockForL2Block}`);
    const l2Block = blocks[0];
    l2Block.header.globalVariables.slotNumber = new Fr(notLastL2SlotInEpoch);
    blocks = [l2Block];
    const blobHashes = await makeVersionedBlobHashes(l2Block);

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 1n,
      pendingHeaderHash: headerHashes[0].toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    makeL2BlockProposedEvent(
      l1BlockForL2Block,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes,
    );
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(0n)).toBe(false);

    // Wait until block 1 is processed
    await waitUntilArchiverBlock(1);

    // Epoch should not be complete
    expect(await archiver.isEpochComplete(0n)).toBe(false);
  });

  it('reports an epoch as complete if the current L2 block is in the last slot of the epoch', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL2SlotInEpoch = epochDuration - 1;
    const l1BlockForL2Block = l1StartBlock + BigInt((lastL2SlotInEpoch * slotDuration) / ethereumSlotDuration);
    expect(lastL2SlotInEpoch).toEqual(3);

    logger.info(`Syncing L2 block on slot ${lastL2SlotInEpoch} mined in L1 block ${l1BlockForL2Block}`);
    const l2Block = blocks[0];
    l2Block.header.globalVariables.slotNumber = new Fr(lastL2SlotInEpoch);
    blocks = [l2Block];
    const blobHashes = await makeVersionedBlobHashes(l2Block);

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 1n,
      pendingHeaderHash: headerHashes[0].toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    makeL2BlockProposedEvent(
      l1BlockForL2Block,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes,
    );

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(0n)).toBe(false);

    // Wait until block 1 is processed
    await waitUntilArchiverBlock(1);

    // Epoch should be complete once block was synced
    expect(await archiver.isEpochComplete(0n)).toBe(true);
  });

  it('reports an epoch as pending if the current L1 block is not the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const notLastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 2n;
    expect(notLastL1BlockForEpoch).toEqual(6n);

    logger.info(`Syncing archiver to L1 block ${notLastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValue(notLastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 0n,
      pendingHeaderHash: GENESIS_ROOT,
      headerHashOfMyBlock: GENESIS_ROOT,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(0n)).toBe(false);
  });

  it('reports an epoch as complete if the current L1 block is the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;
    expect(lastL1BlockForEpoch).toEqual(7n);

    logger.info(`Syncing archiver to L1 block ${lastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 0n,
      pendingHeaderHash: GENESIS_ROOT,
      headerHashOfMyBlock: GENESIS_ROOT,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(0n)).toBe(true);
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12631
  it('reports an epoch as complete due to timestamp only once all its blocks have been synced', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const l2Slot = 1;
    const l1BlockForL2Block = l1StartBlock + BigInt((l2Slot * slotDuration) / ethereumSlotDuration);
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;

    logger.info(`Syncing epoch 0 with L2 block on slot ${l2Slot} mined in L1 block ${l1BlockForL2Block}`);
    const l2Block = blocks[0];
    l2Block.header.globalVariables.slotNumber = new Fr(l2Slot);
    blocks = [l2Block];
    const blobHashes = await makeVersionedBlobHashes(l2Block);

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce({
      provenBlockNumber: 0n,
      provenArchive: GENESIS_ROOT,
      pendingBlockNumber: 1n,
      pendingHeaderHash: headerHashes[0].toString(),
      headerHashOfMyBlock: GENESIS_HEADER_HASH,
      provenEpochNumber: 0n,
      isBlockHeaderHashStale: false,
    } as ViemRollupStatus);
    makeL2BlockProposedEvent(
      l1BlockForL2Block,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes,
    );

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    expect(await archiver.isEpochComplete(0n)).toBe(false);
    while (!(await archiver.isEpochComplete(0n))) {
      // No sleep, we want to know exactly when the epoch completes
    }

    // Once epoch is flagged as complete, block number must be 1
    expect(await archiver.getBlockNumber()).toEqual(1);
    expect(await archiver.isEpochComplete(0n)).toBe(true);
  });

  it('starts new loop if latest L1 block has advanced beyond what a non-archive L1 node tracks', async () => {
    publicClient.getBlockNumber.mockResolvedValueOnce(2000n).mockResolvedValueOnce(2400n);
    await expect((archiver as any).sync(true)).rejects.toThrow(/more than 128 blocks behind/i);
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/13604
  it('handles a block gap due to a spurious L2 prune', async () => {
    expect(await archiver.getBlockNumber()).toEqual(0);

    const rollupTxs = await Promise.all(
      blocks.map((b, i) =>
        makeRollupTx(
          b,
          [],
          i === 0
            ? (new Fr(GENESIS_BLOCK_HEADER_HASH).toString() as `0x${string}`)
            : (headerHashes[i - 1].toString() as `0x${string}`),
        ),
      ),
    );
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));

    let currentBlocks = blocks.slice(0, 2);

    publicClient.getTransaction.mockImplementation(((args: { hash?: `0x${string}` }) => {
      const index = parseInt(withoutHexPrefix(args.hash!));
      if (index > blocks.length) {
        throw new Error(`Transaction not found: ${args.hash}`);
      }
      return Promise.resolve(rollupTxs[index - 1]);
    }) as any);

    // And blobs
    blobSinkClient.getBlobSidecar.mockImplementation((_blockId: string, requestedBlobHashes?: Buffer[]) => {
      const blobs = [];
      for (const requestedBlobHash of requestedBlobHashes!) {
        for (let i = 0; i < blobHashes.flat().length; i++) {
          const blobHash = blobHashes.flat()[i];
          if (blobHash === bufferToHex(requestedBlobHash)) {
            blobs.push(blobsFromBlocks.flat()[i]);
          }
        }
      }
      return Promise.resolve(blobs);
    });

    // Start at L1 block 90, we'll advance this every time we want the archiver to do something
    publicClient.getBlockNumber.mockResolvedValue(90n);

    // Mock status calls that can handle both status() and status(blockNumber) calls
    let contractPendingBlockNumber = 2n;
    let contractPendingHeaderHash = headerHashes[1].toString();

    mockRollup.read.status.mockImplementation((blockNumber?: readonly [bigint]) => {
      if (blockNumber !== undefined) {
        // status(blockNumber) call during unwinding - return header hash for that specific block
        const requestedBlock = Number(blockNumber[0]);
        if (requestedBlock <= currentBlocks.length && requestedBlock > 0) {
          return Promise.resolve({
            provenBlockNumber: 0n,
            provenArchive: GENESIS_ROOT,
            pendingBlockNumber: contractPendingBlockNumber,
            pendingHeaderHash: contractPendingHeaderHash,
            headerHashOfMyBlock: headerHashes[requestedBlock - 1].toString(), // headerHashOfMyBlock for this specific block
            provenEpochNumber: 0n,
            isBlockHeaderHashStale: false,
          } as ViemRollupStatus);
        } else {
          // Block doesn't exist on contract
          return Promise.resolve({
            provenBlockNumber: 0n,
            provenArchive: GENESIS_ROOT,
            pendingBlockNumber: contractPendingBlockNumber,
            pendingHeaderHash: contractPendingHeaderHash,
            headerHashOfMyBlock: Fr.ZERO.toString(),
            provenEpochNumber: 0n,
            isBlockHeaderHashStale: false,
          } as ViemRollupStatus);
        }
      } else {
        // Regular status() call - return current chain tip
        return Promise.resolve({
          provenBlockNumber: 0n,
          provenArchive: GENESIS_ROOT,
          pendingBlockNumber: contractPendingBlockNumber,
          pendingHeaderHash: contractPendingHeaderHash,
          headerHashOfMyBlock: GENESIS_HEADER_HASH,
          provenEpochNumber: 0n,
          isBlockHeaderHashStale: false,
        } as ViemRollupStatus);
      }
    });

    // No messages for this test
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));

    makeL2BlockProposedEvent(
      70n,
      1n,
      headerHashes[0].toString() as `0x${string}`,
      GENESIS_HEADER_HASH as `0x${string}`,
      blobHashes[0],
    );
    makeL2BlockProposedEvent(
      80n,
      2n,
      headerHashes[1].toString() as `0x${string}`,
      headerHashes[0].toString() as `0x${string}`,
      blobHashes[1],
    );

    // Wait until the archiver gets to the target block
    await archiver.start(false);
    await retryUntil(async () => (await archiver.getBlockNumber()) === 2, 'sync', 10, 0.1);

    // And now the rollup contract suddenly forgets about the last block, so the archiver rolls back
    // This is the spurious prune that the archiver needs to recover from on the next iteration
    // We presume this happens because of L1 reorgs or more likely faulty L1 RPC providers
    publicClient.getBlockNumber.mockResolvedValue(95n);
    contractPendingBlockNumber = 1n;
    contractPendingHeaderHash = headerHashes[0].toString();
    currentBlocks = blocks.slice(0, 1);
    await retryUntil(async () => (await archiver.getBlockNumber()) === 1, 'prune', 10, 0.1);

    // But it was just a fluke, and the rollup keeps advancing. We even get block 3, which triggers
    // the archiver's "Rolling back L1 sync point..." handler when trying to insert it with block 2 missing.
    currentBlocks = blocks.slice(0, 3);
    publicClient.getBlockNumber.mockResolvedValue(105n);
    makeL2BlockProposedEvent(
      100n,
      3n,
      headerHashes[2].toString() as `0x${string}`,
      headerHashes[1].toString() as `0x${string}`,
      blobHashes[2],
    );
    contractPendingBlockNumber = 3n;
    contractPendingHeaderHash = headerHashes[2].toString();

    // Then the archiver must reprocess the old block to get to the new one
    await retryUntil(async () => (await archiver.getBlockNumber()) === 3, 'resync', 10, 0.1);
  });

  // TODO(palla/reorg): Add a unit test for the archiver handleEpochPrune
  xit('handles an upcoming L2 prune', () => {});

  const waitUntilArchiverBlock = async (blockNumber: number) => {
    logger.info(`Waiting for archiver to sync to block ${blockNumber}`);
    await retryUntil(() => archiver.getBlockNumber().then(b => b === blockNumber), 'sync', 10, 0.1);
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
   * Makes a fake L2BlockProposed event for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param l2BlockNum - L2 Block number.
   * @param headerHash - The header hash of the block being proposed.
   * @param parentHeaderHash - The header hash of the parent block.
   * @param versionedBlobHashes - The versioned blob hashes.
   */
  const makeL2BlockProposedEvent = (
    l1BlockNum: bigint,
    l2BlockNum: bigint,
    headerHash: `0x${string}`,
    parentHeaderHash: `0x${string}`,
    versionedBlobHashes: `0x${string}`[],
  ) => {
    const log = {
      blockNumber: l1BlockNum,
      args: { blockNumber: l2BlockNum, headerHash, parentHeaderHash, versionedBlobHashes },
      transactionHash: `0x${l2BlockNum}-propose`,
    } as unknown as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>;
    l2BlockProposedLogs.push(log);
  };

  /**
   * Makes fake L1ToL2 MessageSent events for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param l2BlockNumber - The L2 block number for which the message was included.
   * @param indexInSubtree - the index in the l2Block's subtree in the L1 to L2 Messages Tree.
   */
  const makeMessageSentEvent = (l1BlockNum: bigint, l2BlockNumber: number, indexInSubtree: bigint) => {
    const index = indexInSubtree + InboxLeaf.smallestIndexFromL2Block(l2BlockNumber);
    const leaf = Fr.random();
    messagesRollingHash = updateRollingHash(messagesRollingHash, leaf);
    totalMessagesInserted++;

    const log = {
      blockNumber: l1BlockNum,
      blockHash: Buffer32.fromBigInt(l1BlockNum).toString(),
      args: {
        l2BlockNumber: BigInt(l2BlockNumber),
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
   * Makes a fake L2ProofVerified event for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param l2BlockNum - L2 Block number.
   * @param proverId - The prover ID.
   */
  const makeL2ProofVerifiedEvent = (l1BlockNum: bigint, l2BlockNum: number, proverId: EthAddress) => {
    const txHash = `0x${l2BlockNum}-proof`;

    const log = {
      blockNumber: l1BlockNum,
      args: {
        blockNumber: BigInt(l2BlockNum),
        proverId: proverId.toString() as `0x${string}`,
      },
      transactionHash: txHash,
    } as unknown as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2ProofVerified'>;

    l2ProofVerifiedLogs.push(log);
  };
});

/**
 * Makes a fake rollup tx for testing purposes.
 * @param block - The L2Block.
 * @returns A fake tx with calldata that corresponds to calling process in the Rollup contract.
 */
async function makeRollupTx(l2Block: L2Block, signers: Secp256k1Signer[] = [], parentHeaderHash: `0x${string}`) {
  const attestations = signers
    .map(signer => makeBlockAttestationFromBlock(l2Block, signer))
    .map(blockAttestation => CommitteeAttestation.fromSignature(blockAttestation.signature))
    .map(committeeAttestation => committeeAttestation.toViem());
  const header = l2Block.header.toPropose().toViem();
  const blobInput = Blob.getPrefixedEthBlobCommitments(await Blob.getBlobsPerBlock(l2Block.body.toBlobFields()));
  // const archive = toHex(l2Block.archive.root.toBuffer());
  const stateReference = l2Block.header.state.toViem();
  const rollupInput = encodeFunctionData({
    abi: RollupAbi,
    functionName: 'propose',
    args: [
      {
        header,
        // archive,
        stateReference,
        oracleInput: { feeAssetPriceModifier: 0n },
        parentHeaderHash,
      },
      RollupContract.packAttestations(attestations),
      signers.map(signer => signer.address.toString()),
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
  return { input: multiCallInput } as Transaction<bigint, number>;
}

/**
 * Makes versioned blob hashes for testing purposes.
 * @param l2Block - The L2 block.
 * @returns Versioned blob hashes.
 */
async function makeVersionedBlobHashes(l2Block: L2Block): Promise<`0x${string}`[]> {
  const blobHashes = (await Blob.getBlobsPerBlock(l2Block.body.toBlobFields())).map(b => b.getEthVersionedBlobHash());
  return blobHashes.map(h => `0x${h.toString('hex')}` as `0x${string})`);
}

/**
 * Blob response to be returned from the blob sink based on the expected block.
 * @param block - The block.
 * @returns The blobs.
 */
async function makeBlobsFromBlock(block: L2Block) {
  const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
  return blobs.map((blob, index) => new BlobWithIndex(blob, index));
}

/**
 * Makes a fake proof submission transaction for testing purposes.
 * @param txHash - Transaction hash.
 * @param l2BlockNumber - L2 block number.
 * @param proverId - Prover ID.
 * @param archiveRoot - Archive root for the block.
 * @returns A fake transaction with submitEpochRootProof calldata.
 */
function makeProofSubmissionTx(block: L2Block, previousArchive: Fr, proverId: EthAddress): Transaction<bigint, number> {
  const l2BlockNumber = block.header.getBlockNumber();
  const archiveRoot = block.archive.root;

  const data = {
    abi: RollupAbi,
    functionName: 'submitEpochRootProof',
    args: [
      {
        start: BigInt(l2BlockNumber),
        end: BigInt(l2BlockNumber),
        args: {
          previousArchive: previousArchive.toString() as `0x${string}`,
          endArchive: archiveRoot.toString() as `0x${string}`,
          proverId: proverId.toString() as `0x${string}`,
        },
        fees: [],
        attestations: {
          signatureIndices: '0x',
          signaturesOrAddresses: '0x',
        },
        blobInputs: ('0x' + '00'.repeat(32)) as `0x${string}`, // Dummy blob inputs
        proof: ('0x' + '00'.repeat(100)) as `0x${string}`, // Dummy proof data
      },
    ],
  };

  const submitProofCalldata = encodeFunctionData(data as any);

  return {
    input: submitProofCalldata,
  } as Transaction<bigint, number>;
}
