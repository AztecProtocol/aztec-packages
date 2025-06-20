import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContractsProvider } from '@aztec/protocol-contracts';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { type CircuitSimulator, WASMSimulator } from '@aztec/simulator/client';
import { randomInBlock } from '@aztec/stdlib/block';
import type { AztecNode, PXE, PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import { mockTx } from '@aztec/stdlib/testing';
import { TxEffect } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { PXEServiceConfig } from '../config/index.js';
import { PXEService } from '../pxe_service/pxe_service.js';
import { pxeTestSuite } from './pxe_test_suite.js';

async function createPXEService(): Promise<PXE> {
  const kvStore = await openTmpStore('test');
  const node = mock<AztecNode>();
  const simulator = new WASMSimulator();
  const kernelProver = new BBWASMBundlePrivateKernelProver(simulator);
  const protocolContractsProvider = new BundledProtocolContractsProvider();
  const config: PXEServiceConfig = {
    l2BlockBatchSize: 200,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    l1Contracts: { rollupAddress: EthAddress.random() },
    l1ChainId: 31337,
    rollupVersion: 1,
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

  return await PXEService.create(node, kvStore, kernelProver, simulator, protocolContractsProvider, config);
}

pxeTestSuite('PXEService', createPXEService);

describe('PXEService', () => {
  let kvStore: AztecAsyncKVStore;
  let node: MockProxy<AztecNode>;
  let simulator: CircuitSimulator;
  let kernelProver: PrivateKernelProver;
  let config: PXEServiceConfig;
  let protocolContractsProvider: ProtocolContractsProvider;

  beforeEach(async () => {
    kvStore = await openTmpStore('test');
    node = mock<AztecNode>();
    simulator = new WASMSimulator();
    kernelProver = new BBWASMBundlePrivateKernelProver(simulator);
    protocolContractsProvider = new BundledProtocolContractsProvider();

    config = {
      l2BlockBatchSize: 200,
      proverEnabled: false,
      dataDirectory: undefined,
      dataStoreMapSizeKB: 1024 * 1024,
      l1Contracts: { rollupAddress: EthAddress.random() },
      rollupVersion: 1,
      l1ChainId: 31337,
    };
  });

  it('throws when submitting a tx with a nullifier of already settled tx', async () => {
    const settledTx = await TxEffect.random();
    const duplicateTx = await mockTx();

    node.getTxEffect.mockResolvedValue({
      ...randomInBlock(settledTx),
      txIndexInBlock: 0,
    });

    const pxe = await PXEService.create(node, kvStore, kernelProver, simulator, protocolContractsProvider, config);
    await expect(pxe.sendTx(duplicateTx)).rejects.toThrow(/A settled tx with equal hash/);
  });
});
