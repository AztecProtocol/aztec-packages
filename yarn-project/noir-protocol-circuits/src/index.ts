import {
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  KernelCircuitPublicInputs,
  KernelCircuitPublicInputsFinal,
  MergeRollupInputs,
  PrivateKernelInputsInit,
  PrivateKernelInputsInner,
  PrivateKernelInputsOrdering,
  PublicKernelInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';

import { WasmBlackBoxFunctionSolver, createBlackBoxSolver, executeCircuitWithBlackBoxSolver } from '@noir-lang/acvm_js';
import { Abi, abiDecode, abiEncode } from '@noir-lang/noirc_abi';
import { CompiledCircuit } from '@noir-lang/types';

import {
  mapBaseOrMergeRollupPublicInputsFromNoir,
  mapBaseRollupInputsToNoir,
  mapKernelCircuitPublicInputsFinalFromNoir,
  mapKernelCircuitPublicInputsFromNoir,
  mapMergeRollupInputsToNoir,
  mapPrivateKernelInputsInitToNoir,
  mapPrivateKernelInputsInnerToNoir,
  mapPrivateKernelInputsOrderingToNoir,
  mapPublicKernelInputs,
  mapRootRollupInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
} from './type_conversion.js';
import {
  BaseRollupInputs as BaseRollupInputType,
  BaseOrMergeRollupPublicInputs as BaseRollupReturnType,
  rollup_base_simulated_circuit as BaseRollupSimulatedJson,
  KernelCircuitPublicInputsFinal as FinalReturnType,
  PrivateKernelInputsInit as InitInputType,
  PrivateKernelInputsInner as InnerInputType,
  MergeRollupInputs as MergeRollupInputType,
  rollup_merge_circuit as MergeRollupJson,
  BaseOrMergeRollupPublicInputs as MergeRollupReturnType,
  PrivateKernelInputsOrdering as OrderingInputType,
  private_kernel_init_circuit as PrivateKernelInitJson,
  private_kernel_init_simulated_circuit as PrivateKernelInitSimulatedJson,
  private_kernel_inner_circuit as PrivateKernelInnerJson,
  private_kernel_inner_simulated_circuit as PrivateKernelInnerSimulatedJson,
  private_kernel_ordering_circuit as PrivateKernelOrderingJson,
  private_kernel_ordering_simulated_circuit as PrivateKernelOrderingSimulatedJson,
  public_kernel_private_previous_circuit as PublicKernelPrivatePreviousJson,
  public_kernel_private_previous_simulated_circuit as PublicKernelPrivatePreviousSimulatedJson,
  public_kernel_public_previous_circuit as PublicKernelPublicPreviousJson,
  public_kernel_public_previous_simulated_circuit as PublicKernelPublicPreviousSimulatedJson,
  PublicKernelPrivatePreviousInputs as PublicPrivatePreviousInputType,
  KernelCircuitPublicInputs as PublicPrivatePreviousReturnType,
  PublicKernelPublicPreviousInputs as PublicPublicPreviousInputType,
  KernelCircuitPublicInputs as PublicPublicPreviousReturnType,
  KernelCircuitPublicInputs as ReturnType,
  RootRollupInputs as RootRollupInputType,
  rollup_root_circuit as RootRollupJson,
  RootRollupPublicInputs as RootRollupReturnType,
} from './types/index.js';

// TODO(Tom): This should be exported from noirc_abi
/**
 * The decoded inputs from the circuit.
 */
export type DecodedInputs = {
  /**
   * The inputs to the circuit
   */
  inputs: Record<string, any>;
  /**
   * The return value of the circuit
   */
  return_value: any;
};

export const PrivateKernelInitArtifact = PrivateKernelInitJson as CompiledCircuit;

export const PrivateKernelInnerArtifact = PrivateKernelInnerJson as CompiledCircuit;

export const PrivateKernelOrderingArtifact = PrivateKernelOrderingJson as CompiledCircuit;

export const PublicKernelPrivatePreviousArtifact = PublicKernelPrivatePreviousJson as CompiledCircuit;

export const PublicKernelPublicPreviousArtifact = PublicKernelPublicPreviousJson as CompiledCircuit;

/**
 * Executes the init private kernel.
 * @param privateKernelInputsInit - The private kernel inputs.
 * @returns The public inputs.
 */
export async function executeInit(
  privateKernelInputsInit: PrivateKernelInputsInit,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPrivateKernelInputsInitToNoir(privateKernelInputsInit);

  const returnType = await executePrivateKernelInitWithACVM(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

let solver: Promise<WasmBlackBoxFunctionSolver>;

const getSolver = (): Promise<WasmBlackBoxFunctionSolver> => {
  if (!solver) {
    solver = createBlackBoxSolver();
  }
  return solver;
};

/**
 * Executes the inner private kernel.
 * @param privateKernelInputsInner - The private kernel inputs.
 * @returns The public inputs.
 */
export async function executeInner(
  privateKernelInputsInner: PrivateKernelInputsInner,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPrivateKernelInputsInnerToNoir(privateKernelInputsInner);

  const returnType = await executePrivateKernelInnerWithACVM(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInputsInit - The private kernel inputs.
 * @returns The public inputs.
 */
export async function executeOrdering(
  privateKernelInputsOrdering: PrivateKernelInputsOrdering,
): Promise<KernelCircuitPublicInputsFinal> {
  const params = mapPrivateKernelInputsOrderingToNoir(privateKernelInputsOrdering);

  const returnType = await executePrivateKernelOrderingWithACVM(params);

  return mapKernelCircuitPublicInputsFinalFromNoir(returnType);
}

/**
 * Executes the public kernel.
 * @param privateKernelInputsInit - The public kernel private inputs.
 * @returns The public inputs.
 */
export async function executePublicKernelPrivatePrevious(
  publicKernelPrivateInputs: PublicKernelInputs,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPublicKernelInputs(publicKernelPrivateInputs);

  const returnType = await executePublicKernelPrivatePreviousWithACVM(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner public kernel.
 * @param privateKernelInputsInit - The public kernel private inputs.
 * @returns The public inputs.
 */
export async function executePublicKernelPublicPrevious(
  publicKernelPrivateInputs: PublicKernelInputs,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPublicKernelInputs(publicKernelPrivateInputs);

  const returnType = await executePublicKernelPublicPreviousWithACVM(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the root rollup.
 * @param rootRollupInputs - The root rollup inputs.
 * @returns The public inputs.
 */
export async function executeRootRollup(rootRollupInputs: RootRollupInputs): Promise<RootRollupPublicInputs> {
  const params = mapRootRollupInputsToNoir(rootRollupInputs);

  const returnType = await executeRootRollupWithACVM(params);

  return mapRootRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the merge rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeMergeRollup(mergeRollupInputs: MergeRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapMergeRollupInputsToNoir(mergeRollupInputs);

  const returnType = await executeMergeRollupWithACVM(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the base rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeBaseRollup(baseRollupInputs: BaseRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapBaseRollupInputsToNoir(baseRollupInputs);

  const returnType = await executeBaseRollupWithACVM(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the init private kernel with the given inputs using the acvm.
 *
 */
async function executePrivateKernelInitWithACVM(input: InitInputType): Promise<ReturnType> {
  const initialWitnessMap = abiEncode(PrivateKernelInitSimulatedJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(PrivateKernelInitSimulatedJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(PrivateKernelInitSimulatedJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as ReturnType;
}

/**
 * Executes the inner private kernel with the given inputs using the acvm.
 */
async function executePrivateKernelInnerWithACVM(input: InnerInputType): Promise<ReturnType> {
  const initialWitnessMap = abiEncode(PrivateKernelInnerSimulatedJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(PrivateKernelInnerSimulatedJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(PrivateKernelInnerSimulatedJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as ReturnType;
}

/**
 * Executes the ordering private kernel with the given inputs using the acvm.
 */
async function executePrivateKernelOrderingWithACVM(input: OrderingInputType): Promise<FinalReturnType> {
  const initialWitnessMap = abiEncode(PrivateKernelOrderingSimulatedJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(PrivateKernelOrderingSimulatedJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(PrivateKernelOrderingSimulatedJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as FinalReturnType;
}

/**
 * Executes the public kernel with private prevoius kernel with the given inputs
 */
async function executePublicKernelPrivatePreviousWithACVM(
  input: PublicPrivatePreviousInputType,
): Promise<PublicPrivatePreviousReturnType> {
  const initialWitnessMap = abiEncode(PublicKernelPrivatePreviousSimulatedJson.abi as Abi, { inputs: input });
  const decodedBytecode = Buffer.from(PublicKernelPrivatePreviousSimulatedJson.bytecode, 'base64');
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(PublicKernelPrivatePreviousSimulatedJson.abi as Abi, _witnessMap);
  // Cast the inputs as the return type
  return decodedInputs.return_value as PublicPrivatePreviousReturnType;
}

/**
 * Executes the ordering private kernel with the given inputs using the acvm.
 */
async function executePublicKernelPublicPreviousWithACVM(
  input: PublicPublicPreviousInputType,
): Promise<PublicPublicPreviousReturnType> {
  const initialWitnessMap = abiEncode(PublicKernelPublicPreviousSimulatedJson.abi as Abi, { inputs: input });
  const decodedBytecode = Buffer.from(PublicKernelPublicPreviousSimulatedJson.bytecode, 'base64');
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(PublicKernelPublicPreviousSimulatedJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as PublicPublicPreviousReturnType;
}

/**
 * Executes the root rollup with the given inputs using the acvm.
 */
async function executeRootRollupWithACVM(input: RootRollupInputType): Promise<RootRollupReturnType> {
  const initialWitnessMap = abiEncode(RootRollupJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(RootRollupJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  const decodedInputs: DecodedInputs = abiDecode(RootRollupJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as RootRollupReturnType;
}

/**
 * Executes the merge rollup with the given inputs using the acvm.
 */
async function executeMergeRollupWithACVM(input: MergeRollupInputType): Promise<MergeRollupReturnType> {
  const initialWitnessMap = abiEncode(MergeRollupJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(MergeRollupJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  const decodedInputs: DecodedInputs = abiDecode(MergeRollupJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as MergeRollupReturnType;
}

/**
 * Executes the base rollup with the given inputs using the acvm.
 */
async function executeBaseRollupWithACVM(input: BaseRollupInputType): Promise<BaseRollupReturnType> {
  const initialWitnessMap = abiEncode(BaseRollupSimulatedJson.abi as Abi, { inputs: input });

  // Execute the circuit on those initial witness values
  //
  // Decode the bytecode from base64 since the acvm does not know about base64 encoding
  const decodedBytecode = Buffer.from(BaseRollupSimulatedJson.bytecode, 'base64');
  //
  // Execute the circuit
  const _witnessMap = await executeCircuitWithBlackBoxSolver(
    await getSolver(),
    decodedBytecode,
    initialWitnessMap,
    () => {
      throw Error('unexpected oracle during execution');
    },
  );

  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(BaseRollupSimulatedJson.abi as Abi, _witnessMap);

  // Cast the inputs as the return type
  return decodedInputs.return_value as BaseRollupReturnType;
}
