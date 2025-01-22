import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { generateKeyPair, marshalPrivateKey } from '@libp2p/crypto/keys';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';

import { type P2PConfig } from './config.js';
import { createLibP2PPeerIdFromPrivateKey, getPeerIdPrivateKey } from './util.js';

describe('p2p utils', () => {
  // Test that peer id private key is persisted within the node store
  describe('getPeerIdPrivateKey', () => {
    it('Can create a recovered libp2p peer id from a private key', async () => {
      const peerId = await createSecp256k1PeerId();
      const privKey = peerId.privateKey!;
      const privateKeyString = Buffer.from(privKey).toString('hex');

      const reconstructedPeerId = await createLibP2PPeerIdFromPrivateKey(privateKeyString);
      expect(reconstructedPeerId.publicKey).toEqual(peerId.publicKey);
    });

    const readFromSingleton = async (store: AztecKVStore) => {
      const peerIdPrivateKeySingleton = store.openSingleton('peerIdPrivateKey');
      return await peerIdPrivateKeySingleton.get();
    };

    it('If nothing is provided, it should create a new peer id private key, and persist it', async () => {
      const store = openTmpStore();

      const config = {} as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);

      expect(peerIdPrivateKey).toBeDefined();

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(peerIdPrivateKey);

      // When we try again, it should read the value from the store, not generate a new one
      const peerIdPrivateKey2 = await getPeerIdPrivateKey(config, store);
      expect(peerIdPrivateKey2).toBe(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey);
      expect(peerId).toBeDefined();
    });

    it('If a value is provided in the config, it should use and persist that value', async () => {
      const store = openTmpStore();

      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = Buffer.from(marshalPrivateKey(newPeerIdPrivateKey)).toString('hex');
      const config = {
        peerIdPrivateKey: privateKeyString,
      } as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);

      expect(peerIdPrivateKey).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(privateKeyString);

      // Now when given an empty config, it should read the value from the store
      const peerIdPrivateKey2 = await getPeerIdPrivateKey({} as P2PConfig, store);
      expect(peerIdPrivateKey2).toBe(privateKeyString);

      // Can recover a peer id from the private key
      const peerId = await createLibP2PPeerIdFromPrivateKey(peerIdPrivateKey2);
      expect(peerId).toBeDefined();
    });
  });
});
