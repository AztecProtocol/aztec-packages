import { Blob, type BlobJson, computeEthVersionedBlobHash } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { type RpcBlock, createPublicClient, fallback, http } from 'viem';

import { createBlobArchiveClient } from '../archive/factory.js';
import type { BlobArchiveClient } from '../archive/interface.js';
import { outboundTransform } from '../encoding/index.js';
import { BlobWithIndex } from '../types/blob_with_index.js';
import { type BlobSinkConfig, getBlobSinkConfigFromEnv } from './config.js';
import type { BlobSinkClientInterface } from './interface.js';

export class HttpBlobSinkClient implements BlobSinkClientInterface {
  protected readonly log: Logger;
  protected readonly config: BlobSinkConfig;
  protected readonly archiveClient: BlobArchiveClient | undefined;
  protected readonly fetch: typeof fetch;

  constructor(
    config?: BlobSinkConfig,
    private readonly opts: {
      logger?: Logger;
      archiveClient?: BlobArchiveClient;
    } = {},
  ) {
    this.config = config ?? getBlobSinkConfigFromEnv();
    this.archiveClient = opts.archiveClient ?? createBlobArchiveClient(this.config);
    this.log = opts.logger ?? createLogger('blob-sink:client');
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

  public async testSources() {
    const { blobSinkUrl, l1ConsensusHostUrls } = this.config;
    const archiveUrl = this.archiveClient?.getBaseUrl();
    this.log.info(`Testing configured blob sources`, { blobSinkUrl, l1ConsensusHostUrls, archiveUrl });

    let successfulSourceCount = 0;

    if (blobSinkUrl) {
      try {
        const res = await this.fetch(`${this.config.blobSinkUrl}/status`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          this.log.info(`Blob sink is reachable`, { blobSinkUrl });
          successfulSourceCount++;
        } else {
          this.log.error(`Failure reaching blob sink: ${res.statusText} (${res.status})`, { blobSinkUrl });
        }
      } catch (err) {
        this.log.error(`Error reaching blob sink`, err, { blobSinkUrl });
      }
    } else {
      this.log.warn('No blob sink url is configured');
    }

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

    if (successfulSourceCount === 0) {
      if (this.config.blobAllowEmptySources) {
        this.log.warn('No blob sources are reachable');
      } else {
        throw new Error('No blob sources are reachable');
      }
    }
  }

  public async sendBlobsToBlobSink(blobs: Blob[]): Promise<boolean> {
    if (!this.config.blobSinkUrl) {
      this.log.verbose('No blob sink url configured');
      return false;
    }

    this.log.verbose(`Sending ${blobs.length} blobs to blob sink`);
    try {
      const res = await this.fetch(`${this.config.blobSinkUrl}/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Snappy compress the blob buffer
          blobs: blobs.map((b, i) => ({ blob: outboundTransform(b.toBuffer()), index: i })),
        }),
      });

      if (res.ok) {
        return true;
      }

      this.log.error('Failed to send blobs to blob sink', { status: res.status });
      return false;
    } catch (err) {
      this.log.error(`Blob sink url configured, but unable to send blobs`, err, {
        blobSinkUrl: this.config.blobSinkUrl,
      });
      return false;
    }
  }

  /**
   * Get the blob sidecar
   *
   * If requesting from the blob sink, we send the blobkHash
   * If requesting from the beacon node, we send the slot number
   *
   * 1. First atttempts to get blobs from a configured blob sink
   * 2. On failure, attempts to get blobs from the list of configured consensus hosts
   * 3. On failure, attempts to get blobs from an archive client (eg blobscan)
   * 4. Else, fails
   *
   * @param blockHash - The block hash
   * @param indices - The indices of the blobs to get
   * @returns The blobs
   */
  public async getBlobSidecar(
    blockHash: `0x${string}`,
    blobHashes: Buffer[],
    indices?: number[],
  ): Promise<BlobWithIndex[]> {
    // Accumulate blobs across sources, preserving order and handling duplicates
    // resultBlobs[i] will contain the blob for blobHashes[i], or undefined if not yet found
    const resultBlobs: (BlobWithIndex | undefined)[] = new Array(blobHashes.length).fill(undefined);

    // Helper to get  missing blob hashes that we still need to fetch
    const getMissingBlobHashes = (): Buffer[] =>
      blobHashes
        .map((bh, i) => (resultBlobs[i] === undefined ? bh : undefined))
        .filter((bh): bh is Buffer => bh !== undefined);

    // Return the result, ignoring any undefined ones
    const getFilledBlobs = (): BlobWithIndex[] => resultBlobs.filter((b): b is BlobWithIndex => b !== undefined);

    // Helper to fill in results from fetched blobs
    const fillResults = (fetchedBlobs: BlobJson[]): BlobWithIndex[] => {
      const blobs = processFetchedBlobs(fetchedBlobs, blobHashes, this.log);
      // Fill in any missing positions with matching blobs
      for (let i = 0; i < blobHashes.length; i++) {
        if (resultBlobs[i] === undefined) {
          resultBlobs[i] = blobs[i];
        }
      }
      return getFilledBlobs();
    };

    const { blobSinkUrl, l1ConsensusHostUrls } = this.config;

    const ctx = { blockHash, blobHashes: blobHashes.map(bufferToHex), indices };

    if (blobSinkUrl) {
      const missingHashes = getMissingBlobHashes();
      if (missingHashes.length > 0) {
        this.log.trace(`Attempting to get ${missingHashes.length} blobs from blob sink`, { blobSinkUrl, ...ctx });
        const blobs = await this.getBlobsFromSink(blobSinkUrl, missingHashes);
        const result = fillResults(blobs);
        this.log.debug(`Got ${blobs.length} blobs from blob sink (total: ${result.length}/${blobHashes.length})`, {
          blobSinkUrl,
          ...ctx,
        });
        if (result.length === blobHashes.length) {
          return result;
        }
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
          const blobs = await this.getBlobsFromHost(l1ConsensusHostUrl, slotNumber, indices, l1ConsensusHostIndex);
          const result = fillResults(blobs);
          this.log.debug(
            `Got ${blobs.length} blobs from consensus host (total: ${result.length}/${blobHashes.length})`,
            { slotNumber, l1ConsensusHostUrl, ...ctx },
          );
          if (result.length === blobHashes.length) {
            return result;
          }
        }
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
          return result;
        }
      }
    }

    const result = getFilledBlobs();
    if (result.length < blobHashes.length) {
      this.log.warn(
        `Failed to fetch all blobs for ${blockHash} from all blob sources (got ${result.length}/${blobHashes.length})`,
        {
          blobSinkUrl,
          l1ConsensusHostUrls,
          archiveUrl: this.archiveClient?.getBaseUrl(),
        },
      );
    }
    return result;
  }

  private async getBlobsFromSink(blobSinkUrl: string, blobHashes: Buffer[]): Promise<BlobJson[]> {
    try {
      const hashStrings = blobHashes.map(bufferToHex).join(',');
      const res = await this.fetch(`${blobSinkUrl}/blobs?blobHashes=${hashStrings}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        return parseBlobJsonsFromResponse(await res.json(), this.log);
      }

      this.log.warn(`Failed to get blobs from blob sink: ${res.statusText} (${res.status})`);
      return [];
    } catch (error: any) {
      this.log.error(`Error getting blobs from blob sink`, error);
      return [];
    }
  }

  public async getBlobSidecarFrom(
    hostUrl: string,
    blockHashOrSlot: string | number,
    blobHashes: Buffer[] = [],
    indices: number[] = [],
    l1ConsensusHostIndex?: number,
  ): Promise<BlobWithIndex[]> {
    const blobs = await this.getBlobsFromHost(hostUrl, blockHashOrSlot, indices, l1ConsensusHostIndex);
    return processFetchedBlobs(blobs, blobHashes, this.log).filter((b): b is BlobWithIndex => b !== undefined);
  }

  public async getBlobsFromHost(
    hostUrl: string,
    blockHashOrSlot: string | number,
    indices: number[] = [],
    l1ConsensusHostIndex?: number,
  ): Promise<BlobJson[]> {
    try {
      let res = await this.fetchBlobSidecars(hostUrl, blockHashOrSlot, indices, l1ConsensusHostIndex);
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
          this.log.debug(`Trying slot ${currentSlot} for blob indices ${indices.join(', ')}`);
          res = await this.fetchBlobSidecars(hostUrl, currentSlot, indices, l1ConsensusHostIndex);
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
    indices: number[],
    l1ConsensusHostIndex?: number,
  ): Promise<Response> {
    let baseUrl = `${hostUrl}/eth/v1/beacon/blob_sidecars/${blockHashOrSlot}`;
    if (indices.length > 0) {
      baseUrl += `?indices=${indices.join(',')}`;
    }

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
      transport: fallback(l1RpcUrls.map(url => http(url))),
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

// Blobs will be in this form when requested from the blob sink, or from the beacon chain via `getBlobSidecars`:
// https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
// Here we attempt to parse the response data to Buffer, and check the lengths (via Blob's constructor), to avoid
// throwing an error down the line when calling BlobWithIndex.fromJson().
function parseBlobJson(data: any): BlobJson {
  const blobBuffer = Buffer.from(data.blob.slice(2), 'hex');
  const commitmentBuffer = Buffer.from(data.kzg_commitment.slice(2), 'hex');
  const blob = new Blob(blobBuffer, commitmentBuffer);
  return blob.toJson(parseInt(data.index));
}

// Returns an array that maps each blob hash to the corresponding blob with index, or undefined if the blob is not found
// or the data does not match the commitment.
function processFetchedBlobs(blobs: BlobJson[], blobHashes: Buffer[], logger: Logger): (BlobWithIndex | undefined)[] {
  const requestedBlobHashes = new Set<string>(blobHashes.map(bufferToHex));
  const hashToBlob = new Map<string, BlobWithIndex>();
  for (const blob of blobs) {
    const hashHex = bufferToHex(computeEthVersionedBlobHash(hexToBuffer(blob.kzg_commitment)));
    if (!requestedBlobHashes.has(hashHex) || hashToBlob.has(hashHex)) {
      continue;
    }

    try {
      const blobWithIndex = BlobWithIndex.fromJson(blob);
      hashToBlob.set(hashHex, blobWithIndex);
    } catch (err) {
      // If the above throws, it's likely that the blob commitment does not match the hash of the blob data.
      logger.error(`Error converting blob from json`, err);
    }
  }
  return blobHashes.map(h => hashToBlob.get(bufferToHex(h)));
}

function getBeaconNodeFetchOptions(url: string, config: BlobSinkConfig, l1ConsensusHostIndex?: number) {
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
