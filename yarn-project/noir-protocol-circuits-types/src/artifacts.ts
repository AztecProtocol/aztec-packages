import { type NoirCompiledCircuit } from '@aztec/types/noir';

import EmptyNestedJson from '../artifacts/empty_nested.json' assert { type: 'json' };
import EmptyNestedSimulatedJson from '../artifacts/empty_nested_simulated.json' assert { type: 'json' };
import BaseParityJson from '../artifacts/parity_base.json' assert { type: 'json' };
import RootParityJson from '../artifacts/parity_root.json' assert { type: 'json' };
import PrivateKernelEmptyJson from '../artifacts/private_kernel_empty.json' assert { type: 'json' };
import PrivateKernelEmptySimulatedJson from '../artifacts/private_kernel_empty_simulated.json' assert { type: 'json' };
import PrivateKernelInitJson from '../artifacts/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInitSimulatedJson from '../artifacts/private_kernel_init_simulated.json' assert { type: 'json' };
import PrivateKernelInnerJson from '../artifacts/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelInnerSimulatedJson from '../artifacts/private_kernel_inner_simulated.json' assert { type: 'json' };
import PrivateKernelTailJson from '../artifacts/private_kernel_tail.json' assert { type: 'json' };
import PrivateKernelTailSimulatedJson from '../artifacts/private_kernel_tail_simulated.json' assert { type: 'json' };
import PrivateKernelTailToPublicJson from '../artifacts/private_kernel_tail_to_public.json' assert { type: 'json' };
import PrivateKernelTailToPublicSimulatedJson from '../artifacts/private_kernel_tail_to_public_simulated.json' assert { type: 'json' };
import PublicKernelInnerJson from '../artifacts/public_kernel_inner.json' assert { type: 'json' };
import PublicKernelInnerSimulatedJson from '../artifacts/public_kernel_inner_simulated.json' assert { type: 'json' };
import PublicKernelMergeJson from '../artifacts/public_kernel_merge.json' assert { type: 'json' };
import PublicKernelMergeSimulatedJson from '../artifacts/public_kernel_merge_simulated.json' assert { type: 'json' };
import PublicKernelTailJson from '../artifacts/public_kernel_tail.json' assert { type: 'json' };
import PublicKernelTailSimulatedJson from '../artifacts/public_kernel_tail_simulated.json' assert { type: 'json' };
import BaseRollupJson from '../artifacts/rollup_base.json' assert { type: 'json' };
import BaseRollupSimulatedJson from '../artifacts/rollup_base_simulated.json' assert { type: 'json' };
import BlockMergeRollupJson from '../artifacts/rollup_block_merge.json' assert { type: 'json' };
import BlockRootRollupJson from '../artifacts/rollup_block_root.json' assert { type: 'json' };
import EmptyBlockRootRollupJson from '../artifacts/rollup_block_root_empty.json' assert { type: 'json' };
import MergeRollupJson from '../artifacts/rollup_merge.json' assert { type: 'json' };
import RootRollupJson from '../artifacts/rollup_root.json' assert { type: 'json' };
import {
  PrivateKernelResetArtifacts,
  PrivateKernelResetSimulatedArtifacts,
  type PrivateResetArtifact,
} from './private_kernel_reset_data.js';

export type ServerProtocolArtifact =
  | 'EmptyNestedArtifact'
  | 'PrivateKernelEmptyArtifact'
  | 'PublicKernelInnerArtifact'
  | 'PublicKernelMergeArtifact'
  | 'PublicKernelTailArtifact'
  | 'BaseParityArtifact'
  | 'RootParityArtifact'
  | 'BaseRollupArtifact'
  | 'MergeRollupArtifact'
  | 'BlockRootRollupArtifact'
  | 'EmptyBlockRootRollupArtifact'
  | 'BlockMergeRollupArtifact'
  | 'RootRollupArtifact';

export type ClientProtocolArtifact =
  | 'PrivateKernelInitArtifact'
  | 'PrivateKernelInnerArtifact'
  | 'PrivateKernelTailArtifact'
  | 'PrivateKernelTailToPublicArtifact'
  | PrivateResetArtifact;

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;

export const ServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  EmptyNestedArtifact: EmptyNestedJson as NoirCompiledCircuit,
  PrivateKernelEmptyArtifact: PrivateKernelEmptyJson as NoirCompiledCircuit,
  PublicKernelInnerArtifact: PublicKernelInnerJson as NoirCompiledCircuit,
  PublicKernelMergeArtifact: PublicKernelMergeJson as NoirCompiledCircuit,
  PublicKernelTailArtifact: PublicKernelTailJson as NoirCompiledCircuit,
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  BaseRollupArtifact: BaseRollupJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupJson as NoirCompiledCircuit,
  EmptyBlockRootRollupArtifact: EmptyBlockRootRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const SimulatedServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  EmptyNestedArtifact: EmptyNestedSimulatedJson as NoirCompiledCircuit,
  PrivateKernelEmptyArtifact: PrivateKernelEmptySimulatedJson as NoirCompiledCircuit,
  PublicKernelInnerArtifact: PublicKernelInnerSimulatedJson as NoirCompiledCircuit,
  PublicKernelMergeArtifact: PublicKernelMergeSimulatedJson as NoirCompiledCircuit,
  PublicKernelTailArtifact: PublicKernelTailSimulatedJson as NoirCompiledCircuit,
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  BaseRollupArtifact: BaseRollupSimulatedJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupJson as NoirCompiledCircuit,
  EmptyBlockRootRollupArtifact: EmptyBlockRootRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const ClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicJson as NoirCompiledCircuit,
  ...PrivateKernelResetArtifacts,
};

export const SimulatedClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitSimulatedJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicSimulatedJson as NoirCompiledCircuit,
  ...PrivateKernelResetSimulatedArtifacts,
};

export const ProtocolCircuitArtifacts: Record<ProtocolArtifact, NoirCompiledCircuit> = {
  ...ClientCircuitArtifacts,
  ...ServerCircuitArtifacts,
};
