import { MerkleTreeId } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  ValueType,
} from '@aztec/telemetry-client';

import {
  type DBStats,
  type TreeDBStats,
  type TreeMeta,
  WorldStateMessageType,
  type WorldStateStatusFull,
} from '../native/message.js';

type DBTypeString = 'leaf_preimage' | 'leaf_indices' | 'nodes' | 'blocks' | 'block_indices';

export class WorldStateInstrumentation {
  private dbMapSize: Gauge;
  private treeSize: Gauge;
  private unfinalisedHeight: Gauge;
  private finalisedHeight: Gauge;
  private oldestBlock: Gauge;
  private dbNumItems: Gauge;
  private dbUsedSize: Gauge;
  private requestHistogram: Histogram;

  constructor(public readonly telemetry: TelemetryClient, private log = createLogger('world-state:instrumentation')) {
    const meter = telemetry.getMeter('World State');
    this.dbMapSize = meter.createGauge(Metrics.WORLD_STATE_DB_MAP_SIZE, {
      description: `The current configured map size for each merkle tree`,
      valueType: ValueType.INT,
    });

    this.treeSize = meter.createGauge(Metrics.WORLD_STATE_TREE_SIZE, {
      description: `The current number of leaves in each merkle tree`,
      valueType: ValueType.INT,
    });

    this.unfinalisedHeight = meter.createGauge(Metrics.WORLD_STATE_UNFINALISED_HEIGHT, {
      description: `The unfinalised block height of each merkle tree`,
      valueType: ValueType.INT,
    });

    this.finalisedHeight = meter.createGauge(Metrics.WORLD_STATE_FINALISED_HEIGHT, {
      description: `The finalised block height of each merkle tree`,
      valueType: ValueType.INT,
    });

    this.oldestBlock = meter.createGauge(Metrics.WORLD_STATE_OLDEST_BLOCK, {
      description: `The oldest historical block of each merkle tree`,
      valueType: ValueType.INT,
    });

    this.dbUsedSize = meter.createGauge(Metrics.WORLD_STATE_DB_USED_SIZE, {
      description: `The current used database size for each db of each merkle tree`,
      valueType: ValueType.INT,
    });

    this.dbNumItems = meter.createGauge(Metrics.WORLD_STATE_DB_NUM_ITEMS, {
      description: `The current number of items in each database of each merkle tree`,
      valueType: ValueType.INT,
    });

    this.requestHistogram = meter.createHistogram(Metrics.WORLD_STATE_REQUEST_TIME, {
      description: 'The round trip time of world state requests',
      unit: 'us',
      valueType: ValueType.INT,
    });
  }

  private updateTreeStats(treeDbStats: TreeDBStats, treeMeta: TreeMeta, tree: MerkleTreeId) {
    this.dbMapSize.record(Number(treeDbStats.mapSize), {
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
    this.treeSize.record(Number(treeMeta.size), {
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
    this.unfinalisedHeight.record(Number(treeMeta.unfinalisedBlockHeight), {
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
    this.finalisedHeight.record(Number(treeMeta.finalisedBlockHeight), {
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
    this.oldestBlock.record(Number(treeMeta.oldestHistoricBlock), {
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });

    this.updateTreeDBStats(treeDbStats.blockIndicesDBStats, 'block_indices', tree);
    this.updateTreeDBStats(treeDbStats.blocksDBStats, 'blocks', tree);
    this.updateTreeDBStats(treeDbStats.leafIndicesDBStats, 'leaf_indices', tree);
    this.updateTreeDBStats(treeDbStats.leafPreimagesDBStats, 'leaf_preimage', tree);
    this.updateTreeDBStats(treeDbStats.nodesDBStats, 'nodes', tree);
  }

  private updateTreeDBStats(dbStats: DBStats, dbType: DBTypeString, tree: MerkleTreeId) {
    this.dbNumItems.record(Number(dbStats.numDataItems), {
      [Attributes.WS_DB_DATA_TYPE]: dbType,
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
    this.dbUsedSize.record(Number(dbStats.totalUsedSize), {
      [Attributes.WS_DB_DATA_TYPE]: dbType,
      [Attributes.MERKLE_TREE_NAME]: MerkleTreeId[tree],
    });
  }

  public updateWorldStateMetrics(worldStateStatus: WorldStateStatusFull) {
    this.updateTreeStats(
      worldStateStatus.dbStats.archiveTreeStats,
      worldStateStatus.meta.archiveTreeMeta,
      MerkleTreeId.ARCHIVE,
    );

    this.updateTreeStats(
      worldStateStatus.dbStats.messageTreeStats,
      worldStateStatus.meta.messageTreeMeta,
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
    );

    this.updateTreeStats(
      worldStateStatus.dbStats.noteHashTreeStats,
      worldStateStatus.meta.noteHashTreeMeta,
      MerkleTreeId.NOTE_HASH_TREE,
    );

    this.updateTreeStats(
      worldStateStatus.dbStats.nullifierTreeStats,
      worldStateStatus.meta.nullifierTreeMeta,
      MerkleTreeId.NULLIFIER_TREE,
    );

    this.updateTreeStats(
      worldStateStatus.dbStats.publicDataTreeStats,
      worldStateStatus.meta.publicDataTreeMeta,
      MerkleTreeId.PUBLIC_DATA_TREE,
    );
  }

  public recordRoundTrip(timeMs: number, request: WorldStateMessageType) {
    this.requestHistogram.record(timeMs, {
      [Attributes.WORLD_STATE_REQUEST_TYPE]: WorldStateMessageType[request],
    });
  }
}
