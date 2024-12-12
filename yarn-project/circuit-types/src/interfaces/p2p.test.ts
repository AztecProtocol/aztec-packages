import { type JsonRpcTestContext, createJsonRpcTestSetup } from '@aztec/foundation/json-rpc/test';

import { BlockAttestation } from '../p2p/block_attestation.js';
import { type P2PClientType } from '../p2p/client_type.js';
import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
import { Tx } from '../tx/tx.js';
import { type P2PApi, P2PApiSchema, type PeerInfo } from './p2p.js';

describe('P2PApiSchema', () => {
  let handler: MockP2P;
  let context: JsonRpcTestContext<P2PApi<P2PClientType.Full>>;

  const tested = new Set<string>();

  beforeEach(async () => {
    handler = new MockP2P();
    context = await createJsonRpcTestSetup<P2PApi<P2PClientType.Full>>(handler, P2PApiSchema);
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

  it('getEpochProofQuotes', async () => {
    const quotes = await context.client.getEpochProofQuotes(BigInt(1));
    expect(quotes).toEqual([EpochProofQuote.empty()]);
    expect(quotes[0]).toBeInstanceOf(EpochProofQuote);
  });

  it('getPendingTxs', async () => {
    const txs = await context.client.getPendingTxs();
    expect(txs[0]).toBeInstanceOf(Tx);
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
});

const peers: PeerInfo[] = [
  { status: 'connected', score: 1, id: 'id' },
  { status: 'dialing', dialStatus: 'dialStatus', id: 'id', addresses: ['address'] },
  { status: 'cached', id: 'id', addresses: ['address'], enr: 'enr', dialAttempts: 1 },
];

class MockP2P implements P2PApi<P2PClientType.Full> {
  getAttestationsForSlot(slot: bigint, proposalId?: string | undefined): Promise<BlockAttestation[]> {
    expect(slot).toEqual(1n);
    expect(proposalId).toEqual('proposalId');
    return Promise.resolve([BlockAttestation.empty()]);
  }
  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]> {
    expect(epoch).toEqual(1n);
    return Promise.resolve([EpochProofQuote.empty()]);
  }
  getPendingTxs(): Promise<Tx[]> {
    return Promise.resolve([Tx.random()]);
  }
  getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve('enr');
  }
  getPeers(includePending?: boolean): Promise<PeerInfo[]> {
    expect(includePending === undefined || includePending === true).toBeTruthy();
    return Promise.resolve(peers);
  }
}
