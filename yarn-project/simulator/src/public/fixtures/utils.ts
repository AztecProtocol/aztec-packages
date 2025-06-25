import {
  DEFAULT_GAS_LIMIT,
  DEPLOYER_CONTRACT_ADDRESS,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  REGISTERER_CONTRACT_ADDRESS,
  REGISTERER_CONTRACT_CLASS_REGISTERED_MAGIC_VALUE,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG } from '@aztec/protocol-contracts';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { siloNullifier } from '@aztec/stdlib/hash';
import {
  LogHash,
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  PrivateKernelTailCircuitPublicInputs,
  RollupValidationRequests,
  countAccumulatedItems,
} from '@aztec/stdlib/kernel';
import { ContractClassLogFields, PrivateLog } from '@aztec/stdlib/logs';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  BlockHeader,
  GlobalVariables,
  HashedValues,
  PublicCallRequestWithCalldata,
  Tx,
  TxConstantData,
  TxContext,
} from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

export type TestPrivateInsertions = {
  revertible?: {
    nullifiers?: Fr[];
    noteHashes?: Fr[];
  };
  nonRevertible?: {
    nullifiers?: Fr[];
    noteHashes?: Fr[];
  };
};

/**
 * Craft a carrier transaction for some public calls for simulation by PublicTxSimulator.
 */
export function createTxForPublicCalls(
  privateInsertions: TestPrivateInsertions,
  setupCallRequests: PublicCallRequestWithCalldata[],
  appCallRequests: PublicCallRequestWithCalldata[],
  teardownCallRequest?: PublicCallRequestWithCalldata,
  feePayer = AztecAddress.zero(),
  gasUsedByPrivate: Gas = Gas.empty(),
  globals: GlobalVariables = GlobalVariables.empty(),
): Tx {
  assert(
    setupCallRequests.length > 0 || appCallRequests.length > 0 || teardownCallRequest !== undefined,
    "Can't create public tx with no enqueued calls",
  );
  // use max limits
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

  const forPublic = PartialPrivateTailPublicInputsForPublic.empty();

  // Non revertible private insertions
  if (!privateInsertions.nonRevertible?.nullifiers?.length) {
    throw new Error('At least one non-revertible nullifier is required');
  }

  for (let i = 0; i < privateInsertions.nonRevertible.nullifiers.length; i++) {
    assert(i < forPublic.nonRevertibleAccumulatedData.nullifiers.length, 'Nullifier index out of bounds');
    forPublic.nonRevertibleAccumulatedData.nullifiers[i] = privateInsertions.nonRevertible.nullifiers[i];
  }
  if (privateInsertions.nonRevertible.noteHashes) {
    for (let i = 0; i < privateInsertions.nonRevertible.noteHashes.length; i++) {
      assert(i < forPublic.nonRevertibleAccumulatedData.noteHashes.length, 'Note hash index out of bounds');
      forPublic.nonRevertibleAccumulatedData.noteHashes[i] = privateInsertions.nonRevertible.noteHashes[i];
    }
  }

  // Revertible private insertions
  if (privateInsertions.revertible) {
    if (privateInsertions.revertible.noteHashes) {
      for (let i = 0; i < privateInsertions.revertible.noteHashes.length; i++) {
        assert(i < forPublic.revertibleAccumulatedData.noteHashes.length, 'Note hash index out of bounds');
        forPublic.revertibleAccumulatedData.noteHashes[i] = privateInsertions.revertible.noteHashes[i];
      }
    }
    if (privateInsertions.revertible.nullifiers) {
      for (let i = 0; i < privateInsertions.revertible.nullifiers.length; i++) {
        assert(i < forPublic.revertibleAccumulatedData.nullifiers.length, 'Nullifier index out of bounds');
        forPublic.revertibleAccumulatedData.nullifiers[i] = privateInsertions.revertible.nullifiers[i];
      }
    }
  }

  for (let i = 0; i < setupCallRequests.length; i++) {
    forPublic.nonRevertibleAccumulatedData.publicCallRequests[i] = setupCallRequests[i].request;
  }
  for (let i = 0; i < appCallRequests.length; i++) {
    forPublic.revertibleAccumulatedData.publicCallRequests[i] = appCallRequests[i].request;
  }
  if (teardownCallRequest) {
    forPublic.publicTeardownCallRequest = teardownCallRequest.request;
  }

  const maxFeesPerGas = feePayer.isZero() ? GasFees.empty() : new GasFees(10, 10);
  const teardownGasLimits = teardownCallRequest ? gasLimits : Gas.empty();
  const gasSettings = new GasSettings(gasLimits, teardownGasLimits, maxFeesPerGas, GasFees.empty());
  const txContext = new TxContext(Fr.zero(), Fr.zero(), gasSettings);
  const header = BlockHeader.empty();
  header.globalVariables = globals;
  const constantData = new TxConstantData(header, txContext, Fr.zero(), Fr.zero());

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
  const contractAddress = new AztecAddress(new Fr(REGISTERER_CONTRACT_ADDRESS));
  const emittedLength = contractClassLogFields.length;
  const logFields = ContractClassLogFields.fromEmittedFields(contractClassLogFields);

  const contractClassLogHash = LogHash.from({
    value: await logFields.hash(),
    length: emittedLength,
  }).scope(contractAddress);

  const accumulatedData = tx.data.forPublic ? tx.data.forPublic!.revertibleAccumulatedData : tx.data.forRollup!.end;
  if (!skipNullifierInsertion) {
    const nextNullifierIndex = countAccumulatedItems(accumulatedData.nullifiers);
    accumulatedData.nullifiers[nextNullifierIndex] = contractClass.id;
  }

  const nextLogIndex = countAccumulatedItems(accumulatedData.contractClassLogsHashes);
  accumulatedData.contractClassLogsHashes[nextLogIndex] = contractClassLogHash;

  tx.contractClassLogFields.push(logFields);
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
  const logFields = [
    DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_TAG,
    contractInstance.address.toField(),
    new Fr(contractInstance.version),
    new Fr(contractInstance.salt),
    contractInstance.currentContractClassId,
    contractInstance.initializationHash,
    ...publicKeysAsFields,
    contractInstance.deployer.toField(),
  ];
  const contractInstanceLog = new PrivateLog(
    padArrayEnd(logFields, Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS),
    logFields.length,
  );

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
