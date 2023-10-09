import {
  INITIAL_L2_BLOCK_NUM,
  L2Block,
  L2BlockContext,
  L2BlockL2Logs,
  LogId,
  LogType,
  TxHash,
  UnencryptedL2Log,
} from '@aztec/types';

import { randomBytes } from 'crypto';

import { ArchiverDataStore, MemoryArchiverStore } from './archiver_store.js';

describe('Archiver Memory Store', () => {
  let archiverStore: ArchiverDataStore;

  beforeEach(() => {
    archiverStore = new MemoryArchiverStore(1000);
  });

  it('can store and retrieve blocks', async () => {
    const blocks = Array(10)
      .fill(0)
      .map((_, index) => L2Block.random(index));
    await archiverStore.addL2Blocks(blocks);
    // Offset indices by INITIAL_L2_BLOCK_NUM to ensure we are correctly aligned
    for (const [from, limit] of [
      [0 + INITIAL_L2_BLOCK_NUM, 10],
      [3 + INITIAL_L2_BLOCK_NUM, 3],
      [1 + INITIAL_L2_BLOCK_NUM, 7],
      [5 + INITIAL_L2_BLOCK_NUM, 8],
      [10 + INITIAL_L2_BLOCK_NUM, 1],
      [11 + INITIAL_L2_BLOCK_NUM, 1],
    ]) {
      const expected = blocks.slice(from - INITIAL_L2_BLOCK_NUM, from - INITIAL_L2_BLOCK_NUM + limit);
      const actual = await archiverStore.getL2Blocks(from, limit);
      expect(expected).toEqual(actual);
    }
  });

  test.each([LogType.ENCRYPTED, LogType.UNENCRYPTED])('can store and retrieve logs', async (logType: LogType) => {
    const logs = Array(10)
      .fill(0)
      .map(_ => L2BlockL2Logs.random(6, 3, 2));
    await archiverStore.addLogs(logs, logType);
    // Offset indices by INITIAL_L2_BLOCK_NUM to ensure we are correctly aligned
    for (const [from, limit] of [
      [0 + INITIAL_L2_BLOCK_NUM, 10],
      [3 + INITIAL_L2_BLOCK_NUM, 3],
      [1 + INITIAL_L2_BLOCK_NUM, 7],
      [5 + INITIAL_L2_BLOCK_NUM, 8],
      [10 + INITIAL_L2_BLOCK_NUM, 1],
      [11 + INITIAL_L2_BLOCK_NUM, 1],
    ]) {
      const expected = logs.slice(from - INITIAL_L2_BLOCK_NUM, from - INITIAL_L2_BLOCK_NUM + limit);
      const actual = await archiverStore.getLogs(from, limit, logType);
      expect(expected).toEqual(actual);
    }
  });

  it('throws if we try and request less than 1 block', async () => {
    const blocks = Array(10)
      .fill(0)
      .map((_, index) => L2Block.random(index));
    await archiverStore.addL2Blocks(blocks);
    await expect(async () => await archiverStore.getL2Blocks(1, 0)).rejects.toThrow(
      `Invalid block range from: 1, limit: 0`,
    );
  });

  test.each([LogType.ENCRYPTED, LogType.UNENCRYPTED])(
    'throws if we try and request less than 1 log',
    async (logType: LogType) => {
      const logs = Array(10)
        .fill(0)
        .map(_ => L2BlockL2Logs.random(6, 3, 2));
      await archiverStore.addLogs(logs, logType);
      await expect(async () => await archiverStore.getLogs(1, 0, logType)).rejects.toThrow(
        `Invalid block range from: 1, limit: 0`,
      );
    },
  );

  describe('getUnencryptedLogs errors and config', () => {
    it('throws when log filter is invalid', async () => {
      const txHash = new TxHash(randomBytes(TxHash.SIZE));
      const fromBlock = 1;
      const toBlock = 2;
      const afterLog = new LogId(1, 2, 3);

      const filter1 = {
        txHash,
        fromBlock,
      };
      await expect(async () => await archiverStore.getUnencryptedLogs(filter1)).rejects.toThrow(`If txHash is set`);

      const filter2 = {
        txHash,
        toBlock,
      };
      await expect(async () => await archiverStore.getUnencryptedLogs(filter2)).rejects.toThrow(`If txHash is set`);

      const filter3 = {
        txHash,
        afterLog,
      };
      await expect(async () => await archiverStore.getUnencryptedLogs(filter3)).rejects.toThrow(`If txHash is set`);

      const filter4 = {
        fromBlock,
        afterLog,
      };
      await expect(async () => await archiverStore.getUnencryptedLogs(filter4)).rejects.toThrow(`If fromBlock is set`);
    });

    it('throws fromBlock is smaller than genesis block', async () => {
      const fromBlock = INITIAL_L2_BLOCK_NUM - 1;

      await expect(
        async () =>
          await archiverStore.getUnencryptedLogs({
            fromBlock,
          }),
      ).rejects.toThrow(`smaller than genesis block number`);
    });

    it('does not return more than `maxLogs` logs', async () => {
      const maxLogs = 5;
      archiverStore = new MemoryArchiverStore(maxLogs);
      const blocks = Array(10)
        .fill(0)
        .map((_, index: number) => L2Block.random(index + 1, 4, 2, 3, 2, 2));

      await archiverStore.addL2Blocks(blocks);
      await archiverStore.addLogs(
        blocks.map(block => block.newUnencryptedLogs!),
        LogType.UNENCRYPTED,
      );

      const extendedLogs = await archiverStore.getUnencryptedLogs({});
      expect(extendedLogs.length).toEqual(maxLogs);
    });
  });

  describe('getUnencryptedLogs filtering', () => {
    const txsPerBlock = 4;
    const numPublicFunctionCalls = 3;
    const numUnencryptedLogs = 4;
    const numBlocks = 10;
    let blocks: L2Block[];

    beforeEach(async () => {
      blocks = Array(numBlocks)
        .fill(0)
        .map((_, index: number) =>
          L2Block.random(index + 1, txsPerBlock, 2, numPublicFunctionCalls, 2, numUnencryptedLogs),
        );

      await archiverStore.addL2Blocks(blocks);
      await archiverStore.addLogs(
        blocks.map(block => block.newUnencryptedLogs!),
        LogType.UNENCRYPTED,
      );
    });

    it('txHash filter param is respected', async () => {
      // get random tx
      const targetBlockIndex = Math.floor(Math.random() * numBlocks);
      const targetTxIndex = Math.floor(Math.random() * txsPerBlock);
      const targetTxHash = new L2BlockContext(blocks[targetBlockIndex]).getTxHash(targetTxIndex);

      const logs = await archiverStore.getUnencryptedLogs({ txHash: targetTxHash });

      const expectedNumLogs = numPublicFunctionCalls * numUnencryptedLogs;
      expect(logs.length).toEqual(expectedNumLogs);

      const targeBlockNumber = targetBlockIndex + INITIAL_L2_BLOCK_NUM;
      for (const log of logs) {
        expect(log.id.blockNumber).toEqual(targeBlockNumber);
        expect(log.id.txIndex).toEqual(targetTxIndex);
      }
    });

    it('fromBlock and toBlock filter params are respected', async () => {
      // Set fromBlock and toBlock
      const fromBlock = 3;
      const toBlock = 7;

      const logs = await archiverStore.getUnencryptedLogs({ fromBlock, toBlock });

      const expectedNumLogs = txsPerBlock * numPublicFunctionCalls * numUnencryptedLogs * (toBlock - fromBlock);
      expect(logs.length).toEqual(expectedNumLogs);

      for (const log of logs) {
        const blockNumber = log.id.blockNumber;
        expect(blockNumber).toBeGreaterThanOrEqual(fromBlock);
        expect(blockNumber).toBeLessThan(toBlock);
      }
    });

    it('afterLog filter param is respected', async () => {
      // Get a random log as reference
      const targetBlockIndex = Math.floor(Math.random() * numBlocks);
      const targetTxIndex = Math.floor(Math.random() * txsPerBlock);
      const targetLogIndex = Math.floor(Math.random() * numUnencryptedLogs);

      const afterLog = new LogId(targetBlockIndex + INITIAL_L2_BLOCK_NUM, targetTxIndex, targetLogIndex);

      const logs = await archiverStore.getUnencryptedLogs({ afterLog });

      for (const log of logs) {
        const logId = log.id;
        expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
        if (logId.blockNumber === afterLog.blockNumber) {
          expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
          if (logId.txIndex === afterLog.txIndex) {
            expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
          }
        }
      }
    });

    it('contractAddress filter param is respected', async () => {
      // Get a random contract address from the logs
      const targetBlockIndex = Math.floor(Math.random() * numBlocks);
      const targetTxIndex = Math.floor(Math.random() * txsPerBlock);
      const targetFunctionLogIndex = Math.floor(Math.random() * numPublicFunctionCalls);
      const targetLogIndex = Math.floor(Math.random() * numUnencryptedLogs);
      const targetContractAddress = UnencryptedL2Log.fromBuffer(
        blocks[targetBlockIndex].newUnencryptedLogs!.txLogs[targetTxIndex].functionLogs[targetFunctionLogIndex].logs[
          targetLogIndex
        ],
      ).contractAddress;

      const extendedLogs = await archiverStore.getUnencryptedLogs({ contractAddress: targetContractAddress });

      for (const extendedLog of extendedLogs) {
        expect(extendedLog.log.contractAddress.equals(targetContractAddress)).toBeTruthy();
      }
    });

    it('selector filter param is respected', async () => {
      // Get a random selector from the logs
      const targetBlockIndex = Math.floor(Math.random() * numBlocks);
      const targetTxIndex = Math.floor(Math.random() * txsPerBlock);
      const targetFunctionLogIndex = Math.floor(Math.random() * numPublicFunctionCalls);
      const targetLogIndex = Math.floor(Math.random() * numUnencryptedLogs);
      const targetSelector = UnencryptedL2Log.fromBuffer(
        blocks[targetBlockIndex].newUnencryptedLogs!.txLogs[targetTxIndex].functionLogs[targetFunctionLogIndex].logs[
          targetLogIndex
        ],
      ).selector;

      const extendedLogs = await archiverStore.getUnencryptedLogs({ selector: targetSelector });

      for (const extendedLog of extendedLogs) {
        expect(extendedLog.log.selector.equals(targetSelector)).toBeTruthy();
      }
    });
  });
});
