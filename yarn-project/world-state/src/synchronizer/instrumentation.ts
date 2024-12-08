import { MerkleTreeId } from '@aztec/circuit-types';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type Gauge, type Meter, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

import { type DBStats, type TreeDBStats, type TreeMeta, type WorldStateStatusFull } from '../native/message.js';

type TreeTypeString = 'nullifier' | 'note_hash' | 'archive' | 'message' | 'public_data';
type DBTypeString = 'leaf_preimage' | 'leaf_indices' | 'nodes' | 'blocks' | 'block_indices';

class TreeDBInstrumentation {
  private dbNumItems: Gauge;
  private dbUsedSize: Gauge;

  constructor(meter: Meter, treeName: TreeTypeString, dbName: DBTypeString) {
    this.dbUsedSize = meter.createGauge(`aztec.world_state.db_used_size.${dbName}.${treeName}`, {
      description: `The current used database size for the ${treeName} tree ${dbName} database`,
      valueType: ValueType.INT,
    });

    this.dbNumItems = meter.createGauge(`aztec.world_state.db_num_items.${dbName}.${treeName}`, {
      description: `The current number of items in the ${treeName} tree ${dbName} database`,
      valueType: ValueType.INT,
    });
  }

  public updateMetrics(treeDbStats: DBStats) {
    this.dbNumItems.record(Number(treeDbStats.numDataItems));
    this.dbUsedSize.record(Number(treeDbStats.totalUsedSize));
  }
}

class TreeInstrumentation {
  private treeDbInstrumentation: Map<DBTypeString, TreeDBInstrumentation> = new Map<
    DBTypeString,
    TreeDBInstrumentation
  >();
  private dbMapSize: Gauge;
  private treeSize: Gauge;
  private unfinalisedHeight: Gauge;
  private finalisedHeight: Gauge;
  private oldestBlock: Gauge;

  constructor(meter: Meter, treeName: TreeTypeString, private log: DebugLogger) {
    this.dbMapSize = meter.createGauge(`aztec.world_state.db_map_size.${treeName}`, {
      description: `The current configured map size for the ${treeName} tree`,
      valueType: ValueType.INT,
    });

    this.treeSize = meter.createGauge(`aztec.world_state.tree_size.${treeName}`, {
      description: `The current number of leaves in the ${treeName} tree`,
      valueType: ValueType.INT,
    });

    this.unfinalisedHeight = meter.createGauge(`aztec.world_state.unfinalised_height.${treeName}`, {
      description: `The unfinalised block height of the ${treeName} tree`,
      valueType: ValueType.INT,
    });

    this.finalisedHeight = meter.createGauge(`aztec.world_state.finalised_height.${treeName}`, {
      description: `The finalised block height of the ${treeName} tree`,
      valueType: ValueType.INT,
    });

    this.oldestBlock = meter.createGauge(`aztec.world_state.oldest_block.${treeName}`, {
      description: `The oldest historical block of the ${treeName} tree`,
      valueType: ValueType.INT,
    });

    this.treeDbInstrumentation.set('blocks', new TreeDBInstrumentation(meter, treeName, 'blocks'));
    this.treeDbInstrumentation.set('nodes', new TreeDBInstrumentation(meter, treeName, 'nodes'));
    this.treeDbInstrumentation.set('leaf_preimage', new TreeDBInstrumentation(meter, treeName, 'leaf_preimage'));
    this.treeDbInstrumentation.set('leaf_indices', new TreeDBInstrumentation(meter, treeName, 'leaf_indices'));
    this.treeDbInstrumentation.set('block_indices', new TreeDBInstrumentation(meter, treeName, 'block_indices'));
  }

  private updateDBMetrics(dbName: DBTypeString, dbStats: DBStats) {
    const inst = this.treeDbInstrumentation.get(dbName);
    if (!inst) {
      this.log.error(`Failed to find instrumentation for ${dbName}`);
      return;
    }
    inst.updateMetrics(dbStats);
  }

  public updateMetrics(treeDbStats: TreeDBStats, treeMeta: TreeMeta) {
    this.dbMapSize.record(Number(treeDbStats.mapSize));
    this.treeSize.record(Number(treeMeta.committedSize));
    this.finalisedHeight.record(Number(treeMeta.finalisedBlockHeight));
    this.unfinalisedHeight.record(Number(treeMeta.unfinalisedBlockHeight));
    this.oldestBlock.record(Number(treeMeta.oldestHistoricBlock));

    this.updateDBMetrics('leaf_indices', treeDbStats.leafIndicesDBStats);
    this.updateDBMetrics('leaf_preimage', treeDbStats.leafPreimagesDBStats);
    this.updateDBMetrics('blocks', treeDbStats.blocksDBStats);
    this.updateDBMetrics('nodes', treeDbStats.nodesDBStats);
    this.updateDBMetrics('block_indices', treeDbStats.blockIndicesDBStats);
  }
}

export class WorldStateInstrumentation {
  private treeInstrumentation: Map<MerkleTreeId, TreeInstrumentation> = new Map<MerkleTreeId, TreeInstrumentation>();

  constructor(telemetry: TelemetryClient, private log = createDebugLogger('aztec:world-state:instrumentation')) {
    const meter = telemetry.getMeter('World State');
    this.treeInstrumentation.set(MerkleTreeId.ARCHIVE, new TreeInstrumentation(meter, 'archive', log));
    this.treeInstrumentation.set(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, new TreeInstrumentation(meter, 'message', log));
    this.treeInstrumentation.set(MerkleTreeId.NOTE_HASH_TREE, new TreeInstrumentation(meter, 'note_hash', log));
    this.treeInstrumentation.set(MerkleTreeId.NULLIFIER_TREE, new TreeInstrumentation(meter, 'nullifier', log));
    this.treeInstrumentation.set(MerkleTreeId.PUBLIC_DATA_TREE, new TreeInstrumentation(meter, 'public_data', log));
  }

  private updateTreeStats(treeDbStats: TreeDBStats, treeMeta: TreeMeta, tree: MerkleTreeId) {
    const instrumentation = this.treeInstrumentation.get(tree);
    if (!instrumentation) {
      this.log.error(`Failed to retrieve instrumentation for tree ${MerkleTreeId[tree]}`);
      return;
    }
    instrumentation.updateMetrics(treeDbStats, treeMeta);
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
}
