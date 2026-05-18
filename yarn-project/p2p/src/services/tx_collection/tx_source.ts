import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

import type { ISharedTxValidationCache } from './shared_tx_validation_cache.js';

export type TxSourceCollectionResult = { validTxs: Tx[]; invalidTxHashes: string[] };

export interface TxSource {
  getInfo(): string;
  getTxsByHash(txHashes: TxHash[]): Promise<TxSourceCollectionResult>;
}

export class NodeRpcTxSource implements TxSource {
  constructor(
    private readonly client: Pick<AztecNode, 'getTxsByHash'>,
    private readonly validationCache: ISharedTxValidationCache,
    private readonly info: string,
  ) {}

  public static fromUrl(
    nodeUrl: string,
    validationCache: ISharedTxValidationCache,
    versions: ComponentsVersions,
  ): NodeRpcTxSource {
    const client = createAztecNodeClient(nodeUrl, versions, makeTracedFetch([1, 2, 3], false));
    return new NodeRpcTxSource(client, validationCache, nodeUrl);
  }

  public getInfo() {
    return this.info;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<TxSourceCollectionResult> {
    return this.verifyTxs(await this.client.getTxsByHash(txHashes));
  }

  private async verifyTxs(txs: Tx[]): Promise<TxSourceCollectionResult> {
    const outcomes = await this.validationCache.submitBatch(txs);
    const validTxs: Tx[] = [];
    const invalidTxHashes: string[] = [];
    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];
      const tx = txs[i];
      if (outcome.status === 'invalid') {
        invalidTxHashes.push(tx.getTxHash().toString());
      } else {
        validTxs.push(tx);
      }
    }
    return { validTxs, invalidTxHashes };
  }
}

export function createNodeRpcTxSources(
  urls: string[],
  validationCache: ISharedTxValidationCache,
  chainConfig: ChainConfig,
) {
  const versions = getComponentsVersionsFromConfig(chainConfig, protocolContractsHash, getVKTreeRoot());
  return urls.map(url => NodeRpcTxSource.fromUrl(url, validationCache, versions));
}
