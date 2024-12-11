// @attribution: lodestar impl for inspiration
import { type Logger, createLogger } from '@aztec/foundation/log';
import { executeTimeoutWithCustomError } from '@aztec/foundation/timer';

import { type IncomingStreamData, type PeerId, type Stream } from '@libp2p/interface';
import { pipe } from 'it-pipe';
import { type Libp2p } from 'libp2p';
import { compressSync, uncompressSync } from 'snappy';
import { type Uint8ArrayList } from 'uint8arraylist';

import { CollectiveReqRespTimeoutError, IndiviualReqRespTimeoutError } from '../../errors/reqresp.error.js';
import { type PeerManager } from '../peer_manager.js';
import { PeerErrorSeverity } from '../peer_scoring.js';
import { type P2PReqRespConfig } from './config.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  subProtocolMap,
} from './interface.js';
import { RequestResponseRateLimiter } from './rate_limiter/rate_limiter.js';

/**
 * The Request Response Service
 *
 * It allows nodes to request specific information from their peers, its use case covers recovering
 * information that was missed during a syncronisation or a gossip event.
 *
 * This service implements the request response sub protocol, it is heavily inspired from
 * ethereum implementations of the same name.
 *
 * Note, responses get compressed in streamHandler
 *       so they get decompressed in readMessage
 *
 * see: https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/p2p-interface.md#the-reqresp-domain
 */
export class ReqResp {
  protected readonly logger: Logger;

  private overallRequestTimeoutMs: number;
  private individualRequestTimeoutMs: number;

  // Warning, if the `start` function is not called as the parent class constructor, then the default sub protocol handlers will be used ( not good )
  private subProtocolHandlers: ReqRespSubProtocolHandlers = DEFAULT_SUB_PROTOCOL_HANDLERS;
  private subProtocolValidators: ReqRespSubProtocolValidators = DEFAULT_SUB_PROTOCOL_VALIDATORS;

  private rateLimiter: RequestResponseRateLimiter;

  constructor(config: P2PReqRespConfig, protected readonly libp2p: Libp2p, private peerManager: PeerManager) {
    this.logger = createLogger('p2p:reqresp');

    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;

    this.rateLimiter = new RequestResponseRateLimiter(peerManager);
  }

  /**
   * Start the reqresp service
   */
  async start(subProtocolHandlers: ReqRespSubProtocolHandlers, subProtocolValidators: ReqRespSubProtocolValidators) {
    this.subProtocolHandlers = subProtocolHandlers;
    this.subProtocolValidators = subProtocolValidators;

    // Register all protocol handlers
    for (const subProtocol of Object.keys(this.subProtocolHandlers)) {
      await this.libp2p.handle(subProtocol, this.streamHandler.bind(this, subProtocol as ReqRespSubProtocol));
    }
    this.rateLimiter.start();
  }

  /**
   * Stop the reqresp service
   */
  async stop() {
    // Unregister all handlers
    for (const protocol of Object.keys(this.subProtocolHandlers)) {
      await this.libp2p.unhandle(protocol);
    }

    // Close all active connections
    const closeStreamPromises = this.libp2p.getConnections().map(connection => connection.close());
    await Promise.all(closeStreamPromises);
    this.logger.debug('ReqResp: All active streams closed');

    this.rateLimiter.stop();
    this.logger.debug('ReqResp: Rate limiter stopped');

    // NOTE: We assume libp2p instance is managed by the caller
  }

  /**
   * Send a request to peers, returns the first response
   *
   * @param subProtocol - The protocol being requested
   * @param request - The request to send
   * @returns - The response from the peer, otherwise undefined
   *
   * @description
   * This method attempts to send a request to all active peers using the specified sub-protocol.
   * It opens a stream with each peer, sends the request, and awaits a response.
   * If a valid response is received, it returns the response; otherwise, it continues to the next peer.
   * If no response is received from any peer, it returns undefined.
   *
   * The method performs the following steps:
   * - Iterates over all active peers.
   * - Opens a stream with each peer using the specified sub-protocol.
   *
   * When a response is received, it is validated using the given sub protocols response validator.
   * To see the interface for the response validator - see `interface.ts`
   *
   * Failing a response validation requests in a severe peer penalty, and will
   * prompt the node to continue to search to the next peer.
   * For example, a transaction request validator will check that the payload returned does in fact
   * match the txHash that was requested. A peer that fails this check an only be an extremely naughty peer.
   *
   * This entire operation is wrapped in an overall timeout, that is independent of the
   * peer it is requesting data from.
   *
   */
  async sendRequest<SubProtocol extends ReqRespSubProtocol>(
    subProtocol: SubProtocol,
    request: InstanceType<SubProtocolMap[SubProtocol]['request']>,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined> {
    const requestFunction = async () => {
      const responseValidator = this.subProtocolValidators[subProtocol];
      const requestBuffer = request.toBuffer();

      // Get active peers
      const peers = this.libp2p.getPeers();

      // Attempt to ask all of our peers
      for (const peer of peers) {
        const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffer);

        // If we get a response, return it, otherwise we iterate onto the next peer
        // We do not consider it a success if we have an empty buffer
        if (response && response.length > 0) {
          const object = subProtocolMap[subProtocol].response.fromBuffer(response);
          // The response validator handles peer punishment within
          const isValid = await responseValidator(request, object, peer);
          if (!isValid) {
            this.logger.error(`Invalid response for ${subProtocol} from ${peer.toString()}`);
            return undefined;
          }
          return object;
        }
      }
      return undefined;
    };

    try {
      return await executeTimeoutWithCustomError<InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined>(
        requestFunction,
        this.overallRequestTimeoutMs,
        () => new CollectiveReqRespTimeoutError(),
      );
    } catch (e: any) {
      this.logger.error(`${e.message} | subProtocol: ${subProtocol}`);
      return undefined;
    }
  }

