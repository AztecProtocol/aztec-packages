import { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { FactStoreFixtureContractArtifact } from '@aztec/noir-test-contracts.js/FactStoreFixture';
import { WASMSimulator } from '@aztec/simulator/client';
import type { FunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { BlockHeader } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { ContractFunctionSimulator } from '../../contract_function_simulator/contract_function_simulator.js';
import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { MessageContextService } from '../../messages/message_context_service.js';
import type { AddressStore } from '../address_store/address_store.js';
import { CanonicalChainStore } from '../canonical_chain_store/canonical_chain_store.js';
import type { CapsuleStore } from '../capsule_store/capsule_store.js';
import type { ContractStore } from '../contract_store/contract_store.js';
import type { NoteStore } from '../note_store/note_store.js';
import type { PrivateEventStore } from '../private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../tagging_store/sender_tagging_store.js';
import { FactStore } from './fact_store.js';
import { foldOffchainReception } from './fold_execution.js';
import { MESSAGE_PROCESSED, MESSAGE_RECEIVED, OFFCHAIN_ENTITY_TYPE_ID } from './offchain_reception_fixture.js';

describe('offchain reception fold (real simulator, real reorg)', () => {
  const simulator = new WASMSimulator();
  const JOB = 'fold-test';
  const correlation = Buffer.from('message-1');
  const contract = AztecAddress.fromBigInt(9n);
  const scope = AztecAddress.fromBigInt(1n);

  let factStore: FactStore;
  let chain: CanonicalChainStore;
  let acirSimulator: ContractFunctionSimulator;
  let anchorBlockHeader: BlockHeader;
  let fixture: { artifact: FunctionArtifact & { contractName: string }; address: AztecAddress };

  const fold = () =>
    foldOffchainReception(
      factStore,
      acirSimulator,
      fixture,
      anchorBlockHeader,
      contract,
      scope,
      OFFCHAIN_ENTITY_TYPE_ID,
      correlation,
      JOB,
    );

  beforeEach(async () => {
    const contractStore = mock<ContractStore>();
    anchorBlockHeader = BlockHeader.random();

    chain = new CanonicalChainStore(await openTmpStore('fold-cc'));
    await chain.load();
    factStore = new FactStore(await openTmpStore('fold-facts'), chain);

    acirSimulator = new ContractFunctionSimulator({
      contractStore,
      noteStore: mock<NoteStore>(),
      keyStore: mock<KeyStore>(),
      addressStore: mock<AddressStore>(),
      aztecNode: mock<AztecNode>(),
      l2TipsStore: mock<L2TipsProvider>(),
      senderTaggingStore: mock<SenderTaggingStore>(),
      recipientTaggingStore: mock<RecipientTaggingStore>(),
      senderAddressBookStore: mock<SenderAddressBookStore>(),
      capsuleStore: mock<CapsuleStore>(),
      factStore,
      privateEventStore: mock<PrivateEventStore>(),
      simulator,
      contractSyncService: mock<ContractSyncService>(),
      messageContextService: new MessageContextService(mock<AztecNode>()),
    });

    const foldArtifact = {
      ...FactStoreFixtureContractArtifact.functions.find(f => f.name === 'offchain_reception_fold')!,
      contractName: FactStoreFixtureContractArtifact.name,
    };
    contractStore.getFunctionArtifact.mockResolvedValue(foldArtifact);
    contractStore.getFunctionArtifactWithDebugMetadata.mockResolvedValue({
      ...foldArtifact,
      debug: undefined,
    });

    fixture = { artifact: foldArtifact, address: await AztecAddress.random() };
  });

  const put = (factType: Fr, anchor: { blockNumber: number; blockHash: string } | null) =>
    factStore.put(contract, scope, OFFCHAIN_ENTITY_TYPE_ID, factType, correlation, Buffer.alloc(0), anchor);

  it('retracts Processed on reorg and re-processes once the tx is re-mined', async () => {
    const A = '0xaa';
    const B = '0xbb';

    // 1. Received only (unanchored birth fact): the message has arrived but is not yet processed.
    await put(MESSAGE_RECEIVED, null);
    expect(await fold()).toBe('RECEIVED');

    // 2. The tx is found at (105, A): sync_inbox hands the message off and records a canonical
    //    Processed fact anchored there. Folding it advances the entity to PROCESSED, and it stays
    //    PROCESSED while the anchor remains canonical (idempotent re-syncs do not re-process).
    await chain.setMany([
      { blockNumber: 104, blockHash: Fr.random().toString() },
      { blockNumber: 105, blockHash: A },
    ]);
    await put(MESSAGE_PROCESSED, { blockNumber: 105, blockHash: A });
    expect(await fold()).toBe('PROCESSED');
    expect(await fold()).toBe('PROCESSED');

    // 3. A reorg orphans block 105. The Processed@(105,A) row is still stored but no longer
    //    canonical, so loadCanonicalFactSet filters it out: the fold retracts to RECEIVED and the
    //    message is eligible for re-processing.
    await chain.clearAbove(104);
    expect(await fold()).toBe('RECEIVED');

    // 4. The tx is re-mined at (107, B): a fresh Processed fact anchored there makes the entity
    //    PROCESSED again. The orphaned Processed@(105,A) row stays non-canonical and irrelevant.
    await chain.set(107, B);
    await put(MESSAGE_PROCESSED, { blockNumber: 107, blockHash: B });
    expect(await fold()).toBe('PROCESSED');
  }, 60_000);
});
