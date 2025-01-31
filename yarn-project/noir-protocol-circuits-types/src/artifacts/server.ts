import { type NoirCompiledCircuit } from '@aztec/types/noir';

import BaseParityJson from '../../artifacts/parity_base.json' assert { type: 'json' };
import RootParityJson from '../../artifacts/parity_root.json' assert { type: 'json' };
import PrivateBaseRollupJson from '../../artifacts/rollup_base_private.json' assert { type: 'json' };
import PrivateBaseRollupSimulatedJson from '../../artifacts/rollup_base_private_simulated.json' assert { type: 'json' };
import PublicBaseRollupJson from '../../artifacts/rollup_base_public.json' assert { type: 'json' };
import PublicBaseRollupSimulatedJson from '../../artifacts/rollup_base_public_simulated.json' assert { type: 'json' };
import BlockMergeRollupJson from '../../artifacts/rollup_block_merge.json' assert { type: 'json' };
import BlockRootRollupJson from '../../artifacts/rollup_block_root.json' assert { type: 'json' };
import EmptyBlockRootRollupJson from '../../artifacts/rollup_block_root_empty.json' assert { type: 'json' };
import BlockRootRollupSimulatedJson from '../../artifacts/rollup_block_root_simulated.json' assert { type: 'json' };
import SingleTxBlockRootRollupJson from '../../artifacts/rollup_block_root_single_tx.json' assert { type: 'json' };
import SingleTxBlockRootRollupSimulatedJson from '../../artifacts/rollup_block_root_single_tx_simulated.json' assert { type: 'json' };
import MergeRollupJson from '../../artifacts/rollup_merge.json' assert { type: 'json' };
import RootRollupJson from '../../artifacts/rollup_root.json' assert { type: 'json' };
import { type ServerProtocolArtifact } from './types.js';

export const ServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  PrivateBaseRollupArtifact: PrivateBaseRollupJson as NoirCompiledCircuit,
  PublicBaseRollupArtifact: PublicBaseRollupJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupJson as NoirCompiledCircuit,
  SingleTxBlockRootRollupArtifact: SingleTxBlockRootRollupJson as NoirCompiledCircuit,
  EmptyBlockRootRollupArtifact: EmptyBlockRootRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const SimulatedServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  PrivateBaseRollupArtifact: PrivateBaseRollupSimulatedJson as NoirCompiledCircuit,
  PublicBaseRollupArtifact: PublicBaseRollupSimulatedJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupSimulatedJson as NoirCompiledCircuit,
  SingleTxBlockRootRollupArtifact: SingleTxBlockRootRollupSimulatedJson as NoirCompiledCircuit,
  EmptyBlockRootRollupArtifact: EmptyBlockRootRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};
