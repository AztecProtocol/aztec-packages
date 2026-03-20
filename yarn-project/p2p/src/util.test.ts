import { SecretValue } from '@aztec/foundation/config';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { generateKeyPair } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import type { P2PConfig } from './config.js';
import { getPeerIdPrivateKey, isValidIpAddress, privateKeyFromHex, privateKeyToHex } from './util.js';

const logger = createLogger('p2p-util-test');

describe('p2p utils', () => {
  describe('privateKeyFromHex / privateKeyToHex round-trip', () => {
    it('Can round-trip a private key through hex encoding', async () => {
      const libp2pPrivateKey = await generateKeyPair('secp256k1');
      const peerId = peerIdFromPrivateKey(libp2pPrivateKey);
      const hex = privateKeyToHex(libp2pPrivateKey);

      const recovered = privateKeyFromHex(hex);
      const recoveredPeerId = peerIdFromPrivateKey(recovered);
      expect(recoveredPeerId.toString()).toEqual(peerId.toString());
    });
  });

  // Test that peer id private key is persisted within either a file or the node store
  describe('getPeerIdPrivateKey', () => {
    let tempDir: string;
    let store: AztecAsyncKVStore;

    const readFromSingleton = async (store: AztecAsyncKVStore) => {
      const peerIdPrivateKeySingleton = store.openSingleton<string>('peerIdPrivateKey');
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
      const privateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKey).toBeDefined();
      const hex = privateKeyToHex(privateKey);

      const storedPeerIdPrivateKey = await fs.readFile(peerIdPrivateKeyPath, 'utf8');
      expect(storedPeerIdPrivateKey).toBe(hex);

      // When we try again, it should read the value from the file, not generate a new one
      const privateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(hex);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey);
      expect(peerId).toBeDefined();
    });

    it('If no peer id is stored and a peer id private key file path is not provided, it should create a new peer id private key and persist it to the data directory', async () => {
      const config = { dataDirectory: tempDir } as DataStoreConfig;
      const privateKey = await getPeerIdPrivateKey(config, store, logger);
      const hex = privateKeyToHex(privateKey);

      expect(hex).toBeDefined();

      const storedPeerIdPrivateKey = await fs.readFile(path.join(tempDir, 'p2p-private-key'), 'utf8');
      expect(storedPeerIdPrivateKey).toBe(hex);

      // When we try again, it should read the value from the file, not generate a new one
      const privateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(hex);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey);
      expect(peerId).toBeDefined();
    });

    it(`If no peer id is stored and the peer id private key file path and data dir are both empty, it should create a new peer id private key and persist it to the node's store`, async () => {
      const config = {} as P2PConfig;
      const privateKey = await getPeerIdPrivateKey(config, store, logger);
      const hex = privateKeyToHex(privateKey);

      expect(hex).toBeDefined();

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(hex);

      // When we try again, it should read the value from the store, not generate a new one
      const privateKey2 = await getPeerIdPrivateKey(config, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(hex);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and the peer id private key file path is populated, it should use and persist that value to the file`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = privateKeyToHex(newPeerIdPrivateKey);
      const peerIdPrivateKeyPath = path.join(tempDir, 'private-key');
      const config = {
        peerIdPrivateKeyPath,
        peerIdPrivateKey: new SecretValue(privateKeyString),
      } as P2PConfig;
      const privateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKeyToHex(privateKey)).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await fs.readFile(peerIdPrivateKeyPath, 'utf8');
      expect(storedPeerIdPrivateKey).toBe(privateKeyString);

      // Now when given an empty private key, it should read the value from the file
      const privateKey2 = await getPeerIdPrivateKey({ peerIdPrivateKeyPath } as P2PConfig, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(privateKeyString);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey2);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and a peer id private key file path is not provided, it should use and persist that value to the data directory`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = privateKeyToHex(newPeerIdPrivateKey);
      const config = {
        dataDirectory: tempDir,
        peerIdPrivateKey: new SecretValue(privateKeyString),
      } as P2PConfig & DataStoreConfig;
      const privateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKeyToHex(privateKey)).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await fs.readFile(path.join(tempDir, 'p2p-private-key'), 'utf8');
      expect(storedPeerIdPrivateKey).toBe(privateKeyString);

      // Now when given an empty private key, it should read the value from the file in the data directory
      const privateKey2 = await getPeerIdPrivateKey({ dataDirectory: tempDir } as DataStoreConfig, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(privateKeyString);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey2);
      expect(peerId).toBeDefined();
    });

    it(`If a private key is provided in the config and the peer id private key file path and data dir are both empty, it should use and persist that value to the node's store`, async () => {
      const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
      const privateKeyString = privateKeyToHex(newPeerIdPrivateKey);
      const config = {
        peerIdPrivateKey: new SecretValue(privateKeyString),
      } as P2PConfig;
      const privateKey = await getPeerIdPrivateKey(config, store, logger);

      expect(privateKeyToHex(privateKey)).toBe(privateKeyString);

      const storedPeerIdPrivateKey = await readFromSingleton(store);
      expect(storedPeerIdPrivateKey).toBe(privateKeyString);

      // Now when given an empty config, it should read the value from the store
      const privateKey2 = await getPeerIdPrivateKey({} as P2PConfig, store, logger);
      expect(privateKeyToHex(privateKey2)).toBe(privateKeyString);

      // Can derive a peer id from the private key
      const peerId = peerIdFromPrivateKey(privateKey2);
      expect(peerId).toBeDefined();
    });
  });

  describe('isValidIpAddress', () => {
    it('Determines if IP address is valid', () => {
      expect(isValidIpAddress('127.0.0.1')).toBe(true);
      expect(isValidIpAddress('192.168.0.1')).toBe(true);
      expect(isValidIpAddress('10.0.0.255')).toBe(true);
      expect(isValidIpAddress('255.255.255.255')).toBe(true);
      expect(isValidIpAddress('0.0.0.0')).toBe(true);

      // No IP v6 support
      expect(isValidIpAddress('::1')).toBe(false);
      expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(false);
      expect(isValidIpAddress('2001:db8::1')).toBe(false);
      expect(isValidIpAddress('fe80::1ff:fe23:4567:890a')).toBe(false);
      expect(isValidIpAddress('::')).toBe(false);

      expect(isValidIpAddress('256.256.256.256')).toBe(false);
      expect(isValidIpAddress('192.168.1')).toBe(false);
      expect(isValidIpAddress('192.168.1.1.1')).toBe(false);
      expect(isValidIpAddress('192.168.1.-1')).toBe(false);
      expect(isValidIpAddress('192.168.01.1')).toBe(false);
      expect(isValidIpAddress('999.999.999.999')).toBe(false);
      expect(isValidIpAddress('abc.def.gha.bcd')).toBe(false);
      expect(isValidIpAddress('')).toBe(false);
      expect(isValidIpAddress(' ')).toBe(false);
      expect(isValidIpAddress('127.0.0.1 ')).toBe(false);

      expect(isValidIpAddress('2001:::1')).toBe(false);
      expect(isValidIpAddress('2001:db8:85a3::8a2e:37023:7334')).toBe(false);
      expect(isValidIpAddress('2001:db8:::1')).toBe(false);
      expect(isValidIpAddress('ghij::1234')).toBe(false);
      expect(isValidIpAddress('12345::')).toBe(false);
      expect(isValidIpAddress('::1::')).toBe(false);
      expect(isValidIpAddress('::ffff:192.168.1.256')).toBe(false);
      expect(isValidIpAddress('abcd')).toBe(false);
    });
  });
});
