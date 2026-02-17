import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveKeys, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';

import { KeyStore } from './key_store.js';

describe('KeyStore', () => {
  it('Adds account and returns keys', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const keys = await deriveKeys(sk);
    const derivedMasterNullifierPublicKey = await derivePublicKeyFromSecretKey(keys.masterNullifierHidingKey);
    const computedMasterNullifierPublicKeyHash = await derivedMasterNullifierPublicKey.hash();

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x2e54c8067c410d03d417dddd51e1cad76cece48ff39fa0fe908782b93a209a52"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0d86b380f66ec74d32bb04d98f5b2dcef6d92f344e65604a21640f87fb6d078e2b68df4d20985b71c252746a3f2cc5af32b5f0c32739b94f166dfa230f50397b"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0e0eb5bc3eb9959d6e05cbc0e37b2fa4cfb113c1db651c384907547f1f8670101db2e49c6845619ba432a951d86de2d41680157b0f54556246916900c0fcdcf2"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x2721eaed30c0c9fae14c2ca4af7668a46278762d4a6066ab7a5defcc242f559c0bd0c4b0ec90ebafe511f20e818fb359a1322ab0f02fe3ebec95af5df502015d"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0fabb6adca7c2bf7f6202c65fe2785096efb317897bc545c427635a61d5369552cc356e6e5b68fd64d33c96fad7bb1394956c53930fefdf0bb536812ec604459"`,
    );

    const masterIncomingViewingSecretKey = await keyStore.getMasterIncomingViewingSecretKey(accountAddress);
    expect(masterIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0d3e4402946f2f712d942e1a3962b12fc521effc39fe93777f91285f1ad414cb"`,
    );

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierHidingKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x165cc265d187ed42f0e3f5adbb5a0055a77e205daeb68dd1735796ee402e502f"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x058452c94b1d8540a39d9343758fc132af3401237bd1ac2a16c37462a173954a"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x2e54c8067c410d03d417dddd51e1cad76cece48ff39fa0fe908782b93a209a52"`,
    );

    // Manages to find master nullifier hiding key for pub key
    const masterNullifierHidingKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x26dd6f83a99b5b1cea47692f40b7aece47756a1a5e93138c5b8f7e7afd36ed1a"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKeyFromPublicKey =
      await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKeyFromPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0d3e4402946f2f712d942e1a3962b12fc521effc39fe93777f91285f1ad414cb"`,
    );
  });
});
