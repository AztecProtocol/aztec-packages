import { Blob, BlobDeserializationError, type BlobJson } from '@aztec/blob-lib';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';

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
      onBlobDeserializationError?: 'warn' | 'trace';
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
      throw new Error('No blob sources are reachable');
    }
  }

  public async sendBlobsToBlobSink(blockHash: string, blobs: Blob[]): Promise<boolean> {
    // TODO(md): for now we are assuming the indexes of the blobs will be 0, 1, 2
    // When in reality they will not, but for testing purposes this is fine
    // Right now we fetch everything, then filter out the blobs that we don't want
    if (!this.config.blobSinkUrl) {
      this.log.verbose('No blob sink url configured');
      return false;
    }

    this.log.verbose(`Sending ${blobs.length} blobs to blob sink`);
    try {
      const res = await this.fetch(`${this.config.blobSinkUrl}/blob_sidecar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // eslint-disable-next-line camelcase
          block_id: blockHash,
          // Snappy compress the blob buffer
          blobs: blobs.map((b, i) => ({ blob: outboundTransform(b.toBuffer()), index: i })),
        }),
      });

      if (res.ok) {
        return true;
      }

      this.log.error('Failed to send blobs to blob sink', { status: res.status });
      return false;
    } catch {
      this.log.warn(`Blob sink url configured, but unable to send blobs`, {
        blobSinkUrl: this.config.blobSinkUrl,
        blockHash,
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
    blobHashes: Buffer[] = [],
    indices?: number[],
  ): Promise<BlobWithIndex[]> {
    let blobs: BlobWithIndex[] = [];

    const { blobSinkUrl, l1ConsensusHostUrls } = this.config;
    const ctx = { blockHash, blobHashes: blobHashes.map(bufferToHex), indices };

    if (blobSinkUrl) {
      this.log.trace(`Attempting to get blobs from blob sink`, { blobSinkUrl, ...ctx });
      blobs = await this.getBlobSidecarFrom(blobSinkUrl, blockHash, blobHashes, indices);
      this.log.debug(`Got ${blobs.length} blobs from blob sink`, { blobSinkUrl, ...ctx });
      if (blobs.length > 0) {
        return blobs;
      }
    }

    if (blobs.length == 0 && l1ConsensusHostUrls && l1ConsensusHostUrls.length > 0) {
      // The beacon api can query by slot number, so we get that first
      const consensusCtx = { l1ConsensusHostUrls, ...ctx };
      this.log.trace(`Attempting to get slot number for block hash`, consensusCtx);
      const slotNumber = await this.getSlotNumber(blockHash);
      this.log.debug(`Got slot number ${slotNumber} from consensus host for querying blobs`, consensusCtx);

      if (slotNumber) {
        let l1ConsensusHostUrl: string;
        for (let l1ConsensusHostIndex = 0; l1ConsensusHostIndex < l1ConsensusHostUrls.length; l1ConsensusHostIndex++) {
          l1ConsensusHostUrl = l1ConsensusHostUrls[l1ConsensusHostIndex];
          this.log.trace(`Attempting to get blobs from consensus host`, { slotNumber, l1ConsensusHostUrl, ...ctx });
          const blobs = await this.getBlobSidecarFrom(
            l1ConsensusHostUrl,
            slotNumber,
            blobHashes,
            indices,
            undefined,
            l1ConsensusHostIndex,
          );
          this.log.debug(`Got ${blobs.length} blobs from consensus host`, { slotNumber, l1ConsensusHostUrl, ...ctx });
          if (blobs.length > 0) {
            return blobs;
          }
        }
      }
    }

    if (blobs.length == 0 && this.archiveClient) {
      const archiveCtx = { archiveUrl: this.archiveClient.getBaseUrl(), ...ctx };
      this.log.trace(`Attempting to get blobs from archive`, archiveCtx);
      const allBlobs = await this.archiveClient.getBlobsFromBlock(blockHash);
      if (!allBlobs) {
        this.log.debug('No blobs found from archive client', archiveCtx);
        return [];
      }
      this.log.trace(`Got ${allBlobs.length} blobs from archive client before filtering`, archiveCtx);
      blobs = await getRelevantBlobs(allBlobs, blobHashes, this.log, this.opts.onBlobDeserializationError);
      this.log.debug(`Got ${blobs.length} blobs from archive client`, archiveCtx);
      if (blobs.length > 0) {
        return blobs;
      }
    }

    this.log.warn(`Failed to fetch blobs for ${blockHash} from all blob sources`, {
      blobSinkUrl,
      l1ConsensusHostUrls,
      archiveUrl: this.archiveClient?.getBaseUrl(),
    });
    return [];
  }

  public async getBlobSidecarFrom(
    hostUrl: string,
    blockHashOrSlot: string | number,
    blobHashes: Buffer[] = [],
    indices: number[] = [],
    maxRetries = 10,
    l1ConsensusHostIndex?: number,
  ): Promise<BlobWithIndex[]> {
    try {
      let baseUrl = `${hostUrl}/eth/v1/beacon/blob_sidecars/${blockHashOrSlot}`;
      if (indices.length > 0) {
        baseUrl += `?indices=${indices.join(',')}`;
      }

      const { url, ...options } = getBeaconNodeFetchOptions(baseUrl, this.config, l1ConsensusHostIndex);

      this.log.debug(`Fetching blob sidecar for ${blockHashOrSlot}`, { url, ...options });
      const res = await this.fetch(url, options);

      if (res.ok) {
        const body = await res.json();
        const blobs = await getRelevantBlobs(body.data, blobHashes, this.log, this.opts.onBlobDeserializationError);
        return blobs;
      } else if (res.status === 404) {
        // L1 slot may have been missed, try next few
        if (typeof blockHashOrSlot === 'number' && maxRetries > 0) {
          const nextSlot = Number(blockHashOrSlot) + 1;
          this.log.debug(`L1 slot ${blockHashOrSlot} not found, trying next slot ${nextSlot}`);
          return this.getBlobSidecarFrom(hostUrl, nextSlot, blobHashes, indices, maxRetries - 1, l1ConsensusHostIndex);
        }
      }

      // we already handle the two _expected_ cases above & return early
      // warn if we can't communicate with the remote blob provider
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

async function getRelevantBlobs(
  data: BlobJson[],
  blobHashes: Buffer[],
  logger: Logger,
  onBlobDeserializationError: 'warn' | 'trace' = 'warn',
): Promise<BlobWithIndex[]> {
  const blobsPromise = data
    // Filter out blobs not requested
    .filter((b: BlobJson) => {
      if (blobHashes.length === 0) {
        return true;
      }
      const commitment = Buffer.from(b.kzg_commitment.slice(2), 'hex');
      const blobHash = Blob.getEthVersionedBlobHash(commitment);
      logger.trace(`Filtering blob with hash ${blobHash.toString('hex')}`);
      return blobHashes.some(hash => hash.equals(blobHash));
    })
    // Attempt to deserialise the blob
    // If we cannot decode it, then it is malicious and we should not use it
    .map(async (b: BlobJson): Promise<BlobWithIndex | undefined> => {
      try {
        const blob = await Blob.fromJson(b);
        return new BlobWithIndex(blob, parseInt(b.index));
      } catch (err) {
        if (err instanceof BlobDeserializationError) {
          logger[onBlobDeserializationError](`Failed to deserialise blob`, { commitment: b.kzg_commitment });
          return undefined;
        }
        throw err;
      }
    });

  // Second map is async, so we need to await it, and filter out blobs that did not deserialise
  const maybeBlobs = await Promise.all(blobsPromise);
  return maybeBlobs.filter((b: BlobWithIndex | undefined): b is BlobWithIndex => b !== undefined);
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
  if (l1ConsensusHostApiKey && !l1ConsensusHostApiKeyHeader) {
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
