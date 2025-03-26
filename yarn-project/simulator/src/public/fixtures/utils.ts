import {
  CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS,
  DEFAULT_GAS_LIMIT,
  DEPLOYER_CONTRACT_ADDRESS,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  REGISTERER_CONTRACT_ADDRESS,
  REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import { DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG } from '@aztec/protocol-contracts';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { siloNullifier } from '@aztec/stdlib/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  PrivateKernelTailCircuitPublicInputs,
  RollupValidationRequests,
  ScopedLogHash,
  countAccumulatedItems,
} from '@aztec/stdlib/kernel';
import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  BlockHeader,
  HashedValues,
  PublicCallRequestWithCalldata,
  Tx,
  TxConstantData,
  TxContext,
} from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

/**
 * Craft a carrier transaction for some public calls for simulation by PublicTxSimulator.
 */
export function createTxForPublicCalls(
  firstNullifier: Fr,
  setupCallRequests: PublicCallRequestWithCalldata[],
  appCallRequests: PublicCallRequestWithCalldata[],
  teardownCallRequest?: PublicCallRequestWithCalldata,
  feePayer = AztecAddress.zero(),
  gasUsedByPrivate: Gas = Gas.empty(),
): Tx {
  assert(
    setupCallRequests.length > 0 || appCallRequests.length > 0 || teardownCallRequest !== undefined,
    "Can't create public tx with no enqueued calls",
  );
  // use max limits
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

  const forPublic = PartialPrivateTailPublicInputsForPublic.empty();
  // TODO(#9269): Remove this fake nullifier method as we move away from 1st nullifier as hash.
  forPublic.nonRevertibleAccumulatedData.nullifiers[0] = firstNullifier;

  // We reverse order because the simulator expects it to be like a "stack" of calls to pop from
  for (let i = setupCallRequests.length - 1; i >= 0; i--) {
    forPublic.nonRevertibleAccumulatedData.publicCallRequests[setupCallRequests.length - i - 1] =
      setupCallRequests[i].request;
  }
  for (let i = appCallRequests.length - 1; i >= 0; i--) {
    forPublic.revertibleAccumulatedData.publicCallRequests[appCallRequests.length - i - 1] = appCallRequests[i].request;
  }
  if (teardownCallRequest) {
    forPublic.publicTeardownCallRequest = teardownCallRequest.request;
  }

  const maxFeesPerGas = feePayer.isZero() ? GasFees.empty() : new GasFees(10, 10);
  const teardownGasLimits = teardownCallRequest ? gasLimits : Gas.empty();
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

  const calldata = [
    ...setupCallRequests,
    ...appCallRequests,
    ...(teardownCallRequest ? [teardownCallRequest] : []),
  ].map(r => new HashedValues(r.calldata, r.request.calldataHash));

  return new Tx(txData, ClientIvcProof.empty(), [], calldata);
}

export function createTxForPrivateOnly(feePayer = AztecAddress.zero(), gasUsedByPrivate: Gas = new Gas(10, 10)): Tx {
  // use max limits
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

  const forRollup = PartialPrivateTailPublicInputsForRollup.empty();

  const maxFeesPerGas = feePayer.isZero() ? GasFees.empty() : new GasFees(10, 10);
  const gasSettings = new GasSettings(gasLimits, Gas.empty(), maxFeesPerGas, GasFees.empty());
  const txContext = new TxContext(Fr.zero(), Fr.zero(), gasSettings);
  const constantData = new TxConstantData(BlockHeader.empty(), txContext, Fr.zero(), Fr.zero());

  const txData = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    RollupValidationRequests.empty(),
    /*gasUsed=*/ gasUsedByPrivate,
    feePayer,
    /*forPublic=*/ undefined,
    forRollup,
  );
  return new Tx(txData, ClientIvcProof.empty(), [], []);
}

export async function addNewContractClassToTx(
  tx: Tx,
  contractClass: ContractClassPublic,
  skipNullifierInsertion = false,
) {
  const contractClassLogFields = [
    new Fr(REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE),
    contractClass.id,
    new Fr(contractClass.version),
    new Fr(contractClass.artifactHash),
    new Fr(contractClass.privateFunctionsRoot),
    ...bufferAsFields(contractClass.packedBytecode, Math.ceil(contractClass.packedBytecode.length / 31) + 1),
  ];
  const contractClassLog = ContractClassLog.fromFields([
    new Fr(REGISTERER_CONTRACT_ADDRESS),
    ...contractClassLogFields.concat(
      new Array(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS - contractClassLogFields.length).fill(Fr.ZERO),
    ),
  ]);
  const contractClassLogHash = ScopedLogHash.fromFields([
    await contractClassLog.hash(),
    new Fr(7),
    new Fr(contractClassLog.getEmittedLength()),
    new Fr(REGISTERER_CONTRACT_ADDRESS),
  ]);

  const accumulatedData = tx.data.forPublic ? tx.data.forPublic!.revertibleAccumulatedData : tx.data.forRollup!.end;
  if (!skipNullifierInsertion) {
    const nextNullifierIndex = countAccumulatedItems(accumulatedData.nullifiers);
    accumulatedData.nullifiers[nextNullifierIndex] = contractClass.id;
  }

  const nextLogIndex = countAccumulatedItems(accumulatedData.contractClassLogsHashes);
  accumulatedData.contractClassLogsHashes[nextLogIndex] = contractClassLogHash;

  tx.contractClassLogs.push(contractClassLog);
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

  const accumulatedData = tx.data.forPublic ? tx.data.forPublic!.revertibleAccumulatedData : tx.data.forRollup!.end;
  if (!skipNullifierInsertion) {
    const nextNullifierIndex = countAccumulatedItems(accumulatedData.nullifiers);
    accumulatedData.nullifiers[nextNullifierIndex] = contractAddressNullifier;
  }

  const nextLogIndex = countAccumulatedItems(accumulatedData.privateLogs);
  accumulatedData.privateLogs[nextLogIndex] = contractInstanceLog;
}
