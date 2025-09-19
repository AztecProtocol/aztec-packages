import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';

import { mock } from 'jest-mock-extended';

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
    l2BlockBatchSize: 50,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    l1Contracts: { rollupAddress: EthAddress.random() },
    l1ChainId: 31337,
    rollupVersion: 1,
  };

  // Mock getNodeInfo which is called during PXE service creation
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
  node.getNodeInfo.mockResolvedValue({
    nodeVersion: '1.0.0',
    l1ChainId: 31337,
    rollupVersion: 1,
    enr: undefined,
    l1ContractAddresses: mockedContracts,
    protocolContractAddresses: {
      classRegistry: await AztecAddress.random(),
      feeJuice: await AztecAddress.random(),
      instanceRegistry: await AztecAddress.random(),
      multiCallEntrypoint: await AztecAddress.random(),
    },
  });

  return await PXEService.create(node, kvStore, kernelProver, simulator, protocolContractsProvider, config);
}

pxeTestSuite('PXEService', createPXEService);
