import { MerkleTreeId } from '@aztec/stdlib/trees';

type BlockSyncMetrics = {
  numTxs: number;
  numLeaves: number;
  value: number;
};

export enum InsertionType {
  BATCH,
  SEQUENTIAL,
}

type InsertionMetrics = {
  treeType: MerkleTreeId;
  insertionType: InsertionType;
  numLeaves: number;
  value: number;
};

export enum DataRetrievalType {
  SIBLING_PATH,
  LEAF_PREIMAGE,
  LEAF_VALUE,
  LEAF_INDICES,
  LOW_LEAF,
}

type DataRetrievalMetrics = {
  retrievalType: DataRetrievalType;
  value: number;
};

export class NativeBenchMetics {
  private blockSyncMetrics: BlockSyncMetrics[] = [];
  private insertionMetrics: InsertionMetrics[] = [];
  private dataRetrievalMetrics: DataRetrievalMetrics[] = [];

  public toPrettyString() {
    let pretty = '';
    pretty += `Block sync metrics:\n`;
    for (const metric of this.blockSyncMetrics) {
      pretty += `  ${metric.numTxs} txs, ${metric.numLeaves} leaves: ${metric.value} ms\n`;
    }
    pretty += `Insertion metrics:\n`;
    for (const metric of this.insertionMetrics) {
      pretty += `  ${MerkleTreeId[metric.treeType]}: ${InsertionType[metric.insertionType]} (${metric.numLeaves} leaves): ${metric.value} ms\n`;
    }
    pretty += `Data retrieval metrics:\n`;
    for (const metric of this.dataRetrievalMetrics) {
      pretty += `  ${DataRetrievalType[metric.retrievalType]}: ${metric.value} us\n`;
    }
    return pretty;
  }

  public addBlockSyncMetric(numTxs: number, numLeaves: number, value: number) {
    this.blockSyncMetrics.push({ numTxs, numLeaves, value });
  }
  public addInsertionMetric(treeId: MerkleTreeId, insertionType: InsertionType, numLeaves: number, value: number) {
    this.insertionMetrics.push({ treeType: treeId, insertionType, numLeaves, value });
  }
  public addDataRetrievalMetric(retrievalType: DataRetrievalType, value: number) {
    this.dataRetrievalMetrics.push({ retrievalType, value: value });
  }

  public toGithubActionBenchmarkJSON(indent = 2) {
    const data = [];
    for (const blockSync of this.blockSyncMetrics) {
      data.push({
        name: `Block Sync/${blockSync.numTxs} txs/${blockSync.numLeaves} leaves per tx`,
        value: blockSync.value,
        unit: 'ms',
      });
    }
    for (const insertion of this.insertionMetrics) {
      data.push({
        name: `Tree Insertion/${MerkleTreeId[insertion.treeType]}/${InsertionType[insertion.insertionType]}/${insertion.numLeaves} leaves`,
        value: insertion.value,
        unit: 'ms',
      });
    }
    for (const retrieval of this.dataRetrievalMetrics) {
      data.push({
        name: `Data Retrieval/${DataRetrievalType[retrieval.retrievalType]}`,
        value: retrieval.value,
        unit: 'us',
      });
    }
    return JSON.stringify(data, null, indent);
  }
}
