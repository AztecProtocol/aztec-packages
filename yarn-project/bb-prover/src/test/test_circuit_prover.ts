import {
  type ProofAndVerificationKey,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProofAndVerificationKey,
  makePublicInputsAndRecursiveProof,
} from '@aztec/circuit-types';
import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type AvmCircuitInputs,
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  EmptyNestedData,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type ParityPublicInputs,
  type PrivateBaseRollupInputs,
  type PrivateKernelEmptyInputData,
  PrivateKernelEmptyInputs,
  type Proof,
  type PublicBaseRollupInputs,
  RECURSIVE_PROOF_LENGTH,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  type TubeInputs,
  VerificationKeyData,
  makeEmptyRecursiveProof,
  makeRecursiveProof,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import {
  ProtocolCircuitVks,
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
  convertPrivateKernelEmptyInputsToWitnessMap,
  convertRootParityInputsToWitnessMap,
  convertRootParityOutputsFromWitnessMap,
  convertRootRollupInputsToWitnessMap,
  convertRootRollupOutputsFromWitnessMap,
  convertSimulatedBlockRootRollupInputsToWitnessMap,
  convertSimulatedBlockRootRollupOutputsFromWitnessMap,
  convertSimulatedPrivateBaseRollupInputsToWitnessMap,
  convertSimulatedPrivateBaseRollupOutputsFromWitnessMap,
  convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap,
  convertSimulatedPublicBaseRollupInputsToWitnessMap,
  convertSimulatedPublicBaseRollupOutputsFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { type SimulationProvider, WASMSimulator, emitCircuitSimulationStats } from '@aztec/simulator';
import { type TelemetryClient, trackSpan } from '@aztec/telemetry-client';

import { type WitnessMap } from '@noir-lang/types';

import { ProverInstrumentation } from '../instrumentation.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';

/**
 * A class for use in testing situations (e2e, unit test, etc) and temporarily for assembling a block in the sequencer.
 * Simulates circuits using the most efficient method and performs no proving.
 */
export class TestCircuitProver implements ServerCircuitProver {
  private wasmSimulator = new WASMSimulator();
  private instrumentation: ProverInstrumentation;
  private logger = createLogger('bb-prover:test-prover');

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

    return await this.simulate(
      kernelInputs,
      'PrivateKernelEmptyArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertPrivateKernelEmptyInputsToWitnessMap,
      convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap,
    );
  }

  /**
   * Simulates the base parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getBaseParityProof')
  public async getBaseParityProof(
    inputs: BaseParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return await this.simulate(
      inputs,
      'BaseParityArtifact',
      RECURSIVE_PROOF_LENGTH,
      convertBaseParityInputsToWitnessMap,
      convertBaseParityOutputsFromWitnessMap,
    );
  }

  /**
   * Simulates the root parity circuit from its inputs.
   * @param inputs - Inputs to the circuit.
   * @returns The public inputs of the parity circuit.
   */
  @trackSpan('TestCircuitProver.getRootParityProof')
  public async getRootParityProof(
    inputs: RootParityInputs,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return await this.simulate(
      inputs,
      'RootParityArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertRootParityInputsToWitnessMap,
      convertRootParityOutputsFromWitnessMap,
    );
  }

  public async getTubeProof(_tubeInput: TubeInputs): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    await this.delay();
    return makeProofAndVerificationKey(makeEmptyRecursiveProof(TUBE_PROOF_LENGTH), VerificationKeyData.makeFakeHonk());
  }

  @trackSpan('TestCircuitProver.getPrivateBaseRollupProof')
  public async getPrivateBaseRollupProof(
    inputs: PrivateBaseRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return await this.simulate(
      inputs,
      'PrivateBaseRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertSimulatedPrivateBaseRollupInputsToWitnessMap,
      convertSimulatedPrivateBaseRollupOutputsFromWitnessMap,
    );
  }

  @trackSpan('TestCircuitProver.getPublicBaseRollupProof')
  public async getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    return await this.simulate(
      inputs,
      'PublicBaseRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertSimulatedPublicBaseRollupInputsToWitnessMap,
      convertSimulatedPublicBaseRollupOutputsFromWitnessMap,
    );
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
    return await this.simulate(
      input,
      'MergeRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertMergeRollupInputsToWitnessMap,
      convertMergeRollupOutputsFromWitnessMap,
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
    return await this.simulate(
      input,
      'BlockRootRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertSimulatedBlockRootRollupInputsToWitnessMap,
      convertSimulatedBlockRootRollupOutputsFromWitnessMap,
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
    return await this.simulate(
      input,
      'EmptyBlockRootRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertEmptyBlockRootRollupInputsToWitnessMap,
      convertEmptyBlockRootRollupOutputsFromWitnessMap,
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
    return await this.simulate(
      input,
      'BlockMergeRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertBlockMergeRollupInputsToWitnessMap,
      convertBlockMergeRollupOutputsFromWitnessMap,
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
    return await this.simulate(
      input,
      'RootRollupArtifact',
      NESTED_RECURSIVE_PROOF_LENGTH,
      convertRootRollupInputsToWitnessMap,
      convertRootRollupOutputsFromWitnessMap,
    );
  }

  public async getAvmProof(
    _inputs: AvmCircuitInputs,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    // We can't simulate the AVM because we don't have enough context to do so (e.g., DBs).
    // We just return an empty proof and VK data.
    this.logger.debug('Skipping AVM simulation in TestCircuitProver.');
    await this.delay();
    return makeProofAndVerificationKey(
      makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
      VerificationKeyData.makeFake(AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    );
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
    if (artifactName == 'BlockRootRollupArtifact') {
      // TODO(#10323): temporarily force block root to use wasm while we simulate
      // the blob operations with an oracle. Appears to be no way to provide nativeACVM with a foreign call hander.
      simulationProvider = this.wasmSimulator;
    }
    const witness = await simulationProvider.simulateCircuit(witnessMap, SimulatedServerCircuitArtifacts[artifactName]);

    const result = convertOutput(witness);

    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(circuitName, timer.ms(), input.toBuffer().length, result.toBuffer().length, this.logger);
    await this.delay();
    return makePublicInputsAndRecursiveProof(result, makeRecursiveProof(proofLength), ProtocolCircuitVks[artifactName]);
  }
}
