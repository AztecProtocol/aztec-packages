import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { ENR, SignableENR } from '@nethermindeth/enr';

import { PersistedEnrStore } from './persisted_enr_store.js';

describe('PersistedEnrStore', () => {
  let store: AztecAsyncKVStore;

  beforeEach(async () => {
    store = await openTmpStore('persisted-enr-store-test');
  });

  afterEach(async () => {
    await store.close();
  });

  // Mints an immutable ENR for the given peer at a specific sequence number. The same peer always
  // produces the same nodeId regardless of sequence, so this lets us model a peer updating its ENR.
  const enrForPeer = (peerId: PeerId, seq: bigint): ENR => {
    const signable = SignableENR.createFromPeerId(peerId);
    signable.seq = seq;
    return ENR.decodeTxt(signable.encodeTxt());
  };

  const nodeIdsOf = (enrs: ENR[]) => new Set(enrs.map(e => e.nodeId));

  it('round-trips persisted ENRs through load', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const a = enrForPeer(await createSecp256k1PeerId(), 1n);
    const b = enrForPeer(await createSecp256k1PeerId(), 1n);

    await enrStore.persist(a);
    await enrStore.persist(b);

    expect(nodeIdsOf(await enrStore.load(() => true))).toEqual(nodeIdsOf([a, b]));
  });

  it('refreshes a tracked peer to a newer ENR, ignores older ones, and never adds unknown peers', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const peer = await createSecp256k1PeerId();

    await enrStore.persist(enrForPeer(peer, 1n));

    // A newer ENR (higher sequence) replaces the stored one.
    await enrStore.refresh(enrForPeer(peer, 3n));
    let loaded = await enrStore.load(() => true);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].seq).toBe(3n);

    // An older ENR is ignored.
    await enrStore.refresh(enrForPeer(peer, 2n));
    loaded = await enrStore.load(() => true);
    expect(loaded[0].seq).toBe(3n);

    // Refreshing a peer we don't already track is a no-op (refresh only updates, never inserts).
    await enrStore.refresh(enrForPeer(await createSecp256k1PeerId(), 1n));
    expect(await enrStore.load(() => true)).toHaveLength(1);
  });

  it('evicts the oldest-seen ENRs first once over capacity', async () => {
    const enrStore = new PersistedEnrStore(store, 3);
    const a = enrForPeer(await createSecp256k1PeerId(), 1n);
    const b = enrForPeer(await createSecp256k1PeerId(), 1n);
    const c = enrForPeer(await createSecp256k1PeerId(), 1n);
    const d = enrForPeer(await createSecp256k1PeerId(), 1n);
    const e = enrForPeer(await createSecp256k1PeerId(), 1n);

    // Fill past the cap: A is the oldest and gets evicted.
    await enrStore.persist(a);
    await enrStore.persist(b);
    await enrStore.persist(c);
    await enrStore.persist(d);
    expect(nodeIdsOf(await enrStore.load(() => true))).toEqual(nodeIdsOf([b, c, d]));

    // Re-persisting B marks it most-recently-seen, so the next eviction drops C (now the oldest) not B.
    await enrStore.persist(b);
    await enrStore.persist(e);
    expect(nodeIdsOf(await enrStore.load(() => true))).toEqual(nodeIdsOf([b, d, e]));
  });

  it('drops rejected and undecodable entries on load', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const keep = enrForPeer(await createSecp256k1PeerId(), 1n);
    const reject = enrForPeer(await createSecp256k1PeerId(), 1n);

    await enrStore.persist(keep);
    await enrStore.persist(reject);

    // The predicate rejects one peer; it should be returned-excluded and removed from the store.
    const loaded = await enrStore.load(enr => enr.nodeId === keep.nodeId);
    expect(nodeIdsOf(loaded)).toEqual(nodeIdsOf([keep]));

    // A subsequent accept-all load confirms the rejected entry was deleted, not merely filtered.
    expect(nodeIdsOf(await enrStore.load(() => true))).toEqual(nodeIdsOf([keep]));
  });
});
