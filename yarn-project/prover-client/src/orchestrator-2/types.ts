import {
  type MerkleTreeOperations,
  type ProvingRequest,
  type ProvingRequestResult,
  type ProvingRequestType,
  type SimulationRequestResult,
} from '@aztec/circuit-types';
import {
  type AppendOnlyTreeSnapshot,
  type Fr,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';
import { type TelemetryClient } from '@aztec/telemetry-client';

export type ParityState = {
  l1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
  newL1ToL2MessageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>;
  messageTreeSnapshot: AppendOnlyTreeSnapshot;
};

type PayloadUrl = string;

export interface Prover {
  prove<Request extends ProvingRequest>(request: Request): Promise<ProvingRequestResult<Request['type']>>;
}

export interface Simulator {
  simulate<Request extends ProvingRequest>(request: Request): Promise<SimulationRequestResult<Request['type']>>;
}

export interface PayloadStore {
  save(id: string, payload: Buffer): Promise<PayloadUrl>;
  load(payloadUrl: PayloadUrl): Promise<Buffer | undefined>;
}

export interface MetadataStore {
  save(id: string, metadata: any): Promise<void>;
  load(id: string): Promise<any | undefined>;
  list(parentId: string): Promise<any[]>;
}

export interface Circuit<Type extends ProvingRequestType> {
  simulate(): Promise<SimulationRequestResult<Type>>;
  prove(): Promise<ProvingRequestResult<Type>>;
}

export type OrchestratorContext = {
  db: MerkleTreeOperations;
  simulator: Simulator;
  prover: Prover;
  telemetryClient: TelemetryClient;
  proverId: Fr;
  options: {
    checkSimulationMatchesProof: boolean;
    avmProvingStrict: boolean;
    simulationOnly: boolean;
  };
};
