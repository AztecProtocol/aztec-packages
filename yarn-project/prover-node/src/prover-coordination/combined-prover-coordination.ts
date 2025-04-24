import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import type { P2P } from '@aztec/p2p';
import type { P2PClient, ProverCoordination } from '@aztec/stdlib/interfaces/server';
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
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]>;
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
  addTxs(txs: Tx[]): Promise<void>;
}

export interface TxSource {
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;
}

// Wraps the p2p client into a coordination pool
class P2PCoordinationPool implements CoordinationPool {
  constructor(private readonly p2p: P2P) {}
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.p2p.getTxsByHash(txHashes);
  }
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]> {
    return this.p2p.hasTxsInPool(txHashes);
  }
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.p2p.getTxsByHashFromPool(txHashes);
  }
  addTxs(txs: Tx[]): Promise<void> {
    return this.p2p.addTxs(txs);
  }
}

// Wraps an in memory tx pool into a coordination pool. Used for testing when no p2p/tx pool is available.
class InMemoryCoordinationPool implements CoordinationPool {
  private txs: Map<string, Tx> = new Map();
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return Promise.resolve(txHashes.map(hash => this.txs.get(hash.toString())));
  }
  hasTxsInPool(txHashes: TxHash[]): Promise<boolean[]> {
    return Promise.resolve(txHashes.map(hash => this.txs.has(hash.toString())));
  }
  getTxsByHashFromPool(txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    return this.getTxsByHash(txHashes);
  }
  async addTxs(txs: Tx[]): Promise<void> {
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    txs.forEach((tx, index) => this.txs.set(hashes[index].toString(), tx));
  }
}

// Class to implement combined transaction retrieval from p2p and any available nodes
export class CombinedProverCoordination implements ProverCoordination {
  constructor(
    public readonly p2p: P2P | undefined,
    public readonly aztecNodes: TxSource[],
    private readonly options: CombinedCoordinationOptions = {
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequests: 10,
      txGatheringTimeoutMs: 10000,
      txGatheringIntervalMs: 1000,
    },
    private readonly log = createLogger('prover-node:combined-prover-coordination'),
  ) {}

  public getP2PClient(): P2PClient | undefined {
    return this.p2p;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    const pool = this.p2p ? new P2PCoordinationPool(this.p2p) : new InMemoryCoordinationPool();
    await this.#gatherTxs(txHashes, pool);
    const availability = await pool.hasTxsInPool(txHashes);
    const notFound = txHashes.filter((_, index) => !availability[index]);
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
    const availability = await pool.hasTxsInPool(txHashes);
    const notFound = txHashes.filter((_, index) => !availability[index]);
    const txsToFind = new Set(notFound.map(tx => tx.toString()));
    if (txsToFind.size === 0) {
      return;
    }
    this.log.info(`Gathering ${txsToFind.size} txs from any available nodes`);
    await this.#gatherTxsFromAllNodes(txsToFind, pool);
    if (txsToFind.size === 0) {
      return;
    }
    this.log.info(`Gathering ${txsToFind.size} txs from p2p network`);
    await pool.getTxsByHash([...txsToFind].map(tx => TxHash.fromString(tx)));
  }

  async #gatherTxsFromAllNodes(txsToFind: Set<string>, pool: CoordinationPool) {
    if (txsToFind.size === 0 || this.aztecNodes.length === 0) {
      return;
    }
    await Promise.all(this.aztecNodes.map(aztecNode => this.#gatherTxsFromNode(txsToFind, aztecNode, pool)));
  }

  async #gatherTxsFromNode(txsToFind: Set<string>, aztecNode: TxSource, pool: CoordinationPool) {
    const totalTxsRequired = txsToFind.size;

    // It's possible that the set is empty as we already found the txs
    if (totalTxsRequired === 0) {
      return;
    }
    let totalTxsGathered = 0;

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
    this.log.info(`Gathered ${totalTxsGathered} of ${totalTxsRequired} txs from a node`);
  }
}
