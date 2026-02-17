import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FileStore, ReadOnlyFileStore } from '@aztec/stdlib/file-store';

import { inboundTransform, outboundTransform } from '../encoding/index.js';
import { HEALTHCHECK_CONTENT, HEALTHCHECK_FILENAME } from './healthcheck.js';

/**
 * A blob client that uses a FileStore (S3/GCS/local) as the data source.
 * Blobs are stored as JSON files keyed by their versioned blob hash.
 */
export class FileStoreBlobClient {
  private readonly log: Logger;

  constructor(
    private readonly store: ReadOnlyFileStore | FileStore,
    private readonly basePath: string,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger('blob-client:filestore-client');
  }

  /**
   * Get the path for a blob file.
   * Format: basePath/blobs/{versionedBlobHash}.data
   */
  private blobPath(versionedBlobHash: string): string {
    return `${this.basePath}/blobs/${versionedBlobHash}.data`;
  }

  /**
   * Get the path for the healthcheck file.
   * Format: basePath/.healthcheck
   */
  private healthcheckPath(): string {
    return `${this.basePath}/${HEALTHCHECK_FILENAME}`;
  }

  /**
   * Fetch blobs by their versioned hashes.
   * @param blobHashes - Array of versioned blob hashes (0x-prefixed hex strings)
   * @returns Array of BlobJson objects for found blobs
   */
  async getBlobsByHashes(blobHashes: string[]): Promise<BlobJson[]> {
    const blobs: BlobJson[] = [];

    for (let i = 0; i < blobHashes.length; i++) {
      try {
        const path = this.blobPath(blobHashes[i]);
        if (!(await this.store.exists(path))) {
          continue;
        }

        const data = await this.store.read(path);
        const json = JSON.parse(inboundTransform(data).toString()) as BlobJson;
        blobs.push(json);
      } catch (err) {
        this.log.warn(`Failed to read blob ${blobHashes[i]} from filestore`, err);
      }
    }

    return blobs;
  }

  /**
   * Check if a blob exists in the store.
   * @param versionedBlobHash - The versioned blob hash (0x-prefixed hex string)
   */
  exists(versionedBlobHash: string): Promise<boolean> {
    return this.store.exists(this.blobPath(versionedBlobHash));
  }

  /**
   * Save a single blob to the store.
   * @param blob - The blob to save
   * @param skipIfExists - Skip saving if blob already exists (default: true)
   * @throws Error if the store is read-only
   */
  async saveBlob(blob: Blob, skipIfExists = true): Promise<void> {
    if (!this.isWritable()) {
      throw new Error('FileStore is read-only');
    }

    const versionedHash = `0x${computeEthVersionedBlobHash(blob.commitment).toString('hex')}`;

    if (skipIfExists && (await this.store.exists(this.blobPath(versionedHash)))) {
      this.log.trace(`Blob ${versionedHash} already exists, skipping`);
      return;
    }

    const json = blob.toJSON();
    await (this.store as FileStore).save(
      this.blobPath(versionedHash),
      outboundTransform(Buffer.from(JSON.stringify(json))),
    );
    this.log.debug(`Saved blob ${versionedHash} to filestore`);
  }

  /**
   * Save multiple blobs to the store in parallel.
   * @param blobs - The blobs to save
   * @param skipIfExists - Skip saving if blob already exists (default: true)
   */
  async saveBlobs(blobs: Blob[], skipIfExists = true): Promise<void> {
    await Promise.all(blobs.map(blob => this.saveBlob(blob, skipIfExists)));
  }

  /**
   * Get the base URL/path of the filestore.
   */
  getBaseUrl(): string {
    return this.basePath;
  }

  /**
   * Test if the filestore connection is working by checking for healthcheck file.
   * The healthcheck file is uploaded periodically by writable clients via HttpBlobClient.start().
   * This provides a uniform connection test across all store types (S3/GCS/Local/HTTP).
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.store.exists(this.healthcheckPath());
    } catch (err: any) {
      this.log.warn(`Connection test failed: ${err?.message ?? String(err)}`);
      return false;
    }
  }

  /**
   * Upload the healthcheck file if it doesn't already exist.
   * This enables read-only clients (HTTP) to verify connectivity.
   */
  async uploadHealthcheck(): Promise<void> {
    if (!this.isWritable()) {
      this.log.trace('Cannot upload healthcheck: store is read-only');
      return;
    }
    const path = this.healthcheckPath();
    await (this.store as FileStore).save(path, Buffer.from(HEALTHCHECK_CONTENT));
    this.log.debug(`Uploaded healthcheck file to ${path}`);
  }

  /**
   * Check if the store supports write operations.
   */
  private isWritable(): boolean {
    return 'save' in this.store;
  }
}
