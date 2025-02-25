import { type AvmCircuitInputs } from '@aztec/circuits.js/avm';
import {
  type ProofAndVerificationKey,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuits.js/interfaces/server';
import type { BaseParityInputs, ParityPublicInputs, RootParityInputs } from '@aztec/circuits.js/parity';
import { type Proof, makeEmptyRecursiveProof, makeRecursiveProof } from '@aztec/circuits.js/proofs';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type MergeRollupInputs,
  type PrivateBaseRollupInputs,
  type PublicBaseRollupInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type SingleTxBlockRootRollupInputs,
  type TubeInputs,
} from '@aztec/circuits.js/rollup';
import { VerificationKeyData } from '@aztec/circuits.js/vks';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import {
  type ServerProtocolArtifact,
  SimulatedServerCircuitArtifacts,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBlockMergeRollupInputsToWitnessMap,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertEmptyBlockRootRollupInputsToWitnessMap,
  convertEmptyBlockRootRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
  convertSimulatedBlockRootRollupInputsToWitnessMap,
  convertSimulatedBlockRootRollupOutputsFromWitnessMap,
  convertSimulatedPrivateBaseRollupInputsToWitnessMap,
  convertSimulatedPrivateBaseRollupOutputsFromWitnessMap,
  convertSimulatedPublicBaseRollupInputsToWitnessMap,
  convertSimulatedPublicBaseRollupOutputsFromWitnessMap,
  convertSimulatedSingleTxBlockRootRollupInputsToWitnessMap,
  convertSimulatedSingleTxBlockRootRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types/server';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/vks';
import { type SimulationProvider, WASMSimulatorWithBlobs, emitCircuitSimulationStats } from '@aztec/simulator/server';
import { type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { type WitnessMap } from '@noir-lang/types';

import { ProverInstrumentation } from '../instrumentation.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
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
    private simulationProvider?: SimulationProvider,
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
    inputs: BaseParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.BASE_PARITY, () =>
      this.simulate(
        inputs,
        'BaseParityArtifact',
        RECURSIVE_PROOF_LENGTH,
        convertBaseParityInputsToWitnessMap,
        convertBaseParityOutputsFromWitnessMap,
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
    inputs: RootParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.ROOT_PARITY, () =>
      this.simulate(
        inputs,
        'RootParityArtifact',
        NESTED_RECURSIVE_PROOF_LENGTH,
        convertRootParityInputsToWitnessMap,
        convertRootParityOutputsFromWitnessMap,
      ),
    );
  }

  public getTubeProof(_tubeInput: TubeInputs): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return this.applyDelay(ProvingRequestType.TUBE_PROOF, () =>
      makeProofAndVerificationKey(makeEmptyRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFakeRollupHonk()),
    );
  }

  @trackSpan('TestCircuitProver.getPrivateBaseRollupProof')
  public getPrivateBaseRollupProof(
    inputs: PrivateBaseRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.PRIVATE_BASE_ROLLUP, () =>
      this.simulate(
        inputs,
        'PrivateBaseRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertSimulatedPrivateBaseRollupInputsToWitnessMap,
        convertSimulatedPrivateBaseRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getPublicBaseRollupProof')
  public getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.PUBLIC_BASE_ROLLUP, () =>
      this.simulate(
        inputs,
        'PublicBaseRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertSimulatedPublicBaseRollupInputsToWitnessMap,
        convertSimulatedPublicBaseRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getMergeRollupProof')
  public getMergeRollupProof(
    input: MergeRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.MERGE_ROLLUP, () =>
      this.simulate(
        input,
        'MergeRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertMergeRollupInputsToWitnessMap,
        convertMergeRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getBlockRootRollupProof')
  public getBlockRootRollupProof(
    input: BlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.BLOCK_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'BlockRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertSimulatedBlockRootRollupInputsToWitnessMap,
        convertSimulatedBlockRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  @trackSpan('TestCircuitProver.getSingleTxBlockRootRollupProof')
  public async getSingleTxBlockRootRollupProof(
    input: SingleTxBlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return await this.applyDelay(ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'SingleTxBlockRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertSimulatedSingleTxBlockRootRollupInputsToWitnessMap,
        convertSimulatedSingleTxBlockRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the empty block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getEmptyBlockRootRollupProof')
  public getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'EmptyBlockRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertEmptyBlockRootRollupInputsToWitnessMap,
        convertEmptyBlockRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the block merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getBlockMergeRollupProof')
  public getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.BLOCK_MERGE_ROLLUP, () =>
      this.simulate(
        input,
        'BlockMergeRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertBlockMergeRollupInputsToWitnessMap,
        convertBlockMergeRollupOutputsFromWitnessMap,
      ),
    );
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getRootRollupProof')
  public getRootRollupProof(input: RootRollupInputs): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return this.applyDelay(ProvingRequestType.ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'RootRollupArtifact',
        NESTED_RECURSIVE_PROOF_LENGTH,
        convertRootRollupInputsToWitnessMap,
        convertRootRollupOutputsFromWitnessMap,
      ),
    );
  }

  public getAvmProof(_inputs: AvmCircuitInputs): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    // We can't simulate the AVM because we don't have enough context to do so (e.g., DBs).
    // We just return an empty proof and VK data.
    this.logger.debug('Skipping AVM simulation in TestCircuitProver.');
    return this.applyDelay(ProvingRequestType.PUBLIC_VM, () =>
      makeProofAndVerificationKey(
        makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
        VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
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
    convertInput: (input: CircuitInputType) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => CircuitOutputType,
  ) {
    const timer = new Timer();
    const witnessMap = convertInput(input);
    const circuitName = mapProtocolArtifactNameToCircuitName(artifactName);

    let simulationProvider = this.simulationProvider ?? this.wasmSimulator;
    if (['BlockRootRollupArtifact', 'SingleTxBlockRootRollupArtifact'].includes(artifactName)) {
      // TODO(#10323): temporarily force block root to use wasm while we simulate
      // the blob operations with an oracle. Appears to be no way to provide nativeACVM with a foreign call hander.
      simulationProvider = this.wasmSimulator;
    }
    const witness = await simulationProvider.executeProtocolCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts[artifactName],
    );

    const result = convertOutput(witness);

    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(circuitName, timer.ms(), input.toBuffer().length, result.toBuffer().length, this.logger);
    return makePublicInputsAndRecursiveProof(result, makeRecursiveProof(proofLength), ProtocolCircuitVks[artifactName]);
  }
}
