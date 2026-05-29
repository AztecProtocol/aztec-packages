import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import type { BlockHash } from '@aztec/stdlib/block';

import { AddressStore } from './address_store/address_store.js';
import { CanonicalChainStore } from './canonical_chain_store/canonical_chain_store.js';
import { CapsuleStore } from './capsule_store/capsule_store.js';
import { ContractStore } from './contract_store/contract_store.js';
import { FactStore } from './fact_store/fact_store.js';
import { NoteStore } from './note_store/note_store.js';
import { PrivateEventStore } from './private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderAddressBookStore, SenderTaggingStore } from './tagging_store/index.js';

/**
 * The set of sub-stores opened against a single `AztecAsyncKVStore` to back PXE state.
 */
export type PxeStores = {
  addressStore: AddressStore;
  privateEventStore: PrivateEventStore;
  contractStore: ContractStore;
  noteStore: NoteStore;
  canonicalChainStore: CanonicalChainStore;
  factStore: FactStore;
  senderTaggingStore: SenderTaggingStore;
  senderAddressBookStore: SenderAddressBookStore;
  recipientTaggingStore: RecipientTaggingStore;
  capsuleStore: CapsuleStore;
  keyStore: KeyStore;
  l2TipsStore: L2TipsKVStore;
};

/**
 * Opens every PXE sub-store against the given backing store. The `initialBlockHash` seeds the
 * `L2TipsKVStore` so it agrees with the node's archiver on the dynamic genesis header hash.
 */
export function openPxeStores(store: AztecAsyncKVStore, initialBlockHash: BlockHash): PxeStores {
  const canonicalChainStore = new CanonicalChainStore(store);
  return {
    addressStore: new AddressStore(store),
    privateEventStore: new PrivateEventStore(store, canonicalChainStore),
    contractStore: new ContractStore(store),
    noteStore: new NoteStore(store, canonicalChainStore),
    canonicalChainStore,
    factStore: new FactStore(store, canonicalChainStore),
    senderTaggingStore: new SenderTaggingStore(store),
    senderAddressBookStore: new SenderAddressBookStore(store),
    recipientTaggingStore: new RecipientTaggingStore(store),
    capsuleStore: new CapsuleStore(store),
    keyStore: new KeyStore(store),
    l2TipsStore: new L2TipsKVStore(store, 'pxe', initialBlockHash),
  };
}
