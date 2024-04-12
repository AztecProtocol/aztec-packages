import { Fr } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { openTmpStore } from '@aztec/kv-store/utils';

import { NewTestKeyStore } from './new_test_key_store.js';

describe('NewTestKeyStore', () => {
  it('Adds account and returns keys', async () => {
    const db = openTmpStore();
    const keyStore = new NewTestKeyStore(new Grumpkin(), db);

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const partialAddress = new Fr(243523n);

    const accountAddress = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x2ae5eeea29e4059842653d97864456c28fa53e4a823a8df65802090de1e85baa"`,
    );

    // TODO(#5714): The keys are currently the same here because separator is currently ignored in poseidon
    const masterNullifierPublicKey = await keyStore.getMasterNullifierPublicKey(accountAddress);
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1b0b998b70b295ed14912584c64abfd402ee13511d0dcf05badef38e8c10acd00fce0a5909d612c9a2d2c9172ff3cf5ba6be3e314d66b05edd74f3d5d259110f"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1b0b998b70b295ed14912584c64abfd402ee13511d0dcf05badef38e8c10acd00fce0a5909d612c9a2d2c9172ff3cf5ba6be3e314d66b05edd74f3d5d259110f"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1b0b998b70b295ed14912584c64abfd402ee13511d0dcf05badef38e8c10acd00fce0a5909d612c9a2d2c9172ff3cf5ba6be3e314d66b05edd74f3d5d259110f"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1b0b998b70b295ed14912584c64abfd402ee13511d0dcf05badef38e8c10acd00fce0a5909d612c9a2d2c9172ff3cf5ba6be3e314d66b05edd74f3d5d259110f"`,
    );
  });
});
