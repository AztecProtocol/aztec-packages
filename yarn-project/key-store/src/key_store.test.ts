import {
  AztecAddress,
  Fq,
  Fr,
  type KeyPrefix,
  computeAppSecretKey,
  deriveKeys,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { openTmpStore } from '@aztec/kv-store/utils';

import { KeyStore } from './key_store.js';

describe('KeyStore', () => {
  it('Adds account and returns keys', async () => {
    const keyStore = new KeyStore(openTmpStore());

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const keys = deriveKeys(sk);
    const derivedMasterNullifierPublicKey = derivePublicKeyFromSecretKey(keys.masterNullifierSecretKey);
    const computedMasterNullifierPublicKeyHash = derivedMasterNullifierPublicKey.hash();

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x1a8a9a1d91cbb353d8df4f1bbfd0283f7fc63766f671edd9443a1270a7b2a954"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x2ef5d15dd65d29546680ab72846fb071f41cb9f2a0212215e6c560e29df4ff650ce764818364b376be92dc2f49577fe440e64a16012584f7c4ee94f7edbc323a"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1c088f4e4a711f236a88b55da9ddf388de0bc00d56a5ceca96cea3a5cbe75bf32db0a333ba30c36b844d9fc6d2fb0de8d10e4371f0c5baebae452d90ff366798"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x232d0b445d097fbc2046012c3fc474f6a9beef97eda1d8d1f2487dbe501ee1e70e8db9a824531a14e8717dee54cbb7abfec29a88c550a49617258bd6fd858242"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x076429010fdebfa522b053267f654a4c5daf18589915d96f7e5001d63ea2033f27f915f254560c84450aa38e93c3162be52492d05b316e75f542e3b302117360"`,
    );

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierSecretKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x230a44dfe7cfec7a735c89f7289c5cb5d2c3dc0bf5d3505917fd2476f67873a8"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appIncomingViewingSecretKey = await keyStore.getAppIncomingViewingSecretKey(accountAddress, appAddress);
    expect(appIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0084c92262407236c992dcea10cf3406a642074cad6c6034d2990ffb073207a7"`,
    );

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x2639b26510f9d30b7e173d301b263b246b7a576186be1f44cd7c86bc06773f8a"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x1a8a9a1d91cbb353d8df4f1bbfd0283f7fc63766f671edd9443a1270a7b2a954"`,
    );

    // Manages to find master nullifer secret key for pub key
    const masterNullifierSecretKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0fde74d5e504c73b58aad420dd72590fc6004571411e7f77c45378714195a52b"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKey = await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1f1f43082427fed511393bbabf8a471eb87af09f0e95bb740dc33e1ced1a54c1"`,
    );
  });

  it.each(['n' as KeyPrefix, 'iv' as KeyPrefix])('key rotation tests', async keyPrefix => {
    const keyStore = new KeyStore(openTmpStore());

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchSnapshot();

    // Arbitrary fixed values
    const newMasterSecretKeys = [new Fq(420n), new Fq(69n), new Fq(42069n)];
    const newDerivedMasterPublicKeys = [
      derivePublicKeyFromSecretKey(newMasterSecretKeys[0]),
      derivePublicKeyFromSecretKey(newMasterSecretKeys[1]),
      derivePublicKeyFromSecretKey(newMasterSecretKeys[2]),
    ];

    const newComputedMasterPublicKeyHashes = [
      newDerivedMasterPublicKeys[0].hash(),
      newDerivedMasterPublicKeys[1].hash(),
      newDerivedMasterPublicKeys[2].hash(),
    ];

    // We rotate our key
    await keyStore.rotateMasterKey(accountAddress, keyPrefix, newMasterSecretKeys[0]);
    await keyStore.rotateMasterKey(accountAddress, keyPrefix, newMasterSecretKeys[1]);
    await keyStore.rotateMasterKey(accountAddress, keyPrefix, newMasterSecretKeys[2]);

    // We make sure we can get master public keys with master public key hashes
    const { pkM: masterPublicKey2 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[2],
      AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterPublicKey2).toEqual(newDerivedMasterPublicKeys[2]);
    const { pkM: masterPublicKey1 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[1],
      AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterPublicKey1).toEqual(newDerivedMasterPublicKeys[1]);
    const { pkM: masterPublicKey0 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[0],
      AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterPublicKey0).toEqual(newDerivedMasterPublicKeys[0]);

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    // We make sure we can get app secret keys with master public key hashes
    const { skApp: appSecretKey0 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[0],
      appAddress,
    );
    expect(appSecretKey0.toString()).toMatchSnapshot();
    const { skApp: appSecretKey1 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[1],
      appAddress,
    );
    expect(appSecretKey1.toString()).toMatchSnapshot();
    const { skApp: appSecretKey2 } = await keyStore.getKeyValidationRequest(
      newComputedMasterPublicKeyHashes[2],
      appAddress,
    );
    expect(appSecretKey2.toString()).toMatchSnapshot();

    expect(appSecretKey0).toEqual(computeAppSecretKey(newMasterSecretKeys[0], appAddress, keyPrefix));
    expect(appSecretKey1).toEqual(computeAppSecretKey(newMasterSecretKeys[1], appAddress, keyPrefix));
    expect(appSecretKey2).toEqual(computeAppSecretKey(newMasterSecretKeys[2], appAddress, keyPrefix));
  });
});
