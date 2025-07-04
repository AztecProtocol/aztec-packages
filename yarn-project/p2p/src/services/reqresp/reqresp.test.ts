import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { sleep } from '@aztec/foundation/sleep';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

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
import { type ReqRespResponse, ReqRespSubProtocol, RequestableBuffer } from './interface.js';
import { reqRespBlockHandler } from './protocols/block.js';
import { GoodByeReason, reqGoodbyeHandler } from './protocols/goodbye.js';
import { ReqRespStatus, prettyPrintReqRespStatus } from './status.js';

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
    const loggerSpy = jest.spyOn((nodes[1].req as any).logger, 'warn');

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
      const txHash = await tx.getTxHash();

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
      await resTx.getTxHash();

      expect(resTx).toEqual(tx);
    });

    it('handles returning empty buffers', async () => {
      const tx = await mockTx();
      const txHash = await tx.getTxHash();

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

  describe('Block protocol', () => {
    it('should handle block requests', async () => {
      const blockNumber = 1;
      const blockNumberFr = Fr.ONE;
      const block = await L2Block.random(blockNumber);

      const l2BlockSource: MockProxy<L2BlockSource> = mock<L2BlockSource>();
      l2BlockSource.getBlock.mockImplementation((_blockNumber: number) => {
        return Promise.resolve(block);
      });

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.BLOCK] = reqRespBlockHandler(l2BlockSource);

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const resp = await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.BLOCK,
        blockNumberFr.toBuffer(),
      );
      expectSuccess(resp);

      const res = L2Block.fromBuffer(resp.data);
      expect(res).toEqual(block);
    });
  });

  describe('Batch requests', () => {
    it('should send a batch request between many peers', async () => {
      const batchSize = 9;
      nodes = await createNodes(peerScoring, 3);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const sendRequestToPeerSpy = jest.spyOn(nodes[0].req, 'sendRequestToPeer');

      const requests = Array.from({ length: batchSize }, _ => RequestableBuffer.fromBuffer(Buffer.from(`ping`)));
      const expectResponses = Array.from({ length: batchSize }, _ => RequestableBuffer.fromBuffer(Buffer.from(`pong`)));

      const res = await nodes[0].req.sendBatchRequest(ReqRespSubProtocol.PING, requests, undefined);
      expect(res).toEqual(expectResponses);

      // Expect one request to have been sent to each peer
      expect(sendRequestToPeerSpy).toHaveBeenCalledTimes(batchSize);
      expect(sendRequestToPeerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey,
        }),
        ReqRespSubProtocol.PING,
        Buffer.from('ping'),
      );
      expect(sendRequestToPeerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[2].p2p.peerId.publicKey,
        }),
        ReqRespSubProtocol.PING,
        Buffer.from('ping'),
      );
    });

    it('should send a batch request with a pinned peer', async () => {
      const batchSize = 9;
      nodes = await createNodes(peerScoring, 4, {
        // Bump rate limits so the pinned peer can respond
        [ReqRespSubProtocol.PING]: {
          peerLimit: { quotaTimeMs: 1000, quotaCount: 50 },
          globalLimit: { quotaTimeMs: 1000, quotaCount: 50 },
        },
      });

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const sendRequestToPeerSpy = jest.spyOn(nodes[0].req, 'sendRequestToPeer');

      const requests = times(batchSize, i => RequestableBuffer.fromBuffer(Buffer.from(`ping${i}`)));
      const expectResponses = times(batchSize, _ => RequestableBuffer.fromBuffer(Buffer.from(`pong`)));

      const res = await nodes[0].req.sendBatchRequest(ReqRespSubProtocol.PING, requests, nodes[1].p2p.peerId);
      expect(res).toEqual(expectResponses);

      // Expect pinned peer to have received all requests
      for (let i = 0; i < batchSize; i++) {
        expect(sendRequestToPeerSpy).toHaveBeenCalledWith(
          expect.objectContaining({ publicKey: nodes[1].p2p.peerId.publicKey }),
          ReqRespSubProtocol.PING,
          Buffer.from(`ping${i}`),
        );
      }

      // Expect at least one request to have been sent to each other peer
      expect(sendRequestToPeerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: nodes[2].p2p.peerId.publicKey }),
        ReqRespSubProtocol.PING,
        expect.any(Buffer),
      );

      expect(sendRequestToPeerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: nodes[3].p2p.peerId.publicKey }),
        ReqRespSubProtocol.PING,
        expect.any(Buffer),
      );
    });

    it('should stop after max retry attempts', async () => {
      const batchSize = 12;
      nodes = await createNodes(peerScoring, 3);

      const requesterLoggerSpy = jest.spyOn((nodes[0].req as any).logger, 'debug');

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const requests = Array.from({ length: batchSize }, _ => RequestableBuffer.fromBuffer(Buffer.from(`ping`)));
      // We will fail two of the responses - due to hitting the ping rate limit on the responding nodes
      const expectResponses = Array.from({ length: batchSize - 2 }, _ =>
        RequestableBuffer.fromBuffer(Buffer.from(`pong`)),
      );

      const res = await nodes[0].req.sendBatchRequest(ReqRespSubProtocol.PING, requests, undefined);
      expect(res).toEqual(expectResponses);

      // Check that we did detect hitting a rate limit
      expect(requesterLoggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${prettyPrintReqRespStatus(ReqRespStatus.RATE_LIMIT_EXCEEDED)}`),
      );
    });
  });
});

function expectSuccess(res: ReqRespResponse): asserts res is { status: ReqRespStatus.SUCCESS; data: Buffer } {
  expect(res.status).toBe(ReqRespStatus.SUCCESS);
}
