import { AztecKVStore, AztecMap } from '@aztec/kv-store';

import { ENR } from '@chainsafe/enr';

export interface AztecPeerStore {
  addPeer(peerId: string, enr: ENR): Promise<boolean>;
  removePeer(peerId: string): Promise<boolean>;
  getPeer(peerId: string): ENR | undefined;
  getAllPeers(): IterableIterator<ENR>;
}

export class AztecPeerDb implements AztecPeerStore {
  #peers: AztecMap<string, ENR>;

  constructor(private db: AztecKVStore) {
    this.#peers = db.openMap('p2p_peers');
  }

  addPeer(peerId: string, enr: ENR): Promise<boolean> {
    return this.#peers.set(peerId, enr);
  }

  removePeer(peerId: string): Promise<boolean> {
    return this.#peers.delete(peerId);
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
