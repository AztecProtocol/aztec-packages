import type { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector, countArgumentsSize, getAllFunctionAbis } from '@aztec/stdlib/abi';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';

/**
 * Builds an AllowedElement from a contract artifact, deriving both the function selector
 * and calldata length from the artifact instead of hardcoding signature strings.
 */
export async function buildAllowedElement(
  artifact: ContractArtifact,
  target: { address: AztecAddress } | { classId: Fr },
  functionName: string,
  opts?: { onlySelf?: boolean; rejectNullMsgSender?: boolean },
): Promise<AllowedElement> {
  const allFunctions = getAllFunctionAbis(artifact);
  const fn = allFunctions.find(f => f.name === functionName);
  if (!fn) {
    throw new Error(`Unknown function ${functionName} in artifact ${artifact.name}`);
  }
  const selector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
  const calldataLength = 1 + countArgumentsSize(fn);
  return {
    ...target,
    selector,
    calldataLength,
    ...(opts?.onlySelf ? { onlySelf: true } : {}),
    ...(opts?.rejectNullMsgSender ? { rejectNullMsgSender: true } : {}),
  } as AllowedElement;
}
