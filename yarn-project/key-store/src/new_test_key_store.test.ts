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
      `"0x2be4a07a3c5b5d746cb3c312bce46ee844748039b5e772ddb8d0e961f1512bb9"`,
    );

    // TODO(#5714): The keys are currently the same here because separator is currently ignored in poseidon
    const masterNullifierPublicKey = await keyStore.getMasterNullifierPublicKey(accountAddress);
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x03e81abc4e901640f7e3a2ad2058c94f17985bbb482774e9ec2c047c21ff25f30b7997c999ace8289fe5595cf0df6a038b73e3955241d6240263f73b51401911"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x09c762a9e8da1471ca67eb9e150398cc8406aee86f397f842f6ef10a7a0fda32239588ed8e880e81000efd81c7a856ba063cdfaa6212e3a512ad59bff163c619"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x282f7a4242121b26a16a72228593db50de79bb312ce0825657a175ca8e7802100b161ab6f43d98fe6ecafaeeeeef8d1c0d77b220d5eb92d2bb2aee50b7558940"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x14348f7ca16a769fe76dfbeef2812a6b788b94952a39fcf10f78114a2a85c3e517387463d0b7fad7aac6f9f970a5533d919fbda66b537b7ce4544f13d497ffad"`,
    );
  });
});
