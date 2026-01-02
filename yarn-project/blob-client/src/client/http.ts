import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { shuffle } from '@aztec/foundation/array';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { type RpcBlock, createPublicClient, fallback, http } from 'viem';

import { createBlobArchiveClient } from '../archive/factory.js';
import type { BlobArchiveClient } from '../archive/interface.js';
import type { FileStoreBlobClient } from '../filestore/filestore_blob_client.js';
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
    this.archiveClient = opts.archiveClient ?? createBlobArchiveClient(this.config);
    this.log = opts.logger ?? createLogger('blob-client:client');
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
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        `Fetching ${args[0]}`,
        makeBackoff([1, 1, 3]),
        this.log,
        /*failSilently=*/ true,
      );
    };
  }

  /**
   * Upload fetched blobs to filestore (fire-and-forget).
   * Called automatically when blobs are fetched from any source.
   */
  private uploadBlobsToFileStore(blobs: Blob[]): void {
    if (!this.fileStoreUploadClient) {
      return;
    }

    void this.fileStoreUploadClient.saveBlobs(blobs, true).catch(err => {
      this.log.warn(`Failed to upload ${blobs.length} blobs to filestore`, err);
    });
  }

  /**
   * Disables or enables blob storage operations.
   * When disabled, getBlobSidecar returns empty arrays and sendBlobsToFilestore returns false.
   * Useful for testing scenarios where blob storage failure needs to be simulated.
   * @param value - True to disable blob storage, false to enable
   */
  public setDisabled(value: boolean): void {
    this.disabled = value;
    this.log.info(`Blob storage ${value ? 'disabled' : 'enabled'}`);
  }

  public async testSources() {
    const { l1ConsensusHostUrls } = this.config;
    const archiveUrl = this.archiveClient?.getBaseUrl();
    this.log.info(`Testing configured blob sources`, { l1ConsensusHostUrls, archiveUrl });

    let successfulSourceCount = 0;

    if (l1ConsensusHostUrls && l1ConsensusHostUrls.length > 0) {
      for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
        const l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
        try {
          const { url, ...options } = getBeaconNodeFetchOptions(
            `${l1ConsensusHostUrl}/eth/v1/beacon/headers`,
            this.config,
            l1ConsensusHostIndex,
          );
          const res = await this.fetch(url, options);
          if (res.ok) {
            this.log.info(`L1 consensus host is reachable`, { l1ConsensusHostUrl });
            successfulSourceCount++;
          } else {
            this.log.error(`Failure reaching L1 consensus host: ${res.statusText} (${res.status})`, {
              l1ConsensusHostUrl,
            });
          }
        } catch (err) {
          this.log.error(`Error reaching L1 consensus host`, err, { l1ConsensusHostUrl });
        }
      }
    } else {
      this.log.warn('No L1 consensus host urls configured');
    }

    if (this.archiveClient) {
      try {
        const latest = await this.archiveClient.getLatestBlock();
        this.log.info(`Archive client is reachable and synced to L1 block ${latest.number}`, { latest, archiveUrl });
        successfulSourceCount++;
      } catch (err) {
        this.log.error(`Error reaching archive client`, err, { archiveUrl });
      }
    } else {
      this.log.warn('No archive client configured');
    }

    if (this.fileStoreClients.length > 0) {
      for (const fileStoreClient of this.fileStoreClients) {
        try {
          const accessible = await fileStoreClient.testConnection();
          if (accessible) {
            this.log.info(`FileStore is reachable`, { url: fileStoreClient.getBaseUrl() });
            successfulSourceCount++;
          } else {
            this.log.warn(`FileStore is not accessible`, { url: fileStoreClient.getBaseUrl() });
          }
        } catch (err) {
          this.log.error(`Error reaching filestore`, err, { url: fileStoreClient.getBaseUrl() });
        }
      }
    }

    if (successfulSourceCount === 0) {
      if (this.config.blobAllowEmptySources) {
        this.log.warn('No blob sources are reachable');
      } else {
        throw new Error('No blob sources are reachable');
      }
    }
  }

  public async sendBlobsToFilestore(blobs: Blob[]): Promise<boolean> {
    if (this.disabled) {
      this.log.warn('Blob storage is disabled, not uploading blobs');
      return false;
    }

    if (!this.fileStoreUploadClient) {
      this.log.verbose('No filestore upload configured');
      return false;
    }

    this.log.verbose(`Uploading ${blobs.length} blobs to filestore`);
    try {
      await this.fileStoreUploadClient.saveBlobs(blobs, true);
      return true;
    } catch (err) {
      this.log.error('Failed to upload blobs to filestore', err);
      return false;
    }
  }

  /**
   * Get the blob sidecar
   *
   * If requesting from the blob client, we send the blobkHash
   * If requesting from the beacon node, we send the slot number
   *
   * Source ordering depends on sync state:
   * - Historical sync: blob client → FileStore → L1 consensus → Archive
   * - Near tip sync: blob client → FileStore → L1 consensus → FileStore (with retries) → Archive (eg blobscan)
   *
   * @param blockHash - The block hash
   * @param blobHashes - The blob hashes to fetch
   * @param opts - Options including isHistoricalSync flag
   * @returns The blobs
   */
  public async getBlobSidecar(
    blockHash: `0x${string}`,
    blobHashes: Buffer[],
    opts?: GetBlobSidecarOptions,
  ): Promise<Blob[]> {
    if (this.disabled) {
      this.log.warn('Blob storage is disabled, returning empty blob sidecar');
      return [];
    }

    const isHistoricalSync = opts?.isHistoricalSync ?? false;
    // Accumulate blobs across sources, preserving order and handling duplicates
    // resultBlobs[i] will contain the blob for blobHashes[i], or undefined if not yet found
    const resultBlobs: (Blob | undefined)[] = new Array(blobHashes.length).fill(undefined);

    // Helper to get  missing blob hashes that we still need to fetch
    const getMissingBlobHashes = (): Buffer[] =>
      blobHashes
        .map((bh, i) => (resultBlobs[i] === undefined ? bh : undefined))
        .filter((bh): bh is Buffer => bh !== undefined);

    // Return the result, ignoring any undefined ones
    const getFilledBlobs = (): Blob[] => resultBlobs.filter((b): b is Blob => b !== undefined);

    // Helper to fill in results from fetched blobs
    const fillResults = (fetchedBlobs: BlobJson[]): Blob[] => {
      const blobs = processFetchedBlobs(fetchedBlobs, blobHashes, this.log);
      // Fill in any missing positions with matching blobs
      for (let i = 0; i < blobHashes.length; i++) {
        if (resultBlobs[i] === undefined) {
          resultBlobs[i] = blobs[i];
        }
      }
      return getFilledBlobs();
    };

    // Fire callback when returning blobs (fire-and-forget)
    const returnWithCallback = (blobs: Blob[]): Blob[] => {
      if (blobs.length > 0 && this.opts.onBlobsFetched) {
        void Promise.resolve().then(() => this.opts.onBlobsFetched!(blobs));
      }
      return blobs;
    };

    const { l1ConsensusHostUrls } = this.config;

    const ctx = { blockHash, blobHashes: blobHashes.map(bufferToHex) };

    // Try filestore (quick, no retries) - useful for both historical and near-tip sync
    if (this.fileStoreClients.length > 0 && getMissingBlobHashes().length > 0) {
      await this.tryFileStores(getMissingBlobHashes, fillResults, ctx);
      if (getMissingBlobHashes().length === 0) {
        return returnWithCallback(getFilledBlobs());
      }
    }

    const missingAfterSink = getMissingBlobHashes();
    if (missingAfterSink.length > 0 && l1ConsensusHostUrls && l1ConsensusHostUrls.length > 0) {
      // The beacon api can query by slot number, so we get that first
      const consensusCtx = { l1ConsensusHostUrls, ...ctx };
      this.log.trace(`Attempting to get slot number for block hash`, consensusCtx);
      const slotNumber = await this.getSlotNumber(blockHash);
      this.log.debug(`Got slot number ${slotNumber} from consensus host for querying blobs`, consensusCtx);

      if (slotNumber) {
        let l1ConsensusHostUrl: string;
        for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
          const missingHashes = getMissingBlobHashes();
          if (missingHashes.length === 0) {
            break;
          }

          l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
          this.log.trace(`Attempting to get ${missingHashes.length} blobs from consensus host`, {
            slotNumber,
            l1ConsensusHostUrl,
            ...ctx,
          });
          const blobs = await this.getBlobsFromHost(l1ConsensusHostUrl, slotNumber, l1ConsensusHostIndex);
          const result = fillResults(blobs);
          this.log.debug(
            `Got ${blobs.length} blobs from consensus host (total: ${result.length}/${blobHashes.length})`,
            { slotNumber, l1ConsensusHostUrl, ...ctx },
          );
          if (result.length === blobHashes.length) {
            return returnWithCallback(result);
          }
        }
      }
    }

    // For near-tip sync, retry filestores with backoff (eventual consistency)
    // This handles the case where blobs are still being uploaded by other validators
    if (!isHistoricalSync && this.fileStoreClients.length > 0 && getMissingBlobHashes().length > 0) {
      try {
        await retry(
          async () => {
            await this.tryFileStores(getMissingBlobHashes, fillResults, ctx);
            if (getMissingBlobHashes().length > 0) {
              throw new Error('Still missing blobs from filestores');
            }
          },
          'filestore blob retrieval',
          makeBackoff([1, 1, 2]),
          this.log,
          true, // failSilently - expected to fail during eventual consistency
        );
        return returnWithCallback(getFilledBlobs());
      } catch {
        // Exhausted retries, continue to archive fallback
      }
    }

    const missingAfterConsensus = getMissingBlobHashes();
    if (missingAfterConsensus.length > 0 && this.archiveClient) {
      const archiveCtx = { archiveUrl: this.archiveClient.getBaseUrl(), ...ctx };
      this.log.trace(`Attempting to get ${missingAfterConsensus.length} blobs from archive`, archiveCtx);
      const allBlobs = await this.archiveClient.getBlobsFromBlock(blockHash);
      if (!allBlobs) {
        this.log.debug('No blobs found from archive client', archiveCtx);
      } else {
        this.log.trace(`Got ${allBlobs.length} blobs from archive client before filtering`, archiveCtx);
        const result = fillResults(allBlobs);
        this.log.debug(
          `Got ${allBlobs.length} blobs from archive client (total: ${result.length}/${blobHashes.length})`,
          archiveCtx,
        );
        if (result.length === blobHashes.length) {
          return returnWithCallback(result);
        }
      }
    }

    const result = getFilledBlobs();
    if (result.length < blobHashes.length) {
      this.log.warn(
        `Failed to fetch all blobs for ${blockHash} from all blob sources (got ${result.length}/${blobHashes.length})`,
        {
          l1ConsensusHostUrls,
          archiveUrl: this.archiveClient?.getBaseUrl(),
          fileStoreUrls: this.fileStoreClients.map(c => c.getBaseUrl()),
        },
      );
    }
    return returnWithCallback(result);
  }

  /**
   * Try all filestores once (shuffled for load distribution).
   * @param getMissingBlobHashes - Function to get remaining blob hashes to fetch
   * @param fillResults - Callback to fill in results
   * @param ctx - Logging context
   */
  private async tryFileStores(
    getMissingBlobHashes: () => Buffer[],
    fillResults: (blobs: BlobJson[]) => Blob[],
    ctx: { blockHash: string; blobHashes: string[] },
  ): Promise<void> {
    // Shuffle clients for load distribution
    const shuffledClients = [...this.fileStoreClients];
    shuffle(shuffledClients);

    for (const client of shuffledClients) {
      const blobHashes = getMissingBlobHashes();
      if (blobHashes.length === 0) {
        return; // All blobs found, no need to try more filestores
      }

      try {
        const blobHashStrings = blobHashes.map(h => `0x${h.toString('hex')}`);
        this.log.trace(`Attempting to get ${blobHashStrings.length} blobs from filestore`, {
          url: client.getBaseUrl(),
          ...ctx,
        });
        const blobs = await client.getBlobsByHashes(blobHashStrings);
        if (blobs.length > 0) {
          const result = fillResults(blobs);
          this.log.debug(
            `Got ${blobs.length} blobs from filestore (total: ${result.length}/${ctx.blobHashes.length})`,
            {
              url: client.getBaseUrl(),
              ...ctx,
            },
          );
        }
      } catch (err) {
        this.log.warn(`Failed to fetch from filestore: ${err}`, { url: client.getBaseUrl() });
      }
    }
  }

  public async getBlobSidecarFrom(
    hostUrl: string,
    blockHashOrSlot: string | number,
    blobHashes: Buffer[] = [],
    l1ConsensusHostIndex?: number,
  ): Promise<Blob[]> {
    const blobs = await this.getBlobsFromHost(hostUrl, blockHashOrSlot, l1ConsensusHostIndex);
    return processFetchedBlobs(blobs, blobHashes, this.log).filter((b): b is Blob => b !== undefined);
  }

  public async getBlobsFromHost(
    hostUrl: string,
    blockHashOrSlot: string | number,
    l1ConsensusHostIndex?: number,
  ): Promise<BlobJson[]> {
    try {
      let res = await this.fetchBlobSidecars(hostUrl, blockHashOrSlot, l1ConsensusHostIndex);
      if (res.ok) {
        return parseBlobJsonsFromResponse(await res.json(), this.log);
      }

      if (res.status === 404 && typeof blockHashOrSlot === 'number') {
        const latestSlot = await this.getLatestSlotNumber(hostUrl, l1ConsensusHostIndex);
        this.log.debug(`Requested L1 slot ${blockHashOrSlot} not found, trying out slots up to ${latestSlot}`, {
          hostUrl,
          status: res.status,
          statusText: res.statusText,
        });

        let maxRetries = 10;
        let currentSlot = blockHashOrSlot + 1;
        while (res.status === 404 && maxRetries > 0 && latestSlot !== undefined && currentSlot <= latestSlot) {
          this.log.debug(`Trying slot ${currentSlot}`);
          res = await this.fetchBlobSidecars(hostUrl, currentSlot, l1ConsensusHostIndex);
          if (res.ok) {
            return parseBlobJsonsFromResponse(await res.json(), this.log);
          }
          currentSlot++;
          maxRetries--;
        }
      }

      this.log.warn(`Unable to get blob sidecar for ${blockHashOrSlot}: ${res.statusText} (${res.status})`, {
        status: res.status,
        statusText: res.statusText,
        body: await res.text().catch(() => 'Failed to read response body'),
      });
      return [];
    } catch (error: any) {
      this.log.warn(`Error getting blob sidecar from ${hostUrl}: ${error.message ?? error}`);
      return [];
    }
  }

  private fetchBlobSidecars(
    hostUrl: string,
    blockHashOrSlot: string | number,
    l1ConsensusHostIndex?: number,
  ): Promise<Response> {
    const baseUrl = `${hostUrl}/eth/v1/beacon/blob_sidecars/${blockHashOrSlot}`;

    const { url, ...options } = getBeaconNodeFetchOptions(baseUrl, this.config, l1ConsensusHostIndex);
    this.log.debug(`Fetching blob sidecar for ${blockHashOrSlot}`, { url, ...options });
    return this.fetch(url, options);
  }

  private async getLatestSlotNumber(hostUrl: string, l1ConsensusHostIndex?: number): Promise<number | undefined> {
    try {
      const baseUrl = `${hostUrl}/eth/v1/beacon/headers/head`;
      const { url, ...options } = getBeaconNodeFetchOptions(baseUrl, this.config, l1ConsensusHostIndex);
      this.log.debug(`Fetching latest slot number`, { url, ...options });
      const res = await this.fetch(url, options);
      if (res.ok) {
        const body = await res.json();
        const slot = parseInt(body.data.header.message.slot);
        if (Number.isNaN(slot)) {
          this.log.error(`Failed to parse slot number from response from ${hostUrl}`, { body });
          return undefined;
        }
        return slot;
      }
    } catch (err) {
      this.log.error(`Error getting latest slot number from ${hostUrl}`, err);
      return undefined;
    }
  }

  /**
   * Get the slot number from the consensus host
   * As of eip-4788, the parentBeaconBlockRoot is included in the execution layer.
   * This allows us to query the consensus layer for the slot number of the parent block, which we will then use
   * to request blobs from the consensus layer.
   *
   * If this returns undefined, it means that we are not connected to a real consensus host, and we should
   * query blobs with the blockHash.
   *
   * If this returns a number, then we should query blobs with the slot number
   *
   * @param blockHash - The block hash
   * @returns The slot number
   */
  private async getSlotNumber(blockHash: `0x${string}`): Promise<number | undefined> {
    const { l1ConsensusHostUrls, l1RpcUrls } = this.config;
    if (!l1ConsensusHostUrls || l1ConsensusHostUrls.length === 0) {
      this.log.debug('No consensus host url configured');
      return undefined;
    }

    if (!l1RpcUrls || l1RpcUrls.length === 0) {
      this.log.debug('No execution host url configured');
      return undefined;
    }

    // Ping execution node to get the parentBeaconBlockRoot for this block
    let parentBeaconBlockRoot: string | undefined;
    const client = createPublicClient({
      transport: fallback(l1RpcUrls.map(url => http(url, { batch: false }))),
    });
    try {
      const res: RpcBlock = await client.request({
        method: 'eth_getBlockByHash',
        params: [blockHash, /*tx flag*/ false],
      });

      if (res.parentBeaconBlockRoot) {
        parentBeaconBlockRoot = res.parentBeaconBlockRoot;
      }
    } catch (err) {
      this.log.error(`Error getting parent beacon block root`, err);
    }

    if (!parentBeaconBlockRoot) {
      this.log.error(`No parent beacon block root found for block ${blockHash}`);
      return undefined;
    }

    // Query beacon chain to get the slot number for that block root
    let l1ConsensusHostUrl: string;
    for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
      l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
      try {
        const { url, ...options } = getBeaconNodeFetchOptions(
          `${l1ConsensusHostUrl}/eth/v1/beacon/headers/${parentBeaconBlockRoot}`,
          this.config,
          l1ConsensusHostIndex,
        );
        const res = await this.fetch(url, options);

        if (res.ok) {
          const body = await res.json();

          // Add one to get the slot number of the original block hash
          return Number(body.data.header.message.slot) + 1;
        }
      } catch (err) {
        this.log.error(`Error getting slot number`, err);
      }
    }

    return undefined;
  }

  /** @internal - exposed for testing */
  public getArchiveClient(): BlobArchiveClient | undefined {
    return this.archiveClient;
  }
}

