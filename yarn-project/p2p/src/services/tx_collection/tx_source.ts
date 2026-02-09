import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

export interface TxSource {
  getInfo(): string;
  getTxsByHash(txHashes: TxHash[]): Promise<{ validTxs: Tx[]; invalidTxHashes: string[] }>;
}

export class NodeRpcTxSource implements TxSource {
  constructor(
    private readonly client: Pick<AztecNode, 'getTxsByHash'>,
    private readonly info: string,
  ) {}

  public static fromUrl(nodeUrl: string, versions: ComponentsVersions): NodeRpcTxSource {
    const client = createAztecNodeClient(nodeUrl, versions, makeTracedFetch([1, 2, 3], false));
    return new NodeRpcTxSource(client, nodeUrl);
  }

  public getInfo() {
    return this.info;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<{ validTxs: Tx[]; invalidTxHashes: string[] }> {
    return this.verifyTxs(await this.client.getTxsByHash(txHashes));
  }

  private async verifyTxs(txs: Tx[]): Promise<{ validTxs: Tx[]; invalidTxHashes: string[] }> {
    // Validate tx hashes for all collected txs from external sources
    const validTxs: Tx[] = [];
    const invalidTxHashes: string[] = [];
    await Promise.all(
      txs.map(async tx => {
        const isValid = await tx.validateTxHash();
        if (isValid) {
          validTxs.push(tx);
        } else {
          invalidTxHashes.push(tx.getTxHash().toString());
        }
      }),
    );
    return { validTxs: validTxs, invalidTxHashes: invalidTxHashes };
  }
}

export function createNodeRpcTxSources(urls: string[], chainConfig: ChainConfig) {
  const versions = getComponentsVersionsFromConfig(chainConfig, protocolContractsHash, getVKTreeRoot());
  return urls.map(url => NodeRpcTxSource.fromUrl(url, versions));
}
