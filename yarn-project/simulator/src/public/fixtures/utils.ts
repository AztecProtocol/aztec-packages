import { type PublicExecutionRequest, Tx, UnencryptedFunctionL2Logs, UnencryptedL2Log } from '@aztec/circuit-types';
import { bufferAsFields } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/circuits.js/contract';
import { Gas, GasFees, GasSettings } from '@aztec/circuits.js/gas';
import { siloNullifier } from '@aztec/circuits.js/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  RollupValidationRequests,
  ScopedLogHash,
  countAccumulatedItems,
} from '@aztec/circuits.js/kernel';
import { PrivateLog } from '@aztec/circuits.js/logs';
import { BlockHeader, TxConstantData, TxContext } from '@aztec/circuits.js/tx';
import {
  DEFAULT_GAS_LIMIT,
  DEPLOYER_CONTRACT_ADDRESS,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  REGISTERER_CONTRACT_ADDRESS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import {
  DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG,
  REGISTERER_CONTRACT_CLASS_REGISTERED_TAG,
} from '@aztec/protocol-contracts';

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

export function addNewContractClassToTx(tx: Tx, contractClass: ContractClassPublic, skipNullifierInsertion = false) {
  const contractClassLogFields = [
    REGISTERER_CONTRACT_CLASS_REGISTERED_TAG,
    contractClass.id,
    new Fr(contractClass.version),
    new Fr(contractClass.artifactHash),
    new Fr(contractClass.privateFunctionsRoot),
    ...bufferAsFields(contractClass.packedBytecode, Math.ceil(contractClass.packedBytecode.length / 31) + 1),
  ];
  const contractClassLogBuffer = Buffer.concat([
    ...contractClassLogFields.map(f => f.toBuffer()),
    contractClass.packedBytecode,
    Buffer.alloc(32 - (contractClass.packedBytecode.length % 32)),
  ]);
  const contractClassLog = new UnencryptedFunctionL2Logs([
    new UnencryptedL2Log(AztecAddress.fromNumber(REGISTERER_CONTRACT_ADDRESS), contractClassLogBuffer),
  ]);
  const contractClassLogHash = ScopedLogHash.fromFields([
    Fr.fromBuffer(contractClassLog.logs[0].hash()),
    new Fr(7),
    new Fr(contractClassLog.getKernelLength()),
    new Fr(REGISTERER_CONTRACT_ADDRESS),
  ]);

  if (!skipNullifierInsertion) {
    const nextNullifierIndex = countAccumulatedItems(tx.data.forPublic!.revertibleAccumulatedData.nullifiers);
    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[nextNullifierIndex] = contractClass.id;
  }

  const nextLogIndex = countAccumulatedItems(tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes);
  tx.data.forPublic!.revertibleAccumulatedData.contractClassLogsHashes[nextLogIndex] = contractClassLogHash;

  tx.contractClassLogs.addFunctionLogs([contractClassLog]);
}

export async function addNewContractInstanceToTx(
  tx: Tx,
  contractInstance: ContractInstanceWithAddress,
  skipNullifierInsertion = false,
) {
  // can't use publicKeys.toFields() because it includes isInfinite which
  // is not broadcast in such private logs
  const publicKeysAsFields = [
    contractInstance.publicKeys.masterNullifierPublicKey.x,
    contractInstance.publicKeys.masterNullifierPublicKey.y,
    contractInstance.publicKeys.masterIncomingViewingPublicKey.x,
    contractInstance.publicKeys.masterIncomingViewingPublicKey.y,
    contractInstance.publicKeys.masterOutgoingViewingPublicKey.x,
    contractInstance.publicKeys.masterOutgoingViewingPublicKey.y,
    contractInstance.publicKeys.masterTaggingPublicKey.x,
    contractInstance.publicKeys.masterTaggingPublicKey.y,
  ];
  const fields = [
    DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG,
    contractInstance.address.toField(),
    new Fr(contractInstance.version),
    new Fr(contractInstance.salt),
    contractInstance.currentContractClassId,
    contractInstance.initializationHash,
    ...publicKeysAsFields,
    contractInstance.deployer.toField(),
    new Fr(0),
    new Fr(0),
    new Fr(0),
  ];
  const contractInstanceLog = new PrivateLog(assertLength(fields, PRIVATE_LOG_SIZE_IN_FIELDS));

  const contractAddressNullifier = await siloNullifier(
    AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
    contractInstance.address.toField(),
  );

  if (!skipNullifierInsertion) {
    const nextNullifierIndex = countAccumulatedItems(tx.data.forPublic!.revertibleAccumulatedData.nullifiers);
    tx.data.forPublic!.revertibleAccumulatedData.nullifiers[nextNullifierIndex] = contractAddressNullifier;
  }

  const nextLogIndex = countAccumulatedItems(tx.data.forPublic!.revertibleAccumulatedData.privateLogs);
  tx.data.forPublic!.revertibleAccumulatedData.privateLogs[nextLogIndex] = contractInstanceLog;
}
