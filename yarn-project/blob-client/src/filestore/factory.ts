import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type FileStore,
  type ReadOnlyFileStore,
  createFileStore,
  createReadOnlyFileStore,
} from '@aztec/stdlib/file-store';

import { FileStoreBlobClient } from './filestore_blob_client.js';

/**
 * Metadata required to construct the base path for blob storage.
 * Path format: aztec-{l1ChainId}-{rollupVersion}-{rollupAddress}/
 */
export interface BlobFileStoreMetadata {
  /** The L1 chain ID */
  l1ChainId: number;
  /** The rollup version */
  rollupVersion: number;
  /** The rollup contract address (with or without 0x prefix) */
  rollupAddress: string;
}

/**
 * Constructs the base path for blob storage.
 * Format: aztec-{l1ChainId}-{rollupVersion}-{rollupAddress}
 */
export function makeBlobBasePath(metadata: BlobFileStoreMetadata): string {
  const { l1ChainId, rollupVersion, rollupAddress } = metadata;
  // Normalize rollup address to lowercase without 0x prefix for consistency
  const normalizedAddress = rollupAddress.toLowerCase().replace(/^0x/, '');
  return `aztec-${l1ChainId}-${rollupVersion}-0x${normalizedAddress}`;
}

/**
 * Creates a read-only FileStoreBlobClient for fetching blobs.
 *
 * @param storeUrl - The URL of the filestore (s3://, gs://, file://, https://)
 * @param metadata - Chain metadata for constructing the base path
 * @param logger - Optional logger
 * @returns A FileStoreBlobClient for reading blobs, or undefined if storeUrl is undefined
 */
export async function createReadOnlyFileStoreBlobClient(
  storeUrl: string,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient>;
export async function createReadOnlyFileStoreBlobClient(
  storeUrl: string | undefined,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient | undefined>;
export async function createReadOnlyFileStoreBlobClient(
  storeUrl: string | undefined,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient | undefined> {
  if (!storeUrl) {
    return undefined;
  }

  const log = logger ?? createLogger('blob-client:filestore-factory');
  const basePath = makeBlobBasePath(metadata);

  log.debug(`Creating read-only filestore blob client`, { storeUrl, basePath });

  const store: ReadOnlyFileStore = await createReadOnlyFileStore(storeUrl, log);
  return new FileStoreBlobClient(store, basePath, log);
}

/**
 * Creates multiple read-only FileStoreBlobClients from an array of URLs.
 *
 * @param storeUrls - Array of filestore URLs
 * @param metadata - Chain metadata for constructing the base path
 * @param logger - Optional logger
 * @returns Array of FileStoreBlobClients (excludes any that failed to create)
 */
export async function createReadOnlyFileStoreBlobClients(
  storeUrls: string[] | undefined,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient[]> {
  if (!storeUrls || storeUrls.length === 0) {
    return [];
  }

  const log = logger ?? createLogger('blob-client:filestore-factory');
  const clients: FileStoreBlobClient[] = [];

  for (const storeUrl of storeUrls) {
    try {
      const client = await createReadOnlyFileStoreBlobClient(storeUrl, metadata, log);
      if (client) {
        clients.push(client);
      }
    } catch (err) {
      log.error('Failed to create read-only filestore blob client for %s', storeUrl, err);
    }
  }

  return clients;
}

/**
 * Creates a writable FileStoreBlobClient for uploading blobs.
 * Note: https:// URLs are not supported for upload, only s3://, gs://, or file://.
 *
 * @param storeUrl - The URL of the filestore (s3://, gs://, file://)
 * @param metadata - Chain metadata for constructing the base path
 * @param logger - Optional logger
 * @returns A writable FileStoreBlobClient, or undefined if storeUrl is undefined
 */
export async function createWritableFileStoreBlobClient(
  storeUrl: string,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient>;
export async function createWritableFileStoreBlobClient(
  storeUrl: string | undefined,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient | undefined>;
export async function createWritableFileStoreBlobClient(
  storeUrl: string | undefined,
  metadata: BlobFileStoreMetadata,
  logger?: Logger,
): Promise<FileStoreBlobClient | undefined> {
  if (!storeUrl) {
    return undefined;
  }

  const log = logger ?? createLogger('blob-client:filestore-factory');
  const basePath = makeBlobBasePath(metadata);

  log.debug(`Creating writable filestore blob client`, { storeUrl, basePath });

  const store: FileStore | undefined = await createFileStore(storeUrl, log);
  if (!store) {
    log.warn('Failed to create writable filestore for %s', storeUrl);
    return undefined;
  }

  return new FileStoreBlobClient(store, basePath, log);
}
