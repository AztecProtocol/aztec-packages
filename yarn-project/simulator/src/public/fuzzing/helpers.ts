import {
  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { AvmTxHint } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNullifier } from '@aztec/stdlib/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
} from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { BlockHeader, HashedValues, Tx, TxConstantData, TxContext, TxHash } from '@aztec/stdlib/tx';

// Registers a contract by inserting its address nullifier into the nullifier tree
export async function registerContract(
  merkleTrees: MerkleTreeWriteOperations,
  contractAddress: AztecAddress,
): Promise<void> {
  const contractAddressNullifier = await siloNullifier(
    AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
    contractAddress.toField(),
  );
  await merkleTrees.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()]);
}

/**
 * Creates a TypeScript Tx object from a deserialized C++ Tx (AvmTxHint-like structure).
 * This allows using PublicTxSimulator.simulate() with fuzzer-generated transactions.
 *
 * @param cppTx - Deserialized C++ Tx from msgpack (matches AvmTxHint structure)
 * @returns A TypeScript Tx suitable for PublicTxSimulator
 */
export async function createFuzzerTx(cppTx: AvmTxHint): Promise<Tx> {
  // Create TxHash from the C++ tx hash string
  if (!cppTx.hash) {
    throw new Error(`cppTx.hash is undefined. Keys: ${Object.keys(cppTx || {}).join(', ')}`);
  }
  const txHash = TxHash.fromString(cppTx.hash);

  // Extract PublicCallRequest instances from enqueued calls
  const setupCallRequests = cppTx.setupEnqueuedCalls.map(call => call.request);
  const paddedSetupCalls = padArrayEnd(setupCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX);

  const appLogicCallRequests = cppTx.appLogicEnqueuedCalls.map(call => call.request);
  const paddedAppLogicCalls = padArrayEnd(appLogicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX);

  // Build non-revertible accumulated data from C++ tx
  const emptyNonRevertible = PrivateToPublicAccumulatedData.empty();
  const nonRevertibleAccumulatedData = new PrivateToPublicAccumulatedData(
    padArrayEnd(cppTx.nonRevertibleAccumulatedData.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    padArrayEnd(cppTx.nonRevertibleAccumulatedData.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
    padArrayEnd(
      cppTx.nonRevertibleAccumulatedData.l2ToL1Messages,
      ScopedL2ToL1Message.empty(),
      MAX_L2_TO_L1_MSGS_PER_TX,
    ),
    padArrayEnd(cppTx.nonRevertibleContractDeploymentData.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
    emptyNonRevertible.contractClassLogsHashes,
    paddedSetupCalls,
  );

  // Build revertible accumulated data from C++ tx
  const emptyRevertible = PrivateToPublicAccumulatedData.empty();
  const revertibleAccumulatedData = new PrivateToPublicAccumulatedData(
    padArrayEnd(cppTx.revertibleAccumulatedData.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    padArrayEnd(cppTx.revertibleAccumulatedData.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
    padArrayEnd(cppTx.revertibleAccumulatedData.l2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
    padArrayEnd(cppTx.revertibleContractDeploymentData.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
    emptyRevertible.contractClassLogsHashes,
    paddedAppLogicCalls,
  );

  // Build teardown call request (if exists)
  const teardownCallRequest = cppTx.teardownEnqueuedCall?.request ?? PublicCallRequest.empty();

  // Create forPublic structure
  const forPublic = new PartialPrivateTailPublicInputsForPublic(
    nonRevertibleAccumulatedData,
    revertibleAccumulatedData,
    teardownCallRequest,
  );

  // Build TxContext - gasSettings is already a proper GasSettings after AvmTxHint.fromPlainObject
  const txContext = new TxContext(
    Fr.ZERO, // chainId - this is fine because simulation actually reads from globalVariables not here
    Fr.ZERO, // version - this is fine because simulation actually reads from globalVariables not here
    cppTx.gasSettings,
  );

  // Build TxConstantData
  const constants = new TxConstantData(
    BlockHeader.empty(), // anchorBlockHeader (unused in simulation)
    txContext,
    Fr.ZERO, // vkTreeRoot - not needed for public simulation
    Fr.ZERO, // protocolContractsHash - not needed for public simulation
  );

  const data = new PrivateKernelTailCircuitPublicInputs(
    constants,
    cppTx.gasUsedByPrivate,
    cppTx.feePayer,
    0n, // includeByTimestamp
    forPublic,
    undefined, // forRollup - not needed for public simulation
  );

  // todo(ilyas): I don't think we need to construct this, but keeping for now - the hashing could get costly with
  // large number of enqueued calls or large calldata so keep an eye on this!
  // Build publicFunctionCalldata from all enqueued calls
  // Calldata is already Fr[] after AvmTxHint.fromPlainObject
  const publicFunctionCalldata: HashedValues[] = [];

  // Add setup calls
  for (const call of cppTx.setupEnqueuedCalls || []) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(call.calldata));
  }

  // Add app logic calls
  for (const call of cppTx.appLogicEnqueuedCalls || []) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(call.calldata));
  }

  // Add teardown call if present
  if (cppTx.teardownEnqueuedCall) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(cppTx.teardownEnqueuedCall.calldata));
  }

  // Extract contract class log fields from ContractDeploymentData
  const contractClassLogFields = [
    ...cppTx.nonRevertibleContractDeploymentData.contractClassLogs.map(log => log.fields),
    ...cppTx.revertibleContractDeploymentData.contractClassLogs.map(log => log.fields),
  ];

  // Create the Tx
  return new Tx(
    txHash,
    data,
    ChonkProof.empty(), // No real proof needed for simulation
    contractClassLogFields,
    publicFunctionCalldata,
  );
}
