import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveKeys, derivePublicKeyFromSecretKey, hashPublicKey } from '@aztec/stdlib/keys';

import { KeyStore } from './key_store.js';

describe('KeyStore', () => {
  it('Adds account and returns keys', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const keys = await deriveKeys(sk);
    const derivedMasterNullifierPublicKey = await derivePublicKeyFromSecretKey(keys.masterNullifierHidingKey);
    const computedMasterNullifierPublicKeyHash = await hashPublicKey(derivedMasterNullifierPublicKey);
    const computedMasterIncomingViewingPublicKeyHash = await hashPublicKey(keys.publicKeys.ivpkM);

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x25d24398ba1a027cf6879542e7ed726f2d05dfb441e3c564ce44c6cdd7414e16"`,
    );

    const { pkMHash: returnedNpkMHash } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(returnedNpkMHash.equals(computedMasterNullifierPublicKeyHash)).toBe(true);

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.equals(keys.publicKeys.ivpkM)).toBe(true);

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.equals(keys.masterOutgoingViewingPublicKey)).toBe(true);

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.equals(keys.masterTaggingPublicKey)).toBe(true);

    const masterIncomingViewingSecretKey = await keyStore.getMasterIncomingViewingSecretKey(accountAddress);
    expect(masterIncomingViewingSecretKey.equals(keys.masterIncomingViewingSecretKey)).toBe(true);

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkMHash: obtainedNpkMHash, skApp: appNullifierHidingKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      appAddress,
    );
    expect(appNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x165cc265d187ed42f0e3f5adbb5a0055a77e205daeb68dd1735796ee402e502f"`,
    );
    expect(obtainedNpkMHash).toEqual(computedMasterNullifierPublicKeyHash);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x058452c94b1d8540a39d9343758fc132af3401237bd1ac2a16c37462a173954a"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x25d24398ba1a027cf6879542e7ed726f2d05dfb441e3c564ce44c6cdd7414e16"`,
    );

    // Manages to find master nullifier hiding key for the pk_m hash
    const masterNullifierHidingKey = await keyStore.getMasterSecretKey(computedMasterNullifierPublicKeyHash);
    expect(masterNullifierHidingKey.equals(keys.masterNullifierHidingKey)).toBe(true);

    // Manages to find master incoming viewing secret key for the pk_m hash
    const masterIncomingViewingSecretKeyFromPublicKey = await keyStore.getMasterSecretKey(
      computedMasterIncomingViewingPublicKeyHash,
    );
    expect(masterIncomingViewingSecretKeyFromPublicKey.equals(keys.masterIncomingViewingSecretKey)).toBe(true);
  });
});
