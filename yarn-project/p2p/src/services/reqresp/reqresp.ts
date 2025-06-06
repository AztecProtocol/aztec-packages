// @attribution: lodestar impl for inspiration
import { compactArray } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { IncomingStreamData, PeerId, Stream } from '@libp2p/interface';
import { abortableDuplex, abortableSink } from 'abortable-iterator';
import { pipe } from 'it-pipe';
import type { Libp2p } from 'libp2p';
import type { Uint8ArrayList } from 'uint8arraylist';

import {
  CollectiveReqRespTimeoutError,
  IndividualReqRespTimeoutError,
  InvalidResponseError,
} from '../../errors/reqresp.error.js';
import { SnappyTransform } from '../encoding.js';
import type { PeerScoring } from '../peer-manager/peer_scoring.js';
import type { P2PReqRespConfig } from './config.js';
import { BatchConnectionSampler } from './connection-sampler/batch_connection_sampler.js';
import { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolRateLimits,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  subProtocolMap,
} from './interface.js';
import { ReqRespMetrics } from './metrics.js';
import {
  RateLimitStatus,
  RequestResponseRateLimiter,
  prettyPrintRateLimitStatus,
} from './rate-limiter/rate_limiter.js';
import { ReqRespStatus, ReqRespStatusError, parseStatusChunk, prettyPrintReqRespStatus } from './status.js';

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

  private connectionSampler: ConnectionSampler;
  private rateLimiter: RequestResponseRateLimiter;

  private snappyTransform: SnappyTransform;

  private metrics: ReqRespMetrics;

  constructor(
    config: P2PReqRespConfig,
    private libp2p: Libp2p,
    private peerScoring: PeerScoring,
    rateLimits: Partial<ReqRespSubProtocolRateLimits> = {},
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.logger = createLogger('p2p:reqresp');

    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;

    this.rateLimiter = new RequestResponseRateLimiter(peerScoring, rateLimits);

    // Connection sampler is used to sample our connected peers
    this.connectionSampler = new ConnectionSampler(libp2p);

    this.snappyTransform = new SnappyTransform();
    this.metrics = new ReqRespMetrics(telemetryClient);
  }

  get tracer() {
    return this.metrics.tracer;
  }

  /**
   * Start the reqresp service
   */
  async start(subProtocolHandlers: ReqRespSubProtocolHandlers, subProtocolValidators: ReqRespSubProtocolValidators) {
    this.subProtocolHandlers = subProtocolHandlers;
    this.subProtocolValidators = subProtocolValidators;

    // Register all protocol handlers
    for (const subProtocol of Object.keys(this.subProtocolHandlers)) {
      await this.libp2p.handle(
        subProtocol,
        (data: IncomingStreamData) =>
          void this.streamHandler(subProtocol as ReqRespSubProtocol, data).catch(err =>
            this.logger.error(`Error on libp2p subprotocol ${subProtocol} handler`, err),
          ),
      );
    }
    this.rateLimiter.start();
  }

  /**
   * Stop the reqresp service
   */
  async stop() {
    // Unregister handlers in parallel
    const unregisterPromises = Object.keys(this.subProtocolHandlers).map(protocol => this.libp2p.unhandle(protocol));
    await Promise.all(unregisterPromises);

    // Close connection sampler
    await this.connectionSampler.stop();
    this.logger.debug('ReqResp: Connection sampler stopped');

    // Close streams in parallel
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

    const requestFunction = async (signal: AbortSignal) => {
      // Attempt to ask all of our peers, but sampled in a random order
      // This function is wrapped in a timeout, so we will exit the loop if we have not received a response
      const numberOfPeers = this.libp2p.getPeers().length;

      if (numberOfPeers === 0) {
        this.logger.debug('No active peers to send requests to');
        return undefined;
      }

      const attemptedPeers: Map<string, boolean> = new Map();
      for (let i = 0; i < numberOfPeers; i++) {
        if (signal.aborted) {
          throw new AbortError('Request has been aborted');
        }
        // Sample a peer to make a request to
        const peer = this.connectionSampler.getPeer(attemptedPeers);
        this.logger.trace(`Attempting to send request to peer: ${peer?.toString()}`);
        if (!peer) {
          this.logger.debug('No peers available to send requests to');
          return undefined;
        }

        attemptedPeers.set(peer.toString(), true);

        this.logger.trace(`Sending request to peer: ${peer.toString()}`);
        const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffer);

        if (response.status !== ReqRespStatus.SUCCESS) {
          this.logger.debug(
            `Request to peer ${peer.toString()} failed with status ${prettyPrintReqRespStatus(response.status)}`,
          );
          continue;
        }

        // If we get a response, return it, otherwise we iterate onto the next peer
        // We do not consider it a success if we have an empty buffer
        if (response && response.data.length > 0) {
          const object = subProtocolMap[subProtocol].response.fromBuffer(response.data);
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
  @trackSpan(
    'ReqResp.sendBatchRequest',
    (subProtocol: ReqRespSubProtocol, requests: InstanceType<SubProtocolMap[ReqRespSubProtocol]['request']>[]) => ({
      [Attributes.P2P_REQ_RESP_PROTOCOL]: subProtocol,
      [Attributes.P2P_REQ_RESP_BATCH_REQUESTS_COUNT]: requests.length,
    }),
  )
  async sendBatchRequest<SubProtocol extends ReqRespSubProtocol>(
    subProtocol: SubProtocol,
    requests: InstanceType<SubProtocolMap[SubProtocol]['request']>[],
    pinnedPeer: PeerId | undefined,
    timeoutMs = 10000,
    maxPeers = Math.max(10, Math.ceil(requests.length / 3)),
    maxRetryAttempts = 3,
  ): Promise<(InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined)[]> {
    const responseValidator = this.subProtocolValidators[subProtocol];
    const responses: (InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined)[] = new Array(requests.length);
    const requestBuffers = requests.map(req => req.toBuffer());

    const requestFunction = async (signal: AbortSignal) => {
      // Track which requests still need to be processed
      const pendingRequestIndices = new Set(requestBuffers.map((_, i) => i));

      // Create batch sampler with the total number of requests and max peers
      const batchSampler = new BatchConnectionSampler(
        this.connectionSampler,
        requests.length,
        maxPeers,
        compactArray([pinnedPeer]), // Exclude pinned peer from sampling, we will forcefully send all requests to it
      );

      if (batchSampler.activePeerCount === 0 && !pinnedPeer) {
        this.logger.warn('No active peers to send requests to');
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
        if (signal.aborted) {
          throw new AbortError('Batch request aborted');
        }
        // Process requests in parallel for each available peer
        type BatchEntry = { peerId: PeerId; indices: number[] };
        const requestBatches = new Map<string, BatchEntry>();

        // Group requests by peer
        for (const requestIndex of pendingRequestIndices) {
          const peer = batchSampler.getPeerForRequest(requestIndex);
          if (!peer) {
            break;
          }
          const peerAsString = peer.toString();
          if (!requestBatches.has(peerAsString)) {
            requestBatches.set(peerAsString, { peerId: peer, indices: [] });
          }
          requestBatches.get(peerAsString)!.indices.push(requestIndex);
        }

        // If there is a pinned peer, we will always send every request to that peer
        // We use the default limits for the subprotocol to avoid hitting the rate limiter
        if (pinnedPeer) {
          const limit = this.rateLimiter.getRateLimits(subProtocol).peerLimit.quotaCount;
          requestBatches.set(pinnedPeer.toString(), {
            peerId: pinnedPeer,
            indices: Array.from(pendingRequestIndices.values()).slice(0, limit),
          });
        }

        // Make parallel requests for each peer's batch
        // A batch entry will look something like this:
        // PeerId0: [0, 1, 2, 3]
        // PeerId1: [4, 5, 6, 7]

        // Peer Id 0 will send requests 0, 1, 2, 3 in serial
        // while simultaneously Peer Id 1 will send requests 4, 5, 6, 7 in serial

        const batchResults = await Promise.all(
          Array.from(requestBatches.entries()).map(async ([peerAsString, { peerId: peer, indices }]) => {
            try {
              // Requests all going to the same peer are sent synchronously
              const peerResults: { index: number; response: InstanceType<SubProtocolMap[SubProtocol]['response']> }[] =
                [];
              for (const index of indices) {
                this.logger.trace(`Sending request ${index} to peer ${peerAsString}`);
                const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffers[index]);

                // Check the status of the response buffer
                if (response.status !== ReqRespStatus.SUCCESS) {
                  this.logger.debug(
                    `Request to peer ${peerAsString} failed with status ${prettyPrintReqRespStatus(response.status)}`,
                  );

                  // If we hit a rate limit or some failure, we remove the peer and return the results,
                  // they will be split among remaining peers and the new sampled peer
                  batchSampler.removePeerAndReplace(peer);
                  return { peer, results: peerResults };
                }

                if (response && response.data.length > 0) {
                  const object = subProtocolMap[subProtocol].response.fromBuffer(response.data);
                  const isValid = await responseValidator(requests[index], object, peer);

                  if (isValid) {
                    peerResults.push({ index, response: object });
                  }
                }
              }

              return { peer, results: peerResults };
            } catch (error) {
              this.logger.debug(`Failed batch request to peer ${peerAsString}:`, error);
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
      return await executeTimeout<(InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined)[]>(
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
   * @param dialTimeout - If establishing a stream takes longer than this an error will be thrown
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
  @trackSpan('ReqResp.sendRequestToPeer', (peerId: PeerId, subProtocol: ReqRespSubProtocol, _: Buffer) => ({
    [Attributes.P2P_ID]: peerId.toString(),
    [Attributes.P2P_REQ_RESP_PROTOCOL]: subProtocol,
  }))
  public async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
    dialTimeout: number = 500,
  ): Promise<ReqRespResponse> {
    let stream: Stream | undefined;
    try {
      this.metrics.recordRequestSent(subProtocol);

      stream = await this.connectionSampler.dialProtocol(peerId, subProtocol, dialTimeout);

      // Open the stream with a timeout
      const result = await executeTimeout<ReqRespResponse>(
        (signal): Promise<ReqRespResponse> =>
          pipe([payload], abortableDuplex(stream!, signal), abortableSink(this.readMessage.bind(this), signal)),
        this.individualRequestTimeoutMs,
        () => new IndividualReqRespTimeoutError(),
      );

      return result;
    } catch (e: any) {
      this.metrics.recordRequestError(subProtocol);
      this.handleResponseError(e, peerId, subProtocol);

      // If there is an exception, we return an unknown response
      return {
        status: ReqRespStatus.FAILURE,
        data: Buffer.from([]),
      };
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
    // Non punishable errors - we do not expect a response for goodbye messages
    if (subProtocol === ReqRespSubProtocol.GOODBYE) {
      this.logger.debug('Error encountered on goodbye sub protocol, no penalty', {
        peerId: peerId.toString(),
        subProtocol,
      });
      return undefined;
    }

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
   *
   * The message is split into two components
   * - The first chunk should contain a control byte, indicating the status of the response see `ReqRespStatus`
   * - The second chunk should contain the response data
   */
  private async readMessage(source: AsyncIterable<Uint8ArrayList>): Promise<ReqRespResponse> {
    let statusBuffer: ReqRespStatus | undefined;
    const chunks: Uint8Array[] = [];

    try {
      for await (const chunk of source) {
        if (statusBuffer === undefined) {
          const firstChunkBuffer = chunk.subarray();
          statusBuffer = parseStatusChunk(firstChunkBuffer);
        } else {
          chunks.push(chunk.subarray());
        }
      }

      const messageData = Buffer.concat(chunks);
      const message: Buffer = this.snappyTransform.inboundTransformNoTopic(messageData);

      return {
        status: statusBuffer ?? ReqRespStatus.UNKNOWN,
        data: message,
      };
    } catch (e: any) {
      this.logger.debug(`Reading message failed: ${e.message}`);

      let status = ReqRespStatus.UNKNOWN;
      if (e instanceof ReqRespStatusError) {
        status = e.status;
      }

      return {
        status,
        data: Buffer.from([]),
      };
    }
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
  @trackSpan('ReqResp.streamHandler', (protocol: ReqRespSubProtocol, { connection }: IncomingStreamData) => ({
    [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol,
    [Attributes.P2P_ID]: connection.remotePeer.toString(),
  }))
  private async streamHandler(protocol: ReqRespSubProtocol, { stream, connection }: IncomingStreamData) {
    this.metrics.recordRequestReceived(protocol);

    try {
      // Store a reference to from this for the async generator
      const rateLimitStatus = this.rateLimiter.allow(protocol, connection.remotePeer);
      if (rateLimitStatus != RateLimitStatus.Allowed) {
        this.logger.warn(
          `Rate limit exceeded ${prettyPrintRateLimitStatus(rateLimitStatus)} for ${protocol} from ${
            connection.remotePeer
          }`,
        );

        throw new ReqRespStatusError(ReqRespStatus.RATE_LIMIT_EXCEEDED);
      }

      const handler = this.subProtocolHandlers[protocol];
      const transform = this.snappyTransform;

      await pipe(
        stream,
        async function* (source: any) {
          for await (const chunkList of source) {
            const msg = Buffer.from(chunkList.subarray());
            const response = await handler(connection.remotePeer, msg);

            if (protocol === ReqRespSubProtocol.GOODBYE) {
              // NOTE: The stream was already closed by Goodbye handler
              // peerManager.goodbyeReceived(peerId, reason); will call libp2p.hangUp closing all active streams and connections
              // Don't respond
              return;
            }

            // Send success code first, then the response
            const successChunk = Buffer.from([ReqRespStatus.SUCCESS]);
            yield new Uint8Array(successChunk);

            yield new Uint8Array(transform.outboundTransformNoTopic(response));
          }
        },
        stream,
      );
    } catch (e: any) {
      this.logger.warn('Reqresp Response error: ', e);
      this.metrics.recordResponseError(protocol);

      // If we receive a known error, we use the error status in the response chunk, otherwise we categorize as unknown
      let errorStatus = ReqRespStatus.UNKNOWN;
      if (e instanceof ReqRespStatusError) {
        errorStatus = e.status;
      }

      if (stream.status === 'open') {
        const sendErrorChunk = this.sendErrorChunk(errorStatus);
        // Return and yield the response chunk
        await pipe(
          stream,
          async function* (_source: any) {
            yield* sendErrorChunk;
          },
          stream,
        );
      } else {
        this.logger.debug('Stream already closed, not sending error response', { protocol, err: e, errorStatus });
      }
    } finally {
      //NOTE: All other status codes indicate closed stream.
      //Either graceful close (closed/closing) or forced close (aborted/reset)
      if (stream.status === 'open') {
        await stream.close();
      }
    }
  }

  private async *sendErrorChunk(error: ReqRespStatus): AsyncIterable<Uint8Array> {
    const errorChunk = Buffer.from([error]);
    yield new Uint8Array(errorChunk);
  }
}
