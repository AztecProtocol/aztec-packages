import type { BlobJson } from '@aztec/blob-lib';
import { createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { z } from 'zod';

import { BlobArchiveClientInstrumentation } from './instrumentation.js';
import type { BlobArchiveClient } from './interface.js';

export const BlobscanBlockResponseSchema = z
  .object({
    hash: z.string(),
    slot: z.number().int(),
    number: z.number().int(),
    transactions: z.array(
      z.object({
        hash: z.string(),
        blobs: z.array(
          z.object({
            versionedHash: z.string(),
            data: z.string(),
            commitment: z.string(),
            proof: z.string(),
            size: z.number().int(),
            index: z.number().int().optional(), // This is the index within the tx, not within the block!
          }),
        ),
      }),
    ),
  })
  .transform(data =>
    data.transactions
      .flatMap(tx =>
        tx.blobs.map(blob => ({
          blob: blob.data,
          // eslint-disable-next-line camelcase
          kzg_commitment: blob.commitment,
        })),
      )
      .map((blob, index) => ({ ...blob, index: index.toString() })),
  ) satisfies ZodFor<BlobJson[]>;

// Response from https://api.blobscan.com/blocks?sort=desc&type=canonical
export const BlobscanBlocksResponseSchema = z.object({
  blocks: z.array(
    z.object({
      hash: z.string(),
      slot: z.number().int(),
      number: z.number().int(),
    }),
  ),
});

export class BlobscanArchiveClient implements BlobArchiveClient {
  private readonly logger = createLogger('blob-sink:blobscan-archive-client');
  private readonly fetchOpts = { headers: { accept: 'application/json' } };
  private readonly fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    return await retry(
      () => fetch(...args),
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      `Fetching ${args[0]}`,
      makeBackoff([1, 1, 3]),
      this.logger,
      /*failSilently=*/ false,
    );
  };

  private readonly baseUrl: URL;

  private instrumentation: BlobArchiveClientInstrumentation;

  constructor(baseUrl: string, telemetry: TelemetryClient = getTelemetryClient()) {
    this.baseUrl = new URL(baseUrl);
    if (this.baseUrl.protocol !== 'https:') {
      throw new TypeError('BaseURL must be secure: ' + baseUrl);
    }
    this.instrumentation = new BlobArchiveClientInstrumentation(
      telemetry,
      this.baseUrl.origin,
      'BlobscanArchiveClient',
    );
  }

  public async getLatestBlock(): Promise<{ hash: string; number: number; slot: number }> {
    const url = new URL('blocks', this.baseUrl);
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('type', 'canonical');
    url.searchParams.set('p', '1');
    url.searchParams.set('ps', '1');

    this.logger.trace(`Fetching latest block from ${url.href}`);
    const response = await this.fetch(url, this.fetchOpts);

    if (response.status !== 200) {
      throw new Error(`Failed to fetch latest block: ${response.statusText} (${response.status})`, {
        cause: {
          httpResponse: {
            status: response.status,
            body: await response.text().catch(() => 'Failed to read response body'),
          },
        },
      });
    }

    const parsed = await response.json().then((data: any) => BlobscanBlocksResponseSchema.parse(data));
    if (parsed.blocks.length === 0) {
      throw new Error(`No blocks found at ${this.baseUrl}`);
    }

    return parsed.blocks[0];
  }

  public getBaseUrl(): string {
    return this.baseUrl.href;
  }

  public async getBlobsFromBlock(blockId: string): Promise<BlobJson[] | undefined> {
    const url = new URL(`blocks/${blockId}`, this.baseUrl);
    url.searchParams.set('type', 'canonical');
    url.searchParams.set('expand', 'blob,blob_data');

    this.logger.trace(`Fetching blobs for block ${blockId} from ${url.href}`);
    const response = await this.fetch(url, this.fetchOpts);

    this.instrumentation.incRequest('blocks', response.status);

    if (response.status === 404) {
      this.logger.debug(`No blobs found for block ${blockId} at ${this.baseUrl}`);
      return undefined;
    } else if (response.status !== 200) {
      throw new Error(`Failed to fetch blobs for block ${blockId}: ${response.statusText} (${response.status})`, {
        cause: {
          httpResponse: {
            status: response.status,
            body: await response.text().catch(() => 'Failed to read response body'),
          },
        },
      });
    } else {
      const result = await response.json().then((data: any) => BlobscanBlockResponseSchema.parse(data));
      this.logger.debug(`Fetched ${result.length} blobs for block ${blockId} from ${this.baseUrl}`);
      this.instrumentation.incRetrievedBlobs(result.length);
      return result;
    }
  }

  public async getBlobData(id: string): Promise<Buffer | undefined> {
    const url = new URL(`blobs/${id}/data`, this.baseUrl);

    const response = await this.fetch(url, this.fetchOpts);
    this.instrumentation.incRequest('blobs', response.status);
    if (response.status === 404) {
      return undefined;
    } else if (response.status !== 200) {
      throw new Error(`Failed to fetch blob data for blob ${id}: ${response.statusText} (${response.status})`, {
        cause: {
          httpResponse: {
            status: response.status,
            body: await response.text().catch(err => {
              this.logger.warn('Failed to read response body', err);
              return '';
            }),
          },
        },
      });
    } else {
      return await response.json().then((data: any) => {
        const blob = schemas.BufferHex.parse(data);
        this.instrumentation.incRetrievedBlobs(1);
        return blob;
      });
    }
  }
}
