import { sleep } from '@aztec/foundation/sleep';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { Tx, TxArray, TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import {
  MOCK_SUB_PROTOCOL_HANDLERS,
  type ReqRespNode,
  connectToPeers,
  createNodes,
  startNodes,
  stopNodes,
} from '../../test-helpers/reqresp-nodes.js';
import type { PeerManager } from '../peer-manager/peer_manager.js';
import type { PeerScoring } from '../peer-manager/peer_scoring.js';
import { type ReqRespResponse, ReqRespSubProtocol } from './interface.js';
import { GoodByeReason, reqGoodbyeHandler } from './protocols/goodbye.js';
import { ReqRespStatus } from './status.js';

const PING_REQUEST = Buffer.from('ping');

// The Req Resp protocol should allow nodes to dial specific peers
// and ask for specific data that they missed via the traditional gossip protocol.
describe('ReqResp', () => {
  let peerManager: MockProxy<PeerManager>;
  let peerScoring: MockProxy<PeerScoring>;
  let nodes: ReqRespNode[];

  beforeEach(() => {
    peerScoring = mock<PeerScoring>();
    peerManager = mock<PeerManager>();
  });

  afterEach(async () => {
    if (nodes) {
      await stopNodes(nodes);
    }
  });

  it('should perform a ping request', async () => {
    // Create two nodes
    // They need to discover each other
    nodes = await createNodes(peerScoring, 2);
    const { req: pinger } = nodes[0];
    const { p2p: other } = nodes[1];

    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);

    await sleep(500);

    const resp = await pinger.sendRequestToPeer(other.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
    expectSuccess(resp);

    await sleep(500);
    expect(resp.data.toString('utf-8')).toEqual('pong');
  });

  it('should handle gracefully if a peer connected peer is offline', async () => {
    nodes = await createNodes(peerScoring, 2);

    const { req: pinger } = nodes[0];
    const { req: ponger, p2p: pongerNode } = nodes[1];
    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);
    await sleep(500);

    const stopPonger = ponger.stop();

    //It should not return any data in case we cannot dial the peer
    const response = await pinger.sendRequestToPeer(pongerNode.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
    expect(response.status).toEqual(ReqRespStatus.FAILURE);
    expect(response).not.toHaveProperty('data');

    await stopPonger;
  });

  it('should hit a rate limit if too many requests are made in quick succession', async () => {
    nodes = await createNodes(peerScoring, 2);

    await startNodes(nodes);

    // Spy on the logger to make sure the error message is logged
    const loggerSpy = jest.spyOn((nodes[1].req as any).logger, 'verbose');

    await sleep(500);
    await connectToPeers(nodes);
    await sleep(500);

    // Default rate is set at 1 every 200 ms; so this should fire a few times
    const responses = [];
    for (let i = 0; i < 10; i++) {
      // Response object contains the status (error flags) and data
      const response = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.PING,
        Buffer.from('ping'),
      );
      responses.push(response);
    }

    // Check that one of the responses gets a rate limit response
    const rateLimitResponse = responses.find(response => response?.status === ReqRespStatus.RATE_LIMIT_EXCEEDED);
    expect(rateLimitResponse).toBeDefined();

    // Make sure the error message is logged
    const errorMessage = `Rate limit exceeded DeniedPeer for ${
      ReqRespSubProtocol.PING
    } from ${nodes[0].p2p.peerId.toString()}`;
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });

  describe('Tx req protocol', () => {
    it('can request a Tx from TxHash', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, message: Buffer): Promise<Buffer> => {
        const receivedHash = TxHash.fromBuffer(message);
        if (txHash.equals(receivedHash)) {
          return Promise.resolve(tx.toBuffer());
        }
        return Promise.resolve(Buffer.from(''));
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.TX, txHash.toBuffer());
      expectSuccess(resp);

      // Set tx hash since expect will compare private properties
      const resTx = Tx.fromBuffer(resp.data);
      resTx.getTxHash();

      expect(resTx).toEqual(tx);
    });

    it('can request a batch of  Txs from TxHashes', async () => {
      const txs = [await mockTx(), await mockTx(), await mockTx()];
      const txHashes = new TxHashArray(...(await Promise.all(txs.map(t => t.getTxHash()))));

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, message: Buffer): Promise<Buffer> => {
        const receivedHashes = TxHashArray.fromBuffer(message);
        const toReturn = new TxArray(...txs.filter(t => receivedHashes.includes(t.txHash)));
        return Promise.resolve(toReturn.toBuffer());
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.TX,
        txHashes.toBuffer(),
      );
      expectSuccess(resp);

      const resTx = TxArray.fromBuffer(resp.data);
      resTx.forEach((tx, i) => expect(tx).toEqual(txs[i]));
    });

    it('Requesting batch of txs should throw on empty response buffer', async () => {
      const txs = [await mockTx(), await mockTx(), await mockTx()];
      const txHashes = new TxHashArray(...(await Promise.all(txs.map(t => t.getTxHash()))));

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, _message: Buffer): Promise<Buffer> => {
        return Promise.resolve(Buffer.alloc(0));
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.TX,
        txHashes.toBuffer(),
      );
      expectSuccess(resp);

      expect(() => {
        TxArray.fromBuffer(resp.data);
      }).toThrow('Failed to deserialize TxArray from buffer');
    });

    it('Requesting batch of txs should handle empty response', async () => {
      const txs = [await mockTx(), await mockTx(), await mockTx()];
      const txHashes = new TxHashArray(...(await Promise.all(txs.map(t => t.getTxHash()))));

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, _message: Buffer): Promise<Buffer> => {
        return Promise.resolve(new TxArray().toBuffer());
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.TX,
        txHashes.toBuffer(),
      );
      expectSuccess(resp);

      const resTx = TxArray.fromBuffer(resp.data);
      expect(resTx.length).toEqual(0);
    });

    it('handles returning empty buffers', async () => {
      const tx = await mockTx();
      const txHash = tx.getTxHash();

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, _message: Buffer): Promise<Buffer> => {
        return Promise.resolve(Buffer.alloc(0));
      };

      nodes = await createNodes(peerScoring, 2);

      const spySendRequestToPeer = jest.spyOn(nodes[0].req, 'sendRequestToPeer');

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.TX, txHash.toBuffer());
      expectSuccess(resp);

      expect(spySendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(resp.data.length).toEqual(0);
    });

    it('should hit individual timeout if nothing is returned over the stream', async () => {
      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);

      jest.spyOn((nodes[1].req as any).subProtocolHandlers, ReqRespSubProtocol.TX).mockImplementation(() => {
        return new Promise(() => {});
      });

      // Spy on the logger to make sure the error message is logged
      const loggerSpy = jest.spyOn((nodes[0].req as any).logger, 'debug');

      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const request = TxHash.random().toBuffer();
      const resp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.TX, request);

      expect(resp.status).toEqual(ReqRespStatus.FAILURE);
      expect(resp).not.toHaveProperty('data');

      // Make sure the error message is logged
      const peerId = nodes[1].p2p.peerId.toString();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Request to peer timed out'),
        expect.objectContaining({ peerId, subProtocol: ReqRespSubProtocol.TX }),
      );

      // Expect the peer to be penalized for timing out
      expect(peerScoring.penalizePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey, // must use objectContaining as we do not match exactly, as private key is contained in this test mapping
        }),
        PeerErrorSeverity.HighToleranceError,
      );
    });
  });

  describe('Goodbye protocol', () => {
    it('should send a goodbye message to a peer', async () => {
      nodes = await createNodes(peerScoring, 2);

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      // Req Goodbye Handler is defined in the reqresp.ts file
      protocolHandlers[ReqRespSubProtocol.GOODBYE] = reqGoodbyeHandler(peerManager);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const response = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.SHUTDOWN]),
      );

      // Node 1 Peer manager receives the goodbye from the sending node
      expect(peerManager.goodbyeReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[0].p2p.peerId.publicKey,
        }),
        GoodByeReason.SHUTDOWN,
      );

      // Expect no response to be sent - we categorize as unknown
      expect(response?.status).toEqual(ReqRespStatus.UNKNOWN);
    });

    it('should not yield any warnings when handling a goodbye message received from peer', async () => {
      nodes = await createNodes(peerScoring, 2);
      const sendingNode = nodes[0];
      const receivingNode = nodes[1];

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      // Req Goodbye Handler is defined in the reqresp.ts file
      protocolHandlers[ReqRespSubProtocol.GOODBYE] = reqGoodbyeHandler(peerManager);
      const warnSpy = jest.spyOn((receivingNode.req as any).logger, 'warn');

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const response = await sendingNode.req.sendRequestToPeer(
        receivingNode.p2p.peerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.SHUTDOWN]),
      );

      // Node 1 Peer manager receives the goodbye from the sending node
      expect(peerManager.goodbyeReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: sendingNode.p2p.peerId.publicKey,
        }),
        GoodByeReason.SHUTDOWN,
      );

      // Expect no response to be sent - we categorize as unknown
      expect(response?.status).toEqual(ReqRespStatus.UNKNOWN);

      // make sure warn was NOT called
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Authentication gating', () => {
    it('should reject unauthenticated peers on all data protocols', async () => {
      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      // Set up auth checker that rejects all peers (simulates p2pAllowOnlyValidators=true with no authenticated peers)
      nodes[1].req.setShouldRejectPeer(() => true);

      // All data protocols should be rejected
      for (const protocol of [ReqRespSubProtocol.TX, ReqRespSubProtocol.BLOCK_TXS]) {
        const resp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, protocol, Buffer.from('request'));
        expect(resp.status).toEqual(ReqRespStatus.FAILURE);
      }

      // PING is an allowed protocol — should succeed
      const pingResp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
      expectSuccess(pingResp);
      expect(pingResp.data.toString('utf-8')).toEqual('pong');
    });

    it('should allow handshake protocols for unauthenticated peers', async () => {
      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      // Reject all peers on gated protocols
      nodes[1].req.setShouldRejectPeer(() => true);

      // PING, STATUS, AUTH, GOODBYE should still work
      const pingResp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
      expectSuccess(pingResp);

      const statusResp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.STATUS,
        Buffer.from('status'),
      );
      expectSuccess(statusResp);

      const authResp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.AUTH,
        Buffer.from('auth'),
      );
      expectSuccess(authResp);
    });

    it('should allow authenticated peers on all protocols', async () => {
      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      // Set up auth checker that allows all peers (simulates authenticated validator)
      nodes[1].req.setShouldRejectPeer(() => false);

      // Data protocols should succeed for authenticated peers
      const pingResp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
      expectSuccess(pingResp);
      expect(pingResp.data.toString('utf-8')).toEqual('pong');

      const txResp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.TX,
        Buffer.from('request'),
      );
      expectSuccess(txResp);
    });

    it('should allow all protocols when no auth checker is set', async () => {
      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      // No setShouldRejectPeer called — all protocols should work (backwards compatible)
      const pingResp = await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.PING, PING_REQUEST);
      expectSuccess(pingResp);
      expect(pingResp.data.toString('utf-8')).toEqual('pong');

      const txResp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.TX,
        Buffer.from('request'),
      );
      expectSuccess(txResp);
    });
  });
});

function expectSuccess(res: ReqRespResponse): asserts res is { status: ReqRespStatus.SUCCESS; data: Buffer } {
  expect(res.status).toBe(ReqRespStatus.SUCCESS);
}
