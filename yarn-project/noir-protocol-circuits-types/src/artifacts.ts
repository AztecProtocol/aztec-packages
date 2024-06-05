import { type PrivateKernelResetTags } from '@aztec/circuits.js';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import EmptyNestedJson from './target/empty_nested.json' assert { type: 'json' };
import EmptyNestedSimulatedJson from './target/empty_nested_simulated.json' assert { type: 'json' };
import BaseParityJson from './target/parity_base.json' assert { type: 'json' };
import RootParityJson from './target/parity_root.json' assert { type: 'json' };
import PrivateKernelEmptyJson from './target/private_kernel_empty.json' assert { type: 'json' };
import PrivateKernelEmptySimulatedJson from './target/private_kernel_empty_simulated.json' assert { type: 'json' };
import PrivateKernelInitJson from './target/private_kernel_init.json' assert { type: 'json' };
import PrivateKernelInitSimulatedJson from './target/private_kernel_init_simulated.json' assert { type: 'json' };
import PrivateKernelInnerJson from './target/private_kernel_inner.json' assert { type: 'json' };
import PrivateKernelInnerSimulatedJson from './target/private_kernel_inner_simulated.json' assert { type: 'json' };
import PrivateKernelResetJson from './target/private_kernel_reset.json' assert { type: 'json' };
import PrivateKernelResetBigJson from './target/private_kernel_reset_big.json' assert { type: 'json' };
import PrivateKernelResetMediumJson from './target/private_kernel_reset_medium.json' assert { type: 'json' };
import PrivateKernelResetSimulatedJson from './target/private_kernel_reset_simulated.json' assert { type: 'json' };
import PrivateKernelResetBigSimulatedJson from './target/private_kernel_reset_simulated_big.json' assert { type: 'json' };
import PrivateKernelResetMediumSimulatedJson from './target/private_kernel_reset_simulated_medium.json' assert { type: 'json' };
import PrivateKernelResetSmallSimulatedJson from './target/private_kernel_reset_simulated_small.json' assert { type: 'json' };
import PrivateKernelResetSmallJson from './target/private_kernel_reset_small.json' assert { type: 'json' };
import PrivateKernelTailJson from './target/private_kernel_tail.json' assert { type: 'json' };
import PrivateKernelTailSimulatedJson from './target/private_kernel_tail_simulated.json' assert { type: 'json' };
import PrivateKernelTailToPublicJson from './target/private_kernel_tail_to_public.json' assert { type: 'json' };
import PrivateKernelTailToPublicSimulatedJson from './target/private_kernel_tail_to_public_simulated.json' assert { type: 'json' };
import PublicKernelAppLogicJson from './target/public_kernel_app_logic.json' assert { type: 'json' };
import PublicKernelAppLogicSimulatedJson from './target/public_kernel_app_logic_simulated.json' assert { type: 'json' };
import PublicKernelSetupJson from './target/public_kernel_setup.json' assert { type: 'json' };
import PublicKernelSetupSimulatedJson from './target/public_kernel_setup_simulated.json' assert { type: 'json' };
import PublicKernelTailJson from './target/public_kernel_tail.json' assert { type: 'json' };
import PublicKernelTailSimulatedJson from './target/public_kernel_tail_simulated.json' assert { type: 'json' };
import PublicKernelTeardownJson from './target/public_kernel_teardown.json' assert { type: 'json' };
import PublicKernelTeardownSimulatedJson from './target/public_kernel_teardown_simulated.json' assert { type: 'json' };
import BaseRollupJson from './target/rollup_base.json' assert { type: 'json' };
import BaseRollupSimulatedJson from './target/rollup_base_simulated.json' assert { type: 'json' };
import MergeRollupJson from './target/rollup_merge.json' assert { type: 'json' };
import RootRollupJson from './target/rollup_root.json' assert { type: 'json' };

export type PrivateResetArtifacts =
  | 'PrivateKernelResetFullArtifact'
  | 'PrivateKernelResetBigArtifact'
  | 'PrivateKernelResetMediumArtifact'
  | 'PrivateKernelResetSmallArtifact';

export const PrivateResetTagToArtifactName: Record<PrivateKernelResetTags, PrivateResetArtifacts> = {
  full: 'PrivateKernelResetFullArtifact',
  big: 'PrivateKernelResetBigArtifact',
  medium: 'PrivateKernelResetMediumArtifact',
  small: 'PrivateKernelResetSmallArtifact',
};

