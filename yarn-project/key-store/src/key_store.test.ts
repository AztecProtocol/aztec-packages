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
    const derivedMasterNullifierPublicKey = await derivePublicKeyFromSecretKey(keys.masterNullifierSecretKey);
    const computedMasterNullifierPublicKeyHash = await derivedMasterNullifierPublicKey.hash();

    const partialAddress = new Fr(243523n);

    const { address: accountAddress } = await keyStore.addAccount(sk, partialAddress);
    expect(accountAddress.toString()).toMatchInlineSnapshot(
      `"0x16ec29dfd1664beb246b4b4e1cbe52ce196643ce636258e5c1d88d2717432c90"`,
    );

    const { pkM: masterNullifierPublicKey } = await keyStore.getKeyValidationRequest(
      computedMasterNullifierPublicKeyHash,
      await AztecAddress.random(), // Address is random because we are not interested in the app secret key here
    );
    expect(masterNullifierPublicKey.toString()).toMatchInlineSnapshot(
      `"0x070f06be8318a978ee6175e194c55e3f1f2826b477bcfc60f918cae9b63245571dea9944f3701b900ea00df0736f246c701007b2ec7e3d5714c94d2efa69389f"`,
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

    const { pkM: obtainedMasterNullifierPublicKey, skApp: appNullifierSecretKey } =
      await keyStore.getKeyValidationRequest(computedMasterNullifierPublicKeyHash, appAddress);
    expect(appNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x16ef80df9a29f7a4cb34d6deaaaa5cc48f7b3a0356d46148a18fdddfd157ab0e"`,
    );
    expect(obtainedMasterNullifierPublicKey).toEqual(masterNullifierPublicKey);

    const appOutgoingViewingSecretKey = await keyStore.getAppOutgoingViewingSecretKey(accountAddress, appAddress);
    expect(appOutgoingViewingSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1329a2ba3e38f72c8d7af23ccd06470e8c3b89307ae4eb947854b43f779af833"`,
    );

    // Returned accounts are as expected
    const accounts = await keyStore.getAccounts();
    expect(accounts.toString()).toMatchInlineSnapshot(
      `"0x16ec29dfd1664beb246b4b4e1cbe52ce196643ce636258e5c1d88d2717432c90"`,
    );

    // Manages to find master nullifer secret key for pub key
    const masterNullifierSecretKey = await keyStore.getMasterSecretKey(masterNullifierPublicKey);
    expect(masterNullifierSecretKey.toString()).toMatchInlineSnapshot(
      `"0x1a50a594f2fea5e38eb0563467862c4826711d9226f7be20951ec265347cba81"`,
    );

    // Manages to find master incoming viewing secret key for pub key
    const masterIncomingViewingSecretKeyFromPublicKey =
      await keyStore.getMasterSecretKey(masterIncomingViewingPublicKey);
    expect(masterIncomingViewingSecretKeyFromPublicKey.toString()).toMatchInlineSnapshot(
      `"0x0a57d767ba58dfd3c3deb4f96b0c30b051401bc5bd4e8b01ffca40754f45d40f"`,
    );
  });
});
