import type { Fr } from '@aztec/foundation/fields';

import type { AvmContext } from './avm_context.js';
import { type AvmExecutionError, AvmRevertReason } from './errors.js';

async function createRevertReason(message: string, revertData: Fr[], context: AvmContext): Promise<AvmRevertReason> {
  // We drop the returnPc information.
  const internalCallStack = context.machineState.internalCallStack.map(entry => entry.callPc);

  // If we are reverting due to the same error that we have been tracking, we use the nested error as the cause.
  let nestedError = undefined;
  const revertDataEquals = (a: Fr[], b: Fr[]) => a.length === b.length && a.every((v, i) => v.equals(b[i]));
  if (
    context.machineState.collectedRevertInfo &&
    revertDataEquals(context.machineState.collectedRevertInfo.revertDataRepresentative, revertData)
  ) {
    nestedError = context.machineState.collectedRevertInfo.recursiveRevertReason;
    message = context.machineState.collectedRevertInfo.recursiveRevertReason.message;
  }

  const fnName = await context.persistableState.getPublicFunctionDebugName(context.environment);

  return new AvmRevertReason(
    message,
    /*failingFunction=*/ {
      contractAddress: context.environment.address,
      functionName: fnName,
    },
    /*noirCallStack=*/ [...internalCallStack, context.machineState.pc].map(pc => `0.${pc}`),
    /*options=*/ { cause: nestedError },
  );
}

/**
 * Create a "revert reason" error for an exceptional halt.
 *
 * @param haltingError - the lower-level error causing the exceptional halt
 * @param context - the context of the AVM execution used to extract the failingFunction and noirCallStack
 */
export async function revertReasonFromExceptionalHalt(
  haltingError: AvmExecutionError,
  context: AvmContext,
): Promise<AvmRevertReason> {
  return await createRevertReason(haltingError.message, [], context);
}

/**
 * Create a "revert reason" error for an explicit revert (a root cause).
 *
 * @param revertData - output data of the explicit REVERT instruction
 * @param context - the context of the AVM execution used to extract the failingFunction and noirCallStack
 */
export async function revertReasonFromExplicitRevert(revertData: Fr[], context: AvmContext): Promise<AvmRevertReason> {
  return await createRevertReason('Assertion failed: ', revertData, context);
}
