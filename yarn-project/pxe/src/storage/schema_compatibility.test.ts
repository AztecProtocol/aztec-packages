import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';

import { createStoreSpy } from './__schema_fixtures__/store_spy.js';
import { AddressStore } from './address_store/address_store.js';
import { AnchorBlockStore } from './anchor_block_store/anchor_block_store.js';
import { CapsuleStore } from './capsule_store/capsule_store.js';
import { ContractStore } from './contract_store/contract_store.js';
import { NoteStore } from './note_store/note_store.js';
import { PrivateEventStore } from './private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderAddressBookStore, SenderTaggingStore } from './tagging_store/index.js';

describe('pxe schema compatibility', () => {
  it('pins the set of opened stores', async () => {
    const inner = await openTmpStore('pxe-schema-stores', true);
    try {
      const { store, log } = createStoreSpy(inner);

      // Mirror pxe.ts:216-226 exactly. Any store added there must be added here.
      new AddressStore(store);
      new PrivateEventStore(store);
      new ContractStore(store);
      new NoteStore(store);
      new AnchorBlockStore(store);
      new SenderTaggingStore(store);
      new SenderAddressBookStore(store);
      new RecipientTaggingStore(store);
      new CapsuleStore(store);
      new KeyStore(store);
      new L2TipsKVStore(store, 'pxe');

      const sorted = [...log].sort((a, b) =>
        a.name === b.name ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name),
      );
      expect(sorted).toMatchSnapshot();
    } finally {
      await inner.close();
    }
  });
});
