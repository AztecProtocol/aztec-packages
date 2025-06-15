import { Fr } from '@aztec/foundation/fields';
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
    const derivedMasterNullifierPublicKey = await derivePublicKeyFromSecretKey(keys.masterNullifierSecretKey);
    const computedMasterNullifierPublicKeyHash = await derivedMasterNullifierPublicKey.hash();

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x0018beb0ea3792b46f92e776c2409bcc1b83d2353af3bd3d1d6042df1cdbb921"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x232d0b445d097fbc2046012c3fc474f6a9beef97eda1d8d1f2487dbe501ee1e70e8db9a824531a14e8717dee54cbb7abfec29a88c550a49617258bd6fd858242"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x076429010fdebfa522b053267f654a4c5daf18589915d96f7e5001d63ea2033f27f915f254560c84450aa38e93c3162be52492d05b316e75f542e3b302117360"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x07cec19d32f1cbaaacf16edc081021b696c86dff14160779373ffc77b04568e7076f25b0e7f0d02fd6433d788483e2262c1e45c5962790b40d1cd7efbd5253d3"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x104022ba22d041827df4e8b41793dae7c9aa7e7c0f0dd98b9964f313ad960b8a03ad0ae9f6f597dbc7d2c7e8da1f1317fa6cac4b2d8ccd2f2e4156352290332b"`,
    );

    const masterIncomingViewingSecretKey = await keyStore.getMasterIncomingViewingSecretKey(accountAddress);
    expect(masterIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x09c0e50485b12da8bfb586b499b44b5d2dc4912b7ad6ce67b5102cba1331e1b4"`,
    );

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierSecretKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0247d73d16cf0939cc783b3cee140b37b294b6cbc1c0295d530f3f637c9b8034"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0fdc48b6bba93e3c9fffc6970d67d554bf18a2d418ddfb66f9de12dd34871b06"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x0018beb0ea3792b46f92e776c2409bcc1b83d2353af3bd3d1d6042df1cdbb921"`,
    );

    // Manages to find master nullifer secret key for pub key
    const masterNullifierSecretKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1d1d920024dd64e019c23de36d27aefe4d9d4d05983b99cf85bea9e85fd60020"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKeyFromPublicKey =
      await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKeyFromPublicKey.toString()).toMatchInlineSnapshot(
      `"0x09c0e50485b12da8bfb586b499b44b5d2dc4912b7ad6ce67b5102cba1331e1b4"`,
    );
  });
});
