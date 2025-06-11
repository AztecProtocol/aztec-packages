import { Blob } from '@aztec/blob-lib';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { BlobWithIndex } from '@aztec/blob-sink/types';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { DefaultL1ContractsConfig, InboxContract, RollupContract, type ViemPublicClient } from '@aztec/ethereum';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex, withoutHexPrefix } from '@aztec/foundation/string';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { ForwarderAbi, type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { L2Block } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { PrivateLog } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type FormattedBlock, type Log, type Transaction, encodeFunctionData, toHex } from 'viem';

import { Archiver } from './archiver.js';
import type { ArchiverDataStore } from './archiver_store.js';
import type { ArchiverInstrumentation } from './instrumentation.js';
import { KVArchiverDataStore } from './kv_archiver_store/kv_archiver_store.js';
import { updateRollingHash } from './structs/inbox_message.js';

interface MockRollupContractRead {
  /** Returns the rollup version. */
  getVersion: () => Promise<bigint>;
  /** Given an L2 block number, returns the archive. */
  archiveAt: (args: readonly [bigint]) => Promise<`0x${string}`>;
  /** Given an L2 block number, returns provenBlockNumber, provenArchive, pendingBlockNumber, pendingArchive, archiveForLocalPendingBlockNumber, provenEpochNumber. */
  status: (args: readonly [bigint]) => Promise<[bigint, `0x${string}`, bigint, `0x${string}`, `0x${string}`]>;
}

interface MockInboxContractRead {
  getState: () => Promise<{ rollingHash: `0x${string}`; totalMessagesInserted: bigint; inProgress: bigint }>;
}

interface MockRollupContractEvents {
  L2BlockProposed: (
    filter: any,
    range: { fromBlock: bigint; toBlock: bigint },
  ) => Promise<Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[]>;
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
      .map((_, i) => getNumPrivateLogsForTx(i, blockNumber))
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

  let publicClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobSinkClient: MockProxy<BlobSinkClientInterface>;
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

  let l2BlockProposedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[];
  let l2MessageSentLogs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[];

