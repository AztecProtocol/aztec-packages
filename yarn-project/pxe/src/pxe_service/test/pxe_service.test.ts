import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/wasm/bundle';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsStore } from '@aztec/kv-store/stores';
import type { ProtocolContractsProvider } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { type SimulationProvider, WASMSimulator } from '@aztec/simulator/client';
import { randomInBlock } from '@aztec/stdlib/block';
import type { AztecNode, PXE, PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import { mockTx } from '@aztec/stdlib/testing';
import { TxEffect } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { PxeDatabase } from '../../database/interfaces/pxe_database.js';
import { KVPxeDatabase } from '../../database/kv_pxe_database.js';
import type { PXEServiceConfig } from '../../index.js';
import { PXEService } from '../pxe_service.js';
import { pxeTestSuite } from './pxe_test_suite.js';

async function createPXEService(): Promise<PXE> {
  const kvStore = await openTmpStore('test');
  const keyStore = new KeyStore(kvStore);
  const node = mock<AztecNode>();
  const db = await KVPxeDatabase.create(kvStore);
  const simulationProvider = new WASMSimulator();
  const kernelProver = new BBWASMBundlePrivateKernelProver(simulationProvider);
  const tips = new L2TipsStore(kvStore, 'pxe');
  const protocolContractsProvider = new BundledProtocolContractsProvider();
  const config: PXEServiceConfig = {
    l2StartingBlock: INITIAL_L2_BLOCK_NUM,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    l1Contracts: { rollupAddress: EthAddress.random() },
    l1ChainId: 31337,
    version: 1,
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

  return Promise.resolve(
    new PXEService(keyStore, node, db, tips, kernelProver, simulationProvider, protocolContractsProvider, config),
  );
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
  let protocolContractsProvider: ProtocolContractsProvider;

  beforeEach(async () => {
    const kvStore = await openTmpStore('test');
    keyStore = new KeyStore(kvStore);
    node = mock<AztecNode>();
    tips = new L2TipsStore(kvStore, 'pxe');
    db = await KVPxeDatabase.create(kvStore);
    simulationProvider = new WASMSimulator();
    kernelProver = new BBWASMBundlePrivateKernelProver(simulationProvider);
    protocolContractsProvider = new BundledProtocolContractsProvider();

    config = {
      l2StartingBlock: INITIAL_L2_BLOCK_NUM,
      proverEnabled: false,
      dataDirectory: undefined,
      dataStoreMapSizeKB: 1024 * 1024,
      l1Contracts: { rollupAddress: EthAddress.random() },
      version: 1,
      l1ChainId: 31337,
    };
  });

  it('throws when submitting a tx with a nullifier of already settled tx', async () => {
    const settledTx = await TxEffect.random();
    const duplicateTx = await mockTx();

    node.getTxEffect.mockResolvedValue(randomInBlock(settledTx));

    const pxe = new PXEService(
      keyStore,
      node,
      db,
      tips,
      kernelProver,
      simulationProvider,
      protocolContractsProvider,
      config,
    );
    await expect(pxe.sendTx(duplicateTx)).rejects.toThrow(/A settled tx with equal hash/);
  });
});
