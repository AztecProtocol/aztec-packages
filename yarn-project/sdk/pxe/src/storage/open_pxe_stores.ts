import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import type { BlockHash } from '@aztec/stdlib/block';

import { AddressStore } from './address_store/address_store.js';
import { AnchorBlockStore } from './anchor_block_store/anchor_block_store.js';
import { CapsuleStore } from './capsule_store/capsule_store.js';
import { ContractStore } from './contract_store/contract_store.js';
import { FactStore } from './fact_store/fact_store.js';
import { NoteStore } from './note_store/note_store.js';
import { PrivateEventStore } from './private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderTaggingStore, TaggingSecretSourcesStore } from './tagging_store/index.js';

/**
 * The set of sub-stores opened against a single `AztecAsyncKVStore` to back PXE state.
 */
export type PxeStores = {
  addressStore: AddressStore;
  privateEventStore: PrivateEventStore;
  contractStore: ContractStore;
  noteStore: NoteStore;
  anchorBlockStore: AnchorBlockStore;
  senderTaggingStore: SenderTaggingStore;
  taggingSecretSourcesStore: TaggingSecretSourcesStore;
  recipientTaggingStore: RecipientTaggingStore;
  capsuleStore: CapsuleStore;
  keyStore: KeyStore;
  l2TipsStore: L2TipsKVStore;
  factStore: FactStore;
};

/**
 * Opens every PXE sub-store against the given backing store. The `initialBlockHash` seeds the
 * `L2TipsKVStore` so it agrees with the node's archiver on the dynamic genesis header hash.
 */
export function openPxeStores(store: AztecAsyncKVStore, initialBlockHash: BlockHash): PxeStores {
  return {
    addressStore: new AddressStore(store),
    privateEventStore: new PrivateEventStore(store),
    contractStore: new ContractStore(store),
    noteStore: new NoteStore(store),
    anchorBlockStore: new AnchorBlockStore(store),
    senderTaggingStore: new SenderTaggingStore(store),
    taggingSecretSourcesStore: new TaggingSecretSourcesStore(store),
    recipientTaggingStore: new RecipientTaggingStore(store),
    capsuleStore: new CapsuleStore(store),
    keyStore: new KeyStore(store),
    l2TipsStore: new L2TipsKVStore(store, 'pxe', initialBlockHash),
    factStore: new FactStore(store),
  };
}
