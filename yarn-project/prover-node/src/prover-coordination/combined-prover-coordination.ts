import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import type { P2P } from '@aztec/p2p';
import type { ProverCoordination } from '@aztec/stdlib/interfaces/server';
import type { P2PClientType } from '@aztec/stdlib/p2p';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

export type CombinedCoordinationOptions = {
  // These options apply to http tx gathering only
  txGatheringBatchSize: number;
  txGatheringMaxParallelRequests: number;
  txGatheringTimeoutMs: number;
  txGatheringIntervalMs: number;
};

interface CoordinationPool {
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
  getUnavailableTxsFromPool(txHashes: TxHash[]): Promise<TxHash[]>;
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
  addTxs(txs: Tx[]): Promise<void>;
}

export interface TxSource {
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
}

class P2PCoordinationPool<T extends P2PClientType = P2PClientType.Full> implements CoordinationPool {
  constructor(private readonly p2p: P2P<T>) {}
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.p2p.getTxsByHash(txHashes);
  }
  getUnavailableTxsFromPool(txHashes: TxHash[]): Promise<TxHash[]> {
    return this.p2p.getUnavailableTxsFromPool(txHashes);
  }
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.p2p.getTxsByHashFromPool(txHashes);
  }
  addTxs(txs: Tx[]): Promise<void> {
    return this.p2p.addTxs(txs);
  }
}

class InMemoryCoordinationPool implements CoordinationPool {
  private txs: Map<string, Tx> = new Map();
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return Promise.resolve(txHashes.map(hash => this.txs.get(hash.toString())));
  }
  getUnavailableTxsFromPool(txHashes: TxHash[]): Promise<TxHash[]> {
    return Promise.resolve(txHashes.filter(hash => !this.txs.has(hash.toString())));
  }
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.getTxsByHash(txHashes);
  }
  addTxs(txs: Tx[]): Promise<void> {
    txs.forEach(tx => this.txs.set(tx.getTxHash().toString(), tx));
    return Promise.resolve();
  }
}

export class CombinedProverCoordination<T extends P2PClientType = P2PClientType.Full> implements ProverCoordination {
  constructor(
    public readonly p2p: P2P<T> | undefined,
    public readonly aztecNodes: TxSource[],
    private readonly options: CombinedCoordinationOptions = {
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequests: 10,
      txGatheringTimeoutMs: 10000,
      txGatheringIntervalMs: 1000,
    },
    private readonly log = createLogger('aztec:prover-node:combined-prover-coordination'),
  ) {}

  public async getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    const pool = this.p2p ? new P2PCoordinationPool(this.p2p) : new InMemoryCoordinationPool();
    await this.#gatherTxs(txHashes, pool);
    const notFound = await pool.getUnavailableTxsFromPool(txHashes);
    if (notFound.length > 0) {
      throw new Error(`Could not find txs: ${notFound.map(tx => tx.toString())}`);
    }
    const txs = await pool.getTxsByHashFromPool(txHashes);
    return txs.filter(tx => tx !== undefined) as Tx[];
  }

  public async gatherTxs(txHashes: TxHash[]): Promise<void> {
    const pool = this.p2p ? new P2PCoordinationPool(this.p2p) : new InMemoryCoordinationPool();
    await this.#gatherTxs(txHashes, pool);
  }

  async #gatherTxs(txHashes: TxHash[], pool: CoordinationPool): Promise<void> {
    const notFound = await pool.getUnavailableTxsFromPool(txHashes);
    const txsToFind = new Set(notFound.map(tx => tx.toString()));
    await this.#gatherTxsFromAllNodes(txsToFind, pool);
    if (txsToFind.size === 0) {
      return;
    }
    await pool.getTxsByHash([...txsToFind].map(tx => TxHash.fromString(tx)));
  }

  async #gatherTxsFromAllNodes(txsToFind: Set<string>, pool: CoordinationPool) {
    if (txsToFind.size === 0) {
      return;
    }
    if (this.aztecNodes.length === 0) {
      this.log.warn('No Aztec nodes available for tx gathering');
      return;
    }
    // Split the txs into sets (one per node) and then shuffle the sets
    // We do this to ensure that we ask all nodes for txs before giving up
    const allTxs: string[] = [...txsToFind];
    const txsPerNode = Math.ceil(allTxs.length / this.aztecNodes.length);
    const txSets: Set<string>[] = [];
    for (let i = 0; i < this.aztecNodes.length; i++) {
      const batch = allTxs.splice(0, txsPerNode);
      txSets.push(new Set(batch));
    }

    // There should not be any txs left, but if there are, we add them to the last set
    allTxs.forEach(tx => txSets[txSets.length - 1].add(tx));

    for (let i = 0; i < txSets.length; i++) {
      const nodePromises = [];
      for (let j = 0; j < this.aztecNodes.length; j++) {
        // The node is always given the same set location, we then shuffle the sets to ensure that
        // we ask all nodes for txs before giving up
        nodePromises.push(this.#gatherTxsFromNode(txSets[j], this.aztecNodes[j], pool));
      }
      await Promise.all(nodePromises);
      // now shuffle the sets
      const first = txSets.shift();
      txSets.push(first!);
    }
  }

  async #gatherTxsFromNode(txsToFind: Set<string>, aztecNode: TxSource, pool: CoordinationPool) {
    const totalTxsRequired = txsToFind.size;

    // It's possible that the set is empty as we already found the txs
    if (totalTxsRequired === 0) {
      return;
    }
    let totalTxsGathered = 0;
    this.log.info(`Gathering a total of ${totalTxsRequired} txs from aztec node`);

    const batches: string[][] = [];
    const allTxs: string[] = [...txsToFind];
    while (allTxs.length) {
      const batch = allTxs.splice(0, this.options.txGatheringBatchSize);
      batches.push(batch);
    }

    await asyncPool(this.options.txGatheringMaxParallelRequests, batches, async batch => {
      try {
        const txs = (await aztecNode.getTxsByHash(batch.map(b => TxHash.fromString(b)))).filter(
          tx => tx !== undefined,
        ) as Tx[];
        const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
        await pool.addTxs(txs);
        hashes.forEach(hash => txsToFind.delete(hash.toString()));
        totalTxsGathered += txs.length;
      } catch (err) {
        this.log.error(`Error gathering txs from aztec node: ${err}`);
        return;
      }
    });
    this.log.info(`Gathered ${totalTxsGathered} of ${totalTxsRequired} txs`);
  }
}
