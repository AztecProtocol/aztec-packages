import { TxHash, mockTx } from '@aztec/circuit-types';
import { sleep } from '@aztec/foundation/sleep';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CollectiveReqRespTimeoutError, IndiviualReqRespTimeoutError } from '../../errors/reqresp.error.js';
import {
  MOCK_SUB_PROTOCOL_HANDLERS,
  MOCK_SUB_PROTOCOL_VALIDATORS,
  connectToPeers,
  createNodes,
  startNodes,
  stopNodes,
} from '../../mocks/index.js';
import { type PeerManager } from '../peer_manager.js';
import { PeerErrorSeverity } from '../peer_scoring.js';
import { PING_PROTOCOL, RequestableBuffer, TX_REQ_PROTOCOL } from './interface.js';

const PING_REQUEST = RequestableBuffer.fromBuffer(Buffer.from('ping'));

// The Req Resp protocol should allow nodes to dial specific peers
// and ask for specific data that they missed via the traditional gossip protocol.
describe('ReqResp', () => {
  let peerManager: MockProxy<PeerManager>;

  beforeEach(() => {
    peerManager = mock<PeerManager>();
  });

  it('Should perform a ping request', async () => {
    // Create two nodes
    // They need to discover each other
    const nodes = await createNodes(peerManager, 2);
    const { req: pinger } = nodes[0];

    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);

    await sleep(500);

    const res = await pinger.sendRequest(PING_PROTOCOL, PING_REQUEST);

    await sleep(500);
    expect(res?.toBuffer().toString('utf-8')).toEqual('pong');

    await stopNodes(nodes);
  });

  it('Should handle gracefully if a peer connected peer is offline', async () => {
    const nodes = await createNodes(peerManager, 2);

    const { req: pinger } = nodes[0];
    const { req: ponger } = nodes[1];
    await startNodes(nodes);

    // connect the nodes
    await connectToPeers(nodes);
    await sleep(500);

    void ponger.stop();

    // It should return undefined if it cannot dial the peer
    const res = await pinger.sendRequest(PING_PROTOCOL, PING_REQUEST);

    expect(res).toBeUndefined();

    await stopNodes(nodes);
  });

  it('Should request from a later peer if other peers are offline', async () => {
    const nodes = await createNodes(peerManager, 4);

    await startNodes(nodes);
    await sleep(500);
    await connectToPeers(nodes);
    await sleep(500);

    // Stop the second middle two nodes
    void nodes[1].req.stop();
    void nodes[2].req.stop();

    // send from the first node
    const res = await nodes[0].req.sendRequest(PING_PROTOCOL, PING_REQUEST);

    expect(res?.toBuffer().toString('utf-8')).toEqual('pong');

    await stopNodes(nodes);
  });

  it('Should hit a rate limit if too many requests are made in quick succession', async () => {
    const nodes = await createNodes(peerManager, 2);

    await startNodes(nodes);

    // Spy on the logger to make sure the error message is logged
    const loggerSpy = jest.spyOn((nodes[1].req as any).logger, 'warn');

    await sleep(500);
    await connectToPeers(nodes);
    await sleep(500);

    // Default rate is set at 1 every 200 ms; so this should fire a few times
    for (let i = 0; i < 10; i++) {
      await nodes[0].req.sendRequestToPeer(nodes[1].p2p.peerId, PING_PROTOCOL, Buffer.from('ping'));
    }

    // Make sure the error message is logged
    const errorMessage = `Rate limit exceeded for ${PING_PROTOCOL} from ${nodes[0].p2p.peerId.toString()}`;
    expect(loggerSpy).toHaveBeenCalledWith(errorMessage);

    await stopNodes(nodes);
  });

  describe('TX REQ PROTOCOL', () => {
    it('Can request a Tx from TxHash', async () => {
      const tx = mockTx();
      const txHash = tx.getTxHash();

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[TX_REQ_PROTOCOL] = (message: Buffer): Promise<Uint8Array> => {
        const receivedHash = TxHash.fromBuffer(message);
        if (txHash.equals(receivedHash)) {
          return Promise.resolve(Uint8Array.from(tx.toBuffer()));
        }
        return Promise.resolve(Uint8Array.from(Buffer.from('')));
      };

      const nodes = await createNodes(peerManager, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const res = await nodes[0].req.sendRequest(TX_REQ_PROTOCOL, txHash);
      expect(res).toEqual(tx);

      await stopNodes(nodes);
    });

    it('Does not crash if tx hash returns undefined', async () => {
      const tx = mockTx();
      const txHash = tx.getTxHash();

      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      // Return nothing
      protocolHandlers[TX_REQ_PROTOCOL] = (_message: Buffer): Promise<Uint8Array> => {
        return Promise.resolve(Uint8Array.from(Buffer.from('')));
      };

      const nodes = await createNodes(peerManager, 2);

      await startNodes(nodes, protocolHandlers);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const res = await nodes[0].req.sendRequest(TX_REQ_PROTOCOL, txHash);
      expect(res).toBeUndefined();

      await stopNodes(nodes);
    });

    it('Should hit individual timeout if nothing is returned over the stream', async () => {
      const nodes = await createNodes(peerManager, 2);

      await startNodes(nodes);

      jest.spyOn((nodes[1].req as any).subProtocolHandlers, TX_REQ_PROTOCOL).mockImplementation(() => {
        return new Promise(() => {});
      });

      // Spy on the logger to make sure the error message is logged
      const loggerSpy = jest.spyOn((nodes[0].req as any).logger, 'error');

      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const request = TxHash.random();
      const res = await nodes[0].req.sendRequest(TX_REQ_PROTOCOL, request);
      expect(res).toBeUndefined();

      // Make sure the error message is logged
      const errorMessage = `${
        new IndiviualReqRespTimeoutError().message
      } | peerId: ${nodes[1].p2p.peerId.toString()} | subProtocol: ${TX_REQ_PROTOCOL}`;
      expect(loggerSpy).toHaveBeenCalledWith(errorMessage);

      // Expect the peer to be penalized for timing out
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey, // must use objectContaining as we do not match exactly, as private key is contained in this test mapping
        }),
        PeerErrorSeverity.HighToleranceError,
      );

      await stopNodes(nodes);
    });

    it('Should hit collective timeout if nothing is returned over the stream from multiple peers', async () => {
      const nodes = await createNodes(peerManager, 4);

      await startNodes(nodes);

      for (let i = 1; i < nodes.length; i++) {
        jest.spyOn((nodes[i].req as any).subProtocolHandlers, TX_REQ_PROTOCOL).mockImplementation(() => {
          return new Promise(() => {});
        });
      }

      // Spy on the logger to make sure the error message is logged
      const loggerSpy = jest.spyOn((nodes[0].req as any).logger, 'error');

      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const request = TxHash.random();
      const res = await nodes[0].req.sendRequest(TX_REQ_PROTOCOL, request);
      expect(res).toBeUndefined();

      // Make sure the error message is logged
      const errorMessage = `${new CollectiveReqRespTimeoutError().message} | subProtocol: ${TX_REQ_PROTOCOL}`;
      expect(loggerSpy).toHaveBeenCalledWith(errorMessage);

      await stopNodes(nodes);
    });

    it('Should penalize peer if transaction validation fails', async () => {
      const tx = mockTx();
      const txHash = tx.getTxHash();

      // Mock that the node will respond with the tx
      const protocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS;
      protocolHandlers[TX_REQ_PROTOCOL] = (message: Buffer): Promise<Uint8Array> => {
        const receivedHash = TxHash.fromBuffer(message);
        if (txHash.equals(receivedHash)) {
          return Promise.resolve(Uint8Array.from(tx.toBuffer()));
        }
        return Promise.resolve(Uint8Array.from(Buffer.from('')));
      };

      // Mock that the receiving node will find that the transaction is invalid
      const protocolValidators = MOCK_SUB_PROTOCOL_VALIDATORS;
      protocolValidators[TX_REQ_PROTOCOL] = (_request, _response, peer) => {
        peerManager.penalizePeer(peer, PeerErrorSeverity.LowToleranceError);
        return Promise.resolve(false);
      };

      const nodes = await createNodes(peerManager, 2);

      await startNodes(nodes, protocolHandlers, protocolValidators);
      await sleep(500);
      await connectToPeers(nodes);
      await sleep(500);

      const res = await nodes[0].req.sendRequest(TX_REQ_PROTOCOL, txHash);
      expect(res).toBeUndefined();

      // Expect the peer to be penalized for sending an invalid response
      expect(peerManager.penalizePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: nodes[1].p2p.peerId.publicKey, // must use objectContaining as we do not match exactly, as private key is contained in this test mapping
        }),
        PeerErrorSeverity.LowToleranceError,
      );

      await stopNodes(nodes);
    });
  });
});