  /**
   * Sends a request to a specific peer
   *
   * We first dial a particular protocol for the peer, this ensures that the peer knows
   * what to respond with
   *
   *
   * @param peerId - The peer to send the request to
   * @param subProtocol - The protocol to use to request
   * @param payload - The payload to send
   * @returns If the request is successful, the response is returned, otherwise undefined
   *
   * @description
   * This method attempts to open a stream with the specified peer, send the payload,
   * and await a response.
   * If an error occurs, it penalizes the peer and returns undefined.
   *
   * The method performs the following steps:
   * - Opens a stream with the peer using the specified sub-protocol.
   * - Sends the payload and awaits a response with a timeout.
   *
   * If the stream is not closed by the dialled peer, and a timeout occurs, then
   * the stream is closed on the requester's end and sender (us) updates its peer score
   */
  async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
  ): Promise<Buffer | undefined> {
    let stream: Stream | undefined;
    try {
      stream = await this.libp2p.dialProtocol(peerId, subProtocol);
      this.logger.trace(`Stream opened with ${peerId.toString()} for ${subProtocol}`);

      // Open the stream with a timeout
      const result = await executeTimeoutWithCustomError<Buffer>(
        (): Promise<Buffer> => pipe([payload], stream!, this.readMessage),
        this.individualRequestTimeoutMs,
        () => new IndiviualReqRespTimeoutError(),
      );

      await stream.close();
      this.logger.trace(`Stream closed with ${peerId.toString()} for ${subProtocol}`);

      return result;
    } catch (e: any) {
      this.logger.error(`Error sending request to peer`, e, { peerId: peerId.toString(), subProtocol });
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.HighToleranceError);
    } finally {
      if (stream) {
        try {
          await stream.close();
          this.logger.trace(`Stream closed with ${peerId.toString()} for ${subProtocol}`);
        } catch (closeError) {
          this.logger.error(
            `Error closing stream: ${closeError instanceof Error ? closeError.message : 'Unknown error'}`,
          );
        }
      }
    }
    return undefined;
  }

  /**
   * Read a message returned from a stream into a single buffer
   */
  private async readMessage(source: AsyncIterable<Uint8ArrayList>): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk.subarray());
    }
    const messageData = chunks.concat();
    return uncompressSync(Buffer.concat(messageData), { asBuffer: true }) as Buffer;
  }

  /**
   * Stream Handler
   * Reads the incoming stream, determines the protocol, then triggers the appropriate handler
   *
   * @param param0 - The incoming stream data
   *
   * @description
   * An individual stream handler will be bound to each sub protocol, and handles returning data back
   * to the requesting peer.
   *
   * The sub protocol handler interface is defined within `interface.ts` and will be assigned to the
   * req resp service on start up.
   *
   * We check rate limits for each peer, note the peer will be penalised within the rate limiter implementation
   * if they exceed their peer specific limits.
   */
  private async streamHandler(protocol: ReqRespSubProtocol, { stream, connection }: IncomingStreamData) {
    // Store a reference to from this for the async generator
    if (!this.rateLimiter.allow(protocol, connection.remotePeer)) {
      this.logger.warn(`Rate limit exceeded for ${protocol} from ${connection.remotePeer}`);

      // TODO(#8483): handle changing peer scoring for failed rate limit, maybe differentiate between global and peer limits here when punishing
      await stream.close();
      return;
    }

    const handler = this.subProtocolHandlers[protocol];

    try {
      await pipe(
        stream,
        async function* (source: any) {
          for await (const chunkList of source) {
            const msg = Buffer.from(chunkList.subarray());
            const response = await handler(msg);
            yield new Uint8Array(compressSync(response));
          }
        },
        stream,
      );
    } catch (e: any) {
      this.logger.warn(e);
    } finally {
      await stream.close();
    }
  }
}
