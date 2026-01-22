import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { shuffle } from '@aztec/foundation/array';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { createPublicClient, fallback, http } from 'viem';

import { createBlobArchiveClient } from '../archive/factory.js';
import type { BlobArchiveClient } from '../archive/interface.js';
import type { FileStoreBlobClient } from '../filestore/filestore_blob_client.js';
import { DEFAULT_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES } from '../filestore/healthcheck.js';
import { type BlobClientConfig, getBlobClientConfigFromEnv } from './config.js';
import type { BlobClientInterface, GetBlobSidecarOptions } from './interface.js';

export class HttpBlobClient implements BlobClientInterface {
  protected readonly log: Logger;
  protected readonly config: BlobClientConfig;
  protected readonly archiveClient: BlobArchiveClient | undefined;
  protected readonly fetch: typeof fetch;
  protected readonly fileStoreClients: FileStoreBlobClient[];
  protected readonly fileStoreUploadClient: FileStoreBlobClient | undefined;

  private disabled = false;
  private healthcheckUploadIntervalId?: NodeJS.Timeout;

  constructor(
    config?: BlobClientConfig,
    private readonly opts: {
      logger?: Logger;
      archiveClient?: BlobArchiveClient;
      fileStoreClients?: FileStoreBlobClient[];
      fileStoreUploadClient?: FileStoreBlobClient;
      /** Callback fired when blobs are successfully fetched from any source */
      onBlobsFetched?: (blobs: Blob[]) => void;
    } = {},
  ) {
    this.config = config ?? getBlobClientConfigFromEnv();
    this.log = opts.logger ?? createLogger('blob-client:client');
    this.archiveClient = opts.archiveClient ?? createBlobArchiveClient(this.config, this.log);
    this.fileStoreClients = opts.fileStoreClients ?? [];
    this.fileStoreUploadClient = opts.fileStoreUploadClient;

    if (this.fileStoreUploadClient && !opts.onBlobsFetched) {
      this.opts.onBlobsFetched = blobs => {
        this.uploadBlobsToFileStore(blobs);
      };
    }

    this.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      return await retry(
        () => fetch(...args),
        this.log,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        `Fetching ${args[0]}`,
        makeBackoff([1, 1, 3]),
        /*failSilently=*/ true,
      );
    };
  }

  /**
   * Upload fetched blobs to filestore (fire-and-forget).
   * Called automatically when blobs are fetched from any source.
   */
  protected uploadBlobsToFileStore(blobs: Blob[]) {
    this.fileStoreUploadClient?.saveBlobs(blobs, true).catch(err => {
      this.log.warn(`Failed to upload blobs to filestore: ${err.message}`);
    });
  }

  /**
   * Start the blob client. Uploads an initial healthcheck file to the filestore
   * and begins periodic healthcheck uploads if fileStoreUploadClient is configured.
   */
  async start(): Promise<void> {
    if (this.fileStoreUploadClient) {
      await this.uploadInitialHealthcheckFile();
      this.startPeriodicHealthcheckUpload();
    }
  }

  /**
   * Stop the blob client. Clears periodic healthcheck upload interval.
   */
  stop(): void {
    if (this.healthcheckUploadIntervalId) {
      clearInterval(this.healthcheckUploadIntervalId);
      this.healthcheckUploadIntervalId = undefined;
    }
  }

  /**
   * Upload an initial healthcheck file to verify the filestore upload is working.
   * Logs a warning if the upload fails.
   */
  private async uploadInitialHealthcheckFile(): Promise<void> {
    const client = this.fileStoreUploadClient!;
    try {
      await client.uploadHealthcheck();
      this.log.info(`Successfully uploaded healthcheck file to filestore: ${client.getBaseUrl()}`);
    } catch (err: any) {
      this.log.warn(`Failed to upload initial healthcheck file: ${err.message}`, { fileStore: client.getBaseUrl() });
    }
  }

  /**
   * Start periodic healthcheck file uploads.
   * Uploads a healthcheck file every 15 minutes (default) to verify write access.
   */
  private startPeriodicHealthcheckUpload(): void {
    const client = this.fileStoreUploadClient!;
    const intervalMs = DEFAULT_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES * 60 * 1000;
    this.healthcheckUploadIntervalId = setInterval(() => {
      void client.uploadHealthcheck().then(
        () => this.log.debug(`Periodic healthcheck file uploaded to filestore: ${client.getBaseUrl()}`),
        (err: any) =>
          this.log.warn(`Failed periodic healthcheck file upload: ${err.message}`, { fileStore: client.getBaseUrl() }),
      );
    }, intervalMs);
  }

  /**
   * Tests all configured blob sources (filestores, consensus hosts, archive client)
   * by attempting simple connectivity checks.
   * @throws Error if no blob sources are reachable
   */
  async testSources(): Promise<void> {
    if (this.disabled) {
      this.log.info('Blob client disabled, skipping blob source check');
      return;
    }
    let successfulSources = 0;
    let checkedSources = 0;

    // Check filestore clients
    for (const fileStore of this.fileStoreClients) {
      checkedSources++;
      const canConnect = await fileStore.testConnection();
      if (canConnect) {
        this.log.info(`FileStore blob source is reachable: ${fileStore.getBaseUrl()}`);
        successfulSources++;
      } else {
        this.log.warn(`FileStore blob source is not reachable: ${fileStore.getBaseUrl()}`);
      }
    }

    // Check archive client
    if (this.archiveClient) {
      checkedSources++;
      const canConnect = await this.testArchiveClient();
      if (canConnect) {
        this.log.info(`Archive blob source is reachable: ${this.archiveClient.getBaseUrl()}`);
        successfulSources++;
      } else {
        this.log.warn(`Archive blob source is not reachable: ${this.archiveClient.getBaseUrl()}`);
      }
    }

    // Check consensus hosts
    for (const consensusHostUrl of this.config.l1ConsensusHostUrls ?? []) {
      checkedSources++;
      try {
        const response = await this.fetch(`${consensusHostUrl}/eth/v1/beacon/headers/head`, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        if (response?.ok) {
          this.log.info(`Consensus host blob source is reachable: ${consensusHostUrl}`);
          successfulSources++;
        } else {
          this.log.warn(`Consensus host blob source is not reachable: ${consensusHostUrl}`);
        }
      } catch {
        this.log.warn(`Consensus host blob source is not reachable: ${consensusHostUrl}`);
      }
    }

    if (successfulSources === 0 && checkedSources > 0 && !this.config.blobAllowEmptySources) {
      throw new Error('No blob sources are reachable');
    }

    if (checkedSources === 0) {
      this.log.warn('No blob sources configured');
    }
  }

  /**
   * Test connectivity to the archive client by fetching a single block.
   */
  private async testArchiveClient(): Promise<boolean> {
    try {
      await this.archiveClient!.getBlobsFromBlock('0x1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Disables blob retrieval (eg when running in prover-only mode).
   * getBlobSidecar will return empty arrays when disabled.
   */
  setDisabled(): void {
    this.disabled = true;
  }

  /**
   * Returns true if this client can upload blobs to filestore.
   */
  canUpload(): boolean {
    return !!this.fileStoreUploadClient;
  }

  /**
   * Sends blobs to the filestore for permanent storage.
   * Returns true if upload was successful, false otherwise.
   */
  async sendBlobsToFilestore(blobs: Blob[]): Promise<boolean> {
    if (!this.fileStoreUploadClient) {
      this.log.verbose('No filestore upload client configured, skipping blob upload');
      return false;
    }

    try {
      await this.fileStoreUploadClient.saveBlobs(blobs, true);
      return true;
    } catch (err: any) {
      this.log.error(`Failed to send blobs to filestore: ${err.message}`);
      return false;
    }
  }

  /**
   * Get blob sidecars for a given block hash and blob hashes.
   * Tries sources in order: filestore, consensus hosts, archive client.
   * Stops early if all requested blobs are found.
   */
  async getBlobSidecar(blockHash: string, blobHashes: Buffer[], opts?: GetBlobSidecarOptions): Promise<Blob[]> {
    if (this.disabled) {
      return [];
    }

    const requestedHashes = new Set(blobHashes.map(h => bufferToHex(h)));
    const foundBlobs = new Map<string, Blob>();
    const missingHashes = () => [...requestedHashes].filter(h => !foundBlobs.has(h));

    // Try filestores first
    await this.tryFileStores(missingHashes(), foundBlobs, opts);
    if (missingHashes().length === 0) {
      this.fireOnBlobsFetched(foundBlobs, blobHashes);
      return this.orderBlobsByRequest(foundBlobs, blobHashes);
    }

    // Try consensus hosts
    await this.tryConsensusHosts(blockHash, missingHashes(), foundBlobs);
    if (missingHashes().length === 0) {
      this.fireOnBlobsFetched(foundBlobs, blobHashes);
      return this.orderBlobsByRequest(foundBlobs, blobHashes);
    }

    // Try archive client
    await this.tryArchiveClient(blockHash, missingHashes(), foundBlobs);

    this.fireOnBlobsFetched(foundBlobs, blobHashes);
    return this.orderBlobsByRequest(foundBlobs, blobHashes);
  }

  /**
   * Fire the onBlobsFetched callback with the fetched blobs (async, non-blocking).
   */
  private fireOnBlobsFetched(foundBlobs: Map<string, Blob>, blobHashes: Buffer[]): void {
    if (this.opts.onBlobsFetched && foundBlobs.size > 0) {
      const blobs = this.orderBlobsByRequest(foundBlobs, blobHashes);
      // Fire and forget - don't block on callback
      void Promise.resolve().then(() => this.opts.onBlobsFetched?.(blobs));
    }
  }

  /**
   * Order blobs by the original request order, duplicating blobs if same hash requested multiple times.
   */
  private orderBlobsByRequest(foundBlobs: Map<string, Blob>, blobHashes: Buffer[]): Blob[] {
    return blobHashes.map(h => foundBlobs.get(bufferToHex(h))).filter((b): b is Blob => b !== undefined);
  }

  /**
   * Try to get blobs from filestore clients.
   * Accumulates blobs into foundBlobs map.
   */
  private async tryFileStores(
    hashes: string[],
    foundBlobs: Map<string, Blob>,
    opts?: GetBlobSidecarOptions,
  ): Promise<void> {
    if (this.fileStoreClients.length === 0 || hashes.length === 0) {
      return;
    }

    const isHistoricalSync = opts?.isHistoricalSync ?? false;

    // Try each filestore, accumulating any blobs found
    const shuffledFileStores = [...this.fileStoreClients];
    shuffle(shuffledFileStores);
    for (const fileStore of shuffledFileStores) {
      const missingHashes = hashes.filter(h => !foundBlobs.has(h));
      if (missingHashes.length === 0) {
        break;
      }

      try {
        const blobJsons = await fileStore.getBlobsByHashes(missingHashes);
        for (const blobJson of blobJsons) {
          const blob = this.tryParseBlob(blobJson);
          if (blob) {
            const hash = bufferToHex(blob.getEthVersionedBlobHash());
            if (!foundBlobs.has(hash)) {
              foundBlobs.set(hash, blob);
            }
          }
        }
      } catch (err: any) {
        this.log.warn(`Failed to fetch blobs from filestore ${fileStore.getBaseUrl()}: ${err.message}`);
      }
    }

    // If not all blobs found and not historical sync, retry with backoff
    const stillMissing = hashes.filter(h => !foundBlobs.has(h));
    if (stillMissing.length > 0 && !isHistoricalSync) {
      const backoff = [1, 1, 2];
      for (const delay of backoff) {
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
        const retryFileStores = [...this.fileStoreClients];
        shuffle(retryFileStores);
        for (const fileStore of retryFileStores) {
          const missingHashes = stillMissing.filter(h => !foundBlobs.has(h));
          if (missingHashes.length === 0) {
            break;
          }

          try {
            const blobJsons = await fileStore.getBlobsByHashes(missingHashes);
            for (const blobJson of blobJsons) {
              const blob = this.tryParseBlob(blobJson);
              if (blob) {
                const hash = bufferToHex(blob.getEthVersionedBlobHash());
                if (!foundBlobs.has(hash)) {
                  foundBlobs.set(hash, blob);
                }
              }
            }
          } catch {
            // Ignore errors during retry
          }
        }
        if (stillMissing.every(h => foundBlobs.has(h))) {
          break;
        }
      }
    }
  }

  /**
   * Try to get blobs from consensus hosts.
   * First fetches the beacon block root to determine the slot, then fetches blob sidecars.
   */
  private async tryConsensusHosts(blockHash: string, hashes: string[], foundBlobs: Map<string, Blob>): Promise<void> {
    if (!this.config.l1ConsensusHostUrls?.length || !this.config.l1RpcUrls?.length || hashes.length === 0) {
      return;
    }

    // Get the beacon block root from execution client
    let beaconBlockRoot: string | undefined;
    for (const rpcUrl of this.config.l1RpcUrls) {
      try {
        const client = createPublicClient({ transport: fallback([http(rpcUrl, { batch: false })]) });
        const block = await client.getBlock({ blockHash: blockHash as `0x${string}` });
        beaconBlockRoot = block.parentBeaconBlockRoot ?? undefined;
        if (beaconBlockRoot) {
          break;
        }
      } catch {
        // Try next RPC
      }
    }

    if (!beaconBlockRoot) {
      this.log.warn(`Could not get beacon block root for block ${blockHash}`);
      return;
    }

    // Get slot number from beacon block root
    let slotNumber: number | undefined;
    const shuffledConsensusUrls = [...this.config.l1ConsensusHostUrls];
    shuffle(shuffledConsensusUrls);
    for (const consensusUrl of shuffledConsensusUrls) {
      try {
        const response = await this.fetchWithApiKey(
          `${consensusUrl}/eth/v1/beacon/headers/${beaconBlockRoot}`,
          this.config.l1ConsensusHostUrls.indexOf(consensusUrl),
        );
        if (response?.ok) {
          const data = await response.json();
          slotNumber = data.data?.header?.message?.slot;
          if (slotNumber !== undefined) {
            break;
          }
        }
      } catch {
        // Try next consensus host
      }
    }

    if (slotNumber === undefined) {
      this.log.warn(`Could not get slot number for beacon block ${beaconBlockRoot}`);
      return;
    }

    // Fetch blobs from consensus hosts
    const hashBuffers = hashes.map(h => hexToBuffer(h));
    const shuffledHostsForBlobs = [...this.config.l1ConsensusHostUrls];
    shuffle(shuffledHostsForBlobs);
    for (const consensusUrl of shuffledHostsForBlobs) {
      const missingHashes = hashes.filter(h => !foundBlobs.has(h));
      if (missingHashes.length === 0) {
        break;
      }

      const blobs = await this.getBlobSidecarFrom(
        consensusUrl,
        slotNumber,
        hashBuffers.filter(h => missingHashes.includes(bufferToHex(h))),
        this.config.l1ConsensusHostUrls.indexOf(consensusUrl),
      );

      for (const blob of blobs) {
        const hash = bufferToHex(blob.getEthVersionedBlobHash());
        if (!foundBlobs.has(hash)) {
          foundBlobs.set(hash, blob);
        }
      }
    }
  }

  /**
   * Fetch blob sidecars from a specific consensus host starting at a given slot.
   * Handles missed slots by incrementing and retrying up to the latest slot.
   */
  async getBlobSidecarFrom(
    consensusUrl: string,
    slotNumber: number,
    blobHashes: Buffer[],
    hostIndex: number,
  ): Promise<Blob[]> {
    const foundBlobs = new Map<string, Blob>();
    const requestedHashes = new Set(blobHashes.map(h => bufferToHex(h)));

    // Get latest slot to know when to stop
    let latestSlot: number | undefined;
    try {
      const response = await this.fetchWithApiKey(`${consensusUrl}/eth/v1/beacon/headers/head`, hostIndex);
      if (response?.ok) {
        const data = await response.json();
        latestSlot = data.data?.header?.message?.slot;
      }
    } catch {
      // Continue without latest slot - will only try requested slot
    }

    let currentSlot = slotNumber;
    const maxSlot = latestSlot ?? slotNumber;

    while (currentSlot <= maxSlot && foundBlobs.size < requestedHashes.size) {
      try {
        const response = await this.fetchWithApiKey(
          `${consensusUrl}/eth/v1/beacon/blob_sidecars/${currentSlot}`,
          hostIndex,
        );

        if (response?.ok) {
          const data = await response.json();
          const blobJsons: BlobJson[] = data.data ?? [];

          for (const blobJson of blobJsons) {
            const blob = this.tryParseBlob(blobJson);
            if (blob) {
              const hash = bufferToHex(blob.getEthVersionedBlobHash());
              if (requestedHashes.has(hash) && !foundBlobs.has(hash)) {
                foundBlobs.set(hash, blob);
              }
            }
          }
        }
      } catch {
        // Slot might be missed, try next
      }

      currentSlot++;
    }

    return [...foundBlobs.values()];
  }

  /**
   * Fetch with optional API key authentication (query param or header).
   */
  private fetchWithApiKey(url: string, hostIndex: number): Promise<Response | undefined> {
    const apiKey = this.config.l1ConsensusHostApiKeys?.[hostIndex]?.getValue();
    const apiKeyHeader = this.config.l1ConsensusHostApiKeyHeaders?.[hostIndex];

    let finalUrl = url;
    const headers: Record<string, string> = { accept: 'application/json' };

    if (apiKey) {
      if (apiKeyHeader) {
        headers[apiKeyHeader] = apiKey;
      } else {
        const urlObj = new URL(url);
        urlObj.searchParams.set('key', apiKey);
        finalUrl = urlObj.toString();
      }
    }

    return this.fetch(finalUrl, { headers });
  }

  /**
   * Try to get blobs from the archive client.
   */
  private async tryArchiveClient(blockHash: string, hashes: string[], foundBlobs: Map<string, Blob>): Promise<void> {
    if (!this.archiveClient || hashes.length === 0) {
      return;
    }

    try {
      const blobJsons = await this.archiveClient.getBlobsFromBlock(blockHash);
      for (const blobJson of blobJsons ?? []) {
        const blob = this.tryParseBlob(blobJson);
        if (blob) {
          const hash = bufferToHex(blob.getEthVersionedBlobHash());
          if (hashes.includes(hash) && !foundBlobs.has(hash)) {
            foundBlobs.set(hash, blob);
          }
        }
      }
    } catch (err: any) {
      this.log.warn(`Failed to fetch blobs from archive: ${err.message}`);
    }
  }

  /**
   * Try to parse a blob JSON, validating the commitment matches the data.
   * Returns undefined if parsing fails or commitment doesn't match.
   */
  private tryParseBlob(blobJson: BlobJson): Blob | undefined {
    try {
      const blob = Blob.fromJson(blobJson);
      // Verify the commitment matches the data
      const computedHash = computeEthVersionedBlobHash(blob.commitment);
      const actualHash = blob.getEthVersionedBlobHash();
      if (!computedHash.equals(actualHash)) {
        this.log.warn('Blob commitment mismatch, discarding');
        return undefined;
      }
      return blob;
    } catch (err: any) {
      this.log.debug(`Failed to parse blob: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Get the archive client (for testing).
   */
  protected getArchiveClient(): BlobArchiveClient | undefined {
    return this.archiveClient;
  }
}