  let logger: Logger;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT).toString();
  const ETHEREUM_SLOT_DURATION = BigInt(DefaultL1ContractsConfig.ethereumSlotDuration);

  beforeEach(async () => {
    logger = createLogger('archiver:test');
    messagesRollingHash = Buffer16.ZERO;
    totalMessagesInserted = 0;
    now = +new Date();
    publicClient = mock<ViemPublicClient>();
    publicClient.getChainId.mockResolvedValue(1);
    publicClient.getBlock.mockImplementation(async (args: { blockNumber?: bigint } = {}) => {
      args.blockNumber ??= await publicClient.getBlockNumber();
      return {
        number: args.blockNumber,
        timestamp: BigInt(args.blockNumber) * ETHEREUM_SLOT_DURATION + BigInt(now),
        hash: Buffer32.fromBigInt(BigInt(args.blockNumber)).toString(),
      } as FormattedBlock;
    });

    blobSinkClient = mock<BlobSinkClientInterface>();

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
      proofSubmissionWindow: 8,
    };

    archiver = new Archiver(
      publicClient,
      { rollupAddress, inboxAddress, registryAddress },
      archiverStore,
      { pollingIntervalMs: 1000, batchSize: 1000 },
      blobSinkClient,
      instrumentation,
      l1Constants,
    );

    blocks = await Promise.all(blockNumbers.map(x => L2Block.random(x, txsPerBlock, x + 1, 2)));
    blocks.forEach((block, i) => {
      block.header.globalVariables.timestamp = new Fr(now + Number(ETHEREUM_SLOT_DURATION) * (i + 1));
      block.body.txEffects.forEach((txEffect, i) => {
        txEffect.privateLogs = times(getNumPrivateLogsForTx(block.number, i), () => PrivateLog.random());
      });
    });

    // TODO(palla/archiver) Instead of guessing the archiver requests with mockResolvedValueOnce,
    // we should use a mock implementation that returns the expected value based on the input.

    // blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));
    // blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    // blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    // rollupTxs = await Promise.all(blocks.map(makeRollupTx));
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
    mockRollupRead.getVersion.mockImplementation(() => Promise.resolve(1n));
    mockRollupEvents = mock<MockRollupContractEvents>();
    mockRollupEvents.L2BlockProposed.mockImplementation((filter: any, { fromBlock, toBlock }) =>
      Promise.resolve(l2BlockProposedLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock)),
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
    l2BlockProposedLogs = [];
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  it('syncs l1 to l2 messages and blocks', async () => {
    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    mockL1BlockNumbers(2500n, 2510n, 2520n);

    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, blocks[0].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValue([
        1n,
        blocks[0].archive.root.toString(),
        3n,
        blocks[2].archive.root.toString(),
        blocks[0].archive.root.toString(),
      ]);

    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvent(98n, 1n, 0n);
    makeMessageSentEvent(99n, 1n, 1n);
    makeL2BlockProposedEvent(101n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);

    makeMessageSentEvent(2504n, 2n, 0n);
    makeMessageSentEvent(2505n, 2n, 1n);
    makeMessageSentEvent(2505n, 2n, 2n);
    makeMessageSentEvent(2506n, 3n, 0n);
    makeL2BlockProposedEvent(2507n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);
    makeL2BlockProposedEvent(2508n, 3n, blocks[2].archive.root.toString(), blobHashes[2]);

    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(2))
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(6));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));

    await archiver.start(false);

    // Wait until block 3 is processed. If this won't happen the test will fail with timeout.
    await waitUntilArchiverBlock(3);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(3);

    expect(await archiver.getL1ToL2Messages(1n)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2n)).toHaveLength(3);
    expect(await archiver.getL1ToL2Messages(3n)).toHaveLength(1);

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

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    // Here we set the current L1 block number to 102. L1 to L2 messages after this should not be read.
    publicClient.getBlockNumber.mockResolvedValue(102n);

    const badArchive = Fr.random().toString();
    const badBlobHash = Fr.random().toString();

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(2));

    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);
    makeL2BlockProposedEvent(90n, 3n, badArchive, [badBlobHash]);
    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringMatching(/archive root mismatch/i), {
      actual: badArchive,
      expected: blocks[2].archive.root.toString(),
    });
  }, 10_000);

  it('skip event search if no changes found', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    mockL1BlockNumbers(50n, 100n);

    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT]);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
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

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    let mockedBlockNum = 0n;
    publicClient.getBlockNumber.mockImplementation(() => {
      mockedBlockNum += 50n;
      return Promise.resolve(mockedBlockNum);
    });

    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);

    // We will return status at first to have an empty round, then as if we have 2 pending blocks, and finally
    // Just a single pending block returning a "failure" for the expected pending block
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, blocks[0].archive.root.toString(), Fr.ZERO.toString()]);

    mockRollup.read.archiveAt
      .mockResolvedValueOnce(blocks[0].archive.root.toString())
      .mockResolvedValueOnce(blocks[1].archive.root.toString())
      .mockResolvedValueOnce(Fr.ZERO.toString());

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    mockInbox.read.getState
      .mockResolvedValueOnce(makeInboxStateFromMsgCount(0))
      .mockResolvedValue(makeInboxStateFromMsgCount(2));

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    await waitUntilArchiverBlock(numL2BlocksInTest);

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);

    expect(loggerSpy).toHaveBeenCalledWith(`No blocks to retrieve from 1 to 50, no blocks on chain`);

    // Lets take a look to see if we can find re-org stuff!
    await sleep(2000);

    expect(loggerSpy).toHaveBeenCalledWith(`L2 prune has been detected.`);

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

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    // Creates messages for L2 blocks 1 and 3, across L1 blocks 100 and 101
    makeMessageSentEvent(100n, 1n, 0n);
    makeMessageSentEvent(100n, 1n, 1n);
    makeMessageSentEvent(101n, 3n, 0n);
    makeMessageSentEvent(101n, 3n, 1n);
    makeMessageSentEvent(101n, 3n, 2n);
    makeMessageSentEvent(101n, 3n, 3n);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(5));

    await archiver.start(false);

    await retryUntil(() => archiver.getL1ToL2Messages(3n).then(msgs => msgs.length === 4), 'sync', 10, 0.1);

    expect(await archiver.getL1ToL2Messages(1n)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2n)).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(3n)).toHaveLength(4);
    expect(await archiver.getL1ToL2Messages(4n)).toHaveLength(0);

    // Drops the last 2 messages from L2 block 3, and adds new messages for L2 blocks 4 and 5
    // Note the overlap in L1 blocks, to test reinsertion of messages
    logger.warn(`Reorging L1 to L2 messages`);
    l2MessageSentLogs.splice(4);
    messagesRollingHash = Buffer16.fromString(l2MessageSentLogs.at(-1)!.args.rollingHash);
    const { leaf: msg40 } = makeMessageSentEvent(101n, 4n, 0n);
    const { leaf: msg50 } = makeMessageSentEvent(101n, 5n, 0n);
    const { leaf: msg51 } = makeMessageSentEvent(102n, 5n, 1n);
    expect(l2MessageSentLogs).toHaveLength(7);
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(7));

    await retryUntil(() => archiver.getL1ToL2Messages(5n).then(msgs => msgs.length === 2), 're-sync', 10, 0.1);

    expect(await archiver.getL1ToL2Messages(1n)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(2n)).toHaveLength(0);
    expect(await archiver.getL1ToL2Messages(3n)).toHaveLength(2);
    expect(await archiver.getL1ToL2Messages(4n)).toHaveLength(1);
    expect(await archiver.getL1ToL2Messages(5n)).toHaveLength(2);

    expect((await archiver.getL1ToL2Messages(4n)).map(leaf => leaf.toString())).toEqual(
      [msg40].map(leaf => leaf.toString()),
    );
    expect((await archiver.getL1ToL2Messages(5n)).map(leaf => leaf.toString())).toEqual(
      [msg50, msg51].map(leaf => leaf.toString()),
    );
  });

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

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, l2Block.archive.root.toString(), GENESIS_ROOT]);
    makeL2BlockProposedEvent(l1BlockForL2Block, 1n, l2Block.archive.root.toString(), blobHashes);
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

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    publicClient.getBlockNumber.mockResolvedValue(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, l2Block.archive.root.toString(), GENESIS_ROOT]);
    makeL2BlockProposedEvent(l1BlockForL2Block, 1n, l2Block.archive.root.toString(), blobHashes);

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
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(0n)).toBe(false);
  });

  it('reports an epoch as complete if the current L1 block is the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;
    expect(lastL1BlockForEpoch).toEqual(7n);

    logger.info(`Syncing archiver to L1 block ${lastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

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

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    publicClient.getBlockNumber.mockResolvedValue(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, l2Block.archive.root.toString(), GENESIS_ROOT]);
    makeL2BlockProposedEvent(l1BlockForL2Block, 1n, l2Block.archive.root.toString(), blobHashes);

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

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));

    // Return the corresponding archive roots for the current blocks
    let currentBlocks = blocks.slice(0, 2);
    mockRollup.read.archiveAt.mockImplementation((args: readonly [bigint]) => {
      const block = currentBlocks[Number(args[0] - 1n)];
      return Promise.resolve(block ? block.archive.root.toString() : Fr.ZERO.toString());
    });

    // And the corresponding rollup txs
    publicClient.getTransaction.mockImplementation((args: { hash?: `0x${string}` }) => {
      const index = parseInt(withoutHexPrefix(args.hash!));
      if (index > blocks.length) {
        throw new Error(`Transaction not found: ${args.hash}`);
      }
      return Promise.resolve(rollupTxs[index - 1]);
    });

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

    // Status first returns the two blocks, only so that it then "forgets" the initial block to add it back later
    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT]);

    // No messages for this test
    mockInbox.read.getState.mockResolvedValue(makeInboxStateFromMsgCount(0));

    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);

    // Wait until the archiver gets to the target block
    await archiver.start(false);
    await retryUntil(async () => (await archiver.getBlockNumber()) === 2, 'sync', 10, 0.1);

    // And now the rollup contract suddenly forgets about the last block, so the archiver rolls back
    // This is the spurious prune that the archiver needs to recover from on the next iteration
    // We presume this happens because of L1 reorgs or more likely faulty L1 RPC providers
    const ZERO = Fr.ZERO.toString();
    publicClient.getBlockNumber.mockResolvedValue(95n);
    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 1n, blocks[0].archive.root.toString(), ZERO]);
    currentBlocks = blocks.slice(0, 1);
    await retryUntil(async () => (await archiver.getBlockNumber()) === 1, 'prune', 10, 0.1);

    // But it was just a fluke, and the rollup keeps advancing. We even get block 3, which triggers
    // the archiver's "Rolling back L1 sync point..." handler when trying to insert it with block 2 missing.
    currentBlocks = blocks.slice(0, 3);
    publicClient.getBlockNumber.mockResolvedValue(105n);
    makeL2BlockProposedEvent(100n, 3n, blocks[2].archive.root.toString(), blobHashes[2]);
    mockRollup.read.status.mockResolvedValue([
      0n,
      GENESIS_ROOT,
      3n,
      blocks[2].archive.root.toString(),
      blocks[0].archive.root.toString(),
    ]);

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
   */
  const makeL2BlockProposedEvent = (
    l1BlockNum: bigint,
    l2BlockNum: bigint,
    archive: `0x${string}`,
    versionedBlobHashes: `0x${string}`[],
  ) => {
    const log = {
      blockNumber: l1BlockNum,
      args: { blockNumber: l2BlockNum, archive, versionedBlobHashes },
      transactionHash: `0x${l2BlockNum}`,
    } as unknown as Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>;
    l2BlockProposedLogs.push(log);
  };

  /**
   * Makes fake L1ToL2 MessageSent events for testing purposes and registers it to be returned by the public client.
   * @param l1BlockNum - L1 block number.
   * @param l2BlockNumber - The L2 block number for which the message was included.
   * @param indexInSubtree - the index in the l2Block's subtree in the L1 to L2 Messages Tree.
   */
  const makeMessageSentEvent = (l1BlockNum: bigint, l2BlockNumber: bigint, indexInSubtree: bigint) => {
    const index = indexInSubtree + InboxLeaf.smallestIndexFromL2Block(l2BlockNumber);
    const leaf = Fr.random();
    messagesRollingHash = updateRollingHash(messagesRollingHash, leaf);
    totalMessagesInserted++;

    const log = {
      blockNumber: l1BlockNum,
      blockHash: Buffer32.fromBigInt(l1BlockNum).toString(),
      args: {
        l2BlockNumber,
        index,
        hash: leaf.toString(),
        rollingHash: messagesRollingHash.toString(),
      },
      transactionHash: `0x${l1BlockNum}`,
    } as Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>;
    l2MessageSentLogs.push(log);
    return { log, leaf, index };
  };
});

/**
 * Makes a fake rollup tx for testing purposes.
 * @param block - The L2Block.
 * @returns A fake tx with calldata that corresponds to calling process in the Rollup contract.
 */
async function makeRollupTx(l2Block: L2Block) {
  const header = l2Block.header.toPropose().toViem();
  const blobInput = Blob.getPrefixedEthBlobCommitments(await Blob.getBlobsPerBlock(l2Block.body.toBlobFields()));
  const archive = toHex(l2Block.archive.root.toBuffer());
  const stateReference = l2Block.header.state.toViem();
  const rollupInput = encodeFunctionData({
    abi: RollupAbi,
    functionName: 'propose',
    args: [
      {
        header,
        archive,
        stateReference,
        oracleInput: { feeAssetPriceModifier: 0n },
        txHashes: [],
      },
      [],
      blobInput,
    ],
  });

  const forwarderInput = encodeFunctionData({
    abi: ForwarderAbi,
    functionName: 'forward',
    args: [[EthAddress.ZERO.toString()], [rollupInput]],
  });

  return { input: forwarderInput } as Transaction<bigint, number>;
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
