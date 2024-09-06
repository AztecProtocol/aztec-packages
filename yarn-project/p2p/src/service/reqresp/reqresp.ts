// @attribution: lodestar impl for inspiration
import { type Logger, createDebugLogger } from '@aztec/foundation/log';

import { Stream, type IncomingStreamData, type PeerId } from '@libp2p/interface';
import { pipe } from 'it-pipe';
import { type Libp2p } from 'libp2p';
import { type Uint8ArrayList } from 'uint8arraylist';

import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  type ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
} from './interface.js';
import { executeTimeoutWithCustomError } from '@aztec/foundation/timer';
import { IndiviualReqRespTimeoutError } from '../../errors/reqresp.error.js';

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

  // TODO: change defaults and add to configuration
  private overallRequestTimeoutMs: number = 4000;
  private individualRequestTimeoutMs: number = 2000;

  private subProtocolHandlers: ReqRespSubProtocolHandlers = DEFAULT_SUB_PROTOCOL_HANDLERS;

  constructor(protected readonly libp2p: Libp2p) {
    this.logger = createDebugLogger('aztec:p2p:reqresp');
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
    // Get active peers
    const peers = this.libp2p.getPeers();

    // Attempt to ask all of our peers
    for (const peer of peers) {
      const response = await this.sendRequestToPeer(peer, subProtocol, payload);
      console.log("In send request response", response);

      // If we get a response, return it, otherwise we iterate onto the next peer
      // We do not consider it a success if we have an empty buffer
      if (response && response.length > 0) {
        return response;
      }
    }
    return undefined;
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

      this.logger.debug(`Stream opened with ${peerId.publicKey} for ${subProtocol}`);

      const result = await executeTimeoutWithCustomError<Buffer>(
        (): Promise<Buffer> => pipe([payload], stream!, this.readMessage),
        this.overallRequestTimeoutMs,
        () => new IndiviualReqRespTimeoutError(),
      );
      console.log("after timeout check", result);

      await stream.close();
      this.logger.debug(`Stream closed with ${peerId.publicKey} for ${subProtocol}`);
      console.log("after stream close", result);

      return result;
    } catch (e: any) {
      this.logger.error(`${e.message} | peer: ${peerId.publicKey?.toString()} | subProtocol: ${subProtocol}`);
    } finally {
      if (stream) {
        try {
          await stream.close();
          this.logger.debug(`Stream closed with ${peerId.publicKey} for ${subProtocol}`);
        } catch (closeError) {
          this.logger.error(`Error closing stream: ${closeError instanceof Error ? closeError.message : 'Unknown error'}`);
        }
      }
      return undefined;
    }
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
  private async streamHandler(protocol: ReqRespSubProtocol, { stream }: IncomingStreamData) {
    // Store a reference to from this for the async generator
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
