import { BBBundlePrivateKernelProver } from '@aztec/bb-prover/client/bundle';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { WASMSimulator } from '@aztec/simulator/client';
import {
  STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
  getStandardMultiCallEntrypoint,
} from '@aztec/standard-contracts/multi-call-entrypoint';
import { EventSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  Body,
  GENESIS_BLOCK_HEADER_HASH,
  GENESIS_CHECKPOINT_HEADER_HASH,
} from '@aztec/stdlib/block';
import { emptyChainConfig } from '@aztec/stdlib/config';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import type { AztecNode, BlockResponse } from '@aztec/stdlib/interfaces/client';
import {
  randomContractArtifact,
  randomContractInstanceWithAddress,
  randomDeployedContract,
} from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
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
    const preloadedContractsProvider = { getPreloadedContracts: async () => [await getStandardMultiCallEntrypoint()] };
    const config: PXEConfig = {
      ...emptyChainConfig,
      l2BlockBatchSize: 50,
      dataDirectory: undefined,
      dataStoreMapSizeKb: 1024 * 1024,
      rollupAddress: EthAddress.random(),
      l1ChainId: 31337,
      rollupVersion: 1,
      autoSync: true,
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
      realProofs: true,
    });

    pxe = await PXE.create({
      node,
      store: kvStore,
      proofCreator: kernelProver,
      simulator,
      protocolContractsProvider,
      preloadedContractsProvider,
      config,
    });
  }, 120_000);

  it('registers an account and returns it as an account only and not as a recipient', async () => {
    const randomSecretKey = Fr.random();
    const randomPartialAddress = Fr.random();
    const completeAddress = await pxe.registerAccount(randomSecretKey, randomPartialAddress);

    // Check that the account is correctly registered using the getAccounts and getRecipients methods
    const accounts = await pxe.getRegisteredAccounts();
    expect(accounts).toContainEqual(completeAddress);
  });

  it('refuses to register an invalid address as a sender', async () => {
    // x = 3 is not a valid x-coordinate on the Grumpkin curve (y^2 = x^3 - 17 = 10 has no square root in Fr)
    const invalidAddress = new AztecAddress(new Fr(3));
    await expect(pxe.registerSender(invalidAddress)).rejects.toThrow(/not valid/);
  });

  it('does not throw when registering the same account twice (just ignores the second attempt)', async () => {
    const randomSecretKey = Fr.random();
    const randomPartialAddress = Fr.random();

    await pxe.registerAccount(randomSecretKey, randomPartialAddress);
    await pxe.registerAccount(randomSecretKey, randomPartialAddress);
  });

  it('does not add a keystore account to the sender address book when registered as a sender', async () => {
    const { address } = await pxe.registerAccount(Fr.random(), Fr.random());
    await pxe.registerSender(address);
    const senders = await pxe.getSenders();
    expect(senders.map(s => s.toString())).not.toContain(address.toString());
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

  it('preloads the standard multi-call entrypoint on creation', async () => {
    const { instance: expectedInstance, artifact: expectedArtifact } = await getStandardMultiCallEntrypoint();
    const instance = await pxe.getContractInstance(STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS);
    expect(instance).toEqual(expectedInstance);

    const artifact = await pxe.getContractArtifact(expectedInstance.currentContractClassId);
    expect(artifact).toEqual(expectedArtifact);
  });

  it('registers a class and adds a contract for it', async () => {
    const artifact = randomContractArtifact();
    const contractClass = await getContractClassFromArtifact(artifact);
    const contractClassId = contractClass.id;
    const instance = await randomContractInstanceWithAddress({ contractClassId });

    await pxe.registerContractClass(artifact);
    expect(await pxe.getContractArtifact(contractClassId)).toEqual(artifact);

    await pxe.registerContract({ instance });
    expect(await pxe.getContractInstance(instance.address)).toEqual(instance);
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

  it('does not call registerContractFunctionSignatures for contracts without public functions', async () => {
    const { artifact, instance } = await randomDeployedContract();
    node.registerContractFunctionSignatures.mockClear();

    await pxe.registerContract({ artifact, instance });

    expect(node.registerContractFunctionSignatures).not.toHaveBeenCalled();
  });

  it('calls registerContractFunctionSignatures for contracts with public functions', async () => {
    const artifact = randomContractArtifact();
    artifact.functions = [
      {
        name: 'my_public_fn',
        functionType: FunctionType.PUBLIC,
        isOnlySelf: false,
        isStatic: false,
        isInitializer: false,
        parameters: [],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.from(''),
        debugSymbols: '',
      },
    ];
    const contractClass = await getContractClassFromArtifact(artifact);
    const instance = await randomContractInstanceWithAddress({ contractClassId: contractClass.id });
    node.registerContractFunctionSignatures.mockClear();

    await pxe.registerContract({ artifact, instance });

    expect(node.registerContractFunctionSignatures).toHaveBeenCalledWith(['my_public_fn()']);
  });

  // These tests are meant to quickly exercise PXE as a
  // frontier API so we don't need to rely on slower E2E
  // tests (which in turn are more meaningful for acceptance).
  // For finer grained tests check out storage/private_event_store.test.ts
  describe('getPrivateEvents', () => {
    let contractAddress: AztecAddress;
    let eventSelector: EventSelector;
    let lastKnownBlockNumber: BlockNumber;
    let l2BlockHash: BlockHash;
    let scope: AztecAddress;
    let privateEventStore: PrivateEventStore;

    beforeEach(async () => {
      // Set up basic state
      lastKnownBlockNumber = BlockNumber(42);
      const globalVariables = GlobalVariables.empty({
        blockNumber: lastKnownBlockNumber,
      });
      const blockHeader = BlockHeader.empty({
        globalVariables,
      });
      const blockHash = BlockHash.random();
      const archive = AppendOnlyTreeSnapshot.empty();
      const checkpointNumber = CheckpointNumber.fromBlockNumber(lastKnownBlockNumber);
      const blockResponse: BlockResponse = {
        header: blockHeader,
        archive,
        hash: blockHash,
        checkpointNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint.ZERO,
        number: lastKnownBlockNumber,
      };
      const blockData: BlockData = {
        header: blockHeader,
        archive,
        blockHash,
        checkpointNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint.ZERO,
      };

      // The block synchronizer's real L2BlockStream walks back from the source tip to find the first block where its
      // local L2TipsKVStore agrees with the source. That store was seeded at PXE creation with the genesis header hash
      // (`node.getBlock(0)` was undefined then, so it fell back to `GENESIS_BLOCK_HEADER_HASH`), and the stream computes
      // the source-side genesis hash from `getBlock(0).header.hash()`. We therefore answer block 0 with a header that
      // hashes to that same genesis constant so the walk agrees at genesis; every other height returns the block-42
      // response the events are anchored to.
      const genesisHeader = { hash: () => Promise.resolve(GENESIS_BLOCK_HEADER_HASH) } as unknown as BlockHeader;
      const genesisBlockResponse: BlockResponse = {
        header: genesisHeader,
        archive,
        hash: GENESIS_BLOCK_HEADER_HASH,
        checkpointNumber: CheckpointNumber.ZERO,
        indexWithinCheckpoint: IndexWithinCheckpoint.ZERO,
        number: BlockNumber.ZERO,
      };
      const isBlockZeroQuery = (query: Parameters<AztecNode['getBlock']>[0]) =>
        query === 0 || (typeof query === 'object' && 'number' in query && query.number === 0);
      node.getBlock.mockImplementation((query => {
        return Promise.resolve(isBlockZeroQuery(query) ? genesisBlockResponse : blockResponse);
      }) as AztecNode['getBlock']);
      node.getBlockData.mockResolvedValue(blockData);

      // Mock getChainTips which is needed for syncing tagged logs
      const tipId = {
        block: { number: lastKnownBlockNumber, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        checkpoint: {
          number: CheckpointNumber.fromBlockNumber(lastKnownBlockNumber),
          hash: GENESIS_CHECKPOINT_HEADER_HASH.toString(),
        },
      };
      node.getChainTips.mockResolvedValue({
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
      node.getPrivateLogsByTags.mockImplementation(query => Promise.resolve(query.tags.map(() => [])));

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
      // Events are anchored to the canonical hash the synchronizer records for `lastKnownBlockNumber`. That hash is the
      // block header hash the `blocks-added` handler derives from the block the node serves below, so we use the same
      // value here; otherwise the recorded hash would disqualify these events from `isCanonical`.
      l2BlockHash = await blockHeader.hash();

      // Canonicality is established the same way it is in production, by driving the real L2BlockStream to completion.
      // Once genesis agrees (see the getBlock mock above) the stream ingests `lastKnownBlockNumber` as a `blocks-added`
      // event, which the block synchronizer adopts as the anchor header. It then emits `chain-finalized` (the node
      // reports a finalized tip there while the local store is still at genesis). So events at that block read back as
      // canonical, and events in later, not-yet-synced blocks stay above the anchor height and are filtered out.
      //
      // getBlocks must yield a body-bearing response so the stream source can build a real L2Block; getCheckpoints has
      // nothing to serve (the single block is uncheckpointed here) and returns empty.
      node.getBlocks.mockResolvedValue([{ ...blockResponse, body: Body.empty() }]);
      node.getCheckpoints.mockResolvedValue([]);

      scope = await AztecAddress.random();

      privateEventStore = new PrivateEventStore(kvStore, { isCanonical: () => true });
    });

    let eventCounter = 0;

    async function storeEvent(blockNumber?: number): Promise<PackedPrivateEvent> {
      const event = {
        packedEvent: [Fr.random(), Fr.random()],
        l2BlockNumber: BlockNumber(blockNumber ?? lastKnownBlockNumber),
        l2BlockHash,
        txHash: TxHash.random(),
        eventSelector,
      };

      const randomness = Fr.random();
      const siloedEventCommitment = Fr.random();

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        event.packedEvent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash: event.txHash,
          l2BlockNumber: event.l2BlockNumber,
          l2BlockHash: event.l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: eventCounter++,
        },
        'test',
      );

      return event;
    }

    it('returns private events', async () => {
      // Store a couple of events to exercise `getPrivateEvents`
      const event1 = await storeEvent();
      const event2 = await storeEvent();
      await privateEventStore.commit('test');

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

      beforeEach(async () => {
        eventsInPastBlocks = await Promise.all([
          storeEvent(lastKnownBlockNumber - 1),
          storeEvent(lastKnownBlockNumber - 1),
        ]);

        eventsInLatestKnownBlock = await Promise.all([
          storeEvent(lastKnownBlockNumber),
          storeEvent(lastKnownBlockNumber),
        ]);

        // Events in not-yet-synced blocks; stored only to verify they are filtered out.
        await Promise.all([storeEvent(lastKnownBlockNumber + 1), storeEvent(lastKnownBlockNumber + 1)]);

        await privateEventStore.commit('test');
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
  // Note: Not testing a successful run of `proveTx`, `sendTx`, `getTxReceipt` and `executeUtility` here as it
  //       requires a larger setup and it's sufficiently tested in the e2e tests.
});
