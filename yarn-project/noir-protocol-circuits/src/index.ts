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
  private_kernel_init_circuit as PrivateKernelInitArtifact,
  private_kernel_inner_circuit as PrivateKernelInnerArtifact,
  private_kernel_ordering_circuit as PrivateKernelOrderingArtifact,
  public_kernel_private_previous_circuit as PublicKernelPrivatePreviousArtifact,
  public_kernel_public_previous_circuit as PublicKernelPublicPreviousArtifact,
  rollup_base as _executeBaseRollup,
  private_kernel_init as _executeInit,
  private_kernel_inner as _executeInner,
  rollup_merge as _executeMergeRollup,
  private_kernel_ordering as _executeOrdering,
  public_kernel_private_previous as _executePublicKernelPrivatePrevious,
  public_kernel_public_previous as _executePublicKernelPublicPrevious,
  rollup_root as _executeRootRollup,
} from './types/index.js';

export {
  PrivateKernelInitArtifact,
  PrivateKernelInnerArtifact,
  PrivateKernelOrderingArtifact,
  PublicKernelPrivatePreviousArtifact,
  PublicKernelPublicPreviousArtifact,
};

/**
 * Executes the init private kernel.
 * @param privateKernelInputsInit - The private kernel inputs.
 * @returns The public inputs.
 */
export async function executeInit(
  privateKernelInputsInit: PrivateKernelInputsInit,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPrivateKernelInputsInitToNoir(privateKernelInputsInit);

  const returnType = await _executeInit(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInputsInner - The private kernel inputs.
 * @returns The public inputs.
 */
export async function executeInner(
  privateKernelInputsInner: PrivateKernelInputsInner,
): Promise<KernelCircuitPublicInputs> {
  const params = mapPrivateKernelInputsInnerToNoir(privateKernelInputsInner);

  const returnType = await _executeInner(params);

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

  const returnType = await _executeOrdering(params);

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

  const returnType = await _executePublicKernelPrivatePrevious(params);

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

  const returnType = await _executePublicKernelPublicPrevious(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the root rollup.
 * @param rootRollupInputs - The root rollup inputs.
 * @returns The public inputs.
 */
export async function executeRootRollup(rootRollupInputs: RootRollupInputs): Promise<RootRollupPublicInputs> {
  const params = mapRootRollupInputsToNoir(rootRollupInputs);

  const returnType = await _executeRootRollup(params);

  return mapRootRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the merge rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeMergeRollup(mergeRollupInputs: MergeRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapMergeRollupInputsToNoir(mergeRollupInputs);

  const returnType = await _executeMergeRollup(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the base rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeBaseRollup(baseRollupInputs: BaseRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapBaseRollupInputsToNoir(baseRollupInputs);

  const returnType = await _executeBaseRollup(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}
