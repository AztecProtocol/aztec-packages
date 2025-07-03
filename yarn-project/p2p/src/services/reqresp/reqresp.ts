// @attribution: lodestar impl for inspiration
import { compactArray } from '@aztec/foundation/collection';
import { AbortError, TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { IncomingStreamData, PeerId, Stream } from '@libp2p/interface';
import type { Libp2p } from 'libp2p';
import { pipeline } from 'node:stream/promises';
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
import { ConnectionSampler, RandomSampler } from './connection-sampler/connection_sampler.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespInterface,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolRateLimits,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  responseFromBuffer,
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
export class ReqResp implements ReqRespInterface {
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
    private logger = createLogger('p2p:reqresp'),
    rateLimits: Partial<ReqRespSubProtocolRateLimits> = {},
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.overallRequestTimeoutMs = config.overallRequestTimeoutMs;
    this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;

    this.rateLimiter = new RequestResponseRateLimiter(peerScoring, rateLimits);

    // Connection sampler is used to sample our connected peers
    this.connectionSampler = new ConnectionSampler(
      libp2p,
      new RandomSampler(),
      createLogger(`${logger.module}:connection-sampler`),
      config,
    );

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

  async addSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator: ReqRespSubProtocolValidators[ReqRespSubProtocol] = DEFAULT_SUB_PROTOCOL_VALIDATORS[subProtocol],
  ): Promise<void> {
    this.subProtocolHandlers[subProtocol] = handler;
    this.subProtocolValidators[subProtocol] = validator;
    await this.libp2p.handle(
      subProtocol,
      (data: IncomingStreamData) =>
        void this.streamHandler(subProtocol as ReqRespSubProtocol, data).catch(err =>
          this.logger.error(`Error on libp2p subprotocol ${subProtocol} handler`, err),
        ),
    );
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
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']>[]> {
    const responseValidator = this.subProtocolValidators[subProtocol];
    const responses: InstanceType<SubProtocolMap[SubProtocol]['response']>[] = new Array(requests.length);
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
        createLogger(`${this.logger.module}:batch-connection-sampler`),
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
                  const object = responseFromBuffer(subProtocol, response.data);
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

      this.logger.trace(`Sending request to peer ${peerId.toString()} on sub protocol ${subProtocol}`);
      stream = await this.connectionSampler.dialProtocol(peerId, subProtocol, dialTimeout);
      this.logger.trace(
        `Opened stream ${stream.id} for sending request to peer ${peerId.toString()} on sub protocol ${subProtocol}`,
      );

      const timeoutErr = new IndividualReqRespTimeoutError();
      const [_, resp] = await executeTimeout(
        signal =>
          Promise.all([
            pipeline([payload], stream!.sink, { signal }),
            pipeline(stream!.source, this.readMessage.bind(this), { signal }),
          ]),
        this.individualRequestTimeoutMs,
        () => timeoutErr,
      );
      return resp;
    } catch (e: any) {
      // On error we immediately abort the stream, this is preferred way,
      // because it signals to the sender that error happened, whereas
      // closing the stream only closes our side and is much slower
      if (stream) {
        stream!.abort(e);
      }

      this.metrics.recordRequestError(subProtocol);
      this.handleResponseError(e, peerId, subProtocol);

      // If there is an exception, we return an unknown response
      this.logger.debug(`Error sending request to peer ${peerId.toString()} on sub protocol ${subProtocol}: ${e}`);
      return { status: ReqRespStatus.FAILURE };
    } finally {
      // Only close the stream if we created it
      // Note even if we aborted the stream, calling close on it is ok, it's just a no-op
      if (stream) {
        try {
          this.logger.trace(
            `Closing stream ${stream.id} for request to peer ${peerId.toString()} on sub protocol ${subProtocol}`,
          );
          await this.connectionSampler.close(stream);
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
    const logTags = { peerId: peerId.toString(), subProtocol };

    // Non punishable errors - we do not expect a response for goodbye messages
    if (subProtocol === ReqRespSubProtocol.GOODBYE) {
      this.logger.debug('Error encountered on goodbye sub protocol, no penalty', logTags);
      return undefined;
    }

    // We do not punish a collective timeout, as the node triggers this interupt, independent of the peer's behaviour
    if (e instanceof CollectiveReqRespTimeoutError || e instanceof InvalidResponseError) {
      this.logger.debug(`Non-punishable error in ${subProtocol}: ${e.message}`, logTags);
      return undefined;
    }

    // Do not punish if we are stopping the service
    if (e instanceof AbortError || e?.code == 'ABORT_ERR') {
      this.logger.debug(`Request aborted: ${e.message}`, logTags);
      return undefined;
    }

    // Do not punish if we are the ones closing the connection
    if (
      e?.code === 'ERR_CONNECTION_BEING_CLOSED' ||
      e?.code === 'ERR_CONNECTION_CLOSED' ||
      e?.code === 'ERR_TRANSIENT_CONNECTION' ||
      e?.message?.includes('Muxer already closed')
    ) {
      this.logger.debug(
        `Connection closed to peer from our side: ${peerId.toString()} (${e?.message ?? 'missing error message'})`,
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

    if (e?.code === 'ERR_UNEXPECTED_EOF') {
      this.logger.debug(`Connection unexpected EOF: ${peerId.toString()}`, logTags);
      return PeerErrorSeverity.HighToleranceError;
    }

    if (e?.code === 'ERR_UNSUPPORTED_PROTOCOL') {
      this.logger.debug(`Sub protocol not supported by peer: ${peerId.toString()}`, logTags);
      return PeerErrorSeverity.HighToleranceError;
    }

    // Timeout errors are punished with high tolerance, they can be due to a geographically far away or overloaded peer
    if (e instanceof IndividualReqRespTimeoutError || e instanceof TimeoutError) {
      this.logger.debug(`Timeout error in ${subProtocol}: ${e.message}`, logTags);
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
    let status: ReqRespStatus | undefined;
    const chunks: Uint8Array[] = [];

    try {
      for await (const chunk of source) {
        const statusParsed = status !== undefined;
        if (statusParsed) {
          chunks.push(chunk.subarray());
          continue;
        }

        const firstChunkBuffer = chunk.subarray();
        status = parseStatusChunk(firstChunkBuffer);

        // In case status is not SUCCESS, we do not expect any data in the response
        // we can return early
        if (status !== ReqRespStatus.SUCCESS) {
          return {
            status,
          };
        }
      }

      const messageData = Buffer.concat(chunks);
      const message: Buffer = this.snappyTransform.inboundTransformNoTopic(messageData);

      return {
        status: status ?? ReqRespStatus.UNKNOWN,
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
      };
    }
  }

  /**
   * Stream Handler
   * Reads the incoming stream, determines the protocol, then triggers the appropriate handler
   *
   * @param protocol - The sub protocol to handle
   * @param incomingStream - The incoming stream data containing the stream and connection
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
  private async streamHandler(protocol: ReqRespSubProtocol, incomingStream: IncomingStreamData) {
    const { stream, connection } = incomingStream;
    try {
      this.metrics.recordRequestReceived(protocol);
      const rateLimitStatus = this.rateLimiter.allow(protocol, connection.remotePeer);
      if (rateLimitStatus !== RateLimitStatus.Allowed) {
        this.logger.warn(
          `Rate limit exceeded ${prettyPrintRateLimitStatus(rateLimitStatus)} for ${protocol} from ${
            connection.remotePeer
          }`,
        );

        throw new ReqRespStatusError(ReqRespStatus.RATE_LIMIT_EXCEEDED);
      }

      await this.processStream(protocol, incomingStream);
    } catch (err: any) {
      this.metrics.recordResponseError(protocol);

      if (err instanceof ReqRespStatusError) {
        const errorSent = await this.trySendError(stream, err.status);
        const logMessage = errorSent
          ? 'Protocol error sent successfully'
          : 'Stream already closed or poisoned, not sending error response';

        this.logger.warn(logMessage, {
          protocol,
          err,
          errorStatus: err.status,
          cause: err.cause ?? 'Cause unknown',
        });
      } else {
        // In erroneous case we abort the stream, this will signal the peer that something went wrong
        // and that this stream should be dropped
        this.logger.warn('Unknown stream error while handling the stream, aborting', {
          protocol,
          err,
        });

        stream.abort(err);
      }
    } finally {
      //NOTE: This is idempotent action, so it's ok to call it even if stream was aborted
      await stream.close();
    }
  }

  /**
   * Reads incoming data from the stream, processes it according to the sub protocol,
   * and puts response back into the stream.
   *
   * @param protocol - The sub protocol to use for processing the stream
   * @param incomingStream - The incoming stream data containing the stream and connection
   *
   * */
  private async processStream(protocol: ReqRespSubProtocol, { stream, connection }: IncomingStreamData): Promise<void> {
    const handler = this.subProtocolHandlers[protocol]!;
    const snappy = this.snappyTransform;
    const SUCCESS = Uint8Array.of(ReqRespStatus.SUCCESS);

    await pipeline(
      stream.source,
      async function* (source: any) {
        for await (const chunk of source) {
          const response = await handler(connection.remotePeer, chunk.subarray());

          if (protocol === ReqRespSubProtocol.GOODBYE) {
            // NOTE: The stream was already closed by Goodbye handler
            // peerManager.goodbyeReceived(peerId, reason); will call libp2p.hangUp closing all active streams and connections
            // Don't try to respond
            return;
          }

          stream.metadata.written = true; // Mark the stream as written to;

          yield SUCCESS;
          yield snappy.outboundTransformNoTopic(response);
        }
      },
      stream.sink,
    );
  }

  /**
   * Try to send error status to the peer. We say try, because the stream,
   * might already be closed
   * @param stream - The stream opened between us and the peer
   * @param status - The error status to send back to the peer
   * @returns true if error was sent successfully, otherwise false
   *
   */
  private async trySendError(stream: Stream, status: ReqRespStatus): Promise<boolean> {
    const canWriteToStream =
      // 'writing' is a bit weird naming, but it actually means that the stream is ready to write
      // 'ready' means that stream ready to be opened for writing
      stream.status === 'open' && (stream.writeStatus === 'writing' || stream.writeStatus === 'ready');

    // Stream was already written to, we consider it poisoned, in a sense,
    // that even if we write an error response, it will not be interpreted correctly by the peer
    const streamPoisoned = stream.metadata.written === true;
    const shouldWriteToStream = canWriteToStream && !streamPoisoned;

    if (!shouldWriteToStream) {
      return false;
    }

    try {
      await pipeline(function* () {
        yield Uint8Array.of(status);
      }, stream.sink);

      return true;
    } catch (e: any) {
      this.logger.warn('Error while sending error response', e);

      stream.abort(e);
      return false;
    }
  }
}
