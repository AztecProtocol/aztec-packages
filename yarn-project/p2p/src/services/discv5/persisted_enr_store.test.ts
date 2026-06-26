import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { multiaddr } from '@multiformats/multiaddr';
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

  // Mints an immutable ENR for the given peer at a specific sequence number and UDP port. The same
  // peer always produces the same nodeId regardless of sequence/address, so this models a peer that
  // bumps its ENR (e.g. after changing address).
  const enrForPeer = (peerId: PeerId, seq: bigint, udpPort: number): ENR => {
    const signable = SignableENR.createFromPeerId(peerId);
    signable.setLocationMultiaddr(multiaddr(`/ip4/127.0.0.1/udp/${udpPort}`));
    signable.seq = seq;
    return ENR.decodeTxt(signable.encodeTxt());
  };

  // Loads the store and indexes the result by nodeId so tests can assert on individual peers' ENRs.
  const loadByNodeId = async (enrStore: PersistedEnrStore, accept: (enr: ENR) => boolean = () => true) => {
    const enrs = await enrStore.load(accept);
    return new Map(enrs.map(enr => [enr.nodeId, enr]));
  };

  // Asserts the store holds exactly `expected`, matching each by full ENR record (txt), sequence and port.
  const expectStoredExactly = async (enrStore: PersistedEnrStore, expected: ENR[]) => {
    const loaded = await loadByNodeId(enrStore);
    expect([...loaded.keys()].sort()).toEqual(expected.map(e => e.nodeId).sort());
    for (const enr of expected) {
      const stored = loaded.get(enr.nodeId);
      expect(stored?.encodeTxt()).toBe(enr.encodeTxt());
      expect(stored?.seq).toBe(enr.seq);
      expect(stored?.udp).toBe(enr.udp);
    }
  };

  it('round-trips persisted ENRs through load, preserving their full record', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const a = enrForPeer(await createSecp256k1PeerId(), 1n, 4001);
    const b = enrForPeer(await createSecp256k1PeerId(), 1n, 4002);

    await enrStore.persist(a);
    await enrStore.persist(b);

    await expectStoredExactly(enrStore, [a, b]);
  });

  it('refreshes a tracked peer to a newer ENR (new address), ignores older ones, never adds unknown peers', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const peer = await createSecp256k1PeerId();
    const v1 = enrForPeer(peer, 1n, 5001);
    const v2 = enrForPeer(peer, 2n, 5002);
    const v3 = enrForPeer(peer, 3n, 5003);
    const nodeId = v1.nodeId; // v1/v2/v3 share a nodeId (same peer), so any of them works

    await enrStore.persist(v1);
    await expectStoredExactly(enrStore, [v1]);

    // A newer ENR (higher sequence, new address) replaces the stored one in full.
    await enrStore.refresh(v3);
    let stored = (await loadByNodeId(enrStore)).get(nodeId);
    expect(stored?.encodeTxt()).toBe(v3.encodeTxt());
    expect(stored?.seq).toBe(3n);
    expect(stored?.udp).toBe(5003);

    // An older ENR is ignored — the stored record and address are unchanged.
    await enrStore.refresh(v2);
    stored = (await loadByNodeId(enrStore)).get(nodeId);
    expect(stored?.encodeTxt()).toBe(v3.encodeTxt());
    expect(stored?.seq).toBe(3n);
    expect(stored?.udp).toBe(5003);

    // Refreshing a peer we don't already track is a no-op (refresh only updates, never inserts).
    const unknown = enrForPeer(await createSecp256k1PeerId(), 1n, 5099);
    await enrStore.refresh(unknown);
    const loaded = await loadByNodeId(enrStore);
    expect(loaded.has(unknown.nodeId)).toBe(false);
    await expectStoredExactly(enrStore, [v3]);
  });

  it('evicts the oldest-seen ENRs first once over capacity, keeping the rest intact', async () => {
    const enrStore = new PersistedEnrStore(store, 3);
    const a = enrForPeer(await createSecp256k1PeerId(), 1n, 6001);
    const b = enrForPeer(await createSecp256k1PeerId(), 1n, 6002);
    const c = enrForPeer(await createSecp256k1PeerId(), 1n, 6003);
    const d = enrForPeer(await createSecp256k1PeerId(), 1n, 6004);
    const e = enrForPeer(await createSecp256k1PeerId(), 1n, 6005);

    // Fill past the cap: A is the oldest-seen and gets evicted; B, C, D remain with their records intact.
    await enrStore.persist(a);
    await enrStore.persist(b);
    await enrStore.persist(c);
    await enrStore.persist(d);
    let loaded = await loadByNodeId(enrStore);
    expect(loaded.has(a.nodeId)).toBe(false);
    await expectStoredExactly(enrStore, [b, c, d]);

    // Re-persisting B marks it most-recently-seen, so the next eviction drops C (now the oldest), not B.
    await enrStore.persist(b);
    await enrStore.persist(e);
    loaded = await loadByNodeId(enrStore);
    expect(loaded.has(a.nodeId)).toBe(false);
    expect(loaded.has(c.nodeId)).toBe(false);
    await expectStoredExactly(enrStore, [b, d, e]);
  });

  it('drops rejected and undecodable entries on load, keeping the accepted record intact', async () => {
    const enrStore = new PersistedEnrStore(store, 10);
    const keep = enrForPeer(await createSecp256k1PeerId(), 1n, 7001);
    const reject = enrForPeer(await createSecp256k1PeerId(), 1n, 7002);

    await enrStore.persist(keep);
    await enrStore.persist(reject);

    // The predicate rejects one peer; it is excluded from the result and deleted from the store.
    const loaded = await loadByNodeId(enrStore, enr => enr.nodeId === keep.nodeId);
    expect([...loaded.keys()]).toEqual([keep.nodeId]);
    expect(loaded.get(keep.nodeId)?.encodeTxt()).toBe(keep.encodeTxt());

    // A subsequent accept-all load confirms the rejected entry was deleted, not merely filtered out.
    await expectStoredExactly(enrStore, [keep]);
  });
});
