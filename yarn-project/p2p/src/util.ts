import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { DataStoreConfig } from '@aztec/kv-store/config';

import type { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { generateKeyPair, marshalPrivateKey, unmarshalPrivateKey } from '@libp2p/crypto/keys';
import type { PeerId, PrivateKey } from '@libp2p/interface';
import type { ConnectionManager } from '@libp2p/interface-internal';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import { resolve } from 'dns/promises';
import type { Libp2p } from 'libp2p';

import type { P2PConfig } from './config.js';

export interface PubSubLibp2p extends Libp2p {
  services: {
    pubsub: GossipSub;
    components: {
      connectionManager: ConnectionManager;
    };
  };
}

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
  const { p2pIp, queryForIp } = config;

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
 * 2. If not, check we have a peer id private key persisted in the node
 * 3. If not, create a new one, then persist it in the node
 *
 */
export async function getPeerIdPrivateKey(
  config: { peerIdPrivateKey?: string },
  store: AztecAsyncKVStore,
): Promise<string> {
  const peerIdPrivateKeySingleton = store.openSingleton<string>('peerIdPrivateKey');
  if (config.peerIdPrivateKey) {
    await peerIdPrivateKeySingleton.set(config.peerIdPrivateKey);
    return config.peerIdPrivateKey;
  }

  const storedPeerIdPrivateKey = await peerIdPrivateKeySingleton.getAsync();
  if (storedPeerIdPrivateKey) {
    return storedPeerIdPrivateKey;
  }

  const newPeerIdPrivateKey = await generateKeyPair('secp256k1');
  const privateKeyString = Buffer.from(marshalPrivateKey(newPeerIdPrivateKey)).toString('hex');

  await peerIdPrivateKeySingleton.set(privateKeyString);
  return privateKeyString;
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
