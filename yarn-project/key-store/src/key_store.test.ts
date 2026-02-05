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
      `"0x0524874045d59753763a315d02910a5ecce0fc36955f174c39a2b6274940d3dc"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x071c69785123d87f750ef7ee094862f4c3cc80ffe8a0aaed4c00ea3f16cb16a413d525e648aa0b2e23169d1764988cf4977842290e7bb47c27cf49b18c5f71df"`,
    );

    const masterIncomingViewingPublicKey = await keyStore.getMasterIncomingViewingPublicKey(accountAddress);
    expect(masterIncomingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x287057dc27511b89cf59d836c62a4b807fe781a3a055885a04cfa3c1e9de0aeb14c46440ee0d56d6d20cc4b41a5641177b9e6771f8d9c32a782e5150c70d2572"`,
    );

    const masterOutgoingViewingPublicKey = await keyStore.getMasterOutgoingViewingPublicKey(accountAddress);
    expect(masterOutgoingViewingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x1dca347bddbf9393477b9025933aad7d662247de5b8dfb626092b947f793aec02b8564965efcd0dd44b82df466d7d00f66a6ce151fa4ff1bc30d7720f7214c27"`,
    );

    const masterTaggingPublicKey = await keyStore.getMasterTaggingPublicKey(accountAddress);
    expect(masterTaggingPublicKey.toString()).toMatchInlineSnapshot(
      `"0x2ce7747ea2e81c17d7477bc35054e1925b8430e640871583b1b751d27753d8281047d83b66b62263ed483d02545d97551f13f3eafc4e4b88eb265bdf3e288bb1"`,
    );

    const masterIncomingViewingSecretKey = await keyStore.getMasterIncomingViewingSecretKey(accountAddress);
    expect(masterIncomingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x0a57d767ba58dfd3c3deb4f96b0c30b051401bc5bd4e8b01ffca40754f45d40f"`,
    );

    // Arbitrary app contract address
    const appAddress = AztecAddress.fromBigInt(624n);

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierHidingKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x2224595adef73358c40640c1bcd194e91e3116d4d2eb6c9ac1c2b13a6ee12941"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1329a2ba3e38f72c8d7af23ccd06470e8c3b89307ae4eb947854b43f779af833"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x0524874045d59753763a315d02910a5ecce0fc36955f174c39a2b6274940d3dc"`,
    );

    // Manages to find master nullifier hiding key for pub key
    const masterNullifierHidingKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierHidingKey.toString()).toMatchInlineSnapshot(
      `"0x16259779b6c6231c88cd09d6ddc5afd97ee8868e9a4aea1cfb930fee185d53c0"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKeyFromPublicKey =
      await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKeyFromPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0a57d767ba58dfd3c3deb4f96b0c30b051401bc5bd4e8b01ffca40754f45d40f"`,
    );
  });
});
