import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockData, BlockHash, type BlockQuery, L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { L2LogsSource } from '@aztec/stdlib/interfaces/server';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { NodeLogsProvider } from './node_logs_provider.js';
import { UnseenBlockHoldOff } from './unseen_block_hold_off.js';

const BY_NUMBER_WAIT_MS = 1000;
const BY_HASH_WAIT_MS = 600;

/** Builds minimal block metadata for a given block number and hash, as returned by the block source. */
const makeBlockData = (blockNumber: BlockNumber, blockHash: BlockHash): BlockData => ({
  header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber }) }),
  archive: L2Block.empty().archive,
  blockHash,
  checkpointNumber: CheckpointNumber(1),
  indexWithinCheckpoint: IndexWithinCheckpoint(0),
});

describe('NodeLogsProvider', () => {
  let blockSource: MockProxy<L2BlockSource>;
  let logsSource: MockProxy<L2LogsSource>;
  let provider: NodeLogsProvider;
  /** Tip of the chain the node has seen; raised to `unseenBlockNumber` when the unseen block arrives. */
  let tip: BlockNumber;
  let unseenBlockNumber: BlockNumber;
  let unseenBlockHash: BlockHash;
  let arrivalTimer: NodeJS.Timeout | undefined;

  const hashForBlock = (blockNumber: BlockNumber): BlockHash =>
    blockNumber === unseenBlockNumber ? unseenBlockHash : new BlockHash(new Fr(1_000_000n + BigInt(blockNumber)));

  /** Makes the block the node had not seen available after `delayMs`, as if it had just arrived from the network. */
  const scheduleUnseenBlockArrival = (delayMs = 200) => {
    arrivalTimer = setTimeout(() => {
      tip = unseenBlockNumber;
    }, delayMs);
  };

  afterEach(() => {
    clearTimeout(arrivalTimer);
    arrivalTimer = undefined;
  });

  beforeEach(() => {
    tip = BlockNumber(5);
    unseenBlockNumber = BlockNumber(6);
    unseenBlockHash = BlockHash.random();

    blockSource = mock<L2BlockSource>();
    blockSource.getBlockNumber.mockImplementation((() => Promise.resolve(tip)) as L2BlockSource['getBlockNumber']);
    blockSource.getBlockData.mockImplementation(((query?: BlockQuery) => {
      if (!query || 'tag' in query) {
        return Promise.resolve(makeBlockData(tip, hashForBlock(tip)));
      }
      if ('number' in query) {
        return Promise.resolve(
          query.number <= tip ? makeBlockData(query.number, hashForBlock(query.number)) : undefined,
        );
      }
      if ('hash' in query) {
        return Promise.resolve(
          query.hash.equals(unseenBlockHash) && tip >= unseenBlockNumber
            ? makeBlockData(unseenBlockNumber, unseenBlockHash)
            : undefined,
        );
      }
      return Promise.resolve(undefined);
    }) as L2BlockSource['getBlockData']);

    logsSource = mock<L2LogsSource>();
    provider = new NodeLogsProvider(
      logsSource,
      new UnseenBlockHoldOff(blockSource, { byNumberWaitMs: BY_NUMBER_WAIT_MS, byHashWaitMs: BY_HASH_WAIT_MS }),
    );
  });

  /** Stands in for the logs source's in-transaction anchor check: the reference block must be in the chain. */
  const rejectAnchorUntilArrival = () => {
    const reject = (query: { referenceBlock?: BlockHash }) =>
      query.referenceBlock !== undefined && tip < unseenBlockNumber
        ? Promise.reject(new Error(`Block ${query.referenceBlock.toString()} is not present`))
        : Promise.resolve([[]]);
    logsSource.getPrivateLogsByTags.mockImplementation(reject);
    logsSource.getPublicLogsByTags.mockImplementation(reject);
  };

  it('holds a private logs query whose reference block has not arrived yet', async () => {
    rejectAnchorUntilArrival();
    scheduleUnseenBlockArrival();

    const result = await provider.getPrivateLogsByTags({ tags: [SiloedTag.random()], referenceBlock: unseenBlockHash });

    expect(result).toEqual([[]]);
  });

  it('holds a public logs query whose reference block has not arrived yet', async () => {
    rejectAnchorUntilArrival();
    scheduleUnseenBlockArrival();

    const result = await provider.getPublicLogsByTags({
      contractAddress: await AztecAddress.random(),
      tags: [Tag.random()],
      referenceBlock: unseenBlockHash,
    });

    expect(result).toEqual([[]]);
  });

  it('delegates a query without an anchor without reading the block source', async () => {
    logsSource.getPrivateLogsByTags.mockResolvedValue([[]]);
    const tags = [SiloedTag.random()];

    expect(await provider.getPrivateLogsByTags({ tags })).toEqual([[]]);

    expect(logsSource.getPrivateLogsByTags).toHaveBeenCalledWith({ tags });
    expect(blockSource.getBlockData).not.toHaveBeenCalled();
  });

  describe('anchors that name no hash', () => {
    it('resolves a block number to the concrete hash the logs source checks', async () => {
      logsSource.getPrivateLogsByTags.mockResolvedValue([[]]);
      scheduleUnseenBlockArrival();

      await provider.getPrivateLogsByTags({ tags: [SiloedTag.random()], referenceBlock: unseenBlockNumber });

      expect(logsSource.getPrivateLogsByTags).toHaveBeenCalledWith(
        expect.objectContaining({ referenceBlock: unseenBlockHash }),
      );
    });

    it('resolves a tag to the concrete hash the logs source checks', async () => {
      logsSource.getPrivateLogsByTags.mockResolvedValue([[]]);

      await provider.getPrivateLogsByTags({ tags: [SiloedTag.random()], referenceBlock: 'latest' });

      expect(logsSource.getPrivateLogsByTags).toHaveBeenCalledWith(
        expect.objectContaining({ referenceBlock: hashForBlock(tip) }),
      );
    });

    it('reports a miss itself, since there is no hash to hand the logs source', async () => {
      await expect(
        provider.getPrivateLogsByTags({
          tags: [SiloedTag.random()],
          referenceBlock: BlockNumber(unseenBlockNumber + 1),
        }),
      ).rejects.toThrow(/not found in the node/);

      expect(logsSource.getPrivateLogsByTags).not.toHaveBeenCalled();
    });
  });

  describe('anchors that name a hash', () => {
    it('resolves an anchor named by both number and hash to that hash', async () => {
      logsSource.getPrivateLogsByTags.mockResolvedValue([[]]);
      scheduleUnseenBlockArrival();

      await provider.getPrivateLogsByTags({
        tags: [SiloedTag.random()],
        referenceBlock: { number: unseenBlockNumber, hash: unseenBlockHash },
      });

      // The logs source checks the anchor by hash inside its own transaction, so it is handed the resolved hash.
      expect(logsSource.getPrivateLogsByTags).toHaveBeenCalledWith(
        expect.objectContaining({ referenceBlock: unseenBlockHash }),
      );
    });

    it('hands an unresolved anchor to the logs source as a bare hash', async () => {
      // An anchor the node cannot resolve still carries a hash, and the logs source's in-transaction check is the
      // authoritative one, so it is handed that hash and raises the error it always did.
      logsSource.getPrivateLogsByTags.mockResolvedValue([[]]);
      const hash = BlockHash.random();

      await provider.getPrivateLogsByTags({ tags: [SiloedTag.random()], referenceBlock: { hash } });

      expect(logsSource.getPrivateLogsByTags).toHaveBeenCalledWith(expect.objectContaining({ referenceBlock: hash }));
    });
  });
});
