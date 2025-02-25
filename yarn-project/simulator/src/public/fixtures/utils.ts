import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/circuits.js/gas';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  RollupValidationRequests,
} from '@aztec/circuits.js/kernel';
import { type PublicExecutionRequest, Tx } from '@aztec/circuits.js/tx';
import { BlockHeader, TxConstantData, TxContext } from '@aztec/circuits.js/tx';
import { DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';

/**
 * Craft a carrier transaction for some public calls for simulation by PublicTxSimulator.
 */
export async function createTxForPublicCalls(
  firstNullifier: Fr,
  setupExecutionRequests: PublicExecutionRequest[],
  appExecutionRequests: PublicExecutionRequest[],
  teardownExecutionRequest?: PublicExecutionRequest,
  feePayer = AztecAddress.zero(),
  gasUsedByPrivate: Gas = Gas.empty(),
): Promise<Tx> {
  assert(
    setupExecutionRequests.length > 0 || appExecutionRequests.length > 0 || teardownExecutionRequest !== undefined,
    "Can't create public tx with no enqueued calls",
  );
  const setupCallRequests = await Promise.all(setupExecutionRequests.map(er => er.toCallRequest()));
  const appCallRequests = await Promise.all(appExecutionRequests.map(er => er.toCallRequest()));
  // use max limits
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

  const forPublic = PartialPrivateTailPublicInputsForPublic.empty();
  // TODO(#9269): Remove this fake nullifier method as we move away from 1st nullifier as hash.
  forPublic.nonRevertibleAccumulatedData.nullifiers[0] = firstNullifier;

  // We reverse order because the simulator expects it to be like a "stack" of calls to pop from
  for (let i = setupCallRequests.length - 1; i >= 0; i--) {
    forPublic.nonRevertibleAccumulatedData.publicCallRequests[i] = setupCallRequests[i];
  }
  for (let i = appCallRequests.length - 1; i >= 0; i--) {
    forPublic.revertibleAccumulatedData.publicCallRequests[i] = appCallRequests[i];
  }
  if (teardownExecutionRequest) {
    forPublic.publicTeardownCallRequest = await teardownExecutionRequest.toCallRequest();
  }

  const maxFeesPerGas = feePayer.isZero() ? GasFees.empty() : new GasFees(10, 10);
  const teardownGasLimits = teardownExecutionRequest ? gasLimits : Gas.empty();
  const gasSettings = new GasSettings(gasLimits, teardownGasLimits, maxFeesPerGas, GasFees.empty());
  const txContext = new TxContext(Fr.zero(), Fr.zero(), gasSettings);
  const constantData = new TxConstantData(BlockHeader.empty(), txContext, Fr.zero(), Fr.zero());

  const txData = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    RollupValidationRequests.empty(),
    /*gasUsed=*/ gasUsedByPrivate,
    feePayer,
    forPublic,
  );
  const tx = Tx.newWithTxData(txData, teardownExecutionRequest);

  // Reverse order because the simulator expects it to be like a "stack" of calls to pop from.
  // Also push app calls before setup calls for this reason.
  for (let i = appExecutionRequests.length - 1; i >= 0; i--) {
    tx.enqueuedPublicFunctionCalls.push(appExecutionRequests[i]);
  }
  for (let i = setupExecutionRequests.length - 1; i >= 0; i--) {
    tx.enqueuedPublicFunctionCalls.push(setupExecutionRequests[i]);
  }

  return tx;
}
