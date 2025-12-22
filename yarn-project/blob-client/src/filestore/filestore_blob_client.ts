import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FileStore, ReadOnlyFileStore } from '@aztec/stdlib/file-store';

import { inboundTransform, outboundTransform } from '../encoding/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';

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
        // We don't know the actual index when fetching from filestore - use -1 to indicate this deliberately
        blobs.push({ ...json, index: '-1' });
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

    // index=-1 is deliberate as we don't know the actual blob index in most cases when the filestores are used (blobs are saved in the filestores before we ever fetch them from L1)
    const json = blob.toJson(-1);
    await (this.store as FileStore).save(
      this.blobPath(versionedHash),
      outboundTransform(Buffer.from(JSON.stringify(json))),
    );
    this.log.debug(`Saved blob ${versionedHash} to filestore`);
  }

  /**
   * Save multiple blobs to the store in parallel.
   * @param blobs - The blobs to save (either Blob[] or BlobWithIndex[])
   * @param skipIfExists - Skip saving if blob already exists (default: true)
   */
  async saveBlobs(blobs: Blob[] | BlobWithIndex[], skipIfExists = true): Promise<void> {
    await Promise.all(
      blobs.map(b => {
        const blob = 'blob' in b ? b.blob : b;
        return this.saveBlob(blob, skipIfExists);
      }),
    );
  }

  /**
   * Get the base URL/path of the filestore.
   */
  getBaseUrl(): string {
    return this.basePath;
  }

  /**
   * Test if the filestore connection is working.
   */
  testConnection(): Promise<boolean> {
    // This implementation will be improved in a separate PR
    // Currently underlying filestore implementations do not expose an easy way to test connectivitiy
    return Promise.resolve(true);
  }

  /**
   * Check if the store supports write operations.
   */
  private isWritable(): boolean {
    return 'save' in this.store;
  }
}