function parseBlobJsonsFromResponse(response: any, logger: Logger): BlobJson[] {
  try {
    const blobs = response.data.map(parseBlobJson);
    return blobs;
  } catch (err) {
    logger.error(`Error parsing blob json from response`, err);
    return [];
  }
}

// Blobs will be in this form when requested from the blob client, or from the beacon chain via `getBlobSidecars`:
// https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
// Here we attempt to parse the response data to Buffer, and check the lengths (via Blob's constructor), to avoid
// throwing an error down the line when calling Blob.fromJson().
function parseBlobJson(data: any): BlobJson {
  const blobBuffer = Buffer.from(data.blob.slice(2), 'hex');
  const commitmentBuffer = Buffer.from(data.kzg_commitment.slice(2), 'hex');
  const blob = new Blob(blobBuffer, commitmentBuffer);
  return blob.toJSON();
}

// Returns an array that maps each blob hash to the corresponding blob, or undefined if the blob is not found
// or the data does not match the commitment.
function processFetchedBlobs(blobs: BlobJson[], blobHashes: Buffer[], logger: Logger): (Blob | undefined)[] {
  const requestedBlobHashes = new Set<string>(blobHashes.map(bufferToHex));
  const hashToBlob = new Map<string, Blob>();
  for (const blobJson of blobs) {
    const hashHex = bufferToHex(computeEthVersionedBlobHash(hexToBuffer(blobJson.kzg_commitment)));
    if (!requestedBlobHashes.has(hashHex) || hashToBlob.has(hashHex)) {
      continue;
    }

    try {
      const blob = Blob.fromJson(blobJson);
      hashToBlob.set(hashHex, blob);
    } catch (err) {
      // If the above throws, it's likely that the blob commitment does not match the hash of the blob data.
      logger.error(`Error converting blob from json`, err);
    }
  }
  return blobHashes.map(h => hashToBlob.get(bufferToHex(h)));
}

