import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { omit } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import {
  randomContractArtifact,
  randomContractInstanceWithAddress,
  randomDeployedContract,
} from '@aztec/stdlib/testing';

import { mock } from 'jest-mock-extended';

import type { PXEConfig } from './config/index.js';
import { PXE } from './pxe.js';

describe('PXE', () => {
  let pxe: PXE;

  beforeAll(async () => {
    const kvStore = await openTmpStore('test');
    const node = mock<AztecNode>();
    const simulator = new WASMSimulator();
    const kernelProver = new BBWASMBundlePrivateKernelProver(simulator);
    const protocolContractsProvider = new BundledProtocolContractsProvider();
    const config: PXEConfig = {
      l2BlockBatchSize: 50,
      dataDirectory: undefined,
      dataStoreMapSizeKB: 1024 * 1024,
      l1Contracts: { rollupAddress: EthAddress.random() },
      l1ChainId: 31337,
      rollupVersion: 1,
    };

    // Mock getNodeInfo which is called during PXE creation
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

    pxe = await PXE.create(node, kvStore, kernelProver, simulator, protocolContractsProvider, config);
  }, 120_000);

  it('registers an account and returns it as an account only and not as a recipient', async () => {
    const randomSecretKey = Fr.random();
    const randomPartialAddress = Fr.random();
    const completeAddress = await pxe.registerAccount(randomSecretKey, randomPartialAddress);

    // Check that the account is correctly registered using the getAccounts and getRecipients methods
    const accounts = await pxe.getRegisteredAccounts();
    expect(accounts).toContainEqual(completeAddress);
  });

  it('does not throw when registering the same account twice (just ignores the second attempt)', async () => {
    const randomSecretKey = Fr.random();
    const randomPartialAddress = Fr.random();

    await pxe.registerAccount(randomSecretKey, randomPartialAddress);
    await pxe.registerAccount(randomSecretKey, randomPartialAddress);
  });

  it('successfully adds a contract', async () => {
    const contracts = await Promise.all([randomDeployedContract(), randomDeployedContract()]);
    for (const contract of contracts) {
      await pxe.registerContract(contract);
    }

    const expectedContractAddresses = contracts.map(contract => contract.instance.address);
    const contractAddresses = await pxe.getContracts();
    expect(contractAddresses).toEqual(expect.arrayContaining(expectedContractAddresses));
  });

  it('registers a class and adds a contract for it', async () => {
    const artifact = randomContractArtifact();
    const contractClass = await getContractClassFromArtifact(artifact);
    const contractClassId = contractClass.id;
    const instance = await randomContractInstanceWithAddress({ contractClassId });

    await pxe.registerContractClass(artifact);
    expect((await pxe.getContractClassMetadata(contractClassId)).contractClass).toMatchObject(
      omit(contractClass, 'privateFunctionsRoot', 'publicBytecodeCommitment'),
    );

    await pxe.registerContract({ instance });
    expect((await pxe.getContractMetadata(instance.address)).contractInstance).toEqual(instance);
  });

  it('refuses to register a class with a mismatched address', async () => {
    const artifact = randomContractArtifact();
    const contractClass = await getContractClassFromArtifact(artifact);
    const contractClassId = contractClass.id;
    const instance = await randomContractInstanceWithAddress({ contractClassId });
    await expect(
      pxe.registerContract({
        instance: {
          ...instance,
          address: await AztecAddress.random(),
        },
        artifact,
      }),
    ).rejects.toThrow(/Added a contract in which the address does not match the contract instance./);
  });

  it('refuses to register a contract with a class that has not been registered', async () => {
    const instance = await randomContractInstanceWithAddress();
    await expect(pxe.registerContract({ instance })).rejects.toThrow(/Artifact not found when registering an instance/);
  });

  it('refuses to register a contract with an artifact with mismatching class id', async () => {
    const artifact = randomContractArtifact();
    const instance = await randomContractInstanceWithAddress();
    await expect(pxe.registerContract({ instance, artifact })).rejects.toThrow(/Artifact does not match/i);
  });

  // Note: Not testing a successful run of `proveTx`, `sendTx`, `getTxReceipt` and `simulateUtility` here as it
  //       requires a larger setup and it's sufficiently tested in the e2e tests.
});
