// @attribution: lodestar impl for inspiration
import { PeerErrorSeverity } from '@aztec/circuit-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';

import { type IncomingStreamData, type PeerId, type Stream } from '@libp2p/interface';
import { pipe } from 'it-pipe';
import { type Libp2p } from 'libp2p';
import { type Uint8ArrayList } from 'uint8arraylist';

import {
  CollectiveReqRespTimeoutError,
  IndividualReqRespTimeoutError,
  InvalidResponseError,
} from '../../errors/reqresp.error.js';
import { SnappyTransform } from '../encoding.js';
import { type PeerScoring } from '../peer-manager/peer_scoring.js';
import { type P2PReqRespConfig } from './config.js';
import { BatchConnectionSampler } from './connection-sampler/batch_connection_sampler.js';
import { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  subProtocolMap,
} from './interface.js';
import { RequestResponseRateLimiter } from './rate-limiter/rate_limiter.js';

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

  private snappyTransform: SnappyTransform;

  private connectionSampler: ConnectionSampler;

  constructor(config: P2PReqRespConfig, private libp2p: Libp2p, private peerScoring: PeerScoring) {
    this.logger = createLogger('p2p:reqresp');

    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;

    this.rateLimiter = new RequestResponseRateLimiter(peerScoring);

    // Connection sampler is used to sample our connected peers
    this.connectionSampler = new ConnectionSampler(libp2p);

    this.snappyTransform = new SnappyTransform();
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

    await this.connectionSampler.stop();
    this.logger.debug('ReqResp: Connection sampler stopped');

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
   * - Sample a peer to send the request to.
   * - Opens a stream with the peer using the specified sub-protocol.
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
    const responseValidator = this.subProtocolValidators[subProtocol];
    const requestBuffer = request.toBuffer();

    const requestFunction = async () => {
      // Attempt to ask all of our peers, but sampled in a random order
      // This function is wrapped in a timeout, so we will exit the loop if we have not received a response
      const numberOfPeers = this.libp2p.getPeers().length;

      if (numberOfPeers === 0) {
        this.logger.debug('No active peers to send requests to');
        return undefined;
      }

      let attemptedPeers: Map<PeerId, boolean> = new Map();
      for (let i = 0; i < numberOfPeers; i++) {
        // Sample a peer to make a request to
        const peer = this.connectionSampler.getPeer(attemptedPeers);
        attemptedPeers.set(peer, true);

        this.logger.trace(`Sending request to peer: ${peer.toString()}`);
        const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffer);

        // If we get a response, return it, otherwise we iterate onto the next peer
        // We do not consider it a success if we have an empty buffer
        if (response && response.length > 0) {
          const object = subProtocolMap[subProtocol].response.fromBuffer(response);
          // The response validator handles peer punishment within
          const isValid = await responseValidator(request, object, peer);
          if (!isValid) {
            throw new InvalidResponseError();
          }
          return object;
        }
      }
    };

    try {
      return await executeTimeout<InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined>(
        requestFunction,
        this.overallRequestTimeoutMs,
        () => new CollectiveReqRespTimeoutError(),
      );
    } catch (e: any) {
      this.logger.debug(`${e.message} | subProtocol: ${subProtocol}`);
      return undefined;
    }
  }

  /**
   * Request multiple messages over the same sub protocol, balancing the requests across peers.
   *
   * @devnote
   * - The function prioritizes sending requests to free peers using a batch sampling strategy.
   * - If a peer fails to respond or returns an invalid response, it is removed from the sampling pool and replaced.
   * - The function stops retrying once all requests are processed, no active peers remain, or the maximum retry attempts are reached.
   * - Responses are validated using a custom validator for the sub-protocol.*
   *
   * Requests are sent in parallel to each peer, but multiple requests are sent to the same peer in series
   * - If a peer fails to respond or returns an invalid response, it is removed from the sampling pool and replaced.
   * - The function stops retrying once all requests are processed, no active peers remain, or the maximum retry attempts are reached.
   * - Responses are validated using a custom validator for the sub-protocol.*
   *
   * @param subProtocol
   * @param requests
   * @param timeoutMs
   * @param maxPeers
   * @returns
   *
   * @throws {CollectiveReqRespTimeoutError} - If the request batch exceeds the specified timeout (`timeoutMs`).
   */
  async sendBatchRequest<SubProtocol extends ReqRespSubProtocol>(
    subProtocol: SubProtocol,
    requests: InstanceType<SubProtocolMap[SubProtocol]['request']>[],
    timeoutMs = 10000,
    maxPeers = Math.min(10, requests.length),
    maxRetryAttempts = 3,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']>[]> {
    const responseValidator = this.subProtocolValidators[subProtocol];
    const responses: InstanceType<SubProtocolMap[SubProtocol]['response']>[] = new Array(requests.length);
    const requestBuffers = requests.map(req => req.toBuffer());

    const requestFunction = async () => {
      // Track which requests still need to be processed
      const pendingRequestIndices = new Set(requestBuffers.map((_, i) => i));

      // Create batch sampler with the total number of requests and max peers
      const batchSampler = new BatchConnectionSampler(this.connectionSampler, requests.length, maxPeers);

      if (batchSampler.activePeerCount === 0) {
        this.logger.debug('No active peers to send requests to');
        return [];
      }

      // This is where it gets fun
      // The outer loop is the retry loop, we will continue to retry until we process all indices we have
      // not received a response for, or we have reached the max retry attempts

      // The inner loop is the batch loop, we will process all requests for each peer in parallel
      // We will then process the results of the requests, and resample any peers that failed to respond
      // We will continue to retry until we have processed all indices, or we have reached the max retry attempts

      let retryAttempts = 0;
      while (pendingRequestIndices.size > 0 && batchSampler.activePeerCount > 0 && retryAttempts < maxRetryAttempts) {
        // Process requests in parallel for each available peer
        const requestBatches = new Map<PeerId, number[]>();

        // Group requests by peer
        for (const requestIndex of pendingRequestIndices) {
          const peer = batchSampler.getPeerForRequest(requestIndex);
          if (!peer) {
            break;
          }

          if (!requestBatches.has(peer)) {
            requestBatches.set(peer, []);
          }
          requestBatches.get(peer)!.push(requestIndex);
        }

        // Make parallel requests for each peer's batch
        // A batch entry will look something like this:
        // PeerId0: [0, 1, 2, 3]
        // PeerId1: [0, 1, 2, 3]

        // Peer Id 0 will send requests 0, 1, 2, 3 in serial
        // while simultaneously Peer Id 1 will send requests 0, 1, 2, 3 in serial

        const batchResults = await Promise.all(
          Array.from(requestBatches.entries()).map(async ([peer, indices]) => {
            try {
              // Requests all going to the same peer are sent synchronously
              const peerResults: { index: number; response: InstanceType<SubProtocolMap[SubProtocol]['response']> }[] =
                [];
              for (const index of indices) {
                const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffers[index]);

                if (response && response.length > 0) {
                  const object = subProtocolMap[subProtocol].response.fromBuffer(response);
                  const isValid = await responseValidator(requests[index], object, peer);

                  if (isValid) {
                    peerResults.push({ index, response: object });
                  }
                }
              }

              return { peer, results: peerResults };
            } catch (error) {
              this.logger.debug(`Failed batch request to peer ${peer.toString()}:`, error);
              batchSampler.removePeerAndReplace(peer);
              return { peer, results: [] };
            }
          }),
        );

        // Process results
        for (const { results } of batchResults) {
          for (const { index, response } of results) {
            if (response) {
              responses[index] = response;
              pendingRequestIndices.delete(index);
            }
          }
        }

        retryAttempts++;
      }

      if (retryAttempts >= maxRetryAttempts) {
        this.logger.debug(`Max retry attempts ${maxRetryAttempts} reached for batch request`);
      }

      return responses;
    };

    try {
      return await executeTimeout<InstanceType<SubProtocolMap[SubProtocol]['response']>[]>(
        requestFunction,
        timeoutMs,
        () => new CollectiveReqRespTimeoutError(),
      );
    } catch (e: any) {
      this.logger.debug(`${e.message} | subProtocol: ${subProtocol}`);
      return [];
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
  public async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
  ): Promise<Buffer | undefined> {
    let stream: Stream | undefined;
    try {
      stream = await this.connectionSampler.dialProtocol(peerId, subProtocol);

      // Open the stream with a timeout
      const result = await executeTimeout<Buffer>(
        (): Promise<Buffer> => pipe([payload], stream!, this.readMessage.bind(this)),
        this.individualRequestTimeoutMs,
        () => new IndividualReqRespTimeoutError(),
      );

      return result;
    } catch (e: any) {
      this.handleResponseError(e, peerId, subProtocol);
    } finally {
      // Only close the stream if we created it
      if (stream) {
        try {
          await this.connectionSampler.close(stream.id);
        } catch (closeError) {
          this.logger.error(
            `Error closing stream: ${closeError instanceof Error ? closeError.message : 'Unknown error'}`,
          );
        }
      }
    }
  }

  /**
   * Handle a response error
   *
   * ReqResp errors are punished differently depending on the severity of the offense
   *
   * @param e - The error
   * @param peerId - The peer id
   * @param subProtocol - The sub protocol
   * @returns If the error is non pubishable, then undefined is returned, otherwise the peer is penalized
   */
  private handleResponseError(e: any, peerId: PeerId, subProtocol: ReqRespSubProtocol): void {
    const severity = this.categorizeError(e, peerId, subProtocol);
    if (severity) {
      this.peerScoring.penalizePeer(peerId, severity);
    }
  }

  /**
   * Categorize the error and log it.
   */
  private categorizeError(e: any, peerId: PeerId, subProtocol: ReqRespSubProtocol): PeerErrorSeverity | undefined {
    // Non pubishable errors
    // We do not punish a collective timeout, as the node triggers this interupt, independent of the peer's behaviour
    const logTags = {
      peerId: peerId.toString(),
      subProtocol,
    };
    if (e instanceof CollectiveReqRespTimeoutError || e instanceof InvalidResponseError) {
      this.logger.debug(
        `Non-punishable error: ${e.message} | peerId: ${peerId.toString()} | subProtocol: ${subProtocol}`,
        logTags,
      );
      return undefined;
    }

    // Pubishable errors
    // Connection reset errors in the networking stack are punished with high severity
    // it just signals an unreliable peer
    // We assume that the requesting node has a functioning networking stack.
    if (e?.code === 'ECONNRESET' || e?.code === 'EPIPE') {
      this.logger.debug(`Connection reset: ${peerId.toString()}`, logTags);
      return PeerErrorSeverity.HighToleranceError;
    }

    if (e?.code === 'ECONNREFUSED') {
      this.logger.debug(`Connection refused: ${peerId.toString()}`, logTags);
      return PeerErrorSeverity.HighToleranceError;
    }

    // Timeout errors are punished with high tolerance, they can be due to a geogrpahically far away peer or an
    // overloaded peer
    if (e instanceof IndividualReqRespTimeoutError) {
      this.logger.debug(
        `Timeout error: ${e.message} | peerId: ${peerId.toString()} | subProtocol: ${subProtocol}`,
        logTags,
      );
      return PeerErrorSeverity.HighToleranceError;
    }

    // Catch all error
    this.logger.error(`Unexpected error sending request to peer`, e, logTags);
    return PeerErrorSeverity.HighToleranceError;
  }

  /**
   * Read a message returned from a stream into a single buffer
   */
  private async readMessage(source: AsyncIterable<Uint8ArrayList>): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk.subarray());
    }
    const messageData = Buffer.concat(chunks);
    return this.snappyTransform.inboundTransformNoTopic(messageData);
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
    const transform = this.snappyTransform;

    try {
      await pipe(
        stream,
        async function* (source: any) {
          for await (const chunkList of source) {
            const msg = Buffer.from(chunkList.subarray());
            const response = await handler(connection.remotePeer, msg);
            yield new Uint8Array(transform.outboundTransformNoTopic(response));
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