function getBeaconNodeFetchOptions(url: string, config: BlobClientConfig, l1ConsensusHostIndex?: number) {
  const { l1ConsensusHostApiKeys, l1ConsensusHostApiKeyHeaders } = config;
  const l1ConsensusHostApiKey =
    l1ConsensusHostIndex !== undefined && l1ConsensusHostApiKeys && l1ConsensusHostApiKeys[l1ConsensusHostIndex];
  const l1ConsensusHostApiKeyHeader =
    l1ConsensusHostIndex !== undefined &&
    l1ConsensusHostApiKeyHeaders &&
    l1ConsensusHostApiKeyHeaders[l1ConsensusHostIndex];

  let formattedUrl = url;
  if (l1ConsensusHostApiKey && l1ConsensusHostApiKey.getValue() !== '' && !l1ConsensusHostApiKeyHeader) {
    formattedUrl += `${formattedUrl.includes('?') ? '&' : '?'}key=${l1ConsensusHostApiKey.getValue()}`;
  }

  return {
    url: formattedUrl,
    ...(l1ConsensusHostApiKey &&
      l1ConsensusHostApiKeyHeader && {
        headers: {
          [l1ConsensusHostApiKeyHeader]: l1ConsensusHostApiKey.getValue(),
        },
      }),
  };
}
