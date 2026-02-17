import {
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_PROTOCOL_CONTRACTS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AvmTxHint, type PublicTxResult } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { contractClassPublicFromPlainObject, contractInstanceWithAddressFromPlainObject } from '@aztec/stdlib/contract';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
} from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { MerkleTreeId, type MerkleTreeWriteOperations, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  HashedValues,
  ProtocolContracts,
  Tx,
  TxConstantData,
  TxContext,
  TxHash,
} from '@aztec/stdlib/tx';
import type { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../avm/fixtures/base_avm_simulation_tester.js';
import { SimpleContractDataSource } from '../fixtures/simple_contract_data_source.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';

/**
 * Request structure for fuzzer simulation communication from C++.
 * Matches the C++ FuzzerSimulationRequest struct
 */
export class FuzzerSimulationRequest {
  constructor(
    public readonly wsDataDir: string,
    public readonly wsMapSizeKb: number,
    public readonly tx: AvmTxHint,
    public readonly globals: GlobalVariables,
    public readonly contractClasses: any[], // Raw, processed by addContractClassFromCpp
    public readonly contractInstances: [any, any][], // Raw pairs [address, instance]
    public readonly publicDataWrites: any[], // Raw public data tree writes to apply before simulation
    public readonly noteHashes: any[], // Raw note hashes to apply before simulation
    public readonly protocolContracts: ProtocolContracts, // Protocol contracts mapping from C++
  ) {}

  static fromPlainObject(obj: any): FuzzerSimulationRequest {
    if (obj instanceof FuzzerSimulationRequest) {
      return obj;
    }
    return new FuzzerSimulationRequest(
      obj.wsDataDir,
      obj.wsMapSizeKb,
      AvmTxHint.fromPlainObject(obj.tx),
      GlobalVariables.fromPlainObject(obj.globals),
      obj.contractClasses,
      obj.contractInstances,
      obj.publicDataWrites ?? [],
      obj.noteHashes ?? [],
      ProtocolContracts.fromPlainObject(obj.protocolContracts),
    );
  }
}

/**
 * Creates a TypeScript Tx object from a deserialized C++ Tx (AvmTxHint-like structure).
 * This allows using PublicTxSimulator.simulate() with fuzzer-generated transactions.
 */
async function createTxFromHint(cppTx: AvmTxHint): Promise<Tx> {
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
    0n, // expirationTimestamp
    forPublic,
    undefined, // forRollup - not needed for public simulation
  );

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

/**
 * A simulator class for the AVM fuzzer that extends BaseAvmSimulationTester.
 * It provides methods for registering contracts from C++ msgpack data and simulating transactions.
 */
export class AvmFuzzerSimulator extends BaseAvmSimulationTester {
  private simulator: PublicTxSimulator;

  constructor(
    merkleTrees: MerkleTreeWriteOperations,
    contractDataSource: SimpleContractDataSource,
    globals: GlobalVariables,
    protocolContracts: ProtocolContracts,
  ) {
    super(contractDataSource, merkleTrees);
    const contractsDb = new PublicContractsDB(contractDataSource);
    this.simulator = new PublicTxSimulator(
      merkleTrees,
      contractsDb,
      globals,
      {
        skipFeeEnforcement: false,
        collectDebugLogs: false,
        collectHints: false,
        collectStatistics: false,
        collectCallMetadata: false,
      },
      protocolContracts,
    );
  }

  /**
   * Static factory method to create an AvmFuzzerSimulator.
   */
  public static async create(
    worldStateService: NativeWorldStateService,
    globals: GlobalVariables,
    protocolContracts: ProtocolContracts,
  ): Promise<AvmFuzzerSimulator> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();
    return new AvmFuzzerSimulator(merkleTrees, contractDataSource, globals, protocolContracts);
  }

  /**
   * Simulate a transaction from a C++ AvmTxHint.
   */
  public async simulate(txHint: AvmTxHint): Promise<PublicTxResult> {
    // Compute fee from gas limits and max fees per gas (upper bound on fee)
    const totalFee =
      BigInt(txHint.gasSettings.gasLimits.daGas) * txHint.gasSettings.maxFeesPerGas.feePerDaGas +
      BigInt(txHint.gasSettings.gasLimits.l2Gas) * txHint.gasSettings.maxFeesPerGas.feePerL2Gas;

    await this.setFeePayerBalance(txHint.feePayer, new Fr(totalFee));

    const tx = await createTxFromHint(txHint);
    return await this.simulator.simulate(tx);
  }

  /**
   * Add a contract class from C++ raw msgpack data.
   */
  public async addContractClassFromCpp(rawClass: any): Promise<void> {
    const contractClass = contractClassPublicFromPlainObject(rawClass);
    await this.contractDataSource.addContractClass(contractClass);
  }

  /**
   * Add a contract instance from C++ raw msgpack data.
   * This also inserts the contract address nullifier into the nullifier tree,
   * unless the address is a protocol canonical address (1-11).
   */
  public async addContractInstanceFromCpp(rawAddress: any, rawInstance: any): Promise<void> {
    const address = AztecAddress.fromPlainObject(rawAddress);
    const instance = contractInstanceWithAddressFromPlainObject(address, rawInstance);
    // Protocol canonical addresses (1-11) should not have nullifiers inserted
    const isProtocolCanonicalAddress = address.toBigInt() <= MAX_PROTOCOL_CONTRACTS && address.toBigInt() >= 1n;
    await this.addContractInstance(instance, /* skipNullifierInsertion */ isProtocolCanonicalAddress);
  }

  /**
   * Apply public data tree writes from C++ raw msgpack data.
   * This is used to pre-populate the public data tree before simulation (e.g., for bytecode upgrades).
   */
  public async applyPublicDataWrites(rawWrites: any[]): Promise<void> {
    for (const rawWrite of rawWrites) {
      const leaf = PublicDataTreeLeaf.fromPlainObject(rawWrite);
      await this.merkleTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [leaf.toBuffer()]);
    }
  }

  /**
   * Apply note hashes from C++ raw msgpack data.
   * This is used to pre-populate the note hash tree before simulation.
   */
  public async applyNoteHashes(rawNoteHashes: any[]): Promise<void> {
    const paddingLeaves = MAX_NOTE_HASHES_PER_TX - (rawNoteHashes.length % MAX_NOTE_HASHES_PER_TX);
    const paddedNoteHashes = [...rawNoteHashes, ...Array(paddingLeaves).fill(Fr.ZERO)];
    await this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, paddedNoteHashes);
  }
}
