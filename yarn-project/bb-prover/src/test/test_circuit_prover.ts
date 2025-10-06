import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import {
  type ServerProtocolArtifact,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertBlockMergeRollupPrivateInputsToWitnessMap,
  convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap,
  convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootFirstRollupOutputsFromWitnessMap,
  convertBlockRootFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootRollupOutputsFromWitnessMap,
  convertBlockRootRollupPrivateInputsToWitnessMap,
  convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap,
  convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap,
  convertBlockRootSingleTxRollupOutputsFromWitnessMap,
  convertBlockRootSingleTxRollupPrivateInputsToWitnessMap,
  convertCheckpointMergeRollupOutputsFromWitnessMap,
  convertCheckpointMergeRollupPrivateInputsToWitnessMap,
  convertCheckpointPaddingRollupOutputsFromWitnessMap,
  convertCheckpointPaddingRollupPrivateInputsToWitnessMap,
  convertCheckpointRootRollupOutputsFromWitnessMap,
  convertCheckpointRootRollupPrivateInputsToWitnessMap,
  convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap,
  convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap,
  convertParityBaseOutputsFromWitnessMap,
  convertParityBasePrivateInputsToWitnessMap,
  convertParityRootOutputsFromWitnessMap,
  convertParityRootPrivateInputsToWitnessMap,
  convertPrivateTxBaseRollupOutputsFromWitnessMap,
  convertPrivateTxBaseRollupPrivateInputsToWitnessMap,
  convertPublicTxBaseRollupOutputsFromWitnessMap,
  convertPublicTxBaseRollupPrivateInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
  convertRootRollupPrivateInputsToWitnessMap,
  convertTxMergeRollupOutputsFromWitnessMap,
  convertTxMergeRollupPrivateInputsToWitnessMap,
  foreignCallHandler,
  getSimulatedServerCircuitArtifact,
} from '@aztec/noir-protocol-circuits-types/server';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import { mapProtocolArtifactNameToCircuitName } from '@aztec/noir-protocol-circuits-types/types';
import type { WitnessMap } from '@aztec/noir-types';
import { type CircuitSimulator, WASMSimulatorWithBlobs, emitCircuitSimulationStats } from '@aztec/simulator/server';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import {
  type ProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityBasePrivateInputs, ParityPublicInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
import { type Proof, ProvingRequestType, makeEmptyRecursiveProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import {
  type BlockMergeRollupPrivateInputs,
  type BlockRollupPublicInputs,
  type BlockRootEmptyTxFirstRollupPrivateInputs,
  type BlockRootFirstRollupPrivateInputs,
  type BlockRootRollupPrivateInputs,
  type BlockRootSingleTxFirstRollupPrivateInputs,
  type BlockRootSingleTxRollupPrivateInputs,
  type CheckpointMergeRollupPrivateInputs,
  type CheckpointPaddingRollupPrivateInputs,
  type CheckpointRollupPublicInputs,
  type CheckpointRootRollupPrivateInputs,
  type CheckpointRootSingleBlockRollupPrivateInputs,
  type PrivateTxBaseRollupPrivateInputs,
  type PublicTubePrivateInputs,
  PublicTubePublicInputs,
  type PublicTxBaseRollupPrivateInputs,
  type RootRollupPrivateInputs,
  type RootRollupPublicInputs,
  type TxMergeRollupPrivateInputs,
  type TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import { VerificationKeyData } from '@aztec/stdlib/vks';
import { type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { ProverInstrumentation } from '../instrumentation.js';
import { PROOF_DELAY_MS, WITGEN_DELAY_MS } from './delay_values.js';

type TestDelay =
  | {
      proverTestDelayType: 'fixed';
      proverTestDelayMs?: number;
    }
  | {
      proverTestDelayType: 'realistic';
      proverTestDelayFactor?: number;
    };

/**
 * A class for use in testing situations (e2e, unit test, etc) and temporarily for assembling a block in the sequencer.
 * Simulates circuits using the most efficient method and performs no proving.
 */
export class TestCircuitProver implements ServerCircuitProver {
  private wasmSimulator = new WASMSimulatorWithBlobs();
  private instrumentation: ProverInstrumentation;
  private logger = createLogger('bb-prover:test-prover');

  constructor(
    private simulator?: CircuitSimulator,
    private opts: TestDelay = { proverTestDelayType: 'fixed', proverTestDelayMs: 0 },
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.instrumentation = new ProverInstrumentation(telemetry, 'TestCircuitProver');
  }

  get tracer() {
    return this.instrumentation.tracer;
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getBaseParityProof')
  public getBaseParityProof(
    inputs: ParityBasePrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.PARITY_BASE, () =>
      this.simulate(
        inputs,
        'ParityBaseArtifact',
        RECURSIVE_PROOF_LENGTH,
        convertParityBasePrivateInputsToWitnessMap,
        convertParityBaseOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getRootParityProof')
  public getRootParityProof(
    inputs: ParityRootPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.PARITY_ROOT, () =>
      this.simulate(
        inputs,
        'ParityRootArtifact',
        NESTED_RECURSIVE_PROOF_LENGTH,
        convertParityRootPrivateInputsToWitnessMap,
        convertParityRootOutputsFromWitnessMap,
      ),
    );
  }

  public getPublicTubeProof(
    inputs: PublicTubePrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.PUBLIC_TUBE, () =>
      makePublicInputsAndRecursiveProof(
        new PublicTubePublicInputs(inputs.hidingKernelProofData.publicInputs, inputs.proverId),
        makeEmptyRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
        ProtocolCircuitVks.PublicTube,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getPrivateTxBaseRollupProof')
  public getPrivateTxBaseRollupProof(
    inputs: PrivateTxBaseRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.PRIVATE_TX_BASE_ROLLUP, () =>
      this.simulate(
        inputs,
        'PrivateTxBaseRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertPrivateTxBaseRollupPrivateInputsToWitnessMap,
        convertPrivateTxBaseRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getPublicTxBaseRollupProof')
  public getPublicTxBaseRollupProof(
    inputs: PublicTxBaseRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.PUBLIC_TX_BASE_ROLLUP, () =>
      this.simulate(
        inputs,
        'PublicTxBaseRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertPublicTxBaseRollupPrivateInputsToWitnessMap,
        convertPublicTxBaseRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getTxMergeRollupProof')
  public getTxMergeRollupProof(
    input: TxMergeRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.TX_MERGE_ROLLUP, () =>
      this.simulate(
        input,
        'TxMergeRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertTxMergeRollupPrivateInputsToWitnessMap,
        convertTxMergeRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockRootFirstRollupProof')
  public getBlockRootFirstRollupProof(
    input: BlockRootFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootFirstRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockRootFirstRollupPrivateInputsToWitnessMap,
        convertBlockRootFirstRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockRootSingleTxFirstRollupProof')
  public async getBlockRootSingleTxFirstRollupProof(
    input: BlockRootSingleTxFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return await this.applyDelay(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootSingleTxFirstRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap,
        convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockRootEmptyTxFirstRollupProof')
  public getBlockRootEmptyTxFirstRollupProof(
    input: BlockRootEmptyTxFirstRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootEmptyTxFirstRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap,
        convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockRootRollupProof')
  public getBlockRootRollupProof(
    input: BlockRootRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.BLOCK_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockRootRollupPrivateInputsToWitnessMap,
        convertBlockRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockRootSingleTxRollupProof')
  public async getBlockRootSingleTxRollupProof(
    input: BlockRootSingleTxRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return await this.applyDelay(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootSingleTxRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockRootSingleTxRollupPrivateInputsToWitnessMap,
        convertBlockRootSingleTxRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getBlockMergeRollupProof')
  public getBlockMergeRollupProof(
    input: BlockMergeRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.BLOCK_MERGE_ROLLUP, () =>
      this.simulate(
        input,
        'BlockMergeRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockMergeRollupPrivateInputsToWitnessMap,
        convertBlockMergeRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getCheckpointRootRollupProof')
  public getCheckpointRootRollupProof(
    input: CheckpointRootRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.CHECKPOINT_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'CheckpointRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertCheckpointRootRollupPrivateInputsToWitnessMap,
        convertCheckpointRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getCheckpointRootSingleBlockRollupProof')
  public getCheckpointRootSingleBlockRollupProof(
    input: CheckpointRootSingleBlockRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP, () =>
      this.simulate(
        input,
        'CheckpointRootSingleBlockRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap,
        convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getCheckpointPaddingRollupProof')
  public getCheckpointPaddingRollupProof(
    input: CheckpointPaddingRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.CHECKPOINT_PADDING_ROLLUP, () =>
      this.simulate(
        input,
        'CheckpointPaddingRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertCheckpointPaddingRollupPrivateInputsToWitnessMap,
        convertCheckpointPaddingRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getCheckpointMergeRollupProof')
  public getCheckpointMergeRollupProof(
    input: CheckpointMergeRollupPrivateInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.CHECKPOINT_MERGE_ROLLUP, () =>
      this.simulate(
        input,
        'CheckpointMergeRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertCheckpointMergeRollupPrivateInputsToWitnessMap,
        convertCheckpointMergeRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getRootRollupProof')
  public getRootRollupProof(
    input: RootRollupPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return this.applyDelay(ProvingRequestType.ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'RootRollupArtifact',
        NESTED_RECURSIVE_PROOF_LENGTH,
        convertRootRollupPrivateInputsToWitnessMap,
        convertRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  public getAvmProof(
    _inputs: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    // We can't simulate the AVM because we don't have enough context to do so (e.g., DBs).
    // We just return an empty proof and VK data.
    this.logger.debug('Skipping AVM simulation in TestCircuitProver.');
    return this.applyDelay(ProvingRequestType.PUBLIC_VM, () =>
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED),
        VerificationKeyData.makeFake(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
      ),
    );
  }

  private async applyDelay<F extends () => any>(type: ProvingRequestType, fn: F): Promise<Awaited<ReturnType<F>>> {
    const timer = new Timer();
    const res = await fn();
    const duration = timer.ms();
    if (this.opts.proverTestDelayType === 'fixed') {
      await sleep(Math.max(0, (this.opts.proverTestDelayMs ?? 0) - duration));
    } else if (this.opts.proverTestDelayType === 'realistic') {
      const delay = WITGEN_DELAY_MS[type] + PROOF_DELAY_MS[type];
      await sleep(Math.max(0, delay * (this.opts.proverTestDelayFactor ?? 1) - duration));
    }

    return res;
  }

  // Not implemented for test circuits
  public verifyProof(_1: ServerProtocolArtifact, _2: Proof): Promise<void> {
    return Promise.reject(new Error('Method not implemented.'));
  }

  private async simulate<
    PROOF_LENGTH extends number,
    CircuitInputType extends { toBuffer: () => Buffer },
    CircuitOutputType extends { toBuffer: () => Buffer },
  >(
    input: CircuitInputType,
    artifactName: ServerProtocolArtifact,
    proofLength: PROOF_LENGTH,
    convertInput: (input: CircuitInputType, simulated?: boolean) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap, simulated?: boolean) => CircuitOutputType,
  ) {
    const timer = new Timer();
    const witnessMap = convertInput(input, true /* simulated */);
    const circuitName = mapProtocolArtifactNameToCircuitName(artifactName);

    let witness: WitnessMap;
    if (
      ['CheckpointRootRollupArtifact', 'CheckpointRootSingleBlockRollupArtifact'].includes(artifactName) ||
      this.simulator == undefined
    ) {
      // TODO(#10323): Native ACVM simulator does not support foreign call handler so we use the wasm simulator
      // when simulating checkpoint root rollup circuits or when the native ACVM simulator is not provided.
      witness = (
        await this.wasmSimulator.executeProtocolCircuit(
          witnessMap,
          getSimulatedServerCircuitArtifact(artifactName),
          foreignCallHandler,
        )
      ).witness;
    } else {
      witness = (
        await this.simulator.executeProtocolCircuit(
          witnessMap,
          getSimulatedServerCircuitArtifact(artifactName),
          undefined, // Native ACM simulator does not support foreign call handler
        )
      ).witness;
    }

    const result = convertOutput(witness, true /* simulated */);

    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(circuitName, timer.ms(), input.toBuffer().length, result.toBuffer().length, this.logger);
    return makePublicInputsAndRecursiveProof(result, makeRecursiveProof(proofLength), ProtocolCircuitVks[artifactName]);
  }
}
