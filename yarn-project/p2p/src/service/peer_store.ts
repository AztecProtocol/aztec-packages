// import type { AztecKVStore, AztecMap } from '@aztec/kv-store';
// import type { ENR } from '@chainsafe/enr';
// import { Peer, PeerQuery, PeerStore } from '@libp2p/interface';
// export interface AztecPeerStore {
//   addPeer(peerId: string, enr: ENR): Promise<void>;
//   removePeer(peerId: string): Promise<void>;
//   getPeer(peerId: string): ENR | undefined;
//   getAllPeers(): IterableIterator<ENR>;
// }
// export class AztecPeerDb implements PeerStore {
//   #peers: AztecMap<string, Peer>;
//   constructor(private db: AztecKVStore) {
//     // super()
//     this.#peers = db.openMap('p2p_peers');
//   }
//   async forEach(fn: (peer: Peer) => void): Promise<void> {
//     // this.db.
//     for await (const peer of this.#peers.values()) {
//       fn(peer);
//     }
//   }
//   async all(query?: PeerQuery): Promise<Peer[]> {
//     return this.#peers.va
//   }
//   // batch
//   // async get(key: Key): Promise<Uint8Array | undefined> {
//   //   return this.#peers.get(key.toString());
//   // }
//   // async addPeer(peerId: string, enr: ENR): Promise<void> {
//   //   void (await this.#peers.set(peerId, enr));
//   // }
//   // async removePeer(peerId: string): Promise<void> {
//   //   void (await this.#peers.delete(peerId));
//   // }
//   // getPeer(peerId: string): ENR | undefined {
//   //   return this.#peers.get(peerId);
//   // }
//   // *getAllPeers(): IterableIterator<ENR> {
//   //   for (const enr of this.#peers.values()) {
//   //     yield enr;
//   //   }
//   // }
// }
import type { AztecKVStore, AztecMap } from '@aztec/kv-store';

import type { ENR } from '@chainsafe/enr';

export interface AztecPeerStore {
  addPeer(peerId: string, enr: ENR): Promise<void>;
  removePeer(peerId: string): Promise<void>;
  getPeer(peerId: string): ENR | undefined;
  getAllPeers(): IterableIterator<ENR>;
}

export class AztecPeerDb implements AztecPeerStore {
  #peers: AztecMap<string, ENR>;

  constructor(private db: AztecKVStore) {
    this.#peers = db.openMap('p2p_peers');
  }

  async addPeer(peerId: string, enr: ENR): Promise<void> {
    void (await this.#peers.set(peerId, enr));
  }

  async removePeer(peerId: string): Promise<void> {
    void (await this.#peers.delete(peerId));
  }

  getPeer(peerId: string): ENR | undefined {
    return this.#peers.get(peerId);
  }

  *getAllPeers(): IterableIterator<ENR> {
    for (const enr of this.#peers.values()) {
      yield enr;
    }
  }
}
