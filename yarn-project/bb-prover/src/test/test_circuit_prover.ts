import {
  type AvmProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  type AvmCircuitInputs,
  AvmVerificationKeyData,
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  EmptyNestedData,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateKernelEmptyInputData,
  PrivateKernelEmptyInputs,
  type Proof,
  type PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  type PublicKernelInnerCircuitPrivateInputs,
  type PublicKernelTailCircuitPrivateInputs,
  RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  type TubeInputs,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  makeEmptyProof,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import {
  ProtocolCircuitVkIndexes,
  ProtocolCircuitVks,
  type ServerProtocolArtifact,
  SimulatedServerCircuitArtifacts,
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBlockMergeRollupInputsToWitnessMap,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertBlockRootRollupInputsToWitnessMap,
  convertBlockRootRollupOutputsFromWitnessMap,
  convertEmptyBlockRootRollupInputsToWitnessMap,
  convertEmptyBlockRootRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertPrivateKernelEmptyInputsToWitnessMap,
  convertPrivateKernelEmptyOutputsFromWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
  convertSimulatedBaseRollupInputsToWitnessMap,
  convertSimulatedBaseRollupOutputsFromWitnessMap,
  convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap,
  convertSimulatedPublicInnerInputsToWitnessMap,
  convertSimulatedPublicInnerOutputFromWitnessMap,
  convertSimulatedPublicMergeInputsToWitnessMap,
  convertSimulatedPublicMergeOutputFromWitnessMap,
  convertSimulatedPublicTailInputsToWitnessMap,
  convertSimulatedPublicTailOutputFromWitnessMap,
  getVKSiblingPath,
} from '@aztec/noir-protocol-circuits-types';
import { type SimulationProvider, WASMSimulator, emitCircuitSimulationStats } from '@aztec/simulator';
import { type TelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { ProverInstrumentation } from '../instrumentation.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';

/**
 * A class for use in testing situations (e2e, unit test, etc) and temporarily for assembling a block in the sequencer.
 * Simulates circuits using the most efficient method and performs no proving.
 */
export class TestCircuitProver implements ServerCircuitProver {
  private wasmSimulator = new WASMSimulator();
  private instrumentation: ProverInstrumentation;
  private logger = createDebugLogger('aztec:test-prover');

  constructor(
    telemetry: TelemetryClient,
    private simulationProvider?: SimulationProvider,
    private opts: { proverTestDelayMs: number } = { proverTestDelayMs: 0 },
  ) {
    this.instrumentation = new ProverInstrumentation(telemetry, 'TestCircuitProver');
  }

  get tracer() {
    return this.instrumentation.tracer;
  }

  public async getEmptyPrivateKernelProof(
    inputs: PrivateKernelEmptyInputData,
  ): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    const emptyNested = new EmptyNestedData(
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['EmptyNestedArtifact'].keyAsFields,
    );
    const kernelInputs = new PrivateKernelEmptyInputs(
      emptyNested,
      inputs.header,
      inputs.chainId,
      inputs.version,
      inputs.vkTreeRoot,
      inputs.protocolContractTreeRoot,
    );
    const witnessMap = convertPrivateKernelEmptyInputsToWitnessMap(kernelInputs);
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.PrivateKernelEmptyArtifact,
    );
    const result = convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap(witness);
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['PrivateKernelEmptyArtifact'],
    );
  }

  public async getEmptyTubeProof(
    inputs: PrivateKernelEmptyInputData,
  ): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    const emptyNested = new EmptyNestedData(
      makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['EmptyNestedArtifact'].keyAsFields,
    );
    const kernelInputs = new PrivateKernelEmptyInputs(
      emptyNested,
      inputs.header,
      inputs.chainId,
      inputs.version,
      inputs.vkTreeRoot,
      inputs.protocolContractTreeRoot,
    );
    const witnessMap = convertPrivateKernelEmptyInputsToWitnessMap(kernelInputs);
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.PrivateKernelEmptyArtifact,
    );
    const result = convertPrivateKernelEmptyOutputsFromWitnessMap(witness);
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getBaseParityProof')
  public async getBaseParityProof(inputs: BaseParityInputs): Promise<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>> {
    const timer = new Timer();
    const witnessMap = convertBaseParityInputsToWitnessMap(inputs);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.BaseParityArtifact,
    );
    const result = convertBaseParityOutputsFromWitnessMap(witness);

    const rootParityInput = new RootParityInput<typeof RECURSIVE_PROOF_LENGTH>(
      makeRecursiveProof<typeof RECURSIVE_PROOF_LENGTH>(RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['BaseParityArtifact'].keyAsFields,
      getVKSiblingPath(ProtocolCircuitVkIndexes['BaseParityArtifact']),
      result,
    );

    this.instrumentation.recordDuration('simulationDuration', 'base-parity', timer);

    emitCircuitSimulationStats(
      'base-parity',
      timer.ms(),
      inputs.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return Promise.resolve(rootParityInput);
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getRootParityProof')
  public async getRootParityProof(
    inputs: RootParityInputs,
  ): Promise<RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    const timer = new Timer();
    const witnessMap = convertRootParityInputsToWitnessMap(inputs);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.RootParityArtifact,
    );

    const result = convertRootParityOutputsFromWitnessMap(witness);

    const rootParityInput = new RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>(
      makeRecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['RootParityArtifact'].keyAsFields,
      getVKSiblingPath(ProtocolCircuitVkIndexes['RootParityArtifact']),
      result,
    );

    this.instrumentation.recordDuration('simulationDuration', 'root-parity', timer);
    emitCircuitSimulationStats(
      'root-parity',
      timer.ms(),
      inputs.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return Promise.resolve(rootParityInput);
  }

  /**
   * Simulates the base rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getBaseRollupProof')
  public async getBaseRollupProof(
    input: BaseRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertSimulatedBaseRollupInputsToWitnessMap(input);

    const simulationProvider = this.simulationProvider ?? this.wasmSimulator;
    const witness = await simulationProvider.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.BaseRollupArtifact,
    );

    const result = convertSimulatedBaseRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'base-rollup', timer);
    emitCircuitSimulationStats(
      'base-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['BaseRollupArtifact'],
    );
  }

  public async getTubeProof(
    _tubeInput: TubeInputs,
  ): Promise<{ tubeVK: VerificationKeyData; tubeProof: RecursiveProof<typeof TUBE_PROOF_LENGTH> }> {
    await this.delay();
    return {
      tubeVK: VerificationKeyData.makeFakeHonk(),
      tubeProof: makeEmptyRecursiveProof(TUBE_PROOF_LENGTH),
    };
  }

  /**
   * Simulates the merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getMergeRollupProof')
  public async getMergeRollupProof(
    input: MergeRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertMergeRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.MergeRollupArtifact,
    );

    const result = convertMergeRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'merge-rollup', timer);
    emitCircuitSimulationStats(
      'merge-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['MergeRollupArtifact'],
    );
  }

  /**
   * Simulates the block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getBlockRootRollupProof')
  public async getBlockRootRollupProof(
    input: BlockRootRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertBlockRootRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.BlockRootRollupArtifact,
    );

    const result = convertBlockRootRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'block-root-rollup', timer);
    emitCircuitSimulationStats(
      'block-root-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['BlockRootRollupArtifact'],
    );
  }

  /**
   * Simulates the empty block root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getEmptyBlockRootRollupProof')
  public async getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertEmptyBlockRootRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.EmptyBlockRootRollupArtifact,
    );

    const result = convertEmptyBlockRootRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'empty-block-root-rollup', timer);
    emitCircuitSimulationStats(
      'empty-block-root-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['EmptyBlockRootRollupArtifact'],
    );
  }

  /**
   * Simulates the block merge rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getBlockMergeRollupProof')
  public async getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertBlockMergeRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.BlockMergeRollupArtifact,
    );

    const result = convertBlockMergeRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'block-merge-rollup', timer);
    emitCircuitSimulationStats(
      'block-merge-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['BlockMergeRollupArtifact'],
    );
  }

  /**
   * Simulates the root rollup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  @trackSpan('TestCircuitProver.getRootRollupProof')
  public async getRootRollupProof(
    input: RootRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    const timer = new Timer();
    const witnessMap = convertRootRollupInputsToWitnessMap(input);

    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(
      witnessMap,
      SimulatedServerCircuitArtifacts.RootRollupArtifact,
    );

    const result = convertRootRollupOutputsFromWitnessMap(witness);

    this.instrumentation.recordDuration('simulationDuration', 'root-rollup', timer);
    emitCircuitSimulationStats(
      'root-rollup',
      timer.ms(),
      input.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks['RootRollupArtifact'],
    );
  }

  @trackSpan('TestCircuitProver.getPublicKernelInnerProof')
  public async getPublicKernelInnerProof(
    inputs: PublicKernelInnerCircuitPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<VMCircuitPublicInputs>> {
    const timer = new Timer();

    const artifact = 'PublicKernelInnerArtifact';
    const circuitName = mapProtocolArtifactNameToCircuitName(artifact);

    const witnessMap = convertSimulatedPublicInnerInputsToWitnessMap(inputs);
    const witness = await this.wasmSimulator.simulateCircuit(witnessMap, SimulatedServerCircuitArtifacts[artifact]);

    const result = convertSimulatedPublicInnerOutputFromWitnessMap(witness);
    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(
      circuitName,
      timer.ms(),
      inputs.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks[artifact],
    );
  }

  @trackSpan('TestCircuitProver.getPublicKernelMergeProof')
  public async getPublicKernelMergeProof(
    inputs: PublicKernelCircuitPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    const timer = new Timer();

    const artifact = 'PublicKernelMergeArtifact';
    const circuitName = mapProtocolArtifactNameToCircuitName(artifact);

    const witnessMap = convertSimulatedPublicMergeInputsToWitnessMap(inputs);
    const witness = await this.wasmSimulator.simulateCircuit(witnessMap, SimulatedServerCircuitArtifacts[artifact]);

    const result = convertSimulatedPublicMergeOutputFromWitnessMap(witness);
    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(
      circuitName,
      timer.ms(),
      inputs.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks[artifact],
    );
  }

  @trackSpan('TestCircuitProver.getPublicTailProof')
  public async getPublicTailProof(
    inputs: PublicKernelTailCircuitPrivateInputs,
  ): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    const timer = new Timer();

    const artifact = 'PublicKernelTailArtifact';
    const circuitName = mapProtocolArtifactNameToCircuitName(artifact);

    const witnessMap = convertSimulatedPublicTailInputsToWitnessMap(inputs);
    // use WASM here as it is faster for small circuits
    const witness = await this.wasmSimulator.simulateCircuit(witnessMap, SimulatedServerCircuitArtifacts[artifact]);

    const result = convertSimulatedPublicTailOutputFromWitnessMap(witness);
    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(
      circuitName,
      timer.ms(),
      inputs.toBuffer().length,
      result.toBuffer().length,
      this.logger,
    );
    await this.delay();
    return makePublicInputsAndRecursiveProof(
      result,
      makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
      ProtocolCircuitVks[artifact],
    );
  }

  public async getAvmProof(_inputs: AvmCircuitInputs): Promise<AvmProofAndVerificationKey> {
    // We can't simulate the AVM because we don't have enough context to do so (e.g., DBs).
    // We just return an empty proof and VK data.
    this.logger.debug('Skipping AVM simulation in TestCircuitProver.');
    await this.delay();
    return { proof: makeEmptyProof(), verificationKey: AvmVerificationKeyData.makeFake() };
  }

  private async delay(): Promise<void> {
    if (this.opts.proverTestDelayMs > 0) {
      await sleep(this.opts.proverTestDelayMs);
    }
  }

  // Not implemented for test circuits
  public verifyProof(_1: ServerProtocolArtifact, _2: Proof): Promise<void> {
    return Promise.reject(new Error('Method not implemented.'));
  }
}
