import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { generateKeyPair, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { P2PConfig } from './config.js';
import { getPeerIdPrivateKey, privateKeyToHex } from './util.js';

const logger = createLogger('p2p-util-test');

describe('p2p utils', () => {
  // Test that peer id private key is persisted within either a file or the node store
  describe('getPeerIdPrivateKey', () => {
    let tempDir: string;
    let store: AztecAsyncKVStore;

    const readFromSingleton = async (store: AztecAsyncKVStore) => {
      const peerIdPrivateKeySingleton = store.openSingleton('peerIdPrivateKey');
      return await peerIdPrivateKeySingleton.getAsync();
    };

    beforeEach(async () => {
      store = await openTmpStore('test');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p2p-util-'));
      await fs.access(tempDir);
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('If no peer id is stored and a peer id private key file path is provided, it should create a new peer id private key and persist it to the file path', async () => {
      const peerIdPrivateKeyPath = path.join(tempDir, 'private-key');
      const config = { peerIdPrivateKeyPath } as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(peerIdPrivateKey).toBeDefined();

      const storedPeerIdPrivateKey = await fs.readFile(peerIdPrivateKeyPath, 'utf8');
      expect(storedPeerIdPrivateKey).toBe(privateKeyToHex(peerIdPrivateKey));

      // When we try again, it should read the value from the file, not generate a new one
      const peerIdPrivateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey);
      expect(peerId).toBeDefined();
    });

    it('If no peer id is stored and a peer id private key file path is not provided, it should create a new peer id private key and persist it to the data directory', async () => {
      const config = { dataDirectory: tempDir } as DataStoreConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(peerIdPrivateKey).toBeDefined();

      const storedPeerIdPrivateKey = await fs.readFile(path.join(tempDir, 'p2p-private-key'), 'utf8');
      expect(storedPeerIdPrivateKey).toBe(privateKeyToHex(peerIdPrivateKey));

      // When we try again, it should read the value from the file, not generate a new one
      const peerIdPrivateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey);
      expect(peerId).toBeDefined();
    });

    it(`If no peer id is stored and the peer id private key file path and data dir are both empty, it should create a new peer id private key and persist it to the node's store`, async () => {
      const config = {} as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(peerIdPrivateKey).toBeDefined();

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(privateKeyToHex(peerIdPrivateKey));

      // When we try again, it should read the value from the store, not generate a new one
      const peerIdPrivateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and the peer id private key file path is populated, it should use and persist that value to the file`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = Buffer.from(privateKeyToProtobuf(newPeerIdPrivateKey)).toString('hex');
      const peerIdPrivateKeyPath = path.join(tempDir, 'private-key');
      const config = {
        peerIdPrivateKeyPath,
        peerIdPrivateKey: privateKeyString,
      } as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKeyToHex(peerIdPrivateKey)).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await fs.readFile(peerIdPrivateKeyPath, 'utf8');
      expect(storedPeerIdPrivateKey).toBe(privateKeyToHex(peerIdPrivateKey));

      // Now when given an empty private key, it should read the value from the file
      const peerIdPrivateKey2 = await getPeerIdPrivateKey({ peerIdPrivateKeyPath } as P2PConfig, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey2);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and a peer id private key file path is not provided, it should use and persist that value to the data directory`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = Buffer.from(privateKeyToProtobuf(newPeerIdPrivateKey)).toString('hex');
      const config = {
        dataDirectory: tempDir,
        peerIdPrivateKey: privateKeyString,
      } as P2PConfig & DataStoreConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKeyToHex(peerIdPrivateKey)).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await fs.readFile(path.join(tempDir, 'p2p-private-key'), 'utf8');
      expect(storedPeerIdPrivateKey).toStrictEqual(privateKeyToHex(peerIdPrivateKey));

      // Now when given an empty private key, it should read the value from the file in the data directory
      const peerIdPrivateKey2 = await getPeerIdPrivateKey({ dataDirectory: tempDir } as DataStoreConfig, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey2);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and the peer id private key file path and data dir are both empty, it should use and persist that value to the node's store`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = Buffer.from(privateKeyToProtobuf(newPeerIdPrivateKey)).toString('hex');
      const config = {
        peerIdPrivateKey: privateKeyString,
      } as P2PConfig;
      const peerIdPrivateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(peerIdPrivateKey).toStrictEqual(peerIdPrivateKey);

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(privateKeyString);

      // Now when given an empty config, it should read the value from the store
      const peerIdPrivateKey2 = await getPeerIdPrivateKey({} as P2PConfig, store, logger);
      expect(peerIdPrivateKey2).toStrictEqual(peerIdPrivateKey);

      // Can recover a peer id from the private key
      const peerId = peerIdFromPrivateKey(peerIdPrivateKey2);
      expect(peerId).toBeDefined();
    });
  });
});
