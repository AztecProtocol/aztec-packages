// @attribution: lodestar impl for inspiration
import { type Logger, createDebugLogger } from '@aztec/foundation/log';
import { executeTimeoutWithCustomError } from '@aztec/foundation/timer';

import { type IncomingStreamData, type PeerId, type Stream } from '@libp2p/interface';
import { pipe } from 'it-pipe';
import { type Libp2p } from 'libp2p';
import { type Uint8ArrayList } from 'uint8arraylist';

import { CollectiveReqRespTimeoutError, IndiviualReqRespTimeoutError } from '../../errors/reqresp.error.js';
import { type P2PReqRespConfig } from './config.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  type ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
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
 * see: https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/p2p-interface.md#the-reqresp-domain
 */
export class ReqResp {
  protected readonly logger: Logger;

  private abortController: AbortController = new AbortController();

  private overallRequestTimeoutMs: number;
  private individualRequestTimeoutMs: number;

  private subProtocolHandlers: ReqRespSubProtocolHandlers = DEFAULT_SUB_PROTOCOL_HANDLERS;
  private rateLimiter: RequestResponseRateLimiter;

  constructor(config: P2PReqRespConfig, protected readonly libp2p: Libp2p) {
    this.logger = createDebugLogger('aztec:p2p:reqresp');

    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;

    this.rateLimiter = new RequestResponseRateLimiter();
  }

  /**
   * Start the reqresp service
   */
  async start(subProtocolHandlers: ReqRespSubProtocolHandlers) {
    this.subProtocolHandlers = subProtocolHandlers;
    // Register all protocol handlers
    for (const subProtocol of Object.keys(this.subProtocolHandlers)) {
      await this.libp2p.handle(subProtocol, this.streamHandler.bind(this, subProtocol as ReqRespSubProtocol));
    }
  }

  /**
   * Stop the reqresp service
   */
  async stop() {
    // Unregister all handlers
    for (const protocol of Object.keys(this.subProtocolHandlers)) {
      await this.libp2p.unhandle(protocol);
    }
    this.rateLimiter.destroy();
    await this.libp2p.stop();
    this.abortController.abort();
  }

  /**
   * Send a request to peers, returns the first response
   *
   * @param subProtocol - The protocol being requested
   * @param payload - The payload to send
   * @returns - The response from the peer, otherwise undefined
   */
  async sendRequest(subProtocol: ReqRespSubProtocol, payload: Buffer): Promise<Buffer | undefined> {
    const requestFunction = async () => {
      // Get active peers
      const peers = this.libp2p.getPeers();

      // Attempt to ask all of our peers
      for (const peer of peers) {
        const response = await this.sendRequestToPeer(peer, subProtocol, payload);

        // If we get a response, return it, otherwise we iterate onto the next peer
        // We do not consider it a success if we have an empty buffer
        if (response && response.length > 0) {
          return response;
        }
      }
      return undefined;
    };

    try {
      return await executeTimeoutWithCustomError<Buffer | undefined>(
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
   * @param peerId - The peer to send the request to
   * @param subProtocol - The protocol to use to request
   * @param payload - The payload to send
   * @returns If the request is successful, the response is returned, otherwise undefined
   */
  async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
  ): Promise<Buffer | undefined> {
    let stream: Stream | undefined;
    try {
      stream = await this.libp2p.dialProtocol(peerId, subProtocol);

      this.logger.debug(`Stream opened with ${peerId.toString()} for ${subProtocol}`);

      const result = await executeTimeoutWithCustomError<Buffer>(
        (): Promise<Buffer> => pipe([payload], stream!, this.readMessage),
        this.individualRequestTimeoutMs,
        () => new IndiviualReqRespTimeoutError(),
      );

      await stream.close();
      this.logger.debug(`Stream closed with ${peerId.toString()} for ${subProtocol}`);

      return result;
    } catch (e: any) {
      this.logger.error(`${e.message} | peerId: ${peerId.toString()} | subProtocol: ${subProtocol}`);
    } finally {
      if (stream) {
        try {
          await stream.close();
          this.logger.debug(`Stream closed with ${peerId.toString()} for ${subProtocol}`);
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
    return Buffer.concat(messageData);
  }

  /**
   * Stream Handler
   * Reads the incoming stream, determines the protocol, then triggers the appropriate handler
   *
   * @param param0 - The incoming stream data
   */
  private async streamHandler(protocol: ReqRespSubProtocol, { stream, connection }: IncomingStreamData) {
    // Store a reference to from this for the async generator
    if (!this.rateLimiter.allow(protocol, connection.remotePeer)) {
      this.logger.warn(`Rate limit exceeded for ${protocol} from ${connection.remotePeer}`);

      // TODO: handle changing peer scoring for failed rate limit, maybe differentiate between global and peer limits here when punishing
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
            yield handler(msg);
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
