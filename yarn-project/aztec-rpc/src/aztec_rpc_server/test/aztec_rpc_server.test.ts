import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { TestKeyStore } from '@aztec/key-store';
import { AztecNode, AztecRPC, L2Tx, mockTx } from '@aztec/types';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { Database } from '../../database/index.js';
import { MemoryDB } from '../../database/memory_db.js';
import { EthAddress, RpcServerConfig } from '../../index.js';
import { AztecRPCServer } from '../aztec_rpc_server.js';
import { aztecRpcTestSuite } from './aztec_rpc_test_suite.js';

/**
 * Generic mock implementation.
 */
type Mockify<T> = {
  [P in keyof T]: jest.Mock;
};

async function createAztecRpcServer(): Promise<AztecRPC> {
  const keyStore = new TestKeyStore(await Grumpkin.new());
  const node = mock<AztecNode>();
  const db = new MemoryDB();
  const config: RpcServerConfig = {
    l2BlockPollingIntervalMS: 100,
  };

  // Setup the relevant mocks
  node.getBlockNumber.mockResolvedValue(2);
  node.getVersion.mockResolvedValue(1);
  node.getChainId.mockResolvedValue(1);
  node.getRollupAddress.mockResolvedValue(EthAddress.random());

  return new AztecRPCServer(keyStore, node, db, config);
}

aztecRpcTestSuite('AztecRPCServer', createAztecRpcServer);

describe('AztecRPCServer', () => {
  it('throws when submitting a tx with a nullifier of already settled tx', async () => {
    const settledTx = L2Tx.random();
    const duplicateTx = mockTx();

    const keyStore = new TestKeyStore(await Grumpkin.new());
    const node: Mockify<AztecNode> = {
      sendTx: jest.fn(),
      isReady: jest.fn(),
      getBlock: jest.fn(),
      getBlocks: jest.fn(),
      getBlockNumber: jest.fn(),
      getVersion: jest.fn(),
      getChainId: jest.fn(),
      getRollupAddress: jest.fn(),
      getExtendedContractData: jest.fn(),
      getContractData: jest.fn(),
      getLogs: jest.fn(),
      getTx: jest.fn().mockImplementation(() => Promise.resolve(settledTx)),
      getPendingTxs: jest.fn(),
      getPendingTxByHash: jest.fn(),
      getPublicStorageAt: jest.fn(),
      getTreeRoots: jest.fn(),
      getHistoricBlockData: jest.fn(),
      findCommitmentIndex: jest.fn(),
      getDataTreePath: jest.fn(),
      getL1ToL2MessageAndIndex: jest.fn(),
      getL1ToL2MessagesTreePath: jest.fn(),
      findContractIndex: jest.fn(),
      getContractPath: jest.fn(),
    } as any;
    const db: Mockify<Database> = {
      getNoteSpendingInfo: jest.fn(),
      addNoteSpendingInfo: jest.fn(),
      addNoteSpendingInfoBatch: jest.fn(),
      removeNullifiedNoteSpendingInfo: jest.fn(),
      getTreeRoots: jest.fn(),
      setTreeRoots: jest.fn(),
      getHistoricBlockData: jest.fn(),
      setHistoricBlockData: jest.fn(),
      addCompleteAddress: jest.fn(),
      getCompleteAddress: jest.fn(),
      getCompleteAddresses: jest.fn(),
      addContract: jest.fn(),
      getContract: jest.fn(),
      getContracts: jest.fn(),
    };
    const config: RpcServerConfig = {
      l2BlockPollingIntervalMS: 100,
    };

    const rpc = new AztecRPCServer(keyStore, node as AztecNode, db as Database, config);
    await expect(rpc.sendTx(duplicateTx)).rejects.toThrowError(/A settled tx with equal hash/);
  });
});
