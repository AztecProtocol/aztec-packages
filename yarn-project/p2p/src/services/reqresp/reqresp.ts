// @attribution: lodestar impl for inspiration
import { AbortError, TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { executeTimeout } from '@aztec/foundation/timer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { IncomingStreamData, PeerId, Stream } from '@libp2p/interface';
import type { Libp2p } from 'libp2p';
import { pipeline } from 'node:stream/promises';
import type { Uint8ArrayList } from 'uint8arraylist';

import { IndividualReqRespTimeoutError } from '../../errors/reqresp.error.js';
import { OversizedSnappyResponseError, SnappyTransform } from '../encoding.js';
import type { PeerScoring } from '../peer-manager/peer_scoring.js';
import {
  DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS,
  DEFAULT_REQRESP_DIAL_TIMEOUT_MS,
  type P2PReqRespConfig,
} from './config.js';
import { ConnectionSampler, RandomSampler } from './connection-sampler/connection_sampler.js';
import {
  type ReqRespInterface,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolRateLimits,
  type ShouldRejectPeer,
  UNAUTHENTICATED_ALLOWED_PROTOCOLS,
  subProtocolSizeCalculators,
} from './interface.js';
import { ReqRespMetrics } from './metrics.js';
import {
  RateLimitStatus,
  RequestResponseRateLimiter,
  prettyPrintRateLimitStatus,
} from './rate-limiter/rate_limiter.js';
import { ReqRespStatus, ReqRespStatusError, parseStatusChunk } from './status.js';

/**
 * The Request Response Service
 *
 * It allows nodes to request specific information from their peers, its use case covers recovering
 * information that was missed during a synchronisation or a gossip event.
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
  private individualRequestTimeoutMs: number = DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS;
  private dialTimeoutMs: number = DEFAULT_REQRESP_DIAL_TIMEOUT_MS;

  private subProtocolHandlers: Partial<ReqRespSubProtocolHandlers> = {};

  private connectionSampler: ConnectionSampler;
  private rateLimiter: RequestResponseRateLimiter;

  private snappyTransform: SnappyTransform;

  private shouldRejectPeer: ShouldRejectPeer | undefined;

  private metrics: ReqRespMetrics;

  constructor(
    config: P2PReqRespConfig,
    private libp2p: Libp2p,
    private peerScoring: PeerScoring,
    private logger = createLogger('p2p:reqresp'),
    rateLimits: Partial<ReqRespSubProtocolRateLimits> = {},
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.updateConfig(config);

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

  public updateConfig(config: Partial<P2PReqRespConfig>): void {
    if (typeof config.individualRequestTimeoutMs === 'number') {
      this.individualRequestTimeoutMs = config.individualRequestTimeoutMs;
    }

    if (typeof config.dialTimeoutMs === 'number') {
      this.dialTimeoutMs = config.dialTimeoutMs;
    }
  }

  public setShouldRejectPeer(checker: ShouldRejectPeer): void {
    this.shouldRejectPeer = checker;
  }

  get tracer() {
    return this.metrics.tracer;
  }

  /**
   * Get the connection sampler instance
   */
  getConnectionSampler(): Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'> {
    return this.connectionSampler;
  }

  /**
   * Start the reqresp service
   */
  async start(subProtocolHandlers: ReqRespSubProtocolHandlers) {
    Object.assign(this.subProtocolHandlers, subProtocolHandlers);

    // Register streamHandler with libp2p.
    // The streamHandler is responsible for reading the incoming stream, determining the protocol, then triggering the appropriate handler.
    for (const subProtocol of Object.keys(subProtocolHandlers)) {
      this.logger.debug(`Registering handler for sub protocol ${subProtocol}`);
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

  async addSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void> {
    this.subProtocolHandlers[subProtocol] = handler;
    this.logger.debug(`Registering handler for sub protocol ${subProtocol}`);
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
    dialTimeout: number = this.dialTimeoutMs,
  ): Promise<ReqRespResponse> {
    let stream: Stream | undefined;
    try {
      this.metrics.recordRequestSent(subProtocol);

      // Calculate expected response size based on the request payload
      const expectedSizeKb = subProtocolSizeCalculators[subProtocol](payload);

      this.logger.trace(`Sending request to peer ${peerId.toString()} on sub protocol ${subProtocol}`);
      stream = await this.connectionSampler.dialProtocol(peerId, subProtocol, dialTimeout);
      this.logger.trace(
        `Opened stream ${stream.id} for sending request to peer ${peerId.toString()} on sub protocol ${subProtocol}`,
      );

      const timeoutErr = new IndividualReqRespTimeoutError();
      // Create a wrapper to pass the expected size to readMessage
      const readMessageWithSizeLimit = (source: AsyncIterable<Uint8ArrayList>) =>
        this.readMessage(source, expectedSizeKb);
      const [_, resp] = await executeTimeout(
        signal =>
          Promise.all([
            pipeline([payload], stream!.sink, { signal }),
            pipeline(stream!.source, readMessageWithSizeLimit, { signal }),
          ]),
        this.individualRequestTimeoutMs,
        () => timeoutErr,
      );
      return resp;
    } catch (e: any) {
      this.logger.debug(`SUBPROTOCOL: ${subProtocol}\n`, e);
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
    const severity = this.categorizeResponseError(e, peerId, subProtocol);
    if (severity) {
      this.peerScoring.penalizePeer(peerId, severity);
    }
  }

  /**
   * Read a message returned from a stream into a single buffer
   *
   * The message is split into two components
   * - The first chunk should contain a control byte, indicating the status of the response see `ReqRespStatus`
   * - The second chunk should contain the response data
   *
   * @param source - The async iterable source of data chunks
   * @param maxSizeKb - Optional maximum expected size in KB for the decompressed response
   */
  private async readMessage(source: AsyncIterable<Uint8ArrayList>, maxSizeKb?: number): Promise<ReqRespResponse> {
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
      const message: Buffer = this.snappyTransform.inboundTransformData(messageData, undefined, maxSizeKb);

      return {
        status: status ?? ReqRespStatus.UNKNOWN,
        data: message,
      };
    } catch (e: any) {
      // All errors (invalid status bytes, oversized snappy responses, corrupt data, etc.)
      // are re-thrown so the caller can penalize the peer via handleResponseError.
      this.logger.debug(`Reading message failed: ${e.message}`);
      throw e;
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
        this.logger.verbose(
          `Rate limit exceeded ${prettyPrintRateLimitStatus(rateLimitStatus)} for ${protocol} from ${
            connection.remotePeer
          }`,
        );

        throw new ReqRespStatusError(ReqRespStatus.RATE_LIMIT_EXCEEDED);
      }

      // When p2pAllowOnlyValidators is enabled, reject unauthenticated peers on data protocols
      if (
        !UNAUTHENTICATED_ALLOWED_PROTOCOLS.has(protocol) &&
        (this.shouldRejectPeer?.(connection.remotePeer.toString()) ?? false)
      ) {
        this.logger.debug(`Rejecting unauthenticated peer ${connection.remotePeer} on gated protocol ${protocol}`);
        throw new ReqRespStatusError(ReqRespStatus.FAILURE);
      }

      await this.processStream(protocol, incomingStream);
    } catch (err: any) {
      this.metrics.recordResponseError(protocol);
      this.handleRequestError(err, connection.remotePeer, protocol);

      if (err instanceof ReqRespStatusError) {
        const errorSent = await this.trySendError(stream, connection.remotePeer, protocol, err.status);
        const logMessage = errorSent
          ? 'Protocol error sent successfully.'
          : 'Stream already closed or poisoned, not sending error response.';

        const isRateLimit = err.status === ReqRespStatus.RATE_LIMIT_EXCEEDED;

        const level = isRateLimit ? 'debug' : 'warn';
        this.logger[level](logMessage + ` Status: ${ReqRespStatus[err.status]}`, {
          protocol,
          err,
          errorStatus: err.status,
          cause: err.cause ?? 'Cause unknown',
        });
      } else {
        // In erroneous case we abort the stream, this will signal the peer that something went wrong
        // and that this stream should be dropped
        const isMessageToNotWarn =
          err instanceof Error &&
          ['stream reset', 'Cannot push value onto an ended pushable', 'read ECONNRESET'].some(msg =>
            err.message.includes(msg),
          );
        const level = isMessageToNotWarn ? 'debug' : 'warn';
        this.logger[level]('Unknown stream error while handling the stream, aborting', {
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
    const handler = this.subProtocolHandlers[protocol];
    if (!handler) {
      throw new Error(`No handler defined for reqresp subprotocol ${protocol}`);
    }

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
          yield snappy.outboundTransformData(response);
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
  private async trySendError(
    stream: Stream,
    peerId: PeerId,
    protocol: ReqRespSubProtocol,
    status: ReqRespStatus,
  ): Promise<boolean> {
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

      this.handleRequestError(e, peerId, protocol);
      return false;
    }
  }

  private handleRequestError(e: any, peerId: PeerId, subProtocol: ReqRespSubProtocol): void {
    const severity = this.categorizeRequestError(e, peerId, subProtocol);
    if (severity) {
      this.peerScoring.penalizePeer(peerId, severity);
    }
  }

  /**
   * Categorize the request error and log it.
   *
   * @returns Severity of the error, or undefined if the error is not punishable.
   */
  private categorizeRequestError(
    e: any,
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
  ): PeerErrorSeverity | undefined {
    const logTags = { peerId: peerId.toString(), subProtocol };

    // Punishable error - peer should never send badly formed request
    if (e instanceof ReqRespStatusError && e.status === ReqRespStatus.BADLY_FORMED_REQUEST) {
      this.logger.debug(`Punishable error in ${subProtocol}: ${e.cause}`, logTags);
      return PeerErrorSeverity.LowToleranceError;
    }

    // TODO: (mralj): think if we should penalize peer here based on connection errors
    return undefined;
  }

  /**
   * Categorize the response error and log it.
   *
   * @returns Severity of the error, or undefined if the error is not punishable.
   */
  private categorizeResponseError(
    e: any,
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
  ): PeerErrorSeverity | undefined {
    const logTags = { peerId: peerId.toString(), subProtocol };

    // Non punishable errors - we do not expect a response for goodbye messages
    if (subProtocol === ReqRespSubProtocol.GOODBYE) {
      this.logger.debug('Error encountered on goodbye sub protocol, no penalty', logTags);
      return undefined;
    }

    // Invalid status byte: the peer sent a status byte that doesn't match any known status code.
    // This is a protocol violation, penalize harshly.
    if (e instanceof ReqRespStatusError) {
      this.logger.warn(`Invalid status byte from peer ${peerId.toString()} in ${subProtocol}: ${e.message}`, logTags);
      return PeerErrorSeverity.LowToleranceError;
    }

    // Oversized snappy response: the peer is sending data that exceeds the allowed size.
    // This is a protocol violation that wastes bandwidth, so penalize harshly.
    if (e instanceof OversizedSnappyResponseError) {
      this.logger.warn(`Oversized response from peer ${peerId.toString()} in ${subProtocol}: ${e.message}`, logTags);
      return PeerErrorSeverity.LowToleranceError;
    }

    return this.categorizeConnectionErrors(e, peerId, subProtocol);
  }

  /*
   * Errors specific to connection  handling
   * These can happen  both when sending request and response.
   */
  private categorizeConnectionErrors(
    e: any,
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
  ): PeerErrorSeverity | undefined {
    const logTags = { peerId: peerId.toString(), subProtocol };
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
      e?.message?.includes('Muxer already closed') ||
      e?.message?.includes('muxer closed') ||
      e?.message?.includes('ended pushable')
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
    this.logger.error(`Unexpected error in ReqResp protocol`, e, logTags);
    return PeerErrorSeverity.HighToleranceError;
  }
}
