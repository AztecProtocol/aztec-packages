import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { BlockAttestation } from '../p2p/block_attestation.js';
import { Tx } from '../tx/tx.js';
import { type P2PApi, P2PApiSchema, type PeerInfo } from './p2p.js';

describe('P2PApiSchema', () => {
  let handler: MockP2P;
  let context: JsonRpcTestContext<P2PApi>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockP2P();
    context = await createJsonRpcTestSetup<P2PApi>(handler, P2PApiSchema);
  });

  afterEach(() => {
    tested.add(/^P2PApiSchema\s+([^(]+)/.exec(expect.getState().currentTestName!)![1]);
    context.httpServer.close();
  });

  afterAll(() => {
    const all = Object.keys(P2PApiSchema);
    expect([...tested].sort()).toEqual(all.sort());
  });

  it('getAttestationsForSlot', async () => {
    const attestations = await context.client.getAttestationsForSlot(BigInt(1), 'proposalId');
    expect(attestations).toEqual([BlockAttestation.empty()]);
    expect(attestations[0]).toBeInstanceOf(BlockAttestation);
  });

  it('getPendingTxs', async () => {
    const txs = await context.client.getPendingTxs();
    expect(txs[0]).toBeInstanceOf(Tx);
  });

  it('getPendingTxCount', async () => {
    const txs = await context.client.getPendingTxCount();
    expect(txs).toEqual(10);
  });

  it('getEncodedEnr', async () => {
    const enr = await context.client.getEncodedEnr();
    expect(enr).toEqual('enr');
  });

  it('getPeers', async () => {
    const peers = await context.client.getPeers();
    expect(peers).toEqual(peers);
  });

  it('getPeers(true)', async () => {
    const peers = await context.client.getPeers(true);
    expect(peers).toEqual(peers);
  });

  it('addAttestation', async () => {
    const attestation = BlockAttestation.empty();
    await context.client.addAttestation(attestation);
  });
});

const peers: PeerInfo[] = [
  { status: 'connected', score: 1, id: 'id' },
  { status: 'dialing', dialStatus: 'dialStatus', id: 'id', addresses: ['address'] },
  { status: 'cached', id: 'id', addresses: ['address'], enr: 'enr', dialAttempts: 1 },
];

class MockP2P implements P2PApi {
  getAttestationsForSlot(slot: bigint, proposalId?: string): Promise<BlockAttestation[]> {
    expect(slot).toEqual(1n);
    expect(proposalId).toEqual('proposalId');
    return Promise.resolve([BlockAttestation.empty()]);
  }

  getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve([Tx.random()]);
  }

  getPendingTxCount(): Promise<number> {
    return Promise.resolve(10);
  }

  getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve('enr');
  }

  getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    expect(includePending === undefined || includePending === true).toBeTruthy();
    return Promise.resolve(peers);
  }

  addAttestation(attestation: BlockAttestation): Promise<void> {
    expect(attestation).toBeInstanceOf(BlockAttestation);
    return Promise.resolve();
  }
}
