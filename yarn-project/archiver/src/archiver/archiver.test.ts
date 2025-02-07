import { Blob } from '@aztec/blob-lib';
import { type BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { InboxLeaf, type L1RollupConstants, L2Block } from '@aztec/circuit-types';
import { GENESIS_ARCHIVE_ROOT, PrivateLog } from '@aztec/circuits.js';
import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ForwarderAbi, type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type Chain,
  type HttpTransport,
  type Log,
  type PublicClient,
  type Transaction,
  encodeFunctionData,
  toHex,
} from 'viem';

import { Archiver } from './archiver.js';
import { type ArchiverDataStore } from './archiver_store.js';
import { type ArchiverInstrumentation } from './instrumentation.js';
import { MemoryArchiverStore } from './memory_archiver_store/memory_archiver_store.js';

interface MockRollupContractRead {
  /** Given an L2 block number, returns the archive. */
  archiveAt: (args: readonly [bigint]) => Promise<`0x${string}`>;
  /** Given an L2 block number, returns provenBlockNumber, provenArchive, pendingBlockNumber, pendingArchive, archiveForLocalPendingBlockNumber, provenEpochNumber. */
  status: (args: readonly [bigint]) => Promise<[bigint, `0x${string}`, bigint, `0x${string}`, `0x${string}`]>;
}

interface MockInboxContractRead {
  totalMessagesInserted: () => Promise<bigint>;
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

  let publicClient: MockProxy<PublicClient<HttpTransport, Chain>>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobSinkClient: MockProxy<BlobSinkClientInterface>;
  let archiverStore: ArchiverDataStore;
  let now: number;
  let l1Constants: L1RollupConstants;

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

  let l2BlockProposedLogs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[];
  let l2MessageSentLogs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[];

  let logger: Logger;

  const GENESIS_ROOT = new Fr(GENESIS_ARCHIVE_ROOT).toString();

  beforeEach(async () => {
    logger = createLogger('archiver:test');
    now = +new Date();
    publicClient = mock<PublicClient<HttpTransport, Chain>>({
      // Return a block with a reasonable timestamp
      getBlock: ((args: any) => ({
        timestamp: args.blockNumber * BigInt(DefaultL1ContractsConfig.ethereumSlotDuration) + BigInt(now),
      })) as any,
    });
    blobSinkClient = mock<BlobSinkClientInterface>();

    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });
    archiverStore = new MemoryArchiverStore(1000);
    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
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
    blocks.forEach(block => {
      block.body.txEffects.forEach((txEffect, i) => {
        txEffect.privateLogs = Array(getNumPrivateLogsForTx(block.number, i))
          .fill(0)
          .map(() => PrivateLog.random());
      });
    });

