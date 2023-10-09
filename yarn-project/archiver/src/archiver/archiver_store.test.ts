import { INITIAL_L2_BLOCK_NUM, L2Block, L2BlockL2Logs, LogId, LogType, TxHash } from '@aztec/types';

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
    // Offset indices by INTIAL_L2_BLOCK_NUM to ensure we are correctly aligned
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
});