export type ServerProtocolArtifact =
  | 'EmptyNestedArtifact'
  | 'PrivateKernelEmptyArtifact'
  | 'PublicKernelSetupArtifact'
  | 'PublicKernelAppLogicArtifact'
  | 'PublicKernelTeardownArtifact'
  | 'PublicKernelTailArtifact'
  | 'BaseParityArtifact'
  | 'RootParityArtifact'
  | 'BaseRollupArtifact'
  | 'MergeRollupArtifact'
  | 'RootRollupArtifact';

export type ClientProtocolArtifact =
  | 'PrivateKernelInitArtifact'
  | 'PrivateKernelInnerArtifact'
  | 'PrivateKernelTailArtifact'
  | 'PrivateKernelTailToPublicArtifact'
  | PrivateResetArtifacts;

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;

export const ServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  EmptyNestedArtifact: EmptyNestedJson as NoirCompiledCircuit,
  PrivateKernelEmptyArtifact: PrivateKernelEmptyJson as NoirCompiledCircuit,
  PublicKernelSetupArtifact: PublicKernelSetupJson as NoirCompiledCircuit,
  PublicKernelAppLogicArtifact: PublicKernelAppLogicJson as NoirCompiledCircuit,
  PublicKernelTeardownArtifact: PublicKernelTeardownJson as NoirCompiledCircuit,
  PublicKernelTailArtifact: PublicKernelTailJson as NoirCompiledCircuit,
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  BaseRollupArtifact: BaseRollupJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const SimulatedServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  EmptyNestedArtifact: EmptyNestedSimulatedJson as NoirCompiledCircuit,
  PrivateKernelEmptyArtifact: PrivateKernelEmptySimulatedJson as NoirCompiledCircuit,
  PublicKernelSetupArtifact: PublicKernelSetupSimulatedJson as NoirCompiledCircuit,
  PublicKernelAppLogicArtifact: PublicKernelAppLogicSimulatedJson as NoirCompiledCircuit,
  PublicKernelTeardownArtifact: PublicKernelTeardownSimulatedJson as NoirCompiledCircuit,
  PublicKernelTailArtifact: PublicKernelTailSimulatedJson as NoirCompiledCircuit,
  BaseParityArtifact: BaseParityJson as NoirCompiledCircuit,
  RootParityArtifact: RootParityJson as NoirCompiledCircuit,
  BaseRollupArtifact: BaseRollupSimulatedJson as NoirCompiledCircuit,
  MergeRollupArtifact: MergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const ResetSimulatedArtifacts: Record<PrivateResetArtifacts, NoirCompiledCircuit> = {
  PrivateKernelResetFullArtifact: PrivateKernelResetSimulatedJson as NoirCompiledCircuit,
  PrivateKernelResetBigArtifact: PrivateKernelResetBigSimulatedJson as NoirCompiledCircuit,
  PrivateKernelResetMediumArtifact: PrivateKernelResetMediumSimulatedJson as NoirCompiledCircuit,
  PrivateKernelResetSmallArtifact: PrivateKernelResetSmallSimulatedJson as NoirCompiledCircuit,
};

export const ClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerJson as NoirCompiledCircuit,
  PrivateKernelResetFullArtifact: PrivateKernelResetJson as NoirCompiledCircuit,
  PrivateKernelResetBigArtifact: PrivateKernelResetBigJson as NoirCompiledCircuit,
  PrivateKernelResetMediumArtifact: PrivateKernelResetMediumJson as NoirCompiledCircuit,
  PrivateKernelResetSmallArtifact: PrivateKernelResetSmallJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicJson as NoirCompiledCircuit,
};

export const SimulatedClientCircuitArtifacts: Record<ClientProtocolArtifact, NoirCompiledCircuit> = {
  PrivateKernelInitArtifact: PrivateKernelInitSimulatedJson as NoirCompiledCircuit,
  PrivateKernelInnerArtifact: PrivateKernelInnerSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailArtifact: PrivateKernelTailSimulatedJson as NoirCompiledCircuit,
  PrivateKernelTailToPublicArtifact: PrivateKernelTailToPublicSimulatedJson as NoirCompiledCircuit,
  ...ResetSimulatedArtifacts,
};

export const ProtocolCircuitArtifacts: Record<ProtocolArtifact, NoirCompiledCircuit> = {
  ...ClientCircuitArtifacts,
  ...ServerCircuitArtifacts,
};
