import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKey, deriveKeys, derivePublicKeyFromSecretKey, hashPublicKey } from '@aztec/stdlib/keys';

import type { AccountPrivacySecretKeys } from './account_privacy_keys.js';
import { KeyStore } from './key_store.js';

/** The four privacy secret keys the key store holds and returns from `getAccountSecretKeys`. */
const PRIVACY_SECRET_KEY_NAMES = [
  'masterNullifierHidingSecretKey',
  'masterIncomingViewingSecretKey',
  'masterOutgoingViewingSecretKey',
  'masterTaggingSecretKey',
] as const satisfies readonly (keyof AccountPrivacySecretKeys)[];

describe('KeyStore', () => {
  it('Adds account and returns keys', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const keys = await deriveKeys(sk);
    const derivedMasterNullifierHidingPublicKey = await derivePublicKeyFromSecretKey(
      keys.masterNullifierHidingSecretKey,
    );
    const computedMasterNullifierHidingPublicKeyHash = await hashPublicKey(derivedMasterNullifierHidingPublicKey);
    const computedMasterIncomingViewingPublicKeyHash = await hashPublicKey(keys.publicKeys.ivpkM);

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(keys, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x0a3120bded2afb430e67e4bdb5326a673fbfd95642b6ea7f80d0cc958aac3940"`,
    );

    const { pkMHash: returnedNpkMHash } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierHidingPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(returnedNpkMHash.equals(computedMasterNullifierHidingPublicKeyHash)).toBe(true);

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.equals(keys.publicKeys.ivpkM)).toBe(true);

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.equals(keys.masterOutgoingViewingPublicKey)).toBe(true);

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.equals(keys.masterTaggingPublicKey)).toBe(true);

    const masterIncomingViewingSecretKey = await keyStore.getMasterIncomingViewingSecretKey(accountAddress);
    expect(masterIncomingViewingSecretKey.equals(keys.masterIncomingViewingSecretKey)).toBe(true);

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigIntUnsafe(624n);

    const { pkMHash: obtainedNpkMHash, skApp: appNullifierHidingKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierHidingPublicKeyHash,
      appAddress,
    );
    expect(appNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x165cc265d187ed42f0e3f5adbb5a0055a77e205daeb68dd1735796ee402e502f"`,
    );
    expect(obtainedNpkMHash).toEqual(computedMasterNullifierHidingPublicKeyHash);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x058452c94b1d8540a39d9343758fc132af3401237bd1ac2a16c37462a173954a"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x0a3120bded2afb430e67e4bdb5326a673fbfd95642b6ea7f80d0cc958aac3940"`,
    );

    // Manages to find master nullifier hiding key for the pk_m hash
    const masterNullifierHidingSecretKey = await keyStore.getMasterSecretKey(
      computedMasterNullifierHidingPublicKeyHash,
    );
    expect(masterNullifierHidingSecretKey.equals(keys.masterNullifierHidingSecretKey)).toBe(true);

    // Manages to find master incoming viewing secret key for the pk_m hash
    const masterIncomingViewingSecretKeyFromPublicKey = await keyStore.getMasterSecretKey(
      computedMasterIncomingViewingPublicKeyHash,
    );
    expect(masterIncomingViewingSecretKeyFromPublicKey.equals(keys.masterIncomingViewingSecretKey)).toBe(true);
  });

  it('exports the privacy secret keys it was registered with', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const privacyKeys = await deriveKeys(new Fr(8923n));
    const { address } = await keyStore.addAccount(privacyKeys, new Fr(243523n));

    const exported = await keyStore.getAccountSecretKeys(address);
    for (const name of PRIVACY_SECRET_KEY_NAMES) {
      expect(exported[name].equals(privacyKeys[name])).toBe(true);
    }
  });

  it('rejects registering an account with secret key resulting in infinity public keys', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const privacyKeys = await deriveKeys(new Fr(8923n));
    privacyKeys.masterIncomingViewingSecretKey = GrumpkinScalar.ZERO;

    await expect(keyStore.addAccount(privacyKeys, new Fr(243523n))).rejects.toThrow('masterIncomingViewingPublicKey');
  });

  it('rejects registering an account with an infinity message-signing or fallback public key', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const privacyKeys = await deriveKeys(new Fr(8923n));
    privacyKeys.masterMessageSigningPublicKey = PublicKey.INFINITY;

    await expect(keyStore.addAccount(privacyKeys, new Fr(243523n))).rejects.toThrow('masterMessageSigningPublicKey');
  });
});
