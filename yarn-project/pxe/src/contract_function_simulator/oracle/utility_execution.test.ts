import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { type CircuitSimulator, WASMSimulator } from '@aztec/simulator/client';
import { HandshakeRegistryArtifact } from '@aztec/standard-contracts/handshake-registry';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import {
  type ContractArtifact,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  encodeArguments,
  getFunctionArtifactByName,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type L2TipsProvider } from '@aztec/stdlib/block';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  computeContractAddressFromInstance,
} from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { PublicKeys, deriveKeys, hashPublicKey } from '@aztec/stdlib/keys';
import { AppTaggingSecret, AppTaggingSecretKind, MessageContext, SiloedTag } from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeL2Tips, randomContractInstanceWithAddress } from '@aztec/stdlib/testing';
import {
  BlockHeader,
  Capsule,
  GlobalVariables,
  MinedTxReceipt,
  TxEffect,
  TxExecutionResult,
  TxHash,
  TxStatus,
} from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { MessageContextService } from '../../messages/message_context_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import { CapsuleService } from '../../storage/capsule_store/capsule_service.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
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
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let contractSyncService: ReturnType<typeof mock<ContractSyncService>>;
  let l2TipsStore: ReturnType<typeof mock<L2TipsProvider>>;
  let messageContextService: MessageContextService;
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
    privateEventStore = mock<PrivateEventStore>();
    contractSyncService = mock<ContractSyncService>();
    l2TipsStore = mock<L2TipsProvider>();
    messageContextService = new MessageContextService(aztecNode);
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
      privateEventStore,
      simulator,
      contractSyncService,
      messageContextService,
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

    // Pins the production oracle's default-authorization allowlist for cross-contract utility reads of the
    // standard HandshakeRegistry: only get_handshakes and get_app_siloed_secret are allowed, everything else is
    // denied.
    describe('cross-contract utility authorization', () => {
      const prepareNestedUtilityCall = async (
        targetContractAddress: AztecAddress,
        contractArtifact: ContractArtifact,
        functionName: string,
      ) => {
        const functionArtifact = {
          ...getFunctionArtifactByName(contractArtifact, functionName),
          contractName: contractArtifact.name,
        };
        const selector = await FunctionSelector.fromNameAndParameters(functionName, functionArtifact.parameters);
        const callerInstance = await randomContractInstanceWithAddress({}, contractAddress);
        const targetInstance = await randomContractInstanceWithAddress({}, targetContractAddress);

        contractStore.getFunctionArtifactWithDebugMetadata.mockResolvedValue(functionArtifact);
        contractStore.getContractInstance.mockImplementation(address => {
          if (address.equals(contractAddress)) {
            return Promise.resolve(callerInstance);
          }
          if (address.equals(targetContractAddress)) {
            return Promise.resolve(targetInstance);
          }
          return Promise.reject(new Error(`Unexpected contract instance lookup for ${address}`));
        });

        return selector;
      };

      const makeNestedSimulator = () => {
        const nestedSimulator = mock<CircuitSimulator>();
        nestedSimulator.executeUserCircuit.mockResolvedValue({ partialWitness: new Map(), returnWitness: new Map() });
        return nestedSimulator;
      };

      let nestedSimulator: ReturnType<typeof makeNestedSimulator>;
      // The standard HandshakeRegistry reads the oracle default-authorizes, mapped to the args each is called with.
      let defaultAuthorizedHandshakeRegistryReads: Map<string, Fr[]>;

      beforeEach(() => {
        nestedSimulator = makeNestedSimulator();
        utilityExecutionOracle = makeOracle({ simulator: nestedSimulator });
        defaultAuthorizedHandshakeRegistryReads = new Map<string, Fr[]>([
          ['get_handshakes', []],
          ['get_app_siloed_secret', [Fr.random(), Fr.random(), new Fr(3), contractAddress.toField()]],
        ]);
      });

      afterEach(() => {
        contractSyncService.ensureContractSynced.mockClear();
        nestedSimulator.executeUserCircuit.mockClear();
      });

      it.each(HandshakeRegistryArtifact.functions.map(fn => fn.name))(
        'authorizes %s only if it is in the standard HandshakeRegistry read allowlist',
        async name => {
          const selector = await prepareNestedUtilityCall(
            STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
            HandshakeRegistryArtifact,
            name,
          );

          if (defaultAuthorizedHandshakeRegistryReads.has(name)) {
            const args = defaultAuthorizedHandshakeRegistryReads.get(name) ?? [];
            await expect(
              utilityExecutionOracle.callUtilityFunction(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, selector, args),
            ).resolves.toEqual([]);
            expect(contractSyncService.ensureContractSynced).toHaveBeenCalled();
            expect(nestedSimulator.executeUserCircuit).toHaveBeenCalled();
          } else {
            await expect(
              utilityExecutionOracle.callUtilityFunction(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, selector, []),
            ).rejects.toThrow('Cross-contract utility call denied: No execution hooks configured');
            expect(contractSyncService.ensureContractSynced).not.toHaveBeenCalled();
            expect(nestedSimulator.executeUserCircuit).not.toHaveBeenCalled();
          }
        },
      );
    });

    describe('getMessageContextsByTxHash', () => {
      const service = new EphemeralArrayService();

      it('sets null in response for zero tx hashes', async () => {
        const requests = EphemeralArray.fromValues(service, [Fr.ZERO]);

        const response = await utilityExecutionOracle.getMessageContextsByTxHash(requests);
        const [responseValue] = response.readAll(service);
        expect(responseValue.isNone()).toBe(true);
        expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
      });

      it('resolves a valid tx hash into a MessageContext', async () => {
        const txHash = TxHash.random();
        const noteHash = Fr.random();
        const firstNullifier = Fr.random();

        aztecNode.getTxReceipt.mockResolvedValueOnce(
          new MinedTxReceipt(
            txHash,
            TxStatus.PROPOSED,
            TxExecutionResult.SUCCESS,
            0n,
            BlockHash.random(),
            BlockNumber(syncedBlockNumber - 1),
            SlotNumber(0),
            0,
            EpochNumber(1),
            TxEffect.from({
              ...(await TxEffect.random()),
              txHash,
              noteHashes: [noteHash],
              nullifiers: [firstNullifier],
            }),
          ),
        );

        const requests = EphemeralArray.fromValues(service, [txHash.hash]);

        const response = await utilityExecutionOracle.getMessageContextsByTxHash(requests);
        const [responseValue] = response.readAll(service);
        expect(responseValue.isSome()).toBe(true);
        expect(responseValue.value).toEqual(new MessageContext(txHash, [noteHash], firstNullifier));
      });

      it('sets null in response for tx effects beyond anchor block', async () => {
        const txHash = TxHash.random();

        aztecNode.getTxReceipt.mockResolvedValueOnce(
          new MinedTxReceipt(
            txHash,
            TxStatus.PROPOSED,
            TxExecutionResult.SUCCESS,
            0n,
            BlockHash.random(),
            BlockNumber(syncedBlockNumber + 1),
            SlotNumber(0),
            0,
            EpochNumber(1),
            TxEffect.from({
              ...(await TxEffect.random()),
              txHash,
              noteHashes: [],
              nullifiers: [Fr.random()],
            }),
          ),
        );

        const requests = EphemeralArray.fromValues(service, [txHash.hash]);

        const response = await utilityExecutionOracle.getMessageContextsByTxHash(requests);
        const [responseValue] = response.readAll(service);
        expect(responseValue.isNone()).toBe(true);
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
        privateEventStore,
        messageContextService,
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
