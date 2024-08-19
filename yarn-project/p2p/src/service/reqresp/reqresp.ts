// @attribution: lodestar impl for inspiration
import { type Logger, createDebugLogger } from '@aztec/foundation/log';

import { type IncomingStreamData, type PeerId } from '@libp2p/interface';
import { pipe } from 'it-pipe';
import { type Libp2p } from 'libp2p';
import { type Uint8ArrayList } from 'uint8arraylist';

import { pingHandler, statusHandler } from './handlers.js';
import { PING_PROTOCOL, STATUS_PROTOCOL } from './interface.js';

/**
 * A mapping from a protocol to a handler function
 */
const REQ_RESP_PROTOCOLS = {
  [PING_PROTOCOL]: pingHandler,
  [STATUS_PROTOCOL]: statusHandler,
};

export class ReqResp {
  protected readonly logger: Logger;

  private abortController: AbortController = new AbortController();

  constructor(protected readonly libp2p: Libp2p) {
    this.logger = createDebugLogger('aztec:p2p:reqresp');
  }

  /**
   * Start the reqresp service
   */
  async start() {
    // Register all protocol handlers
    for (const protocol of Object.keys(REQ_RESP_PROTOCOLS)) {
      await this.libp2p.handle(protocol, this.streamHandler);
    }
  }

  /**
   * Stop the reqresp service
   */
  async stop() {
    // Unregister all handlers
    for (const protocol of Object.keys(REQ_RESP_PROTOCOLS)) {
      await this.libp2p.unhandle(protocol);
    }
    await this.libp2p.stop();
    this.abortController.abort();
  }

  /**
   * Send a request to peers, returns the first response
   *
   * @param protocol - The protocol being requested
   * @param payload - The payload to send
   * @returns - The response from the peer, otherwise undefined
   */
  async sendRequest(protocol: string, payload: Buffer): Promise<Buffer | undefined> {
    // Get active peers
    const peers = this.libp2p.getPeers();

    // Attempt to ask all of our peers
    for (const peer of peers) {
      const response = await this.sendRequestToPeer(peer, protocol, payload);

      // If we get a response, return it, otherwise we iterate onto the next peer
      if (response) {
        return response;
      }
    }
    return undefined;
  }

  /**
   * Sends a request to a specific peer
   *
   * @param peerId - The peer to send the request to
   * @param protocol - The protocol to use to request
   * @param payload - The payload to send
   * @returns If the request is successful, the response is returned, otherwise undefined
   */
  async sendRequestToPeer(peerId: PeerId, protocol: string, payload: Buffer): Promise<Buffer | undefined> {
    try {
      const stream = await this.libp2p.dialProtocol(peerId, protocol);

      const result = await pipe(
        // Send message in two chunks - protocol && payload
        [Buffer.from(protocol), Buffer.from(payload)],
        stream,
        this.readMessage,
      );
      return result;
    } catch (e) {
      this.logger.warn(`Failed to send request to peer ${peerId.publicKey}`);
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
  private async streamHandler({ stream }: IncomingStreamData) {
    try {
      await pipe(
        stream,
        async function* (source: any) {
          let protocol: string | undefined = undefined;
          for await (const chunk of source) {
            // The first message should contain the protocol, subsequent messages should contain the payload

            const msg = Buffer.from(chunk.subarray()).toString();
            if (!protocol) {
              protocol = msg.toString();
            } else {
              const handler: any = REQ_RESP_PROTOCOLS[protocol];
              yield handler(msg);
            }
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
