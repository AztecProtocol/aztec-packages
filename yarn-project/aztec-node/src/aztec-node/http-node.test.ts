import { L2Block } from '@aztec/types';
import { HttpNode } from './http-node.js';
import { jest } from '@jest/globals';

jest.spyOn(global, 'fetch');

const URL = 'http://aztec-node-url.com/';

const setFetchMock = (response: any): void => {
  // @ts-ignore
  global.fetch.mockResolvedValue({
    ok: true,
    json: () => response,
  });
};

describe('HttpNode', () => {
  let httpNode: HttpNode;

  beforeEach(() => {
    httpNode = new HttpNode(URL);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isReady', () => {
    it.each([true, false])('should return %s when the node is ready', async () => {
      const response = { isReady: true };
      setFetchMock(response);

      const result = await httpNode.isReady();

      expect(fetch).toHaveBeenCalledWith(URL);
      expect(result).toBe(true);
    });
  });

  describe('getBlocks', () => {
    it('should fetch and parse blocks', async () => {
      const block1 = L2Block.random(1);
      const block2 = L2Block.random(2);
      const response = {
        blocks: [block1.encode(), block2.encode()],
      };
      setFetchMock(response);

      const result = await httpNode.getBlocks(0, 3);

      expect(fetch).toHaveBeenCalledWith(`${URL}get-blocks?from=0&take=3`);
      expect(result).toEqual([block1, block2]);
    });

    it('should return an empty array if blocks are not available', async () => {
      const response = { blocks: [] };
      setFetchMock(response);

      const result = await httpNode.getBlocks(0, 2);

      expect(fetch).toHaveBeenCalledWith(`${URL}get-blocks?from=0&take=2`);
      expect(result).toEqual([]);
    });
  });
});
