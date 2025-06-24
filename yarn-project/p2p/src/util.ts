import { SecretValue } from '@aztec/foundation/config';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';

import type { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { generateKeyPair, marshalPrivateKey, unmarshalPrivateKey } from '@libp2p/crypto/keys';
import type { Identify } from '@libp2p/identify';
import type { PeerId, PrivateKey } from '@libp2p/interface';
import type { ConnectionManager } from '@libp2p/interface-internal';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import { resolve } from 'dns/promises';
import { promises as fs } from 'fs';
import type { Libp2p } from 'libp2p';
import path from 'path';

import type { P2PConfig } from './config.js';

const PEER_ID_DATA_DIR_FILE = 'p2p-private-key';

export interface PubSubLibp2p extends Pick<Libp2p, 'status' | 'start' | 'stop' | 'peerId'> {
  services: {
    pubsub: Pick<
      GossipSub,
      'addEventListener' | 'removeEventListener' | 'publish' | 'subscribe' | 'reportMessageValidationResult'
    > & { score: Pick<GossipSub['score'], 'score'> };
  };
}

export type FullLibp2p = Libp2p<{
  identify: Identify;
  pubsub: GossipSub;
  components: {
    connectionManager: ConnectionManager;
  };
}>;

/**
 * Converts an address string to a multiaddr string.
 * Example usage:
 * const tcpAddr = '123.456.7.8:80' -> /ip4/123.456.7.8/tcp/80
 * const udpAddr = '[2001:db8::1]:8080' -> /ip6/2001:db8::1/udp/8080
 * @param address - The address string to convert. Has to be in the format <addr>:<port>.
 * @param protocol - The protocol to use in the multiaddr string.
 * @returns A multiaddr compliant string.  */
export function convertToMultiaddr(address: string, port: number, protocol: 'tcp' | 'udp'): string {
  const multiaddrPrefix = addressToMultiAddressType(address);
  if (multiaddrPrefix === 'dns') {
    throw new Error('Invalid address format. Expected an IPv4 or IPv6 address.');
  }

  return `/${multiaddrPrefix}/${address}/${protocol}/${port}`;
}

/**
 * Queries the public IP address of the machine.
 */
export async function getPublicIp(): Promise<string> {
  const resp = await fetch('http://checkip.amazonaws.com/');
  const text = await resp.text();
  return text.trim();
}

export async function resolveAddressIfNecessary(address: string, port: string): Promise<string> {
  const multiaddrPrefix = addressToMultiAddressType(address);
  if (multiaddrPrefix === 'dns') {
    const resolvedAddresses = await resolve(address);
    if (resolvedAddresses.length === 0) {
      throw new Error(`Could not resolve address: ${address}`);
    }
    return `${resolvedAddresses[0]}:${port}`;
  } else {
    return address;
  }
}

// Not public because it is not used outside of this file.
// Plus, it relies on `splitAddressPort` being called on the address first.
function addressToMultiAddressType(address: string): 'ip4' | 'ip6' | 'dns' {
  if (address.includes(':')) {
    return 'ip6';
  } else if (address.match(/^[\d.]+$/)) {
    return 'ip4';
  } else {
    return 'dns';
  }
}

export async function configureP2PClientAddresses(
  _config: P2PConfig & DataStoreConfig,
): Promise<P2PConfig & DataStoreConfig> {
  const config = { ..._config };
  const { p2pIp, queryForIp, p2pBroadcastPort, p2pPort } = config;

  // If no broadcast port is provided, use the given p2p port as the broadcast port
  if (!p2pBroadcastPort) {
    config.p2pBroadcastPort = p2pPort;
  }

  // check if no announce IP was provided
  if (!p2pIp) {
    if (queryForIp) {
      const publicIp = await getPublicIp();
      config.p2pIp = publicIp;
    }
  }
  // TODO(md): guard against setting a local ip address as the announce ip

  return config;
}

/**
 * Get the peer id private key
 *
 * 1. Check if we have a peer id private key in the config
 * 2. If not, check if we have a peer id private key persisted in a file
 * 3. If no file path or data directory is provided, check if we have a peer id private key in the node's store
 * 4. If not, create a new one, then persist it in a file if a file path or data directory is provided or in the node's store otherwise
 *
 */
export async function getPeerIdPrivateKey(
  config: { peerIdPrivateKey?: SecretValue<string>; peerIdPrivateKeyPath?: string; dataDirectory?: string },
  store: AztecAsyncKVStore,
  logger: Logger,
): Promise<SecretValue<string>> {
  const peerIdPrivateKeyFilePath =
    config.peerIdPrivateKeyPath ??
    (config.dataDirectory ? path.join(config.dataDirectory, PEER_ID_DATA_DIR_FILE) : undefined);
  let peerIdPrivateKeySingleton: AztecAsyncSingleton<string> | undefined;

  const writePrivateKeyToFile = async (filePath: string, privateKey: string) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, privateKey);
  };

  // If the peerIdPrivateKey is provided in the config, we use it and persist it in either a file or the node's store
  if (config.peerIdPrivateKey) {
    if (peerIdPrivateKeyFilePath) {
      await writePrivateKeyToFile(peerIdPrivateKeyFilePath, config.peerIdPrivateKey.getValue());
    } else {
      peerIdPrivateKeySingleton = store.openSingleton<string>('peerIdPrivateKey');
      await peerIdPrivateKeySingleton.set(config.peerIdPrivateKey.getValue());
    }
    return config.peerIdPrivateKey;
  }

  // Check to see if we have a peer id private key stored in a file or the node's store
  let storedPeerIdPrivateKey: string | undefined;
  const privateKeyFileExists =
    peerIdPrivateKeyFilePath &&
    (await fs
      .access(peerIdPrivateKeyFilePath)
      .then(() => true)
      .catch(() => false));
  if (peerIdPrivateKeyFilePath && privateKeyFileExists) {
    await fs.access(peerIdPrivateKeyFilePath);
    storedPeerIdPrivateKey = await fs.readFile(peerIdPrivateKeyFilePath, 'utf8');
  } else {
    peerIdPrivateKeySingleton = store.openSingleton<string>('peerIdPrivateKey');
    storedPeerIdPrivateKey = await peerIdPrivateKeySingleton.getAsync();
  }
  if (storedPeerIdPrivateKey) {
    if (peerIdPrivateKeyFilePath && !privateKeyFileExists) {
      logger.verbose(`Peer ID private key found in the node's store, persisting it to ${peerIdPrivateKeyFilePath}`);
      await writePrivateKeyToFile(peerIdPrivateKeyFilePath, storedPeerIdPrivateKey);
    }
    return new SecretValue(storedPeerIdPrivateKey);
  }

  // Generate and persist a new private key
  const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
  const privateKeyString = Buffer.from(marshalPrivateKey(newPeerIdPrivateKey)).toString('hex');
  if (peerIdPrivateKeyFilePath) {
    logger.verbose(`Creating new peer ID private key and persisting it to ${peerIdPrivateKeyFilePath}`);
    await writePrivateKeyToFile(peerIdPrivateKeyFilePath, privateKeyString);
  } else {
    logger.warn(
      'Creating new peer ID private key and persisting it to the lmdb store. Key will be lost on rollup upgrade, specify the peer id private key path and restart the node to persist the peer id private key to a file',
    );
    await peerIdPrivateKeySingleton!.set(privateKeyString);
  }

  return new SecretValue(privateKeyString);
}

/**
 * Create a libp2p peer ID from the private key.
 * @param privateKey - peer ID private key as hex string
 * @returns The peer ID.
 */
export async function createLibP2PPeerIdFromPrivateKey(privateKey: string): Promise<PeerId> {
  if (!privateKey?.length) {
    throw new Error('No peer private key provided');
  }

  const asLibp2pPrivateKey: PrivateKey<'secp256k1'> = await unmarshalPrivateKey(
    new Uint8Array(Buffer.from(privateKey, 'hex')),
  );
  return await createFromPrivKey(asLibp2pPrivateKey);
}
