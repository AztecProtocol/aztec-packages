import { AztecAddress, Fr, deriveKeys, derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
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
      `"0x13c731a2c339964488f847ca0dac49ac71dafc3f34bab6ec3e5d83e7468885ab"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1c088f4e4a711f236a88b55da9ddf388de0bc00d56a5ceca96cea3a5cbe75bf32db0a333ba30c36b844d9fc6d2fb0de8d10e4371f0c5baebae452d90ff366798"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x232d0b445d097fbc2046012c3fc474f6a9beef97eda1d8d1f2487dbe501ee1e70e8db9a824531a14e8717dee54cbb7abfec29a88c550a49617258bd6fd858242"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x076429010fdebfa522b053267f654a4c5daf18589915d96f7e5001d63ea2033f27f915f254560c84450aa38e93c3162be52492d05b316e75f542e3b302117360"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x07cec19d32f1cbaaacf16edc081021b696c86dff14160779373ffc77b04568e7076f25b0e7f0d02fd6433d788483e2262c1e45c5962790b40d1cd7efbd5253d3"`,
    );

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierSecretKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0030e54eefa97f61f384e112dcf7859583494e0e1823a272d18ea93eb110c0a7"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appIncomingViewingSecretKey = await keyStore.getAppIncomingViewingSecretKey(accountAddress, appAddress);
    expect(appIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0247d73d16cf0939cc783b3cee140b37b294b6cbc1c0295d530f3f637c9b8034"`,
    );

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x296c9931262d8b95b4cbbcc66ac4c97d2cc3fab4da5eedc08fcff80f1ce37e34"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x13c731a2c339964488f847ca0dac49ac71dafc3f34bab6ec3e5d83e7468885ab"`,
    );

    // Manages to find master nullifer secret key for pub key
    const masterNullifierSecretKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1f1f43082427fed511393bbabf8a471eb87af09f0e95bb740dc33e1ced1a54c1"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKey = await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1d1d920024dd64e019c23de36d27aefe4d9d4d05983b99cf85bea9e85fd60020"`,
    );
  });
});
