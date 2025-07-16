import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import BaseParityJson from '../../artifacts/parity_base.json' with { type: 'json' };
import RootParityJson from '../../artifacts/parity_root.json' with { type: 'json' };
import PrivateBaseRollupJson from '../../artifacts/rollup_base_private.json' with { type: 'json' };
import PrivateBaseRollupSimulatedJson from '../../artifacts/rollup_base_private_simulated.json' with { type: 'json' };
import PublicBaseRollupJson from '../../artifacts/rollup_base_public.json' with { type: 'json' };
import PublicBaseRollupSimulatedJson from '../../artifacts/rollup_base_public_simulated.json' with { type: 'json' };
import BlockMergeRollupJson from '../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollupJson from '../../artifacts/rollup_block_root.json' with { type: 'json' };
import EmptyBlockRootRollupJson from '../../artifacts/rollup_block_root_empty.json' with { type: 'json' };
import PaddingBlockRootRollupJson from '../../artifacts/rollup_block_root_padding.json' with { type: 'json' };
import BlockRootRollupSimulatedJson from '../../artifacts/rollup_block_root_simulated.json' with { type: 'json' };
import SingleTxBlockRootRollupJson from '../../artifacts/rollup_block_root_single_tx.json' with { type: 'json' };
import SingleTxBlockRootRollupSimulatedJson from '../../artifacts/rollup_block_root_single_tx_simulated.json' with { type: 'json' };
import MergeRollupJson from '../../artifacts/rollup_merge.json' with { type: 'json' };
import RootRollupJson from '../../artifacts/rollup_root.json' with { type: 'json' };
import type { ServerProtocolArtifact } from './types.js';

export const ServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  PrivateBaseRollupArtifact: PrivateBaseRollupJson as NoirCompiledCircuit,
  PublicBaseRollupArtifact: PublicBaseRollupJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupJson as NoirCompiledCircuit,
  SingleTxBlockRootRollupArtifact: SingleTxBlockRootRollupJson as NoirCompiledCircuit,
  EmptyBlockRootRollupArtifact: EmptyBlockRootRollupJson as NoirCompiledCircuit,
  PaddingBlockRootRollupArtifact: PaddingBlockRootRollupJson as NoirCompiledCircuit,
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
  PaddingBlockRootRollupArtifact: PaddingBlockRootRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export function getServerCircuitArtifact(name: ServerProtocolArtifact): NoirCompiledCircuitWithName {
  return {
    ...ServerCircuitArtifacts[name],
    name,
  };
}

export function getSimulatedServerCircuitArtifact(name: ServerProtocolArtifact): NoirCompiledCircuitWithName {
  return {
    ...SimulatedServerCircuitArtifacts[name],
    name,
  };
}
