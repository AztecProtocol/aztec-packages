import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/wasm/bundle';
import {
  type AztecNode,
  type PXE,
  type PrivateKernelProver,
  TxEffect,
  mockTx,
  randomInBlock,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { type L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { L2TipsStore } from '@aztec/kv-store/stores';
import { type SimulationProvider, WASMSimulator } from '@aztec/simulator/client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { KVPxeDatabase } from '../../database/kv_pxe_database.js';
import { type PxeDatabase } from '../../database/pxe_database.js';
import { type PXEServiceConfig } from '../../index.js';
import { PXEService } from '../pxe_service.js';
import { pxeTestSuite } from './pxe_test_suite.js';

async function createPXEService(): Promise<PXE> {
  const kvStore = openTmpStore();
  const keyStore = new KeyStore(kvStore);
  const node = mock<AztecNode>();
  const db = await KVPxeDatabase.create(kvStore);
  const simulationProvider = new WASMSimulator();
  const kernelProver = new BBWASMBundlePrivateKernelProver(simulationProvider);
  const tips = new L2TipsStore(kvStore, 'pxe');
  const config: PXEServiceConfig = {
    l2StartingBlock: INITIAL_L2_BLOCK_NUM,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    l1Contracts: { rollupAddress: EthAddress.random() },
  };

  // Setup the relevant mocks
  node.getBlockNumber.mockResolvedValue(2);
  node.getVersion.mockResolvedValue(1);
  node.getChainId.mockResolvedValue(1);
  const mockedContracts: L1ContractAddresses = {
    rollupAddress: EthAddress.random(),
    registryAddress: EthAddress.random(),
    inboxAddress: EthAddress.random(),
    outboxAddress: EthAddress.random(),
    feeJuiceAddress: EthAddress.random(),
    stakingAssetAddress: EthAddress.random(),
    feeJuicePortalAddress: EthAddress.random(),
    governanceAddress: EthAddress.random(),
    coinIssuerAddress: EthAddress.random(),
    rewardDistributorAddress: EthAddress.random(),
    governanceProposerAddress: EthAddress.random(),
    slashFactoryAddress: EthAddress.random(),
  };
  node.getL1ContractAddresses.mockResolvedValue(mockedContracts);

  return Promise.resolve(new PXEService(keyStore, node, db, tips, kernelProver, simulationProvider, config));
}

pxeTestSuite('PXEService', createPXEService);

describe('PXEService', () => {
  let keyStore: KeyStore;
  let node: MockProxy<AztecNode>;
  let db: PxeDatabase;
  let simulationProvider: SimulationProvider;
  let kernelProver: PrivateKernelProver;
  let config: PXEServiceConfig;
  let tips: L2TipsStore;

  beforeEach(async () => {
    const kvStore = openTmpStore();
    keyStore = new KeyStore(kvStore);
    node = mock<AztecNode>();
    tips = new L2TipsStore(kvStore, 'pxe');
    db = await KVPxeDatabase.create(kvStore);
    simulationProvider = new WASMSimulator();
    kernelProver = new BBWASMBundlePrivateKernelProver(simulationProvider);

    config = {
      l2StartingBlock: INITIAL_L2_BLOCK_NUM,
      proverEnabled: false,
      dataDirectory: undefined,
      dataStoreMapSizeKB: 1024 * 1024,
      l1Contracts: { rollupAddress: EthAddress.random() },
    };
  });

  it('throws when submitting a tx with a nullifier of already settled tx', async () => {
    const settledTx = TxEffect.random();
    const duplicateTx = mockTx();

    node.getTxEffect.mockResolvedValue(randomInBlock(settledTx));

    const pxe = new PXEService(keyStore, node, db, tips, kernelProver, simulationProvider, config);
    await expect(pxe.sendTx(duplicateTx)).rejects.toThrow(/A settled tx with equal hash/);
  });
});
