import { BlockNumber } from '@aztec/foundation/branded-types';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type L2TipsProvider } from '@aztec/stdlib/block';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  computeContractAddressFromInstance,
} from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { PublicKeys, deriveKeys, hashPublicKey } from '@aztec/stdlib/keys';
import { AppTaggingSecret, AppTaggingSecretKind, SiloedTag } from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeL2Tips } from '@aztec/stdlib/testing';
import { BlockHeader, Capsule, GlobalVariables, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { TxResolverService } from '../../messages/tx_resolver_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import { FactService, FactStore } from '../../storage/fact_store/index.js';
import type { OriginBlock } from '../../storage/fact_store/index.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import { Option } from '../noir-structs/option.js';
import { ProvidedSecret } from '../noir-structs/provided_secret.js';
import { TransientArrayService } from '../transient_array_service.js';
import { UtilityExecutionOracle, type UtilityExecutionOracleArgs } from './utility_execution_oracle.js';

describe('Utility Execution test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressStore: ReturnType<typeof mock<AddressStore>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let senderTaggingStore: ReturnType<typeof mock<SenderTaggingStore>>;
  let recipientTaggingStore: ReturnType<typeof mock<RecipientTaggingStore>>;
  let senderAddressBookStore: ReturnType<typeof mock<SenderAddressBookStore>>;
  let capsuleStore: ReturnType<typeof mock<CapsuleStore>>;
  let factStore: FactStore;
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let contractSyncService: ReturnType<typeof mock<ContractSyncService>>;
  let l2TipsStore: ReturnType<typeof mock<L2TipsProvider>>;
  let txResolver: TxResolverService;
  let acirSimulator: ContractFunctionSimulator;
  let owner: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let anchorBlockHeader: BlockHeader;
  const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

  const buildNote = (amount: bigint) => {
    return new Note([new Fr(amount)]);
  };

  beforeEach(async () => {
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    keyStore = mock<KeyStore>();
    addressStore = mock<AddressStore>();
    aztecNode = mock<AztecNode>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    capsuleStore = mock<CapsuleStore>();
    factStore = new FactStore(await openTmpStore('utility-exec-fact-test'));
    privateEventStore = mock<PrivateEventStore>();
    contractSyncService = mock<ContractSyncService>();
    l2TipsStore = mock<L2TipsProvider>();
    txResolver = new TxResolverService(aztecNode);
    const capsuleArrays = new Map<string, Fr[][]>();
    anchorBlockHeader = BlockHeader.random();
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();
    senderAddressBookStore.getSenders.mockResolvedValue([]);

    l2TipsStore.getL2Tips.mockResolvedValue(makeL2Tips(anchorBlockHeader.globalVariables.blockNumber));
    aztecNode.getPrivateLogsByTags.mockImplementation(query => Promise.resolve(query.tags.map(() => [])));

    capsuleStore.setCapsuleArray.mockImplementation((address, slot, content) => {
      capsuleArrays.set(`${address.toString()}:${slot.toString()}`, content);
      return Promise.resolve();
    });
    capsuleStore.readCapsuleArray.mockImplementation((address, slot) => {
      return Promise.resolve(capsuleArrays.get(`${address.toString()}:${slot.toString()}`) ?? []);
    });
    acirSimulator = new ContractFunctionSimulator({
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      l2TipsStore,
      senderTaggingStore,
      recipientTaggingStore,
      senderAddressBookStore,
      capsuleStore,
      factStore,
      privateEventStore,
      simulator,
      contractSyncService,
      txResolver,
    });

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, ownerPartialAddress);
    owner = ownerCompleteAddress.address;

    // Derive keys to get the incoming viewing secret key
    const { masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSecretKey);

    keyStore.getAccounts.mockResolvedValue([owner]);

    // Mock getMasterIncomingViewingSecretKey to return a valid scalar
    // This is needed when LogService tries to compute directional app tagging secrets
    keyStore.getMasterIncomingViewingSecretKey.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerIvskM);
      }
      // Return a default value for any other address
      return Promise.resolve(GrumpkinScalar.random());
    });

    addressStore.getCompleteAddress.mockImplementation((account: AztecAddress) => {
      if (account.equals(owner)) {
        return Promise.resolve(ownerCompleteAddress);
      }
      throw new Error(`Unknown address ${account}`);
    });
  });

  it('should run the summed_values function on StatefulTestContractArtifact', async () => {
    const artifact = {
      ...StatefulTestContractArtifact.functions.find(f => f.name === 'summed_values')!,
      contractName: StatefulTestContractArtifact.name,
    };

    const notes: Note[] = [...Array(5).fill(buildNote(1n)), ...Array(2).fill(buildNote(2n))];

    // The initializer nullifier check requires the instance to be a valid preimage of the contract address, so we
    // can't use a random contract address here.
    const instanceFields = {
      version: 2 as const,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
    };
    const contractAddress = await computeContractAddressFromInstance(instanceFields);

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    // The init check calls check_nullifier_exists, which queries findLeavesIndexes.
    aztecNode.findLeavesIndexes.mockResolvedValue([
      { data: 1n, l2BlockNumber: BlockNumber(1), l2BlockHash: BlockHash.random() },
    ]);
    contractStore.getFunctionArtifact.mockResolvedValue(artifact);
    contractStore.getContractInstance.mockResolvedValue({
      ...instanceFields,
      address: contractAddress,
    } as ContractInstanceWithAddress);
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractStore.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });
    noteStore.getNotes.mockResolvedValue(
      notes.map(
        note =>
          new NoteDao(
            note,
            contractAddress,
            owner,
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            TxHash.random(),
            BlockNumber(42),
            BlockHash.random().toString(),
            0,
            0,
          ),
      ),
    );

    capsuleStore.getCapsule.mockImplementation((_, __) => Promise.resolve(null));

    const execRequest = FunctionCall.from({
      name: artifact.name,
      to: contractAddress,
      selector: FunctionSelector.empty(),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: encodeArguments(artifact, [owner]),
      returnTypes: artifact.returnTypes,
    });

    const { result, offchainEffects } = await acirSimulator.runUtility(
      execRequest,
      [],
      anchorBlockHeader,
      [],
      'test-job-id',
    );

    expect(result).toEqual([new Fr(9)]);
    expect(offchainEffects).toEqual([]);
  }, 30_000);

  it('WASM simulator supports N-way concurrent utility execution', async () => {
    // Fires N concurrent runUtility calls through the shared WASMSimulator instance. Each call runs its own ACIR
    // execution with its own oracle, but they all funnel through the same `executeUserCircuit` entry point and
    // therefore the same Wasm module. If the underlying noir-acvm_js binding cannot handle overlapping executions,
    // concurrent calls can corrupt each other's witness maps: we'd expect crashes, rejections, or wrong sums.
    //
    // This guards the parallelization in ContractSyncService (MAX_CONCURRENT_SCOPE_SYNCS = 5), which is the first
    // code path to run multiple utility ACIR calls simultaneously. N is set to 10 so we test twice the production
    // cap to catch issues that would only surface at higher concurrency.
    const N = 10;
    const artifact = {
      ...StatefulTestContractArtifact.functions.find(f => f.name === 'summed_values')!,
      contractName: StatefulTestContractArtifact.name,
    };

    const notes: Note[] = [...Array(5).fill(buildNote(1n)), ...Array(2).fill(buildNote(2n))];
    const expectedSum = new Fr(9);

    const instanceFields = {
      version: 2 as const,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
    };
    const contractAddress = await computeContractAddressFromInstance(instanceFields);

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    aztecNode.findLeavesIndexes.mockResolvedValue([
      { data: 1n, l2BlockNumber: BlockNumber(1), l2BlockHash: BlockHash.random() },
    ]);
    contractStore.getFunctionArtifact.mockResolvedValue(artifact);
    contractStore.getContractInstance.mockResolvedValue({
      ...instanceFields,
      address: contractAddress,
    } as ContractInstanceWithAddress);
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractStore.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });
    noteStore.getNotes.mockResolvedValue(
      notes.map(
        note =>
          new NoteDao(
            note,
            contractAddress,
            owner,
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            TxHash.random(),
            BlockNumber(42),
            BlockHash.random().toString(),
            0,
            0,
          ),
      ),
    );
    capsuleStore.getCapsule.mockImplementation((_, __) => Promise.resolve(null));

    const execRequest = FunctionCall.from({
      name: artifact.name,
      to: contractAddress,
      selector: FunctionSelector.empty(),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: encodeArguments(artifact, [owner]),
      returnTypes: artifact.returnTypes,
    });

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        acirSimulator.runUtility(execRequest, [], anchorBlockHeader, [], `reentrance-job-${i}`),
      ),
    );

    expect(results).toHaveLength(N);
    for (const { result } of results) {
      expect(result).toEqual([expectedSum]);
    }
  }, 60_000);

  describe('UtilityExecutionOracle', () => {
    let contractAddress: AztecAddress;
    let utilityExecutionOracle: UtilityExecutionOracle;
    const syncedBlockNumber = 100;

    let scope: AztecAddress;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
      anchorBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      });

      scope = await AztecAddress.random();

      utilityExecutionOracle = makeOracle({ contractAddress, scopes: [scope] });
    });

    describe('Respects synced block number', () => {
      it('throws when getting block for future block number', async () => {
        await expect(utilityExecutionOracle.getBlockHeader(BlockNumber(syncedBlockNumber + 1))).rejects.toThrow(
          `Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`,
        );
      });
    });

    describe('capsules', () => {
      it('forwards scope to the capsule service', async () => {
        const slot = Fr.random();
        const srcSlot = Fr.random();
        const dstSlot = Fr.random();
        const capsule = [Fr.random()];

        capsuleStore.getCapsule.mockResolvedValueOnce(capsule);

        utilityExecutionOracle.setCapsule(contractAddress, slot, capsule, scope);
        await utilityExecutionOracle.getCapsule(contractAddress, slot, capsule.length, scope);
        utilityExecutionOracle.deleteCapsule(contractAddress, slot, scope);
        await utilityExecutionOracle.copyCapsule(contractAddress, srcSlot, dstSlot, 1, scope);

        expect(capsuleStore.setCapsule).toHaveBeenCalledWith(contractAddress, slot, capsule, 'test-job-id', scope);
        expect(capsuleStore.getCapsule).toHaveBeenCalledWith(contractAddress, slot, 'test-job-id', scope);
        expect(capsuleStore.deleteCapsule).toHaveBeenCalledWith(contractAddress, slot, 'test-job-id', scope);
        expect(capsuleStore.copyCapsule).toHaveBeenCalledWith(
          contractAddress,
          srcSlot,
          dstSlot,
          1,
          'test-job-id',
          scope,
        );
      });

      it('loads transient capsules by scope', async () => {
        const scope = await AztecAddress.random();
        const slot = Fr.random();
        const transientGlobal = [Fr.random()];
        const transientScoped = [Fr.random()];
        const persisted = [Fr.random()];

        utilityExecutionOracle = makeOracle({
          contractAddress,
          scopes: [scope],
          capsules: [
            new Capsule(contractAddress, slot, transientGlobal),
            new Capsule(contractAddress, slot, transientScoped, scope),
          ],
        });

        capsuleStore.getCapsule.mockResolvedValueOnce(persisted);

        const globalResult = await utilityExecutionOracle.getCapsule(contractAddress, slot, 1, AztecAddress.ZERO);
        expect(globalResult.value!).toEqual(transientGlobal);

        const globalAgain = await utilityExecutionOracle.getCapsule(contractAddress, slot, 1, AztecAddress.ZERO);
        expect(globalAgain.value!).toEqual(transientGlobal);

        const scopedResult = await utilityExecutionOracle.getCapsule(contractAddress, slot, 1, scope);
        expect(scopedResult.value!).toEqual(transientScoped);
      });
    });

    describe('invalidateContractSyncCache', () => {
      it('throws when contract address does not match', async () => {
        const otherAddress = await AztecAddress.random();
        const scope = await AztecAddress.random();
        expect(() =>
          utilityExecutionOracle.setContractSyncCacheInvalid(
            otherAddress,
            BoundedVec.from({ data: [scope], maxLength: 1 }),
          ),
        ).toThrow(`Contract ${contractAddress} cannot invalidate sync cache of ${otherAddress}`);
        expect(contractSyncService.invalidateContractForScopes).not.toHaveBeenCalled();
      });

      it('invalidates cache for the given scopes', async () => {
        const scopeA = await AztecAddress.random();
        const scopeB = await AztecAddress.random();
        utilityExecutionOracle.setContractSyncCacheInvalid(
          contractAddress,
          BoundedVec.from({ data: [scopeA, scopeB], maxLength: 2 }),
        );
        expect(contractSyncService.invalidateContractForScopes).toHaveBeenCalledWith(contractAddress, [scopeA, scopeB]);
      });
    });

    describe('getSharedSecrets', () => {
      const service = new EphemeralArrayService();

      it('returns different shared secrets for different contract addresses', async () => {
        // Generate a deterministic ephemeral public key
        const ephSk = GrumpkinScalar.random();
        const ephPk = await Grumpkin.mul(Grumpkin.generator, ephSk);

        // Derive keys so we can mock getMasterSecretKey (used by getSharedSecrets)
        const { masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSecretKey);
        const ownerIvpkMHash = await hashPublicKey(ownerCompleteAddress.publicKeys.ivpkM);
        keyStore.getMasterSecretKey.mockImplementation((pkMHash: Fr) => {
          if (pkMHash.equals(ownerIvpkMHash)) {
            return Promise.resolve(ownerIvskM);
          }
          throw new Error(`Unknown pk_m_hash ${pkMHash}`);
        });

        const contractAddressA = await AztecAddress.random();
        const contractAddressB = await AztecAddress.random();

        const oracleA = makeOracle({ contractAddress: contractAddressA });
        const oracleB = makeOracle({ contractAddress: contractAddressB });

        const ephPksArray = EphemeralArray.fromValues(service, [ephPk]);
        const responseA = await oracleA.getSharedSecrets(owner, ephPksArray, contractAddressA);
        const [secretA] = responseA.readAll(service);

        const responseB = await oracleB.getSharedSecrets(owner, ephPksArray, contractAddressB);
        const [secretB] = responseB.readAll(service);

        // After app-siloing, different contracts must get different shared secrets for the same
        // (address, ephPk) pair. This prevents cross-contract decryption attacks.
        expect(secretA).not.toEqual(secretB);
      });

      it('rejects when contract address does not match execution context', async () => {
        const ephSk = GrumpkinScalar.random();
        const ephPk = await Grumpkin.mul(Grumpkin.generator, ephSk);

        const { masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSecretKey);
        keyStore.getMasterSecretKey.mockResolvedValue(ownerIvskM);

        const ephPksArray = EphemeralArray.fromValues(service, [ephPk]);
        const wrongAddress = await AztecAddress.random();
        await expect(utilityExecutionOracle.getSharedSecrets(owner, ephPksArray, wrongAddress)).rejects.toThrow(
          /expected/,
        );
      });
    });

    describe('getPendingTaggedLogs', () => {
      const service = new EphemeralArrayService();

      it('searches tags derived from provided secrets', async () => {
        // Capture every tag the node is queried with so we can assert the provided secret was searched.
        const queriedTags: Fr[] = [];
        aztecNode.getPrivateLogsByTags.mockImplementation(query => {
          for (const entry of query.tags) {
            queriedTags.push('tag' in entry ? entry.tag.value : entry.value);
          }
          return Promise.resolve(query.tags.map(() => []));
        });

        const providedSecret = Fr.random();
        const providedSecrets = EphemeralArray.fromValues(service, [
          new ProvidedSecret(providedSecret, AppTaggingSecretKind.UNCONSTRAINED),
        ]);

        await utilityExecutionOracle.getPendingTaggedLogs(owner, providedSecrets);

        // The first-window tag of the provided secret must appear among the tags queried against the node.
        const expectedTag = await SiloedTag.compute({
          extendedSecret: new AppTaggingSecret(providedSecret, contractAddress, AppTaggingSecretKind.UNCONSTRAINED),
          index: 0,
        });
        expect(queriedTags.map(tag => tag.toString())).toContain(expectedTag.value.toString());
      });
    });

    describe('fact store', () => {
      const service = new EphemeralArrayService();
      const typeId = new Fr(10);
      const collectionId = new Fr(20);
      const factTypeId = new Fr(30);
      const noBlock = Option.none<OriginBlock>();

      it('records a fact and reads it back via getFactCollection', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        await oracle.recordFact(contractAddress, scope, typeId, collectionId, factTypeId, [new Fr(7)], noBlock);

        const result = await oracle.getFactCollection(contractAddress, scope, typeId, collectionId);
        expect(result.isSome()).toBe(true);
        const collection = result.value!;
        expect(collection.factCollectionId).toEqual(collectionId);
        const facts = collection.facts.readAll(service);
        expect(facts).toHaveLength(1);
        expect(facts[0].factTypeId).toEqual(factTypeId);
        expect(facts[0].payload.readAll(service)).toEqual([new Fr(7)]);
      });

      it('returns None for an unrecorded collection', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        const result = await oracle.getFactCollection(contractAddress, scope, typeId, collectionId);
        expect(result.isNone()).toBe(true);
      });

      it('returns only the surviving collections of a type after some are removed', async () => {
        const oracle = makeOracle({ scopes: [scope] });

        // Record a fact into a handful of collections of the same type, each with a distinct id, so we can tell which
        // ones come back.
        const ids = [1, 2, 3, 4, 5];
        for (const id of ids) {
          await oracle.recordFact(contractAddress, scope, typeId, new Fr(id), factTypeId, [new Fr(100 + id)], noBlock);
        }

        // Remove two of them; the rest must remain.
        await oracle.deleteFactCollection(contractAddress, scope, typeId, new Fr(2));
        await oracle.deleteFactCollection(contractAddress, scope, typeId, new Fr(4));

        const collections = (await oracle.getFactCollectionsByType(contractAddress, scope, typeId)).readAll(service);

        // Exactly the survivors come back (order is not guaranteed, so compare as a set).
        const survivingIds = collections
          .map(collection => collection.factCollectionId.toNumber())
          .sort((a, b) => a - b);
        expect(survivingIds).toEqual([1, 3, 5]);
      });

      it('stores a retractable fact when given an origin block', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        const originBlock = Option.some<OriginBlock>({ blockNumber: 5, blockHash: new Fr(0xabc) });
        await oracle.recordFact(contractAddress, scope, typeId, collectionId, factTypeId, [new Fr(42)], originBlock);

        const result = await oracle.getFactCollection(contractAddress, scope, typeId, collectionId);
        expect(result.isSome()).toBe(true);
        expect(result.value!.facts.readAll(service)).toHaveLength(1);
      });

      it('deletes a fact collection', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        await oracle.recordFact(contractAddress, scope, typeId, collectionId, factTypeId, [new Fr(1)], noBlock);
        await oracle.deleteFactCollection(contractAddress, scope, typeId, collectionId);

        const collections = (await oracle.getFactCollectionsByType(contractAddress, scope, typeId)).readAll(service);
        expect(collections).toEqual([]);
      });

      it('rejects access to another contract', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        const otherContract = await AztecAddress.random();
        expect(() =>
          oracle.recordFact(otherContract, scope, typeId, collectionId, factTypeId, [new Fr(1)], noBlock),
        ).toThrow(/not allowed to access/);
      });

      it('rejects a scope outside the allowed list', async () => {
        const oracle = makeOracle({ scopes: [scope] });
        const otherScope = await AztecAddress.random();
        expect(() =>
          oracle.recordFact(contractAddress, otherScope, typeId, collectionId, factTypeId, [new Fr(1)], noBlock),
        ).toThrow(/not in the allowed scopes/);
      });
    });

    const makeOracle = (overrides?: Partial<UtilityExecutionOracleArgs>) => {
      const scopes = overrides?.scopes ?? [];
      return new UtilityExecutionOracle({
        contractAddress,
        authWitnesses: [],
        capsules: [],
        anchorBlockHeader,
        contractStore,
        noteStore,
        keyStore,
        addressStore,
        aztecNode,
        recipientTaggingStore,
        senderAddressBookStore,
        capsuleService: new CapsuleService(capsuleStore, scopes),
        factService: new FactService(factStore, scopes),
        privateEventStore,
        txResolver,
        contractSyncService,
        jobId: 'test-job-id',
        scopes,
        l2TipsStore,
        simulator,
        utilityExecutor: () => Promise.resolve(),
        transientArrayService: new TransientArrayService(),
        ...overrides,
      });
    };
  });
});
