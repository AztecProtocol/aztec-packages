import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
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
  convertBaseParityInputsToWitnessMap,
  convertBaseParityOutputsFromWitnessMap,
  convertBlockMergeRollupInputsToWitnessMap,
  convertBlockMergeRollupOutputsFromWitnessMap,
  convertEmptyBlockRootRollupInputsToWitnessMap,
  convertEmptyBlockRootRollupOutputsFromWitnessMap,
  convertMergeRollupInputsToWitnessMap,
  convertMergeRollupOutputsFromWitnessMap,
  convertPaddingBlockRootRollupInputsToWitnessMap,
  convertPaddingBlockRootRollupOutputsFromWitnessMap,
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
  foreignCallHandler,
  getSimulatedServerCircuitArtifact,
} from '@aztec/noir-protocol-circuits-types/server';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
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
import type { BaseParityInputs, ParityPublicInputs, RootParityInputs } from '@aztec/stdlib/parity';
import { type Proof, ProvingRequestType, makeEmptyRecursiveProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import type {
  BaseOrMergeRollupPublicInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PaddingBlockRootRollupInputs,
  PrivateBaseRollupInputs,
  PublicBaseRollupInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  SingleTxBlockRootRollupInputs,
  TubeInputs,
} from '@aztec/stdlib/rollup';
import { VerificationKeyData } from '@aztec/stdlib/vks';
import { type TelemetryClient, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

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

  @trackSpan('TestCircuitProver.getPaddingBlockRootRollupProof')
  public getPaddingBlockRootRollupProof(
    input: PaddingBlockRootRollupInputs,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.applyDelay(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, () =>
      this.simulate(
        input,
        'PaddingBlockRootRollupArtifact',
        NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        convertPaddingBlockRootRollupInputsToWitnessMap,
        convertPaddingBlockRootRollupOutputsFromWitnessMap,
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
    convertInput: (input: CircuitInputType) => WitnessMap,
    convertOutput: (outputWitness: WitnessMap) => CircuitOutputType,
  ) {
    const timer = new Timer();
    const witnessMap = convertInput(input);
    const circuitName = mapProtocolArtifactNameToCircuitName(artifactName);

    let witness: WitnessMap;
    if (
      ['BlockRootRollupArtifact', 'SingleTxBlockRootRollupArtifact'].includes(artifactName) ||
      this.simulator == undefined
    ) {
      // TODO(#10323): Native ACVM simulator does not support foreign call handler so we use the wasm simulator
      // when simulating block root rollup and single tx block root rollup circuits or when the native ACVM simulator
      // is not provided.
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

    const result = convertOutput(witness);

    this.instrumentation.recordDuration('simulationDuration', circuitName, timer);
    emitCircuitSimulationStats(circuitName, timer.ms(), input.toBuffer().length, result.toBuffer().length, this.logger);
    return makePublicInputsAndRecursiveProof(result, makeRecursiveProof(proofLength), ProtocolCircuitVks[artifactName]);
  }
}