    mockRollupRead = mock<MockRollupContractRead>();
    mockRollupRead.archiveAt.mockImplementation((args: readonly [bigint]) =>
      Promise.resolve(blocks[Number(args[0] - 1n)].archive.root.toString()),
    );
    mockRollupEvents = mock<MockRollupContractEvents>();
    mockRollupEvents.L2BlockProposed.mockImplementation((filter: any, { fromBlock, toBlock }) =>
      Promise.resolve(l2BlockProposedLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock)),
    );
    mockRollup = {
      read: mockRollupRead,
      getEvents: mockRollupEvents,
      address: rollupAddress.toString(),
    };

    (archiver as any).rollup = mockRollup;

    mockInboxRead = mock<MockInboxContractRead>();
    mockInboxEvents = mock<MockInboxContractEvents>();
    mockInboxEvents.MessageSent.mockImplementation(async (filter: any, { fromBlock, toBlock }) => {
      return await Promise.resolve(
        l2MessageSentLogs.filter(log => log.blockNumber! >= fromBlock && log.blockNumber! <= toBlock),
      );
    });
    mockInbox = {
      read: mockInboxRead,
      getEvents: mockInboxEvents,
    };
    (archiver as any).inbox = mockInbox;

    l2MessageSentLogs = [];
    l2BlockProposedLogs = [];
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  it('can start, sync and stop and handle l1 to l2 messages and logs', async () => {
    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    blocks.forEach(
      (b, i) =>
        (b.header.globalVariables.timestamp = new Fr(now + DefaultL1ContractsConfig.ethereumSlotDuration * (i + 1))),
    );
    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    publicClient.getBlockNumber.mockResolvedValueOnce(2500n).mockResolvedValueOnce(2600n).mockResolvedValueOnce(2700n);

    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, blocks[0].archive.root.toString(), GENESIS_ROOT])
      .mockResolvedValue([
        1n,
        blocks[0].archive.root.toString(),
        3n,
        blocks[2].archive.root.toString(),
        blocks[0].archive.root.toString(),
      ]);

    mockInbox.read.totalMessagesInserted.mockResolvedValueOnce(2n).mockResolvedValueOnce(6n);

    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    makeMessageSentEvent(98n, 1n, 0n);
    makeMessageSentEvent(99n, 1n, 1n);
    makeL2BlockProposedEvent(101n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);

    makeMessageSentEvent(2504n, 2n, 0n);
    makeMessageSentEvent(2505n, 2n, 1n);
    makeMessageSentEvent(2505n, 2n, 2n);
    makeMessageSentEvent(2506n, 3n, 1n);
    makeL2BlockProposedEvent(2510n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);
    makeL2BlockProposedEvent(2520n, 3n, blocks[2].archive.root.toString(), blobHashes[2]);
    publicClient.getTransaction.mockResolvedValueOnce(rollupTxs[0]);

    rollupTxs.slice(1).forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));

    await archiver.start(false);

    // Wait until block 3 is processed. If this won't happen the test will fail with timeout.
    while ((await archiver.getBlockNumber()) !== 3) {
      await sleep(100);
    }

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(3);

    // L1 to L2 messages
    {
      // Checks that I get correct amount of sequenced new messages for L2 blocks 1 and 2
      let l1ToL2Messages = await archiver.getL1ToL2Messages(1n);
      expect(l1ToL2Messages.length).toEqual(2);

      l1ToL2Messages = await archiver.getL1ToL2Messages(2n);
      expect(l1ToL2Messages.length).toEqual(3);

      // Check that I cannot get messages for block 3 because there is a message gap (message with index 0 was not
      // processed) --> since we are fetching events individually for each message there is a message gap check when
      // fetching the messages for the block in order to ensure that all the messages were really obtained. E.g. if we
      // receive messages with indices 0, 1, 2, 4, 5, 6 we can be sure there is an issue because we are missing message
      // with index 3.
      await expect(async () => {
        await archiver.getL1ToL2Messages(3n);
      }).rejects.toThrow(`L1 to L2 message gap found in block ${3}`);
    }

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

  it('ignores block 3 because it have been pruned (simulate pruning)', async () => {
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

    mockRollup.read.status.mockResolvedValue([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT]);

    mockInbox.read.totalMessagesInserted.mockResolvedValueOnce(2n).mockResolvedValueOnce(2n);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);
    makeL2BlockProposedEvent(90n, 3n, badArchive, [badBlobHash]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    while ((await archiver.getBlockNumber()) !== numL2BlocksInTest) {
      await sleep(100);
    }

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

    publicClient.getBlockNumber.mockResolvedValueOnce(50n).mockResolvedValueOnce(100n);
    mockRollup.read.status
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT])
      .mockResolvedValueOnce([0n, GENESIS_ROOT, 2n, blocks[1].archive.root.toString(), GENESIS_ROOT]);

    mockInbox.read.totalMessagesInserted.mockResolvedValueOnce(0n).mockResolvedValueOnce(2n);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    while ((await archiver.getBlockNumber()) !== numL2BlocksInTest) {
      await sleep(100);
    }

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);
    expect(loggerSpy).toHaveBeenCalledWith(`No blocks to retrieve from 1 to 50`);
  }, 10_000);

  it('handles L2 reorg', async () => {
    const loggerSpy = jest.spyOn((archiver as any).log, 'debug');

    let latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(0);

    const numL2BlocksInTest = 2;

    const rollupTxs = await Promise.all(blocks.map(makeRollupTx));
    const blobHashes = await Promise.all(blocks.map(makeVersionedBlobHashes));

    publicClient.getBlockNumber.mockResolvedValueOnce(50n).mockResolvedValueOnce(100n).mockResolvedValueOnce(150n);

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

    mockInbox.read.totalMessagesInserted
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(2n)
      .mockResolvedValueOnce(2n)
      .mockResolvedValueOnce(2n);

    makeMessageSentEvent(66n, 1n, 0n);
    makeMessageSentEvent(68n, 1n, 1n);
    makeL2BlockProposedEvent(70n, 1n, blocks[0].archive.root.toString(), blobHashes[0]);
    makeL2BlockProposedEvent(80n, 2n, blocks[1].archive.root.toString(), blobHashes[1]);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    while ((await archiver.getBlockNumber()) !== numL2BlocksInTest) {
      await sleep(100);
    }

    latestBlockNum = await archiver.getBlockNumber();
    expect(latestBlockNum).toEqual(numL2BlocksInTest);

    expect(loggerSpy).toHaveBeenCalledWith(`No blocks to retrieve from 1 to 50`);

    // Lets take a look to see if we can find re-org stuff!
    await sleep(1000);

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
    publicClient.getBlockNumber.mockResolvedValueOnce(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, l2Block.archive.root.toString(), GENESIS_ROOT]);
    makeL2BlockProposedEvent(l1BlockForL2Block, 1n, l2Block.archive.root.toString(), blobHashes);
    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(0n)).toBe(false);

    // Wait until block 1 is processed
    while ((await archiver.getBlockNumber()) !== 1) {
      await sleep(100);
    }

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
    publicClient.getBlockNumber.mockResolvedValueOnce(l1BlockForL2Block);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 1n, l2Block.archive.root.toString(), GENESIS_ROOT]);
    makeL2BlockProposedEvent(l1BlockForL2Block, 1n, l2Block.archive.root.toString(), blobHashes);

    rollupTxs.forEach(tx => publicClient.getTransaction.mockResolvedValueOnce(tx));
    const blobsFromBlocks = await Promise.all(blocks.map(b => makeBlobsFromBlock(b)));
    blobsFromBlocks.forEach(blobs => blobSinkClient.getBlobSidecar.mockResolvedValueOnce(blobs));

    await archiver.start(false);

    // Epoch should not yet be complete
    expect(await archiver.isEpochComplete(0n)).toBe(false);

    // Wait until block 1 is processed
    while ((await archiver.getBlockNumber()) !== 1) {
      await sleep(100);
    }

    // Epoch should be complete once block was synced
    expect(await archiver.isEpochComplete(0n)).toBe(true);
  });

  it('reports an epoch as pending if the current L1 block is not the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const notLastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 2n;
    expect(notLastL1BlockForEpoch).toEqual(6n);

    logger.info(`Syncing archiver to L1 block ${notLastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValueOnce(notLastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(0n)).toBe(false);
  });

  it('reports an epoch as complete if the current L1 block is the last one on the epoch and no L2 block landed', async () => {
    const { l1StartBlock, slotDuration, ethereumSlotDuration, epochDuration } = l1Constants;
    const lastL1BlockForEpoch = l1StartBlock + BigInt((epochDuration * slotDuration) / ethereumSlotDuration) - 1n;
    expect(lastL1BlockForEpoch).toEqual(7n);

    logger.info(`Syncing archiver to L1 block ${lastL1BlockForEpoch}`);
    publicClient.getBlockNumber.mockResolvedValueOnce(lastL1BlockForEpoch);
    mockRollup.read.status.mockResolvedValueOnce([0n, GENESIS_ROOT, 0n, GENESIS_ROOT, GENESIS_ROOT]);

    await archiver.start(true);
    expect(await archiver.isEpochComplete(0n)).toBe(true);
  });

  // TODO(palla/reorg): Add a unit test for the archiver handleEpochPrune
  xit('handles an upcoming L2 prune', () => {});

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
    const log = {
      blockNumber: l1BlockNum,
      args: {
        l2BlockNumber,
        index,
        hash: Fr.random().toString(),
      },
      transactionHash: `0x${l1BlockNum}`,
    } as Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>;
    l2MessageSentLogs.push(log);
  };
});

/**
 * Makes a fake rollup tx for testing purposes.
 * @param block - The L2Block.
 * @returns A fake tx with calldata that corresponds to calling process in the Rollup contract.
 */
async function makeRollupTx(l2Block: L2Block) {
  const header = toHex(l2Block.header.toBuffer());
  const body = toHex(l2Block.body.toBuffer());
  const blobInput = Blob.getEthBlobEvaluationInputs(await Blob.getBlobs(l2Block.body.toBlobFields()));
  const archive = toHex(l2Block.archive.root.toBuffer());
  const blockHash = toHex((await l2Block.header.hash()).toBuffer());
  const rollupInput = encodeFunctionData({
    abi: RollupAbi,
    functionName: 'propose',
    args: [
      { header, archive, blockHash, oracleInput: { provingCostModifier: 0n, feeAssetPriceModifier: 0n }, txHashes: [] },
      [],
      body,
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
  const blobHashes = (await Blob.getBlobs(l2Block.body.toBlobFields())).map(b => b.getEthVersionedBlobHash());
  return blobHashes.map(h => `0x${h.toString('hex')}` as `0x${string})`);
}

/**
 * Blob response to be returned from the blob sink based on the expected block.
 * @param block - The block.
 * @returns The blobs.
 */
async function makeBlobsFromBlock(block: L2Block) {
  return await Blob.getBlobs(block.body.toBlobFields());
}
