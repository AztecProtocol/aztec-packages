import { ContractPublicData, L2Block } from '@aztec/types';
import { HttpNode } from './http-node.js';
import { jest } from '@jest/globals';
import { AztecAddress } from '@aztec/circuits.js';

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

  describe('getBlockHeight', () => {
    it('should fetch and return the block height', async () => {
      const response = { blockHeight: 100 };
      setFetchMock(response);

      const result = await httpNode.getBlockHeight();

      expect(fetch).toHaveBeenCalledWith(`${URL}get-block-height`);
      expect(result).toBe(100);
    });
  });

  describe('getVersion', () => {
    it('should fetch and return the version', async () => {
      const response = { version: 5 };
      setFetchMock(response);

      const result = await httpNode.getVersion();

      expect(fetch).toHaveBeenCalledWith(`${URL}get-version`);
      expect(result).toBe(5);
    });
  });

  describe('getChainId', () => {
    it('should fetch and return the chain ID', async () => {
      const response = { chainId: 1234 };
      setFetchMock(response);

      const result = await httpNode.getChainId();

      expect(fetch).toHaveBeenCalledWith(`${URL}get-chain-id`);
      expect(result).toBe(1234);
    });
  });

  describe('getContractData', () => {
    it('should fetch and return contract public data', async () => {
      const contractData = ContractPublicData.random();
      const response = {
        contractData: contractData.toBuffer(),
      };

      setFetchMock(response);

      const result = await httpNode.getContractData(contractData.contractData.contractAddress);

      expect(fetch).toHaveBeenCalledWith(
        `${URL}contract-data?address=${contractData.contractData.contractAddress.toString()}`,
      );
      expect(result).toEqual(contractData);
    });

    it('should return undefined if contract data is not available', async () => {
      const response = {
        contractData: undefined,
      };
      setFetchMock(response);

      const randomAddress = AztecAddress.random();

      const result = await httpNode.getContractData(randomAddress);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-data?address=${randomAddress.toString()}`);
      expect(result).toEqual(undefined);
    });
  });
});
