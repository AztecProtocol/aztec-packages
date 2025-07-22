import { Blob } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import express, { type Express, type Request, type Response, json } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import { type BlobStore, DiskBlobStore } from '../blobstore/index.js';
import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { inboundTransform } from '../encoding/index.js';
import type { PostBlobSidecarRequest } from '../types/api.js';
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

  protected blobStore!: BlobStore;

  private app: Express;
  private server: Server | null = null;
  private metrics: BlobSinkMetrics;
  private log: Logger = createLogger('blob-sink:server');

  constructor(
    config: BlobSinkConfig = {},
    private store?: AztecAsyncKVStore,
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.port = config?.port ?? 5052; // 5052 is beacon chain default http port
    this.app = express();

    // Setup middleware
    this.app.use(json({ limit: '1mb' })); // Increase the limit to allow for a blob to be sent

    this.metrics = new BlobSinkMetrics(telemetry);

    this.setupBlobStore();
    this.setupRoutes();
  }

  private setupBlobStore() {
    this.blobStore = this.store === undefined ? new MemoryBlobStore() : new DiskBlobStore(this.store);
  }

  private setupRoutes() {
    this.app.get('/status', this.status.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.app.get('/blobs', this.handleGetBlobs.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.app.post('/blobs', this.handlePostBlobs.bind(this));
  }

  private status(_req: Request, res: Response) {
    res.status(200).json({ message: 'Ok' });
  }

  private async handleGetBlobs(req: Request, res: Response) {
    const { blobHashes: blobHashesQuery } = req.query;

    try {
      // Parse blob hashes from comma-separated hex strings
      if (!blobHashesQuery || typeof blobHashesQuery !== 'string') {
        this.metrics.incGetBlob(false);
        res.status(400).json({ error: 'Missing or invalid blobHashes query parameter' });
        return;
      }

      const blobHashStrings = blobHashesQuery.split(',');
      const blobHashes: Buffer[] = [];

      for (const hashStr of blobHashStrings) {
        if (!hashStr.match(/^0x[0-9a-fA-F]{64}$/)) {
          this.metrics.incGetBlob(false);
          res.status(400).json({ error: `Invalid blob hash: ${hashStr}` });
          return;
        }
        blobHashes.push(hexToBuffer(hashStr));
      }

      this.log.debug(`Received blobs request for hashes`, { hashes: blobHashStrings });
      const blobs = await this.blobStore.getBlobsByHashes(blobHashes);

      if (blobs.length === 0) {
        this.log.debug(`No blobs found for requested hashes`);
        this.metrics.incGetBlob(false);
        res.status(404).json({ error: 'No blobs found' });
        return;
      }

      this.log.debug(`Returning ${blobs.length} blobs`);
      this.metrics.incGetBlob(true);
      res.json({ version: 'deneb', data: blobs.map(blob => blob.toJSON()) });
    } catch (error) {
      this.metrics.incGetBlob(false);
      res.status(500).json({ error: 'Internal error', details: error });
    }
  }

  private async handlePostBlobs(req: Request, res: Response) {
    const { blobs } = req.body;

    let blobObjects: BlobWithIndex[];

    try {
      this.log.trace(`Received blob sidecar`);
      blobObjects = this.parseBlobData(blobs);
    } catch (error: any) {
      this.log.error(`Failed to parse incoming blobs`, error);
      res.status(400).json({ error: 'Invalid blob data', details: error.message });
      this.metrics.incStoreBlob(false);
      return;
    }

    try {
      await this.blobStore.addBlobs(blobObjects);
      this.metrics.recordBlobReceipt(blobObjects);
      const blobHashes = blobObjects.map(blob => bufferToHex(blob.blob.getEthVersionedBlobHash()));
      this.log.info(`Blobs stored successfully`, { blobHashes });
      res.json({ blobHashes });
      this.metrics.incStoreBlob(true);
    } catch (error: any) {
      this.log.error(`Error storing blob sidecar`, error);
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

  /** Deletes all blobs in the sink. Used for testing. */
  public clear(): Promise<void> {
    this.setupBlobStore();
    return Promise.resolve();
  }
}
