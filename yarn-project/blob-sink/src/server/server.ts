import { Blob, type BlobJson } from '@aztec/blob-lib';
import { type ViemPublicClient, getL2BlockProposalEvents } from '@aztec/ethereum';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { bufferToHex, pluralize } from '@aztec/foundation/string';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import express, { type Express, type Request, type Response, json } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Hex } from 'viem';
import { z } from 'zod';

import type { BlobArchiveClient } from '../archive/index.js';
import { type BlobStore, DiskBlobStore } from '../blobstore/index.js';
import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { inboundTransform } from '../encoding/index.js';
import { type PostBlobSidecarRequest, blockIdSchema, indicesSchema } from '../types/api.js';
import { BlobWithIndex } from '../types/index.js';
import type { BlobSinkConfig } from './config.js';
import { BlobSinkMetrics } from './metrics.js';

/**
 * Example usage:
 * const service = new BlobSinkService({ port: 5052 });
 * await service.start();
 * ... later ...
 * await service.stop();
 */
export class BlobSinkServer {
  public port: number;

  private app: Express;
  private server: Server | null = null;
  private blobStore: BlobStore;
  private metrics: BlobSinkMetrics;
  private log: Logger = createLogger('aztec:blob-sink');
  private l1PublicClient: ViemPublicClient | undefined;

