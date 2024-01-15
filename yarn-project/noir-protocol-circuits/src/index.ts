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
  private_kernel_init,
  private_kernel_inner,
  private_kernel_ordering,
  public_kernel_private_previous,
  public_kernel_public_previous,
  rollup_base,
  rollup_merge,
  rollup_root,
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

  const returnType = await private_kernel_init(params);

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

  const returnType = await private_kernel_inner(params);

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

  const returnType = await private_kernel_ordering(params);

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

  const returnType = await public_kernel_private_previous(params);

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

  const returnType = await public_kernel_public_previous(params);

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the root rollup.
 * @param rootRollupInputs - The root rollup inputs.
 * @returns The public inputs.
 */
export async function executeRootRollup(rootRollupInputs: RootRollupInputs): Promise<RootRollupPublicInputs> {
  const params = mapRootRollupInputsToNoir(rootRollupInputs);

  const returnType = await rollup_root(params);

  return mapRootRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the merge rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeMergeRollup(mergeRollupInputs: MergeRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapMergeRollupInputsToNoir(mergeRollupInputs);

  const returnType = await rollup_merge(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Executes the base rollup.
 * @param mergeRollupInputs - The merge rollup inputs.
 * @returns The public inputs.
 */
export async function executeBaseRollup(baseRollupInputs: BaseRollupInputs): Promise<BaseOrMergeRollupPublicInputs> {
  const params = mapBaseRollupInputsToNoir(baseRollupInputs);

  const returnType = await rollup_base(params);

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}
