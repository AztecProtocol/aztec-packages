import { type Logger, createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { IncomingStreamData, PeerId, Stream } from '@libp2p/interface';
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
import { AggressiveBatchConnectionSampler } from './connection-sampler/agg_batch_connection_sampler.js';
import { ConnectionSampler } from './connection-sampler/connection_sampler.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
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
 * Aggressive Request Response Service
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
export class AggressiveReqResp {
  protected readonly logger: Logger;

  private overallRequestTimeoutMs: number;
  private individualRequestTimeoutMs: number;
  private maxConcurrentPeers: number;
  private txsPerBatch: number;

  // Warning, if the `start` function is not called as the parent class constructor, then the default sub protocol handlers will be used ( not good )
  private subProtocolHandlers: ReqRespSubProtocolHandlers = DEFAULT_SUB_PROTOCOL_HANDLERS;
  private subProtocolValidators: ReqRespSubProtocolValidators = DEFAULT_SUB_PROTOCOL_VALIDATORS;

  private connectionSampler: ConnectionSampler;
  // TOOD: investigate rate limiter in aggressive mode
  private rateLimiter: RequestResponseRateLimiter;

  private snappyTransform: SnappyTransform;

  private metrics: ReqRespMetrics;

  constructor(
    config: P2PReqRespConfig,
    private libp2p: Libp2p,
    private peerScoring: PeerScoring,
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.logger = createLogger('p2p:aggressive-reqresp');

    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;
    this.maxConcurrentPeers = config.maxConcurrentPeers;
    this.txsPerBatch = config.txsPerBatch;

    this.rateLimiter = new RequestResponseRateLimiter(peerScoring);

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

    const requestFunction = async () => {
      // Attempt to ask all of our peers, but sampled in a random order
      // This function is wrapped in a timeout, so we will exit the loop if we have not received a response
      const numberOfPeers = this.libp2p.getPeers().length;

      if (numberOfPeers === 0) {
        this.logger.debug('No active peers to send requests to');
        return undefined;
      }

      const attemptedPeers: Map<string, boolean> = new Map();
      for (let i = 0; i < numberOfPeers; i++) {
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
   * Request multiple messages over the same sub protocol simultaneously from all peers in batches.
   *
   * @devnote
   * - All peers receive all requests in the batch simultaneously
   * - Once any peer successfully responds to a request, we stop requesting that specific item from other peers
   * - We take the first valid response for each request
   * - Requests are processed in batches of length txsPerBatch
   *
   * @param subProtocol - The sub protocol being requested
   * @param requests - The requests to send
   * @param timeoutMs - Maximum time to wait for responses
   * @param maxPeers - Maximum number of peers to request from
   * @returns - Array of responses corresponding to the requests, or undefined for requests with no valid response
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
    timeoutMs = 10000,
    maxPeers = this.maxConcurrentPeers,
  ): Promise<(InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined)[]> {
    maxPeers = Math.min(maxPeers, this.maxConcurrentPeers);
    const responseValidator = this.subProtocolValidators[subProtocol];
    const responses: (InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined)[] = new Array(
      requests.length,
    ).fill(undefined);
    const requestBuffers = requests.map(req => req.toBuffer());

    const requestFunction = async () => {
      this.logger.debug(`Starting batch request with ${requests.length} requests to up to ${maxPeers} peers`);

      // Process requests in batches of txsPerBatch
      for (let batchStart = 0; batchStart < requests.length; batchStart += this.txsPerBatch) {
        const batchEnd = Math.min(batchStart + this.txsPerBatch, requests.length);
        const currentBatchSize = batchEnd - batchStart;

        this.logger.debug(`Processing batch ${batchStart}-${batchEnd - 1} (${currentBatchSize} requests)`);

        // Track which requests in this batch still need responses
        const pendingRequestIndices = new Set(Array.from({ length: currentBatchSize }, (_, i) => batchStart + i));

        // Create batch sampler for the current batch
        const batchSampler = new AggressiveBatchConnectionSampler(this.connectionSampler, maxPeers);

        if (batchSampler.activePeerCount() === 0) {
          this.logger.debug('No active peers to send requests to');
          continue;
        }

        // Get all peers we'll be requesting from
        const peers = batchSampler.getAllPeers();
        this.logger.debug(`Sending batch to ${peers.length} peers`);

        // Send all requests to all peers simultaneously
        const peerPromises = peers.map(async peer => {
          try {
            const peerResults: { index: number; response: InstanceType<SubProtocolMap[SubProtocol]['response']> }[] =
              [];

            // Process each request in the batch sequentially for this peer
            for (const requestIndex of pendingRequestIndices) {
              // Skip this request if it has already been fulfilled by another peer
              if (!pendingRequestIndices.has(requestIndex)) {
                continue;
              }

              const response = await this.sendRequestToPeer(peer, subProtocol, requestBuffers[requestIndex]);

              if (response.status !== ReqRespStatus.SUCCESS) {
                this.logger.debug(
                  `Request ${requestIndex} to peer ${peer.toString()} failed with status ${prettyPrintReqRespStatus(
                    response.status,
                  )}`,
                );
                continue;
              }

              if (response && response.data.length > 0) {
                const object = subProtocolMap[subProtocol].response.fromBuffer(response.data);
                const isValid = await responseValidator(requests[requestIndex], object, peer);

                if (isValid) {
                  peerResults.push({ index: requestIndex, response: object });

                  // Mark this request as fulfilled
                  pendingRequestIndices.delete(requestIndex);
                }
              }
            }

            return { peer, results: peerResults };
          } catch (error) {
            this.logger.debug(`Failed batch request to peer ${peer.toString()}:`, error);
            batchSampler.removePeerAndReplace(peer);
            return { peer, results: [] };
          }
        });

        const allResults = await Promise.allSettled(peerPromises);

        for (const result of allResults) {
          if (result.status === 'fulfilled') {
            for (const { index, response } of result.value.results) {
              if (responses[index] === undefined) {
                responses[index] = response;
              }
            }
          }
        }

        // If all requests in this batch are fulfilled, we can move to the next batch
        if (pendingRequestIndices.size === 0) {
          this.logger.debug(`Completed all requests in batch ${batchStart}-${batchEnd - 1}`);
        } else {
          this.logger.debug(
            `Batch ${batchStart}-${batchEnd - 1} has ${pendingRequestIndices.size} unfulfilled requests`,
          );
        }
      }

      // Count how many requests were fulfilled
      const fulfilledCount = responses.filter(r => r !== undefined).length;
      this.logger.debug(`Batch request completed. Fulfilled ${fulfilledCount}/${requests.length} requests`);

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
      return responses;
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
  @trackSpan('ReqResp.sendRequestToPeer', (peerId: PeerId, subProtocol: ReqRespSubProtocol, _: Buffer) => ({
    [Attributes.P2P_ID]: peerId.toString(),
    [Attributes.P2P_REQ_RESP_PROTOCOL]: subProtocol,
  }))
  public async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
  ): Promise<ReqRespResponse> {
    let stream: Stream | undefined;
    try {
      this.metrics.recordRequestSent(subProtocol);

      stream = await this.connectionSampler.dialProtocol(peerId, subProtocol);

      // Open the stream with a timeout
      const result = await executeTimeout<ReqRespResponse>(
        (): Promise<ReqRespResponse> => pipe([payload], stream!, this.readMessage.bind(this)),
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
              // Don't respond
              await stream.close();
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

      const sendErrorChunk = this.sendErrorChunk(errorStatus);

      // Return and yield the response chunk
      await pipe(
        stream,
        async function* (_source: any) {
          yield* sendErrorChunk;
        },
        stream,
      );
    } finally {
      await stream.close();
    }
  }

  private async *sendErrorChunk(error: ReqRespStatus): AsyncIterable<Uint8Array> {
    const errorChunk = Buffer.from([error]);
    yield new Uint8Array(errorChunk);
  }
}
