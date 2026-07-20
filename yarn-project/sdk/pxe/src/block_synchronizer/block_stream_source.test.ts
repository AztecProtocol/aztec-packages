import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash, L2Block } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { blockStreamSourceFromAztecNode } from './block_stream_source.js';

describe('blockStreamSourceFromAztecNode', () => {
  let node: MockProxy<AztecNode>;
  let source: ReturnType<typeof blockStreamSourceFromAztecNode>;

  const buildResponse = async (block: L2Block) => ({
    header: block.header,
    archive: block.archive,
    hash: await block.hash(),
    checkpointNumber: block.checkpointNumber,
    indexWithinCheckpoint: block.indexWithinCheckpoint,
    number: block.number,
  });

  beforeEach(() => {
    node = mock<AztecNode>();
    source = blockStreamSourceFromAztecNode(node);
  });

  describe('getBlockData', () => {
    it('forwards a number query as a {number} parameter', async () => {
      const block = await L2Block.random(BlockNumber(7));
      node.getBlock.mockResolvedValue((await buildResponse(block)) as any);

      const result = await source.getBlockData({ number: BlockNumber(7) });

      expect(node.getBlock).toHaveBeenCalledWith({ number: BlockNumber(7) });
      expect(result?.header.equals(block.header)).toBe(true);
    });

    it('forwards a hash query as a {hash} parameter', async () => {
      const block = await L2Block.random(BlockNumber(2));
      const hash = await block.hash();
      node.getBlock.mockResolvedValue((await buildResponse(block)) as any);

      const result = await source.getBlockData({ hash });

      expect(node.getBlock).toHaveBeenCalledWith({ hash });
      expect(result?.blockHash.equals(hash)).toBe(true);
    });

    it('forwards an archive query as an {archive} parameter', async () => {
      const block = await L2Block.random(BlockNumber(3));
      const archive = Fr.random();
      node.getBlock.mockResolvedValue((await buildResponse(block)) as any);

      const result = await source.getBlockData({ archive });

      expect(node.getBlock).toHaveBeenCalledWith({ archive });
      expect(result?.header.equals(block.header)).toBe(true);
    });

    it('forwards a tag query as a {tag} parameter', async () => {
      const block = await L2Block.random(BlockNumber(9));
      node.getBlock.mockResolvedValue((await buildResponse(block)) as any);

      const result = await source.getBlockData({ tag: 'proven' });

      expect(node.getBlock).toHaveBeenCalledWith({ tag: 'proven' });
      expect(result?.header.equals(block.header)).toBe(true);
    });

    it('returns undefined when node returns undefined', async () => {
      node.getBlock.mockResolvedValue(undefined);
      const result = await source.getBlockData({ hash: BlockHash.random() });
      expect(result).toBeUndefined();
    });
  });

  describe('getBlocks', () => {
    it('throws on epoch query', async () => {
      await expect(source.getBlocks({ epoch: EpochNumber(1), onlyCheckpointed: true })).rejects.toThrow(
        /epoch query not supported/,
      );
    });
  });
});
