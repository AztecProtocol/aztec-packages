import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type MasterSecretKeys, deriveKeys, derivePublicKeyFromSecretKey, hashPublicKey } from '@aztec/stdlib/keys';

import { KeyStore } from './key_store.js';

/** Picks the six master secret keys out of the full `deriveKeys` output. */
function masterSecretKeysOf(derived: Awaited<ReturnType<typeof deriveKeys>>): MasterSecretKeys {
  return {
    masterNullifierHidingKey: derived.masterNullifierHidingKey,
    masterIncomingViewingSecretKey: derived.masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey: derived.masterOutgoingViewingSecretKey,
    masterTaggingSecretKey: derived.masterTaggingSecretKey,
    masterMessageSigningSecretKey: derived.masterMessageSigningSecretKey,
    masterFallbackSecretKey: derived.masterFallbackSecretKey,
  };
}

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
      `"0x0a3120bded2afb430e67e4bdb5326a673fbfd95642b6ea7f80d0cc958aac3940"`,
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
    const appAddress = AztecAddress.fromBigIntUnsafe(624n);

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
      `"0x0a3120bded2afb430e67e4bdb5326a673fbfd95642b6ea7f80d0cc958aac3940"`,
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

  it('registers an account from master secret keys, matching seed-based registration', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const sk = new Fr(8923n);
    const partialAddress = new Fr(243523n);
    const secretKeys = masterSecretKeysOf(await deriveKeys(sk));

    // Registering with the keys derived from a secret must yield the same complete address as registering with the
    // secret directly: the address is a pure function of the (derived) public keys and the partial address.
    const fromSecretKey = await keyStore.addAccount(sk, partialAddress);
    const fromKeys = await keyStore.addAccount(secretKeys, partialAddress);
    expect(fromKeys.equals(fromSecretKey)).toBe(true);
  });

  it('exports the master secret keys it was registered with', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const secretKeys = masterSecretKeysOf(await deriveKeys(new Fr(8923n)));
    const { address } = await keyStore.addAccount(secretKeys, new Fr(243523n));

    const exported = await keyStore.getAccountSecretKeys(address);
    for (const name of Object.keys(secretKeys) as (keyof MasterSecretKeys)[]) {
      expect(exported[name].equals(secretKeys[name])).toBe(true);
    }
  });

  it('rejects registering an account with a zero secret key', async () => {
    const keyStore = new KeyStore(await openTmpStore('test'));

    const secretKeys = masterSecretKeysOf(await deriveKeys(new Fr(8923n)));
    secretKeys.masterIncomingViewingSecretKey = GrumpkinScalar.ZERO;

    await expect(keyStore.addAccount(secretKeys, new Fr(243523n))).rejects.toThrow('masterIncomingViewingSecretKey');
  });
});
