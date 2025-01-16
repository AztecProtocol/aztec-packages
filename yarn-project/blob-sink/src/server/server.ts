import { Blob } from '@aztec/foundation/blob';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import express, { type Express, type Request, type Response, json } from 'express';
import { type Server } from 'http';
import { type AddressInfo } from 'net';
import { z } from 'zod';

import { type BlobStore, DiskBlobStore } from '../blobstore/index.js';
import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { type PostBlobSidecarRequest, blockIdSchema, indicesSchema } from '../types/api.js';
import { BlobWithIndex } from '../types/index.js';
import { type BlobSinkConfig } from './config.js';
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

  constructor(config?: BlobSinkConfig, store?: AztecKVStore, telemetry: TelemetryClient = getTelemetryClient()) {
    this.port = config?.port ?? 5052; // 5052 is beacon chain default http port
    this.app = express();

    // Setup middleware
    this.app.use(json({ limit: '1mb' })); // Increase the limit to allow for a blob to be sent

    this.metrics = new BlobSinkMetrics(telemetry);

    this.blobStore = store === undefined ? new MemoryBlobStore() : new DiskBlobStore(store);

    // Setup routes
    this.setupRoutes();
  }

  private setupRoutes() {
    // TODO(md): needed?
    this.app.get('/eth/v1/beacon/headers/:block_id', this.handleGetBlockHeader.bind(this));
    this.app.get('/eth/v1/beacon/blob_sidecars/:block_id', this.handleGetBlobSidecar.bind(this));
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

  private async handleGetBlobSidecar(req: Request, res: Response) {
    // eslint-disable-next-line camelcase
    const { block_id } = req.params;
    const { indices } = req.query;

    try {
      // eslint-disable-next-line camelcase
      const parsedBlockId = blockIdSchema.safeParse(block_id);
      if (!parsedBlockId.success) {
        res.status(400).json({
          error: 'Invalid block_id parameter',
        });
        return;
      }

      const parsedIndices = indicesSchema.safeParse(indices);
      if (!parsedIndices.success) {
        res.status(400).json({
          error: 'Invalid indices parameter',
        });
        return;
      }

      const blobs = await this.blobStore.getBlobSidecars(parsedBlockId.data.toString(), parsedIndices.data);

      if (!blobs) {
        res.status(404).json({ error: 'Blob not found' });
        return;
      }

      res.json({
        version: 'deneb',
        data: blobs.map(blob => blob.toJSON()),
      });
    } catch (error) {
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

  private async handlePostBlobSidecar(req: Request, res: Response) {
    // eslint-disable-next-line camelcase
    const { block_id, blobs } = req.body;

    try {
      // eslint-disable-next-line camelcase
      const parsedBlockId = blockIdSchema.parse(block_id);
      if (!parsedBlockId) {
        res.status(400).json({
          error: 'Invalid block_id parameter',
        });
        return;
      }

      this.log.info(`Received blob sidecar for block ${parsedBlockId}`);

      const blobObjects: BlobWithIndex[] = this.parseBlobData(blobs);

      await this.blobStore.addBlobSidecars(parsedBlockId.toString(), blobObjects);
      this.metrics.recordBlobReciept(blobObjects);

      this.log.info(`Blob sidecar stored successfully for block ${parsedBlockId}`);

      res.json({ message: 'Blob sidecar stored successfully' });
    } catch (error) {
      res.status(400).json({
        error: 'Invalid blob data',
      });
    }
  }

  private parseBlobData(blobs: PostBlobSidecarRequest['blobs']): BlobWithIndex[] {
    return blobs.map(({ index, blob }) => new BlobWithIndex(Blob.fromBuffer(Buffer.from(blob.data)), index));
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
