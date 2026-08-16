import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { Tx, TxHash, TxValidator } from '@aztec/stdlib/tx';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

export type TxSourceCollectionResult = { validTxs: Tx[]; invalidTxHashes: string[] };

export interface TxSource {
  getInfo(): string;
  getTxsByHash(txHashes: TxHash[]): Promise<TxSourceCollectionResult>;
}

export class NodeRpcTxSource implements TxSource {
  constructor(
    private readonly client: Pick<AztecNode, 'getTxsByHash'>,
    private readonly txValidator: TxValidator,
    private readonly info: string,
  ) {}

  public static fromUrl(nodeUrl: string, txValidator: TxValidator, versions: ComponentsVersions): NodeRpcTxSource {
    const client = createAztecNodeClient(nodeUrl, {
      versions,
      fetch: makeTracedFetch([1, 2, 3], false),
    });
    return new NodeRpcTxSource(client, txValidator, nodeUrl);
  }

  public getInfo() {
    return this.info;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<TxSourceCollectionResult> {
    // Collected txs feed block validation and proving, so we need their proofs.
    return this.verifyTxs(await this.client.getTxsByHash(txHashes, { includeProof: true }));
  }

  private async verifyTxs(txs: Tx[]): Promise<TxSourceCollectionResult> {
    // Validate tx hashes for all collected txs from external sources
    const validTxs: Tx[] = [];
    const invalidTxHashes: string[] = [];
    await Promise.all(
      txs.map(async tx => {
        const validation = await this.txValidator.validateTx(tx);
        if (validation.result === 'valid') {
          validTxs.push(tx);
        } else {
          invalidTxHashes.push(tx.getTxHash().toString());
        }
      }),
    );
    return { validTxs: validTxs, invalidTxHashes: invalidTxHashes };
  }
}

export function createNodeRpcTxSources(urls: string[], txValidator: TxValidator, chainConfig: ChainConfig) {
  const versions = getComponentsVersionsFromConfig(chainConfig, protocolContractsHash, getVKTreeRoot());
  return urls.map(url => NodeRpcTxSource.fromUrl(url, txValidator, versions));
}
