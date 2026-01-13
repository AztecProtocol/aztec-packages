import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { omit } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GENESIS_CHECKPOINT_HEADER_HASH, L2BlockHash } from '@aztec/stdlib/block';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { SiloedTag } from '@aztec/stdlib/logs';
import {
  randomContractArtifact,
  randomContractInstanceWithAddress,
  randomDeployedContract,
} from '@aztec/stdlib/testing';
import { BlockHeader, GlobalVariables, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { PXEConfig } from './config/index.js';
import { PXE, type PackedPrivateEvent } from './pxe.js';
import { PrivateEventStore } from './storage/private_event_store/private_event_store.js';

describe('PXE', () => {
  let pxe: PXE;
  let kvStore: AztecLMDBStoreV2;
  let node: MockProxy<AztecNode>;

  beforeAll(async () => {
    kvStore = await openTmpStore('test');
    node = mock<AztecNode>();
    const simulator = new WASMSimulator();
    const kernelProver = new BBBundlePrivateKernelProver(simulator);
    const protocolContractsProvider = new BundledProtocolContractsProvider();
    const config: PXEConfig = {
      l2BlockBatchSize: 50,
      dataDirectory: undefined,
      dataStoreMapSizeKb: 1024 * 1024,
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

  // These tests are meant to quickly exercise PXE as a
  // frontier API so we don't need to rely on slower E2E
  // tests (which in turn are more meaningful for acceptance).
  // For finer grained tests check out storage/private_event_store.test.ts
  describe('getPrivateEvents', () => {
    let contractAddress: AztecAddress;
    let eventSelector: EventSelector;
    let lastKnownBlockNumber: BlockNumber;
    let l2BlockHash: L2BlockHash;
    let scope: AztecAddress;
    let privateEventStore: PrivateEventStore;
    let eventIndex = 0;

    beforeEach(async () => {
      // Set up basic state
      lastKnownBlockNumber = BlockNumber(42);
      const globalVariables = GlobalVariables.empty({
        blockNumber: lastKnownBlockNumber,
      });
      const blockHeader = BlockHeader.empty({
        globalVariables,
      });
      node.getBlockHeader.mockResolvedValue(blockHeader);

      // Mock getL2Tips which is needed for syncing tagged logs
      const tipId = {
        block: { number: lastKnownBlockNumber, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        checkpoint: { number: CheckpointNumber(lastKnownBlockNumber), hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      };
      node.getL2Tips.mockResolvedValue({
        proposed: { number: lastKnownBlockNumber, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        checkpointed: tipId,
        proven: tipId,
        finalized: tipId,
      });

      // This is read when PXE tries to resolve the
      // class id of a contract instance
      node.getPublicStorageAt.mockResolvedValue(Fr.ZERO);

      // Used to sync private logs from the node - the return array needs to have the same length as the number of tags
      // on the input.
      node.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => Promise.resolve(tags.map(() => [])));

      // Necessary to sync contract private state
      await pxe.registerContractClass(TestContractArtifact);
      const contractClass = await getContractClassFromArtifact(TestContractArtifact);
      const contractClassId = contractClass.id;
      const contractInstance = await randomContractInstanceWithAddress({ contractClassId });
      await pxe.registerContract({
        instance: contractInstance,
      });

      contractAddress = contractInstance.address;
      eventSelector = EventSelector.random();
      l2BlockHash = L2BlockHash.random();

      scope = await AztecAddress.random();

      privateEventStore = new PrivateEventStore(kvStore);
    });

    async function storeEvent(blockNumber?: number): Promise<PackedPrivateEvent> {
      const event = {
        packedEvent: [Fr.random(), Fr.random()],
        l2BlockNumber: BlockNumber(blockNumber ?? lastKnownBlockNumber),
        l2BlockHash,
        txHash: TxHash.random(),
        eventSelector,
      };

      const randomness = Fr.random();

      await privateEventStore.storePrivateEventLog(eventSelector, randomness, event.packedEvent, eventIndex++, {
        contractAddress,
        scope,
        txHash: event.txHash,
        l2BlockNumber: event.l2BlockNumber,
        l2BlockHash: event.l2BlockHash,
      });

      return event;
    }

    it('returns private events', async () => {
      // Store a couple of events to exercise `getPrivateEvents`
      const event1 = await storeEvent();
      const event2 = await storeEvent();

      const events = await pxe.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: lastKnownBlockNumber,
        scopes: [scope],
      });

      expect(events).toEqual([event1, event2]);
    });

    it('returns no events', async () => {
      const events = await pxe.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: lastKnownBlockNumber,
        scopes: [scope],
      });

      expect(events).toEqual([]);
    });

    describe('filtering', () => {
      let eventsInPastBlocks: PackedPrivateEvent[];
      let eventsInLatestKnownBlock: PackedPrivateEvent[];
      let _eventsInNotYetSyncedBlocks: PackedPrivateEvent[];

      beforeEach(async () => {
        eventsInPastBlocks = await Promise.all([
          storeEvent(lastKnownBlockNumber - 1),
          storeEvent(lastKnownBlockNumber - 1),
        ]);

        eventsInLatestKnownBlock = await Promise.all([
          storeEvent(lastKnownBlockNumber),
          storeEvent(lastKnownBlockNumber),
        ]);

        _eventsInNotYetSyncedBlocks = await Promise.all([
          storeEvent(lastKnownBlockNumber + 1),
          storeEvent(lastKnownBlockNumber + 1),
        ]);
      });

      it('filters by txHash', async () => {
        const events = await pxe.getPrivateEvents(eventSelector, {
          contractAddress,
          scopes: [scope],
          txHash: eventsInLatestKnownBlock[1].txHash,
        });

        expect(events).toEqual([eventsInLatestKnownBlock[1]]);
      });

      it('filters by block', async () => {
        const events = await pxe.getPrivateEvents(eventSelector, {
          contractAddress,
          scopes: [scope],
          fromBlock: BlockNumber(lastKnownBlockNumber - 1),
          toBlock: lastKnownBlockNumber,
        });

        expect(events).toEqual([...eventsInPastBlocks]);
      });
    });
  });
  // Note: Not testing a successful run of `proveTx`, `sendTx`, `getTxReceipt` and `simulateUtility` here as it
  //       requires a larger setup and it's sufficiently tested in the e2e tests.
});
