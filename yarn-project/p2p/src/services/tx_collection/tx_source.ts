import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import { type ComponentsVersions, getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

export interface TxSource {
  getInfo(): string;
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
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

  public getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.client.getTxsByHash(txHashes);
  }
}

export function createNodeRpcTxSources(urls: string[], chainConfig: ChainConfig) {
  const versions = getComponentsVersionsFromConfig(chainConfig, protocolContractTreeRoot, getVKTreeRoot());
  return urls.map(url => NodeRpcTxSource.fromUrl(url, versions));
}
