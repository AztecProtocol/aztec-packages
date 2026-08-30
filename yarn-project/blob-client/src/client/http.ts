import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { shuffle } from '@aztec/foundation/array';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { type RpcBlock, createPublicClient } from 'viem';

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

  /** Cached beacon genesis time (seconds since Unix epoch). Fetched once at startup. */
  private beaconGenesisTime?: bigint;
  /** Cached beacon slot duration in seconds. Fetched once at startup. */
  private beaconSecondsPerSlot?: number;

  /** Indexes of consensus hosts that serve blob sidecars (supernodes). Populated by testSources(). */
  private superNodeHostIndexes?: Set<number>;

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

    let consensusSuperNodes = 0;
    let consensusNonSuperNodes = 0;
    let archiveSources = 0;
    let blobSinks = 0;

    const detectedSuperNodes = new Set<number>();

    if (l1ConsensusHostUrls && l1ConsensusHostUrls.length > 0) {
      for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
        const l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
        try {
          const { url, ...options } = getBeaconNodeFetchOptions(
            `${l1ConsensusHostUrl}/eth/v1/beacon/headers/head`,
            this.config,
            l1ConsensusHostIndex,
          );
          const res = await this.fetch(url, options);
          if (!res.ok) {
            this.log.error(`Failure reaching L1 consensus host: ${res.statusText} (${res.status})`, {
              l1ConsensusHostUrl,
            });
            continue;
          }

          this.log.info(`L1 consensus host is reachable`, { l1ConsensusHostUrl });

          // Check if the host serves blob sidecars (supernode/semi-supernode).
          // Post-Fusaka (PeerDAS), non-supernode beacon nodes no longer serve the
          // blob sidecar endpoint. A 200 response (even with an empty data array
          // for a slot with no blobs) means the node supports serving blob sidecars.
          const body = await res.json();
          const headSlot = body?.data?.header?.message?.slot;
          if (headSlot) {
            const { url: blobUrl, ...blobOptions } = getBeaconNodeFetchOptions(
              `${l1ConsensusHostUrl}/eth/v1/beacon/blobs/${headSlot}`,
              this.config,
              l1ConsensusHostIndex,
            );
            const blobRes = await this.fetch(blobUrl, blobOptions);
            if (blobRes.ok) {
              this.log.info(`L1 consensus host serves blob sidecars (supernode)`, { l1ConsensusHostUrl });
              detectedSuperNodes.add(l1ConsensusHostIndex);
              consensusSuperNodes++;
            } else {
              this.log.info(`L1 consensus host does not serve blob sidecars, skipping for blob fetching`, {
                l1ConsensusHostUrl,
              });
              consensusNonSuperNodes++;
            }
          } else {
            this.log.info(`L1 consensus host is reachable but could not determine head slot`, { l1ConsensusHostUrl });
            consensusNonSuperNodes++;
          }
        } catch (err) {
          this.log.error(`Error reaching L1 consensus host`, err, { l1ConsensusHostUrl });
        }
      }
    }

    this.superNodeHostIndexes = detectedSuperNodes;

    if (this.archiveClient) {
      try {
        const latest = await this.archiveClient.getLatestBlock();
        this.log.info(`Archive client is reachable and synced to L1 block ${latest.number}`, { latest, archiveUrl });
        archiveSources++;
      } catch (err) {
        this.log.error(`Error reaching archive client`, err, { archiveUrl });
      }
    }

    if (this.fileStoreClients.length > 0) {
      for (const fileStoreClient of this.fileStoreClients) {
        try {
          const accessible = await fileStoreClient.testConnection();
          if (accessible) {
            this.log.info(`FileStore is reachable`, { url: fileStoreClient.getBaseUrl() });
            blobSinks++;
          } else {
            this.log.warn(`FileStore is not accessible`, { url: fileStoreClient.getBaseUrl() });
          }
        } catch (err) {
          this.log.error(`Error reaching filestore`, err, { url: fileStoreClient.getBaseUrl() });
        }
      }
    }

    // Emit a single summary after validating all sources
    const successfulSourceCount = consensusSuperNodes + archiveSources + blobSinks;

    let summary = `Blob client running with consensusSuperNodes=${consensusSuperNodes} archiveSources=${archiveSources} blobSinks=${blobSinks}`;
    if (consensusNonSuperNodes > 0) {
      summary += `. ${consensusNonSuperNodes} consensus client(s) ignored because they are not running in supernode or semi-supernode mode`;
    }

    if (successfulSourceCount === 0) {
      if (this.config.blobAllowEmptySources) {
        this.log.warn(summary);
      } else {
        throw new Error(summary);
      }
    } else if (consensusSuperNodes === 0) {
      this.log.warn(summary);
    } else {
      this.log.info(summary);
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
   * Get the blob sidecar.
   *
   * Alternates between two primary sources (consensus and filestore) in a retry loop,
   * then falls back to archive if blobs are still missing. The order of the primary
   * sources is configurable via `blobPreferFilestores`.
   *
   * @param blockHash - The block hash
   * @param blobHashes - The blob hashes to fetch
   * @param opts - Options for slot resolution
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

    // Accumulate blobs across sources, preserving order and handling duplicates
    // resultBlobs[i] will contain the blob for blobHashes[i], or undefined if not yet found
    const resultBlobs: (Blob | undefined)[] = new Array(blobHashes.length).fill(undefined);

    // Helper to get missing blob hashes that we still need to fetch
    const getMissingBlobHashes = (): Buffer[] =>
      blobHashes
        .map((bh, i) => (resultBlobs[i] === undefined ? bh : undefined))
        .filter((bh): bh is Buffer => bh !== undefined);

    // Return the result, ignoring any undefined ones
    const getFilledBlobs = (): Blob[] => resultBlobs.filter((b): b is Blob => b !== undefined);

    // Helper to fill in results from fetched blobs
    const fillResults = async (fetchedBlobs: BlobJson[]): Promise<Blob[]> => {
      const blobs = await processFetchedBlobs(fetchedBlobs, blobHashes, this.log);
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

    const ctx = { blockHash, blobHashes: blobHashes.map(bufferToHex) };

    // Lazily resolve the slot number — only resolved when consensus hosts are actually tried.
    let slotNumber: number | undefined;
    let slotResolved = false;
    const getSlotNumber = async (): Promise<number | undefined> => {
      if (!slotResolved) {
        slotNumber = await this.resolveSlotNumber(blockHash, opts);
        slotResolved = true;
      }
      return slotNumber;
    };

    // Build the two source-try functions. The order depends on the config.
    const tryConsensus = () => this.tryConsensusHosts(getSlotNumber, getMissingBlobHashes, fillResults, ctx);
    const tryFilestores = () => this.tryFileStores(getMissingBlobHashes, fillResults, ctx);

    const preferFilestores = this.config.blobPreferFilestores ?? false;
    const [trySourceA, trySourceB] = preferFilestores ? [tryFilestores, tryConsensus] : [tryConsensus, tryFilestores];

    // Historical sync: blobs should already exist, use shorter backoff for transient errors.
    // Near-tip sync: blobs may still be uploading, use longer backoff for eventual consistency.
    const isHistoricalSync = opts?.isHistoricalSync ?? false;
    const backoff = isHistoricalSync ? [1, 1] : [1, 1, 1, 2, 2];

    // Retry loop: alternate between the two primary sources with backoff.
    try {
      await retry(
        async () => {
          if (getMissingBlobHashes().length > 0) {
            await trySourceA();
          }
          if (getMissingBlobHashes().length > 0) {
            await trySourceB();
          }
          if (getMissingBlobHashes().length > 0) {
            throw new Error('Still missing blobs after trying all primary sources');
          }
        },
        'blob retrieval',
        makeBackoff(backoff),
        this.log,
        true, // failSilently — expected during eventual consistency
      );
      return returnWithCallback(getFilledBlobs());
    } catch {
      // Exhausted retries, continue to archive fallback
    }

    // Archive fallback
    const missingAfterPrimary = getMissingBlobHashes();
    if (missingAfterPrimary.length > 0 && this.archiveClient) {
      const archiveCtx = { archiveUrl: this.archiveClient.getBaseUrl(), ...ctx };
      this.log.trace(`Attempting to get ${missingAfterPrimary.length} blobs from archive`, archiveCtx);
      const allBlobs = await this.archiveClient.getBlobsFromBlock(blockHash);
      if (!allBlobs) {
        this.log.debug('No blobs found from archive client', archiveCtx);
      } else {
        this.log.trace(`Got ${allBlobs.length} blobs from archive client before filtering`, archiveCtx);
        const result = await fillResults(allBlobs);
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
          l1ConsensusHostUrls: this.config.l1ConsensusHostUrls,
          archiveUrl: this.archiveClient?.getBaseUrl(),
          fileStoreUrls: this.fileStoreClients.map(c => c.getBaseUrl()),
        },
      );
    }
    return returnWithCallback(result);
  }

  /** Resolves the beacon slot number for the given block hash. Returns undefined if no consensus hosts. */
  private resolveSlotNumber(
    blockHash: `0x${string}`,
    opts?: GetBlobSidecarOptions,
  ): Promise<number | undefined> | undefined {
    const { l1ConsensusHostUrls } = this.config;
    if (!l1ConsensusHostUrls || l1ConsensusHostUrls.length === 0) {
      return undefined;
    }
    // If no supernodes, no point resolving the slot
    if (this.superNodeHostIndexes && this.superNodeHostIndexes.size === 0) {
      return undefined;
    }
    return this.getSlotNumber(blockHash, opts?.parentBeaconBlockRoot, opts?.l1BlockTimestamp);
  }

  /**
   * Try all supernode consensus hosts for blob sidecars.
   * Skips hosts that were detected as non-supernodes during testSources().
   */
  private async tryConsensusHosts(
    getSlotNumber: () => Promise<number | undefined>,
    getMissingBlobHashes: () => Buffer[],
    fillResults: (blobs: BlobJson[]) => Promise<Blob[]>,
    ctx: { blockHash: string; blobHashes: string[] },
  ): Promise<void> {
    const { l1ConsensusHostUrls } = this.config;
    if (!l1ConsensusHostUrls || l1ConsensusHostUrls.length === 0) {
      return;
    }

    const slotNumber = await getSlotNumber();
    if (!slotNumber) {
      return;
    }

    for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
      const missingHashes = getMissingBlobHashes();
      if (missingHashes.length === 0) {
        break;
      }

      // Skip non-supernode hosts if we've already detected supernodes
      if (this.superNodeHostIndexes && !this.superNodeHostIndexes.has(l1ConsensusHostIndex)) {
        this.log.trace(`Skipping non-supernode consensus host`, {
          l1ConsensusHostUrl: l1ConsensusHostUrls[l1ConsensusHostIndex],
        });
        continue;
      }

      const l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
      this.log.trace(`Attempting to get ${missingHashes.length} blobs from consensus host`, {
        slotNumber,
        l1ConsensusHostUrl,
        ...ctx,
      });
      const blobs = await this.getBlobsFromHost(l1ConsensusHostUrl, slotNumber, l1ConsensusHostIndex, missingHashes);
      const result = await fillResults(blobs);
      this.log.debug(
        `Got ${blobs.length} blobs from consensus host (total: ${result.length}/${ctx.blobHashes.length})`,
        { slotNumber, l1ConsensusHostUrl, ...ctx },
      );
    }
  }

  /**
   * Try all filestores once (shuffled for load distribution).
   * @param getMissingBlobHashes - Function to get remaining blob hashes to fetch
   * @param fillResults - Callback to fill in results
   * @param ctx - Logging context
   */
  private async tryFileStores(
    getMissingBlobHashes: () => Buffer[],
    fillResults: (blobs: BlobJson[]) => Promise<Blob[]>,
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
          const result = await fillResults(blobs);
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
    const blobs = await this.getBlobsFromHost(hostUrl, blockHashOrSlot, l1ConsensusHostIndex, blobHashes);
    return (await processFetchedBlobs(blobs, blobHashes, this.log)).filter((b): b is Blob => b !== undefined);
  }

  public async getBlobsFromHost(
    hostUrl: string,
    blockHashOrSlot: string | number,
    l1ConsensusHostIndex?: number,
    blobHashes?: Buffer[],
  ): Promise<BlobJson[]> {
    try {
      let res = await this.fetchBlobSidecars(hostUrl, blockHashOrSlot, l1ConsensusHostIndex, blobHashes);
      if (res.ok) {
        return await parseBlobJsonsFromResponse(await res.json(), this.log);
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
          res = await this.fetchBlobSidecars(hostUrl, currentSlot, l1ConsensusHostIndex, blobHashes);
          if (res.ok) {
            return await parseBlobJsonsFromResponse(await res.json(), this.log);
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
    blobHashes?: Buffer[],
  ): Promise<Response> {
    let baseUrl = `${hostUrl}/eth/v1/beacon/blobs/${blockHashOrSlot}`;

    if (blobHashes && blobHashes.length > 0) {
      const params = new URLSearchParams();
      for (const hash of blobHashes) {
        params.append('versioned_hashes', `0x${hash.toString('hex')}`);
      }
      baseUrl += `?${params.toString()}`;
    }

    const { url, logSafeUrl, ...options } = getBeaconNodeFetchOptions(baseUrl, this.config, l1ConsensusHostIndex);
    this.log.debug(`Fetching blob sidecar for ${blockHashOrSlot}`, { url: logSafeUrl, ...options });
    // No retry here — this is called inside the main retry loop in getBlobSidecar
    return fetch(url, options);
  }

  private async getLatestSlotNumber(hostUrl: string, l1ConsensusHostIndex?: number): Promise<number | undefined> {
    try {
      const baseUrl = `${hostUrl}/eth/v1/beacon/headers/head`;
      const { url, logSafeUrl, ...options } = getBeaconNodeFetchOptions(baseUrl, this.config, l1ConsensusHostIndex);
      this.log.debug(`Fetching latest slot number`, { url: logSafeUrl, ...options });
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
  private async getSlotNumber(
    blockHash: `0x${string}`,
    parentBeaconBlockRoot?: string,
    l1BlockTimestamp?: bigint,
  ): Promise<number | undefined> {
    const { l1ConsensusHostUrls, l1RpcUrls } = this.config;
    if (!l1ConsensusHostUrls || l1ConsensusHostUrls.length === 0) {
      this.log.debug('No consensus host url configured');
      return undefined;
    }

    // Primary path: compute slot from timestamp if genesis config is cached (no network call needed)
    if (
      l1BlockTimestamp !== undefined &&
      this.beaconGenesisTime !== undefined &&
      this.beaconSecondsPerSlot !== undefined
    ) {
      const slot = Number((l1BlockTimestamp - this.beaconGenesisTime) / BigInt(this.beaconSecondsPerSlot));
      this.log.debug(`Computed slot ${slot} from L1 block timestamp`, { l1BlockTimestamp });
      return slot;
    }

    if (!parentBeaconBlockRoot) {
      // parentBeaconBlockRoot not provided by caller — fetch it from the execution RPC
      if (!l1RpcUrls || l1RpcUrls.length === 0) {
        this.log.debug('No execution host url configured');
        return undefined;
      }

      const client = createPublicClient({
        transport: makeL1HttpTransport(l1RpcUrls, { timeout: this.config.l1HttpTimeoutMS }),
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

  /** Returns true if this client can upload blobs to filestore. */
  public canUpload(): boolean {
    return this.fileStoreUploadClient !== undefined;
  }

  /**
   * Start the blob client.
   * Fetches and caches beacon genesis config for timestamp-based slot resolution,
   * then uploads the initial healthcheck file (awaited) and starts periodic uploads.
   */
  public async start(): Promise<void> {
    await this.fetchBeaconConfig();

    if (!this.fileStoreUploadClient) {
      return;
    }

    await this.fileStoreUploadClient.uploadHealthcheck();
    this.log.debug('Initial healthcheck file uploaded');

    this.startPeriodicHealthcheckUpload();
  }

  /**
   * Start periodic healthcheck upload to the file store to ensure it remains available even if accidentally deleted.
   */
  private startPeriodicHealthcheckUpload(): void {
    const intervalMs =
      (this.config.blobHealthcheckUploadIntervalMinutes ?? DEFAULT_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES) * 60 * 1000;

    this.healthcheckUploadIntervalId = setInterval(() => {
      void this.fileStoreUploadClient!.uploadHealthcheck().catch(err => {
        this.log.warn('Failed to upload periodic healthcheck file', err);
      });
    }, intervalMs);
  }

  /**
   * Fetches and caches beacon genesis time and slot duration from the first available consensus host.
   * These static values enable timestamp-based slot resolution, eliminating the per-fetch headers call.
   * Logs a warning and leaves fields undefined if all hosts fail, callers fall back gracefully.
   */
  private async fetchBeaconConfig(): Promise<void> {
    const { l1ConsensusHostUrls } = this.config;
    if (!l1ConsensusHostUrls || l1ConsensusHostUrls.length === 0) {
      return;
    }

    for (let i = 0; i < l1ConsensusHostUrls.length; i++) {
      try {
        const { url: genesisUrl, ...genesisOptions } = getBeaconNodeFetchOptions(
          `${l1ConsensusHostUrls[i]}/eth/v1/config/genesis`,
          this.config,
          i,
        );
        const { url: specUrl, ...specOptions } = getBeaconNodeFetchOptions(
          `${l1ConsensusHostUrls[i]}/eth/v1/config/spec`,
          this.config,
          i,
        );

        const [genesisRes, specRes] = await Promise.all([
          this.fetch(genesisUrl, genesisOptions),
          this.fetch(specUrl, specOptions),
        ]);

        if (genesisRes.ok && specRes.ok) {
          const genesis = await genesisRes.json();
          const spec = await specRes.json();
          this.beaconGenesisTime = BigInt(genesis.data.genesisTime);
          this.beaconSecondsPerSlot = parseInt(spec.data.secondsPerSlot);
          this.log.debug(`Fetched beacon genesis config`, {
            genesisTime: this.beaconGenesisTime,
            secondsPerSlot: this.beaconSecondsPerSlot,
          });
          return;
        }
      } catch (err) {
        this.log.warn(`Failed to fetch beacon config from host ${l1ConsensusHostUrls[i]}`, err);
      }
    }
    this.log.warn('Could not fetch beacon genesis config from any consensus host — will use headers call fallback');
  }

  /**
   * Stop the blob client, clearing any periodic tasks.
   */
  public stop(): void {
    if (this.healthcheckUploadIntervalId) {
      clearInterval(this.healthcheckUploadIntervalId);
      this.healthcheckUploadIntervalId = undefined;
    }
  }
}

async function parseBlobJsonsFromResponse(response: any, logger: Logger): Promise<BlobJson[]> {
  try {
    return await Promise.all((response.data as string[]).map(parseBlobJson));
  } catch (err) {
    logger.error(`Error parsing blob json from response`, err);
    return [];
  }
}

// Blobs will be in this form when requested from the blob client, or from the beacon chain via `getBlobs`:
// https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobs
// Here we attempt to parse the response data to Buffer, and check the lengths (via Blob's constructor), to avoid
// throwing an error down the line when calling Blob.fromJson().
async function parseBlobJson(rawHex: string): Promise<BlobJson> {
  const blobBuffer = Buffer.from(rawHex.slice(2), 'hex');
  const blob = await Blob.fromBlobBuffer(blobBuffer);
  return blob.toJSON();
}

// Returns an array that maps each blob hash to the corresponding blob, or undefined if the blob is not found
// or the data does not match the commitment.
async function processFetchedBlobs(
  blobs: BlobJson[],
  blobHashes: Buffer[],
  logger: Logger,
): Promise<(Blob | undefined)[]> {
  const requestedBlobHashes = new Set<string>(blobHashes.map(bufferToHex));
  const hashToBlob = new Map<string, Blob>();
  for (const blobJson of blobs) {
    const hashHex = bufferToHex(computeEthVersionedBlobHash(hexToBuffer(blobJson.kzg_commitment)));
    if (!requestedBlobHashes.has(hashHex) || hashToBlob.has(hashHex)) {
      continue;
    }

    try {
      const blob = await Blob.fromJson(blobJson);
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
  let logSafeUrl = url;
  if (l1ConsensusHostApiKey && l1ConsensusHostApiKey.getValue() !== '' && !l1ConsensusHostApiKeyHeader) {
    const separator = formattedUrl.includes('?') ? '&' : '?';
    formattedUrl += `${separator}key=${l1ConsensusHostApiKey.getValue()}`;
    logSafeUrl += `${separator}key=[REDACTED]`;
  }

  return {
    url: formattedUrl,
    logSafeUrl,
    ...(l1ConsensusHostApiKey &&
      l1ConsensusHostApiKeyHeader && {
        headers: {
          [l1ConsensusHostApiKeyHeader]: l1ConsensusHostApiKey.getValue(),
        },
      }),
  };
}
