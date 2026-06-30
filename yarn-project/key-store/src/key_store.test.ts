import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
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
      `"0x0a3120bded2afb430e67e4bdb5326a673fbfd95642b6ea7f80d0cc958aac3940"`,
    );

    const { pkMHash: returnedNpkMHash } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(returnedNpkMHash.equals(computedMasterNullifierPublicKeyHash)).toBe(true);

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

  // Regression guard for the IndexedDB "transaction is not active" race (F-772). The browser store shares one
  // mutable transaction across all sub-stores, and an unwrapped read could observe another sub-store's transaction
  // after it auto-committed at a task boundary. Routing reads through transactionAsync serializes them on the
  // store's queue so a read never touches a foreign transaction. We assert that serialization directly: while a
  // transaction is held open, a concurrent key read must wait for it rather than resolving immediately.
  it('serializes key reads through the store transaction queue', async () => {
    const sk = new Fr(8923n);
    const store = await openTmpStore('test');
    const keyStore = new KeyStore(store);
    const { address } = await keyStore.addAccount(sk, new Fr(243523n));
    const { masterIncomingViewingSecretKey } = await deriveKeys(sk);

    // Hold a transaction open on the store until we release the gate.
    const { promise: gate, resolve: openGate } = promiseWithResolvers<void>();
    const heldTransaction = store.transactionAsync(async () => {
      await gate;
    });

    // Issue a key read while the transaction is held.
    let readResolved = false;
    const read = keyStore.getMasterIncomingViewingSecretKey(address).then(value => {
      readResolved = true;
      return value;
    });

    // Give the read ample opportunity to resolve. It must not: it is queued behind the held transaction.
    await sleep(50);
    expect(readResolved).toBe(false);

    // Releasing the held transaction lets the queued read run and return the correct key.
    openGate();
    await heldTransaction;
    const ivsk = await read;
    expect(readResolved).toBe(true);
    expect(ivsk.equals(masterIncomingViewingSecretKey)).toBe(true);
  });
});
