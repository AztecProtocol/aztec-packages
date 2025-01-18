import { PeerErrorSeverity, TxHash, mockTx } from '@aztec/circuit-types';
import { sleep } from '@aztec/foundation/sleep';

import { describe, expect, it, jest } from '@jest/globals';
import { type PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CollectiveReqRespTimeoutError, IndividualReqRespTimeoutError } from '../../errors/reqresp.error.js';
import {
  MOCK_SUB_PROTOCOL_HANDLERS,
  MOCK_SUB_PROTOCOL_VALIDATORS,
  type ReqRespNode,
  connectToPeers,
  createNodes,
  startNodes,
  stopNodes,
} from '../../mocks/index.js';
import { type PeerScoring } from '../peer-scoring/peer_scoring.js';
import { ReqRespSubProtocol, RequestableBuffer } from './interface.js';
import { GoodByeReason } from './protocols/goodbye.js';

const PING_REQUEST = RequestableBuffer.fromBuffer(Buffer.from('ping'));

// The Req Resp protocol should allow nodes to dial specific peers
// and ask for specific data that they missed via the traditional gossip protocol.
describe('ReqResp', () => {
  let peerScoring: MockProxy<PeerScoring>;
  let nodes: ReqRespNode[];

  beforeEach(() => {
    peerScoring = mock<PeerScoring>();
  });

  afterEach(async () => {
    if (nodes) {
      await stopNodes(nodes as ReqRespNode[]);
    }
  });

  it('Should perform a ping request', async () => {
    // Create two nodes
    // They need to discover each other
    nodes = await createNodes(peerScoring, 2);
    const { req: pinger } = nodes[0];

    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);

    await sleep(500);

    const res = await pinger.sendRequest(ReqRespSubProtocol.PING, PING_REQUEST);

    await sleep(500);
    expect(res?.toBuffer().toString('utf-8')).toEqual('pong');
  });

  it('Should handle gracefully if a peer connected peer is offline', async () => {
    nodes = await createNodes(peerScoring, 2);

    const { req: pinger } = nodes[0];
    const { req: ponger } = nodes[1];
    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);
    await sleep(500);

    void ponger.stop();

    // It should return undefined if it cannot dial the peer
    const res = await pinger.sendRequest(ReqRespSubProtocol.PING, PING_REQUEST);

    expect(res).toBeUndefined();
  });

  it('Should request from a later peer if other peers are offline', async () => {
    nodes = await createNodes(peerScoring, 4);

    await startNodes(nodes);
    await sleep(500);
    await connectToPeers(nodes);
    await sleep(500);

    // Stop the second middle two nodes
    void nodes[1].req.stop();
    void nodes[2].req.stop();

    const loggerSpy = jest.spyOn((nodes[0].req as any).logger, 'debug');

    // send from the first node
    const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.PING, PING_REQUEST);

    // We expect the logger to have been called twice with the peer ids citing the inability to connect
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Connection reset: ${nodes[1].p2p.peerId.toString()}`),
      {
        peerId: nodes[1].p2p.peerId.toString(),
        subProtocol: ReqRespSubProtocol.PING,
      },
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Connection reset: ${nodes[2].p2p.peerId.toString()}`),
      {
        peerId: nodes[2].p2p.peerId.toString(),
        subProtocol: ReqRespSubProtocol.PING,
      },
    );

    expect(res?.toBuffer().toString('utf-8')).toEqual('pong');
  });

  it('Should hit a rate limit if too many requests are made in quick succession', async () => {
    nodes = await createNodes(peerScoring, 2);

    await startNodes(nodes);

    // Spy on the logger to make sure the error message is logged
    const loggerSpy = jest.spyOn((nodes[1].req as any).logger, 'warn');

    await sleep(500);
    await connectToPeers(nodes);
    await sleep(500);

    // Default rate is set at 1 every 200 ms; so this should fire a few times
    for (let i = 0; i < 10; i++) {
      await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, ReqRespSubProtocol.PING, Buffer.from('ping'));
    }

    // Make sure the error message is logged
    const errorMessage = `Rate limit exceeded for ${ReqRespSubProtocol.PING} from ${nodes[0].p2p.peerId.toString()}`;
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });

  describe('Tx req protocol', () => {
    it('Can request a Tx from TxHash', async () => {
      const tx = mockTx();
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

      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, txHash);
      // Set tx hash since expect will compare private properties
      res.getTxHash();
      expect(res).toEqual(tx);
    });

    it('Handle returning empty buffers', async () => {
      const tx = mockTx();
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

      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, txHash);
      expect(spySendRequestToPeer).toHaveBeenCalledTimes(1);
      expect(res).toEqual(undefined);
    });

    it('Does not crash if tx hash returns undefined', async () => {
      const tx = mockTx();
      const txHash = tx.getTxHash();

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      // Return nothing
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, _message: Buffer): Promise<Buffer> => {
        return Promise.resolve(Buffer.from(''));
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, txHash);
      expect(res).toBeUndefined();
    });

    it('Should hit individual timeout if nothing is returned over the stream', async () => {
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

      const request = TxHash.random();
      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, request);
      expect(res).toBeUndefined();

      // Make sure the error message is logged
      const peerId = nodes[1].p2p.peerId.toString();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Timeout error: ${new IndividualReqRespTimeoutError().message} | peerId: ${peerId} | subProtocol: ${
          ReqRespSubProtocol.TX
        }`,
        expect.objectContaining({
          peerId: peerId,
          subProtocol: ReqRespSubProtocol.TX,
        }),
      );

      // Expect the peer to be penalized for timing out
      expect(peerScoring.penalizePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey, // must use objectContaining as we do not match exactly, as private key is contained in this test mapping
        }),
        PeerErrorSeverity.HighToleranceError,
      );
    });

    it('Should hit collective timeout if nothing is returned over the stream from multiple peers', async () => {
      nodes = await createNodes(peerScoring, 4);

      await startNodes(nodes);

      for (let i = 1; i < nodes.length; i++) {
        jest.spyOn((nodes[i].req as any).subProtocolHandlers, ReqRespSubProtocol.TX).mockImplementation(() => {
          return new Promise(() => {});
        });
      }

      // Spy on the logger to make sure the error message is logged
      const loggerSpy = jest.spyOn((nodes[0].req as any).logger, 'debug');

      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const request = TxHash.random();
      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, request);
      expect(res).toBeUndefined();

      // Make sure the error message is logged
      const errorMessage = `${new CollectiveReqRespTimeoutError().message} | subProtocol: ${ReqRespSubProtocol.TX}`;
      expect(loggerSpy).toHaveBeenCalledWith(errorMessage);
    });

    it('Should penalize peer if transaction validation fails', async () => {
      const tx = mockTx();
      const txHash = tx.getTxHash();

      // Mock that the node will respond with the tx
      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[ReqRespSubProtocol.TX] = (_peerId: PeerId, message: Buffer): Promise<Buffer> => {
        const receivedHash = TxHash.fromBuffer(message);
        if (txHash.equals(receivedHash)) {
          return Promise.resolve(tx.toBuffer());
        }
        return Promise.resolve(Buffer.from(''));
      };

      // Mock that the receiving node will find that the transaction is invalid
      const protocolValidators = MOCK_SUB_PROTOCOL_VALIDATORS;
      protocolValidators[ReqRespSubProtocol.TX] = (_request, _response, peer) => {
        peerScoring.penalizePeer(peer, PeerErrorSeverity.LowToleranceError);
        return Promise.resolve(false);
      };

      nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes, protocolHandlers, protocolValidators);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const res = await nodes[0].req.sendRequest(ReqRespSubProtocol.TX, txHash);
      expect(res).toBeUndefined();

      // Expect the peer to be penalized for sending an invalid response
      expect(peerScoring.penalizePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey, // must use objectContaining as we do not match exactly, as private key is contained in this test mapping
        }),
        PeerErrorSeverity.LowToleranceError,
      );
    });
  });

  describe('Goodbye protocol', () => {
    it('Should send a goodbye message to a peer', async () => {
      const nodes = await createNodes(peerScoring, 2);

      await startNodes(nodes);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      await nodes[0].req.sendRequestToPeer(
        nodes[1].p2p.peerId,
        ReqRespSubProtocol.GOODBYE,
        Buffer.from([GoodByeReason.SHUTDOWN]),
      );
    });
  });
});
