import { ContractData, ContractPublicData, L2Block, L2BlockL2Logs, Tx, TxHash, TxL2Logs } from '@aztec/types';
import { HttpNode, txToJson } from './http-node.js';
import { jest } from '@jest/globals';
import { AztecAddress, CircuitsWasm, KERNEL_PUBLIC_CALL_STACK_LENGTH, Proof } from '@aztec/circuits.js';
import { makeKernelPublicInputs, makePublicCallRequest } from '@aztec/circuits.js/factories';
import times from 'lodash.times';
import { randomBytes } from '@aztec/foundation/crypto';
import { Pedersen, SiblingPath } from '@aztec/merkle-tree';

jest.spyOn(global, 'fetch');

const URL = 'http://aztec-node-url.com/';

const setFetchMock = (response: any): void => {
  // @ts-ignore
  global.fetch.mockResolvedValue({
    ok: true,
    json: () => response,
  });
};

// Copied from yarn-project/p2p/src/client/mocks.ts. Do we want to move this to a shared location?
export const MockTx = () => {
  return Tx.createTx(
    makeKernelPublicInputs(),
    new Proof(Buffer.alloc(0)),
    TxL2Logs.random(8, 3), // 8 priv function invocations creating 3 encrypted logs each
    TxL2Logs.random(11, 2), // 8 priv + 3 pub function invocations creating 2 unencrypted logs each
    [],
    times(KERNEL_PUBLIC_CALL_STACK_LENGTH, makePublicCallRequest),
  );
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

  describe('getLogs', () => {
    it.each(['encrypted', 'unencrypted'])('should fetch and return %s logs', async logType => {
      const from = 0;
      const take = 3;
      const log1 = L2BlockL2Logs.random(2, 3, 4);
      const log2 = L2BlockL2Logs.random(1, 5, 2);
      const response = {
        logs: [log1.toBuffer(), log2.toBuffer()],
      };
      setFetchMock(response);

      const result = await httpNode.getLogs(from, take, logType as 'encrypted' | 'unencrypted');

      expect(fetch).toHaveBeenCalledWith(`${URL}get-logs?from=${from}&take=${take}&logType=${logType}`);
      expect(result).toEqual([log1, log2]);
    });

    it.each(['encrypted', 'unencrypted'])(
      'should return an empty array if %s logs are not available',
      async logType => {
        const from = 0;
        const take = 2;
        const response = {};
        setFetchMock(response);

        const result = await httpNode.getLogs(from, take, logType as 'encrypted' | 'unencrypted');

        expect(fetch).toHaveBeenCalledWith(`${URL}get-logs?from=${from}&take=${take}&logType=${logType}`);
        expect(result).toEqual([]);
      },
    );
  });

  describe('getContractInfo', () => {
    it('should fetch and return contract data', async () => {
      const contractInfo = ContractData.random();
      const response = {
        contractInfo: contractInfo.toBuffer(),
      };
      setFetchMock(response);

      const result = await httpNode.getContractInfo(contractInfo.contractAddress);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-info?address=${contractInfo.contractAddress.toString()}`);
      expect(result).toEqual(contractInfo);
    });

    it('should return undefined if contract data is not available', async () => {
      const response = {
        contractInfo: undefined,
      };
      setFetchMock(response);

      const randomAddress = AztecAddress.random();

      const result = await httpNode.getContractInfo(randomAddress);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-info?address=${randomAddress.toString()}`);
      expect(result).toBeUndefined();
    });
  });

  describe('sendTx', () => {
    it('should submit a transaction to the p2p pool', async () => {
      const tx = MockTx();
      const irrelevantResponse = {};
      setFetchMock(irrelevantResponse);

      await httpNode.sendTx(tx);

      const json = txToJson(tx);
      const init: RequestInit = {
        method: 'POST',
        body: JSON.stringify(json),
      };
      // @ts-ignore
      const call = fetch.mock.calls[0];
      expect(call[0].href).toBe(`${URL}tx`);
      expect(call[1]).toStrictEqual(init);
    });
  });

  describe('getPendingTxByHash', () => {
    it('should fetch and return a pending tx', async () => {
      const txHash = new TxHash(randomBytes(TxHash.SIZE));
      const tx = MockTx();
      const response = txToJson(tx);
      setFetchMock(response);

      const result = await httpNode.getPendingTxByHash(txHash);

      expect(fetch).toHaveBeenCalledWith(`${URL}get-pending-tx?hash=${txHash}`);
      expect(result).toEqual(tx);
    });

    it('should return undefined if the pending tx does not exist', async () => {
      const txHash = new TxHash(randomBytes(TxHash.SIZE));
      const response = undefined;
      setFetchMock(response);

      const result = await httpNode.getPendingTxByHash(txHash);

      expect(fetch).toHaveBeenCalledWith(`${URL}get-pending-tx?hash=${txHash}`);
      expect(result).toBeUndefined();
    });
  });

  describe('findContractIndex', () => {
    it('should fetch and return the index of the given contract', async () => {
      const leafValue = Buffer.from('abc123', 'hex');
      const index = '123456';
      const response = { index };
      setFetchMock(response);

      const result = await httpNode.findContractIndex(leafValue);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-index?leaf=${leafValue.toString('hex')}`);
      expect(result).toBe(BigInt(index));
    });

    it('should return undefined if the contract index is not found', async () => {
      const leafValue = Buffer.from('def456', 'hex');
      const response = {};
      setFetchMock(response);

      const result = await httpNode.findContractIndex(leafValue);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-index?leaf=${leafValue.toString('hex')}`);
      expect(result).toBeUndefined();
    });
  });

  describe('getContractPath', () => {
    it('should fetch and return the sibling path for the given leaf index', async () => {
      const leafIndex = BigInt(123456);
      const siblingPath = SiblingPath.ZERO(3, Buffer.alloc(32), new Pedersen(await CircuitsWasm.get()));
      const response = { path: siblingPath.toBuffer().toString('hex') };
      setFetchMock(response);

      const result = await httpNode.getContractPath(leafIndex);

      expect(fetch).toHaveBeenCalledWith(`${URL}contract-path?leaf=${leafIndex.toString()}`);
      expect(result).toEqual(siblingPath);
    });
  });
});
