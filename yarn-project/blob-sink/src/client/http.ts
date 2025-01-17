import { Blob, type BlobJson } from '@aztec/foundation/blob';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { outboundTransform } from '../encoding/index.js';
import { type BlobSinkConfig, getBlobSinkConfigFromEnv } from './config.js';
import { type BlobSinkClientInterface } from './interface.js';

export class HttpBlobSinkClient implements BlobSinkClientInterface {
  private readonly log: Logger;
  private readonly config: BlobSinkConfig;

  constructor(config?: BlobSinkConfig) {
    this.config = config ?? getBlobSinkConfigFromEnv();
    this.log = createLogger('aztec:blob-sink-client');
  }

  public async sendBlobsToBlobSink(blockHash: string, blobs: Blob[]): Promise<boolean> {
    // TODO(md): for now we are assuming the indexes of the blobs will be 0, 1, 2
    // When in reality they will not, but for testing purposes this is fine
    if (!this.config.blobSinkUrl) {
      this.log.verbose('No blob sink url configured');
      return false;
    }

    this.log.verbose(`Sending ${blobs.length} blobs to blob sink`);
    try {
      const res = await fetch(`${this.config.blobSinkUrl}/blob_sidecar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      this.log.error('Failed to send blobs to blob sink', res.status);
      return false;
    } catch (err) {
      this.log.error(`Error sending blobs to blob sink`, err);
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
   * 2. If no blob sink is configured, attempts to get blobs from a configured consensus host
   *
   * 3. If none configured, fails
   *
   * @param blockHash - The block hash
   * @param indices - The indices of the blobs to get
   * @returns The blobs
   */
  public async getBlobSidecar(blockHash: string, indices?: number[]): Promise<Blob[]> {
    if (this.config.blobSinkUrl) {
      this.log.debug('Getting blob sidecar from blob sink');
      const blobs = await this.getBlobSidecarFrom(this.config.blobSinkUrl, blockHash, indices);
      if (blobs.length > 0) {
        this.log.debug(`Got ${blobs.length} blobs from blob sink`);
        return blobs;
      }
    }

    if (this.config.l1ConsensusHostUrl) {
      // The beacon api can query by slot number, so we get that first
      this.log.debug('Getting slot number from consensus host');
      const slotNumber = await this.getSlotNumber(blockHash);
      if (slotNumber) {
        const blobs = await this.getBlobSidecarFrom(this.config.l1ConsensusHostUrl, slotNumber, indices);
        if (blobs.length > 0) {
          this.log.debug(`Got ${blobs.length} blobs from consensus host`);
          return blobs;
        }
      }
    }

    this.log.verbose('No blob sources configured');
    return [];
  }

  public async getBlobSidecarFrom(
    hostUrl: string,
    blockHashOrSlot: string | number,
    indices?: number[],
  ): Promise<Blob[]> {
    // TODO(md): right now we assume all blobs are ours, this will not yet work on sepolia
    try {
      let url = `${hostUrl}/eth/v1/beacon/blob_sidecars/${blockHashOrSlot}`;
      if (indices && indices.length > 0) {
        url += `?indices=${indices.join(',')}`;
      }

      const res = await fetch(url);

      if (res.ok) {
        const body = await res.json();
        this.log.debug(`Blob sidecar for block ${blockHashOrSlot} is ${body}`);
        const blobs = body.data.map((b: BlobJson) => Blob.fromJson(b));
        return blobs;
      }

      this.log.debug(`Unable to get blob sidecar`, res.status);
      return [];
    } catch (err: any) {
      this.log.error(`Unable to get blob sidecar`, err.message);
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
  private async getSlotNumber(blockHash: string): Promise<number | undefined> {
    if (!this.config.l1ConsensusHostUrl) {
      this.log.debug('No consensus host url configured');
      return undefined;
    }

    if (!this.config.l1RpcUrl) {
      this.log.debug('No execution host url configured');
      return undefined;
    }

    // Ping execution node to get the parentBeaconBlockRoot for this block
    let parentBeaconBlockRoot: string | undefined;
    try {
      const res = await fetch(`${this.config.l1RpcUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByHash',
          params: [blockHash, /*tx flag*/ false],
          id: 1,
        }),
      });

      if (res.ok) {
        const body = await res.json();
        parentBeaconBlockRoot = body.result.parentBeaconBlockRoot;
      }
    } catch (err) {
      this.log.error(`Error getting parent beacon block root`, err);
    }

    if (!parentBeaconBlockRoot) {
      this.log.error(`No parent beacon block root found for block ${blockHash}`);
      return undefined;
    }

    // Query beacon chain to get the slot number for that block root
    try {
      const res = await fetch(`${this.config.l1ConsensusHostUrl}/eth/v1/beacon/headers/${parentBeaconBlockRoot}`);
      if (res.ok) {
        const body = await res.json();

        // Add one to get the slot number of the original block hash
        return Number(body.data.header.message.slot) + 1;
      }
    } catch (err) {
      this.log.error(`Error getting slot number`, err);
    }

    return undefined;
  }
}