  constructor(
    private config: BlobSinkConfig = {},
    store?: AztecAsyncKVStore,
    private blobArchiveClient?: BlobArchiveClient,
    l1PublicClient?: ViemPublicClient,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.port = config?.port ?? 5052; // 5052 is beacon chain default http port
    this.app = express();

    // Setup middleware
    this.app.use(json({ limit: '1mb' })); // Increase the limit to allow for a blob to be sent

    this.metrics = new BlobSinkMetrics(telemetry);
    this.l1PublicClient = l1PublicClient;

    this.blobStore = store === undefined ? new MemoryBlobStore() : new DiskBlobStore(store);

    // Setup routes
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get('/status', this.status.bind(this));
    this.app.get('/eth/v1/beacon/headers/:block_id', this.handleGetBlockHeader.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.app.get('/eth/v1/beacon/blob_sidecars/:block_id', this.handleGetBlobSidecar.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.app.post('/blob_sidecar', this.handlePostBlobSidecar.bind(this));
  }

  // TODO(md): needed?
  /**
   * This is a placeholder for the block header endpoint.
   * It is not supported by the blob sink.
   *
   * The blob sink http client will ping this endpoint to check if it is talking to a beacon node
   * or a blob sink
   *
   * @param _req - The request object
   * @param res - The response object
   */
  private handleGetBlockHeader(_req: Request, res: Response) {
    res.status(400).json({
      error: 'Not Supported',
    });
    return;
  }

  private status(_req: Request, res: Response) {
    res.status(200).json({
      message: 'Ok',
    });
    return;
  }

  private async handleGetBlobSidecar(req: Request, res: Response) {
    // eslint-disable-next-line camelcase
    const { block_id: blockIdParam } = req.params;
    const { indices: indicesQuery } = req.query;

    try {
      const parsedBlockId = blockIdSchema.safeParse(blockIdParam);
      if (!parsedBlockId.success) {
        this.metrics.incGetBlob(false);
        res.status(400).json({
          error: 'Invalid block_id parameter',
        });
        return;
      }

      const parsedIndices = indicesSchema.safeParse(indicesQuery);
      if (!parsedIndices.success) {
        this.metrics.incGetBlob(false);
        res.status(400).json({
          error: 'Invalid indices parameter',
        });
        return;
      }

      const blockId = parsedBlockId.data.toString();
      const indices = parsedIndices.data;
      this.log.trace(`Received blobs request for block ${blockId}`, { blockId, indices });

      const blobs =
        (await this.blobStore.getBlobSidecars(blockId, indices)) ??
        (await this.tryGetBlobsFromArchive(blockId, indices));

      if (!blobs) {
        this.log.debug(`No blobs found for block ${blockId}`, { blockId, indices });
        this.metrics.incGetBlob(false);
        res.status(404).json({ error: 'Blob not found' });
        return;
      }

      this.log.debug(`Returning ${blobs.length} blobs for block ${blockId}`, { blockId, indices });
      this.metrics.incGetBlob(true);
      res.json({
        version: 'deneb',
        data: blobs.map(blob => blob.toJSON()),
      });
    } catch (error) {
      this.metrics.incGetBlob(false);
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid block_id parameter',
          details: error.errors,
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
        });
      }
    }
  }

  /**
   * Tries to get blobs for a given block from the archive source (eg blobscan API).
   * If successful, stores them in the blob store for future use.
   */
  private async tryGetBlobsFromArchive(blockId: string, indices?: number[]): Promise<BlobWithIndex[] | undefined> {
    if (!this.blobArchiveClient) {
      return undefined;
    }

    try {
      const blobs = await this.blobArchiveClient.getBlobsFromBlock(blockId);
      if (!blobs) {
        return undefined;
      }

      // We don't get the blob index within the block from blobscan API, we get the blob index
      // within the tx. Here we assume that the blobs are orderd tx first, and then within tx.
      // Note that we are not using querying by indices anywhere in the codebase though.
      const blobsWithIndex = blobs.map((blob, index) => [blob, index] as const);
      const filteredBlobs = indices ? blobsWithIndex.filter(([, index]) => indices.includes(index)) : blobsWithIndex;

      // Parsing a blob fails if this is not one of our blobs. It's very likely there are blobs
      // we don't care about in this block, so this is not a high severity log.
      const tryParseBlob = (blobJson: BlobJson, index: number) =>
        Blob.fromJson(blobJson)
          .then(blob => [blob, index] as const)
          .catch(err => {
            const severity = err.name === 'BlobDeserializationError' ? 'debug' : 'error';
            this.log[severity](`Error parsing blob ${index} for block ${blockId}`, err);
            return [undefined, index] as const;
          });

      // We keep the blobs that were successfully parsed only.
      const parsedBlobs = await Promise.all(filteredBlobs.map(([blobJson, index]) => tryParseBlob(blobJson, index)));
      const validBlobs = parsedBlobs.filter(([blob]) => blob !== undefined) as [Blob, number][];
      const result = validBlobs.map(([blob, index]) => new BlobWithIndex(blob, index));

      // And save them to the local store so we don't re-fetch again.
      this.log.verbose(`Storing ${pluralize('blob', result.length)} downloaded from archive for block ${blockId}`);
      await this.blobStore.addBlobSidecars(blockId, result);

      return result;
    } catch (err) {
      this.log.error(`Failed to get blobs for block ${blockId} from archive`, err);
      return undefined;
    }
  }

  private async handlePostBlobSidecar(req: Request, res: Response) {
    // eslint-disable-next-line camelcase
    const { block_id, blobs } = req.body;

    let parsedBlockId: Hex;
    let blobObjects: BlobWithIndex[];

    try {
      // eslint-disable-next-line camelcase
      parsedBlockId = blockIdSchema.parse(block_id);
      if (!parsedBlockId) {
        res.status(400).json({ error: 'Invalid block_id parameter' });
        return;
      }

      this.log.info(`Received blob sidecar for block ${parsedBlockId}`);
      blobObjects = this.parseBlobData(blobs);
      await this.validateBlobs(parsedBlockId, blobObjects);
    } catch (error: any) {
      res.status(400).json({ error: 'Invalid blob data', details: error.message });
      this.metrics.incStoreBlob(false);
      return;
    }

    try {
      await this.blobStore.addBlobSidecars(parsedBlockId.toString(), blobObjects);
      this.metrics.recordBlobReceipt(blobObjects);

      this.log.info(`Blob sidecar stored successfully for block ${parsedBlockId}`);

      res.json({ message: 'Blob sidecar stored successfully' });
      this.metrics.incStoreBlob(true);
    } catch (error: any) {
      this.log.error(`Error storing blob sidecar for block ${parsedBlockId}`, error);
      this.metrics.incStoreBlob(false);
      res.status(500).json({ error: 'Error storing blob sidecar', details: error.message });
    }
  }

  /**
   * Parse the blob data
   *
   * The blob sink http client will compress the blobs it sends
   *
   * @param blobs - The blob data
   * @returns The parsed blob data
   */
  private parseBlobData(blobs: PostBlobSidecarRequest['blobs']): BlobWithIndex[] {
    return blobs.map(
      ({ index, blob }) =>
        new BlobWithIndex(
          // Snappy decompress the blob buffer
          Blob.fromBuffer(inboundTransform(Buffer.from(blob.data))),
          index,
        ),
    );
  }

  /**
   * Validates the given blobs were actually emitted by a rollup contract.
   * Skips validation if the L1 public client is not set.
   * If the rollupAddress is set in config, it checks that the event came from that contract.
   * Throws on validation failure.
   */
  private async validateBlobs(blockId: Hex, blobs: BlobWithIndex[]): Promise<void> {
    if (!this.l1PublicClient) {
      this.log.debug('Skipping blob validation due to no L1 public client set');
      return;
    }

    const rollupAddress =
      !this.config.l1Contracts?.rollupAddress || this.config.l1Contracts?.rollupAddress?.isZero()
        ? undefined
        : this.config.l1Contracts.rollupAddress;
    const events = await getL2BlockProposalEvents(this.l1PublicClient, blockId, rollupAddress);
    const eventBlobHashes = events.flatMap(event => event.versionedBlobHashes);
    const blobHashesToValidate = blobs.map(blob => bufferToHex(blob.blob.getEthVersionedBlobHash()));

    this.log.debug(
      `Retrieved ${events.length} events with blob hashes ${
        eventBlobHashes ? eventBlobHashes.join(', ') : 'none'
      } for block ${blockId} to verify blobs ${blobHashesToValidate.join(', ')}`,
    );

    const notFoundBlobHashes = blobHashesToValidate.filter(blobHash => !eventBlobHashes.includes(blobHash));

    if (notFoundBlobHashes.length > 0) {
      throw new Error(`Blobs ${notFoundBlobHashes.join(', ')} not found in block proposal event at block ${blockId}`);
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        // Extract port from server address, allows setting address when
        // server is started with port 0
        const address = this.server?.address() as AddressInfo | null;
        if (!address) {
          this.log.error('Server address not found');
          void this.stop().then(() => reject(new Error('Server address not found')));
        }

        this.port = address!.port;
        this.log.info(`Server is running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    this.log.info('Stopping blob sink');
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        this.log.info('Blob sink already stopped');
        return;
      }

      this.server.close(err => {
        if (err) {
          reject(err);
          return;
        }
        this.server = null;
        this.log.info('Blob sink stopped');
        resolve();
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }
}
