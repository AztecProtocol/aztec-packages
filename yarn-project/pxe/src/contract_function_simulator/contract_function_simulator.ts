import {
  AVM_EMITNOTEHASH_BASE_L2_GAS,
  AVM_EMITNULLIFIER_BASE_L2_GAS,
  AVM_SENDL2TOL1MSG_BASE_L2_GAS,
  DA_GAS_PER_FIELD,
  FIXED_AVM_STARTUP_L2_GAS,
  FIXED_DA_GAS,
  FIXED_L2_GAS,
  L2_GAS_PER_CONTRACT_CLASS_LOG,
  L2_GAS_PER_L2_TO_L1_MSG,
  L2_GAS_PER_NOTE_HASH,
  L2_GAS_PER_NULLIFIER,
  L2_GAS_PER_PRIVATE_LOG,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { arrayNonEmptyLength, padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { KeyStore } from '@aztec/key-store';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import {
  type CircuitSimulator,
  ExecutionError,
  createSimulationError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import type { FunctionCall } from '@aztec/stdlib/abi';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter } from '@aztec/stdlib/block';
import { Gas } from '@aztec/stdlib/gas';
import {
  computeNoteHashNonce,
  computeProtocolNullifier,
  computeSiloedPrivateLogFirstField,
  computeUniqueNoteHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  ClaimedLengthArray,
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  type PrivateExecutionStep,
  type PrivateKernelExecutionProofOutput,
  PrivateKernelTailCircuitPublicInputs,
  PrivateLogData,
  PrivateToPublicAccumulatedData,
  PrivateToRollupAccumulatedData,
  PublicCallRequest,
  ReadRequestActionEnum,
  ScopedLogHash,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedReadRequest,
  buildTransientDataHints,
  getNoteHashReadRequestResetActions,
  getNullifierReadRequestResetActions,
} from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { ChonkProof } from '@aztec/stdlib/proofs';
import {
  BlockHeader,
  CallContext,
  HashedValues,
  PrivateExecutionResult,
  TxConstantData,
  TxExecutionRequest,
  collectNested,
  collectNoteHashNullifierCounterMap,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/stdlib/tx';

import type { AccessScopes } from '../access_scopes.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import type { AddressStore } from '../storage/address_store/address_store.js';
import type { CapsuleStore } from '../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { NoteStore } from '../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../storage/tagging_store/sender_tagging_store.js';
import type { BenchmarkedNode } from './benchmarked_node.js';
import { ExecutionNoteCache } from './execution_note_cache.js';
import { ExecutionTaggingIndexCache } from './execution_tagging_index_cache.js';
import { HashedValuesCache } from './hashed_values_cache.js';
import { Oracle } from './oracle/oracle.js';
import { executePrivateFunction } from './oracle/private_execution.js';
import { PrivateExecutionOracle } from './oracle/private_execution_oracle.js';
import { UtilityExecutionOracle } from './oracle/utility_execution_oracle.js';

/** Options for ContractFunctionSimulator.run. */
export type ContractSimulatorRunOpts = {
  /** The address of the contract (should match request.origin). */
  contractAddress: AztecAddress;
  /** The function selector of the entry point. */
  selector: FunctionSelector;
  /** The address calling the function. Can be replaced to simulate a call from another contract or account. */
  msgSender?: AztecAddress;
  /** The block header to use as base state for this run. */
  anchorBlockHeader: BlockHeader;
  /** The address used as a tagging sender when emitting private logs. */
  senderForTags?: AztecAddress;
  /** The accounts whose notes we can access in this call. */
  scopes: AccessScopes;
  /** The job ID for staged writes. */
  jobId: string;
};

/** Args for ContractFunctionSimulator constructor. */
export type ContractFunctionSimulatorArgs = {
  contractStore: ContractStore;
  noteStore: NoteStore;
  keyStore: KeyStore;
  addressStore: AddressStore;
  aztecNode: AztecNode;
  senderTaggingStore: SenderTaggingStore;
  recipientTaggingStore: RecipientTaggingStore;
  senderAddressBookStore: SenderAddressBookStore;
  capsuleStore: CapsuleStore;
  privateEventStore: PrivateEventStore;
  simulator: CircuitSimulator;
  contractSyncService: ContractSyncService;
};

/**
 * The contract function simulator.
 */
export class ContractFunctionSimulator {
  private readonly log: Logger;
  private readonly contractStore: ContractStore;
  private readonly noteStore: NoteStore;
  private readonly keyStore: KeyStore;
  private readonly addressStore: AddressStore;
  private readonly aztecNode: AztecNode;
  private readonly senderTaggingStore: SenderTaggingStore;
  private readonly recipientTaggingStore: RecipientTaggingStore;
  private readonly senderAddressBookStore: SenderAddressBookStore;
  private readonly capsuleStore: CapsuleStore;
  private readonly privateEventStore: PrivateEventStore;
  private readonly simulator: CircuitSimulator;
  private readonly contractSyncService: ContractSyncService;

  constructor(args: ContractFunctionSimulatorArgs) {
    this.contractStore = args.contractStore;
    this.noteStore = args.noteStore;
    this.keyStore = args.keyStore;
    this.addressStore = args.addressStore;
    this.aztecNode = args.aztecNode;
    this.senderTaggingStore = args.senderTaggingStore;
    this.recipientTaggingStore = args.recipientTaggingStore;
    this.senderAddressBookStore = args.senderAddressBookStore;
    this.capsuleStore = args.capsuleStore;
    this.privateEventStore = args.privateEventStore;
    this.simulator = args.simulator;
    this.contractSyncService = args.contractSyncService;
    this.log = createLogger('simulator');
  }

  /**
   * Runs a private function.
   * @param request - The transaction request.
   */
  public async run(
    request: TxExecutionRequest,
    {
      contractAddress,
      selector,
      msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
      anchorBlockHeader,
      senderForTags,
      scopes,
      jobId,
    }: ContractSimulatorRunOpts,
  ): Promise<PrivateExecutionResult> {
    const simulatorSetupTimer = new Timer();

    const entryPointArtifact = await this.contractStore.getFunctionArtifactWithDebugMetadata(contractAddress, selector);

    if (entryPointArtifact.functionType !== FunctionType.PRIVATE) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as private`);
    }

    if (request.origin !== contractAddress) {
      this.log.warn(
        `Request origin does not match contract address in simulation. Request origin: ${request.origin}, contract address: ${contractAddress}`,
      );
    }

    // reserve the first side effect for the tx hash (inserted by the private kernel)
    const startSideEffectCounter = 2;

    const callContext = new CallContext(
      msgSender,
      contractAddress,
      await FunctionSelector.fromNameAndParameters(entryPointArtifact.name, entryPointArtifact.parameters),
      entryPointArtifact.isStatic,
    );

    const protocolNullifier = await computeProtocolNullifier(await request.toTxRequest().hash());
    const noteCache = new ExecutionNoteCache(protocolNullifier);
    const taggingIndexCache = new ExecutionTaggingIndexCache();

    const privateExecutionOracle = new PrivateExecutionOracle({
      argsHash: request.firstCallArgsHash,
      txContext: request.txContext,
      callContext,
      anchorBlockHeader,
      utilityExecutor: async (call, execScopes) => {
        await this.runUtility(call, [], anchorBlockHeader, execScopes, jobId);
      },
      authWitnesses: request.authWitnesses,
      capsules: request.capsules,
      executionCache: HashedValuesCache.create(request.argsOfCalls),
      noteCache,
      taggingIndexCache,
      contractStore: this.contractStore,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.aztecNode,
      senderTaggingStore: this.senderTaggingStore,
      recipientTaggingStore: this.recipientTaggingStore,
      senderAddressBookStore: this.senderAddressBookStore,
      capsuleStore: this.capsuleStore,
      privateEventStore: this.privateEventStore,
      contractSyncService: this.contractSyncService,
      jobId,
      totalPublicCalldataCount: 0,
      sideEffectCounter: startSideEffectCounter,
      scopes,
      senderForTags,
      simulator: this.simulator,
    });

    const setupTime = simulatorSetupTimer.ms();

    try {
      // Note: any nested private function calls are made recursively within this
      // function call. So this execution result is the result of executing _all_
      // private functions of this tx (the results of those executions are contained
      // within executionResult.nestedExecutionResults).
      const executionResult = await executePrivateFunction(
        this.simulator,
        privateExecutionOracle,
        entryPointArtifact,
        contractAddress,
        request.functionSelector,
      );
      const simulatorTeardownTimer = new Timer();

      noteCache.finish();
      const firstNullifierHint = noteCache.getNonceGenerator();

      const publicCallRequests = collectNested([executionResult], r =>
        r.publicInputs.publicCallRequests
          .getActiveItems()
          .map(r => r.inner)
          .concat(r.publicInputs.publicTeardownCallRequest.isEmpty() ? [] : [r.publicInputs.publicTeardownCallRequest]),
      );
      const publicFunctionsCalldata = await Promise.all(
        publicCallRequests.map(async r => {
          const calldata = await privateExecutionOracle.privateLoadFromExecutionCache(r.calldataHash);
          return new HashedValues(calldata, r.calldataHash);
        }),
      );

      const teardownTime = simulatorTeardownTimer.ms();

      // Add simulator overhead to topmost call in the stack
      if (executionResult.profileResult) {
        executionResult.profileResult.timings.witgen += setupTime + teardownTime;
      }

      // Not to be confused with a PrivateCallExecutionResult. This is a superset
      // of the PrivateCallExecutionResult, containing also firstNullifierHint
      // and publicFunctionsCalldata.
      return new PrivateExecutionResult(executionResult, firstNullifierHint, publicFunctionsCalldata);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }

  // docs:start:execute_utility_function
  /**
   * Runs a utility function.
   * @param call - The function call to execute.
   * @param authwits - Authentication witnesses required for the function call.
   * @param anchorBlockHeader - The block header to use as base state for this run.
   * @param scopes - Optional array of account addresses whose notes can be accessed in this call. Defaults to all
   * accounts if not specified.
   * @returns A return value of the utility function in a form as returned by the simulator (Noir fields)
   */
  public async runUtility(
    call: FunctionCall,
    authwits: AuthWitness[],
    anchorBlockHeader: BlockHeader,
    scopes: AccessScopes,
    jobId: string,
  ): Promise<Fr[]> {
    const entryPointArtifact = await this.contractStore.getFunctionArtifactWithDebugMetadata(call.to, call.selector);

    if (entryPointArtifact.functionType !== FunctionType.UTILITY) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as utility`);
    }

    const oracle = new UtilityExecutionOracle({
      contractAddress: call.to,
      authWitnesses: authwits,
      capsules: [],
      anchorBlockHeader,
      contractStore: this.contractStore,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.aztecNode,
      recipientTaggingStore: this.recipientTaggingStore,
      senderAddressBookStore: this.senderAddressBookStore,
      capsuleStore: this.capsuleStore,
      privateEventStore: this.privateEventStore,
      jobId,
      scopes,
    });

    try {
      this.log.verbose(`Executing utility function ${entryPointArtifact.name}`, {
        contract: call.to,
        selector: call.selector,
      });

      const initialWitness = toACVMWitness(0, call.args);
      const acirExecutionResult = await this.simulator
        .executeUserCircuit(initialWitness, entryPointArtifact, new Oracle(oracle).toACIRCallback())
        .catch((err: Error) => {
          err.message = resolveAssertionMessageFromError(err, entryPointArtifact);
          throw new ExecutionError(
            err.message,
            {
              contractAddress: call.to,
              functionSelector: call.selector,
            },
            extractCallStack(err, entryPointArtifact.debug),
            { cause: err },
          );
        });

      this.log.verbose(`Utility simulation for ${call.to}.${call.selector} completed`);
      return witnessMapToFields(acirExecutionResult.returnWitness);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }
  // docs:end:execute_utility_function

  /**
   * Returns the execution statistics collected during the simulator run.
   * @returns The execution statistics.
   */
  getStats() {
    const nodeRPCCalls =
      typeof (this.aztecNode as BenchmarkedNode).getStats === 'function'
        ? (this.aztecNode as BenchmarkedNode).getStats()
        : {
            perMethod: {},
            roundTrips: { roundTrips: 0, totalBlockingTime: 0, roundTripDurations: [], roundTripMethods: [] },
          };

    return { nodeRPCCalls };
  }
}

class OrderedSideEffect<T> {
  sideEffect: T;
  counter: number;

  constructor(sideEffect: T, counter: number) {
    this.sideEffect = sideEffect;
    this.counter = counter;
  }
}

/**
 * Generates the final public inputs of the tail kernel circuit, an empty Chonk proof
 * and the execution steps for a `PrivateExecutionResult` as if it had been
 * processed by the private kernel prover. This skips many of the checks performed by the kernels
 * (allowing state overrides) and is much faster, while still generating a valid
 * output that can be sent to the node for public simulation
 * @param privateExecutionResult - The result of the private execution.
 * @param debugFunctionNameGetter - A provider for contract data in order to get function names and debug info.
 * @param node - AztecNode for verifying settled read requests against the note hash and nullifier trees.
 * @param minRevertibleSideEffectCounterOverride - Optional override for the min revertible side effect counter.
 * Used by TXE to simulate account contract behavior (setting the counter before app execution).
 * @returns The simulated proving result.
 */
export async function generateSimulatedProvingResult(
  privateExecutionResult: PrivateExecutionResult,
  debugFunctionNameGetter: (contractAddress: AztecAddress, functionSelector: FunctionSelector) => Promise<string>,
  node: AztecNode,
  minRevertibleSideEffectCounterOverride?: number,
): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
  const taggedPrivateLogs: OrderedSideEffect<PrivateLogData>[] = [];
  const l2ToL1Messages: OrderedSideEffect<ScopedL2ToL1Message>[] = [];
  const contractClassLogsHashes: OrderedSideEffect<ScopedLogHash>[] = [];
  const publicCallRequests: OrderedSideEffect<PublicCallRequest>[] = [];
  const executionSteps: PrivateExecutionStep[] = [];

  // Unsiloed scoped arrays — used for squashing, read request verification,
  // and siloed at the end only for the surviving items
  const scopedNoteHashes: ScopedNoteHash[] = [];
  const scopedNullifiers: ScopedNullifier[] = [];

  // Read requests for verification
  const noteHashReadRequests: ScopedReadRequest[] = [];
  const nullifierReadRequests: ScopedReadRequest[] = [];

  let publicTeardownCallRequest;

  const executions = [privateExecutionResult.entrypoint];

  while (executions.length !== 0) {
    const execution = executions.shift()!;
    executions.unshift(...execution!.nestedExecutionResults);

    const { contractAddress } = execution.publicInputs.callContext;

    scopedNoteHashes.push(
      ...execution.publicInputs.noteHashes
        .getActiveItems()
        .filter(nh => !nh.isEmpty())
        .map(nh => nh.scope(contractAddress)),
    );
    scopedNullifiers.push(...execution.publicInputs.nullifiers.getActiveItems().map(n => n.scope(contractAddress)));

    taggedPrivateLogs.push(
      ...(await Promise.all(
        execution.publicInputs.privateLogs.getActiveItems().map(async metadata => {
          metadata.log.fields[0] = await computeSiloedPrivateLogFirstField(contractAddress, metadata.log.fields[0]);
          return new OrderedSideEffect(metadata, metadata.counter);
        }),
      )),
    );

    noteHashReadRequests.push(...execution.publicInputs.noteHashReadRequests.getActiveItems());
    nullifierReadRequests.push(...execution.publicInputs.nullifierReadRequests.getActiveItems());
    l2ToL1Messages.push(
      ...execution.publicInputs.l2ToL1Msgs
        .getActiveItems()
        .map(message => new OrderedSideEffect(message.message.scope(contractAddress), message.counter)),
    );
    contractClassLogsHashes.push(
      ...execution.publicInputs.contractClassLogsHashes
        .getActiveItems()
        .map(
          contractClassLogHash =>
            new OrderedSideEffect(contractClassLogHash.logHash.scope(contractAddress), contractClassLogHash.counter),
        ),
    );
    publicCallRequests.push(
      ...execution.publicInputs.publicCallRequests
        .getActiveItems()
        .map(callRequest => new OrderedSideEffect(callRequest.inner, callRequest.counter)),
    );

    if (publicTeardownCallRequest !== undefined && !execution.publicInputs.publicTeardownCallRequest.isEmpty()) {
      throw new Error('Trying to set multiple teardown requests');
    }

    publicTeardownCallRequest = execution.publicInputs.publicTeardownCallRequest.isEmpty()
      ? publicTeardownCallRequest
      : execution.publicInputs.publicTeardownCallRequest;

    executionSteps.push({
      functionName: await debugFunctionNameGetter(
        execution.publicInputs.callContext.contractAddress,
        execution.publicInputs.callContext.functionSelector,
      ),
      timings: execution.profileResult?.timings ?? { witgen: 0, oracles: {} },
      bytecode: execution.acir,
      vk: execution.vk,
      witness: execution.partialWitness,
    });
  }

  const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(privateExecutionResult);
  const minRevertibleSideEffectCounter =
    minRevertibleSideEffectCounterOverride ?? getFinalMinRevertibleSideEffectCounter(privateExecutionResult);

  const scopedNoteHashesCLA = new ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>(
    padArrayEnd(scopedNoteHashes, ScopedNoteHash.empty(), MAX_NOTE_HASHES_PER_TX),
    scopedNoteHashes.length,
  );
  const scopedNullifiersCLA = new ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>(
    padArrayEnd(scopedNullifiers, ScopedNullifier.empty(), MAX_NULLIFIERS_PER_TX),
    scopedNullifiers.length,
  );

  const { filteredNoteHashes, filteredNullifiers, filteredPrivateLogs } = squashTransientSideEffects(
    taggedPrivateLogs,
    scopedNoteHashesCLA,
    scopedNullifiersCLA,
    noteHashNullifierCounterMap,
    minRevertibleSideEffectCounter,
  );

  await verifyReadRequests(
    node,
    await privateExecutionResult.entrypoint.publicInputs.anchorBlockHeader.hash(),
    noteHashReadRequests,
    nullifierReadRequests,
    scopedNoteHashesCLA,
    scopedNullifiersCLA,
  );

  const siloedNoteHashes = await Promise.all(
    filteredNoteHashes
      .sort((a, b) => a.counter - b.counter)
      .map(async nh => new OrderedSideEffect(await siloNoteHash(nh.contractAddress, nh.value), nh.counter)),
  );
  const siloedNullifiers = await Promise.all(
    filteredNullifiers
      .sort((a, b) => a.counter - b.counter)
      .map(async n => new OrderedSideEffect(await siloNullifier(n.contractAddress, n.value), n.counter)),
  );

  const constantData = new TxConstantData(
    privateExecutionResult.entrypoint.publicInputs.anchorBlockHeader,
    privateExecutionResult.entrypoint.publicInputs.txContext,
    getVKTreeRoot(),
    protocolContractsHash,
  );

  const hasPublicCalls = privateExecutionResult.publicFunctionCalldata.length !== 0;
  let inputsForRollup;
  let inputsForPublic;
  let gasUsed;

  const sortByCounter = <T>(a: OrderedSideEffect<T>, b: OrderedSideEffect<T>) => a.counter - b.counter;
  const getEffect = <T>(orderedSideEffect: OrderedSideEffect<T>) => orderedSideEffect.sideEffect;

  const isPrivateOnlyTx = privateExecutionResult.publicFunctionCalldata.length === 0;

  const [nonRevertibleNullifiers, revertibleNullifiers] = splitOrderedSideEffects(
    siloedNullifiers,
    minRevertibleSideEffectCounter,
  );
  const nonceGenerator = privateExecutionResult.firstNullifier;
  if (nonRevertibleNullifiers.length === 0) {
    nonRevertibleNullifiers.push(nonceGenerator);
  } else if (!nonRevertibleNullifiers[0].equals(nonceGenerator)) {
    throw new Error('The first non revertible nullifier should be equal to the nonce generator. This is a bug!');
  }

  if (isPrivateOnlyTx) {
    // We must make the note hashes unique by using the
    // nonce generator and their index in the tx.
    const uniqueNoteHashes = await Promise.all(
      siloedNoteHashes.map(async (orderedSideEffect, i) => {
        const siloedNoteHash = orderedSideEffect.sideEffect;
        const nonce = await computeNoteHashNonce(nonceGenerator, i);
        const uniqueNoteHash = await computeUniqueNoteHash(nonce, siloedNoteHash);
        return uniqueNoteHash;
      }),
    );
    const accumulatedDataForRollup = new PrivateToRollupAccumulatedData(
      padArrayEnd(uniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nonRevertibleNullifiers.concat(revertibleNullifiers), Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(
        l2ToL1Messages.sort(sortByCounter).map(getEffect),
        ScopedL2ToL1Message.empty(),
        MAX_L2_TO_L1_MSGS_PER_TX,
      ),
      padArrayEnd(filteredPrivateLogs.sort(sortByCounter).map(getEffect), PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(
        contractClassLogsHashes.sort(sortByCounter).map(getEffect),
        ScopedLogHash.empty(),
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
      ),
    );
    gasUsed = meterGasUsed(accumulatedDataForRollup, isPrivateOnlyTx);
    inputsForRollup = new PartialPrivateTailPublicInputsForRollup(accumulatedDataForRollup);
  } else {
    const [nonRevertibleNoteHashes, revertibleNoteHashes] = splitOrderedSideEffects(
      siloedNoteHashes,
      minRevertibleSideEffectCounter,
    );
    const nonRevertibleUniqueNoteHashes = await Promise.all(
      nonRevertibleNoteHashes.map(async (noteHash, i) => {
        const nonce = await computeNoteHashNonce(nonceGenerator, i);
        return await computeUniqueNoteHash(nonce, noteHash);
      }),
    );
    const [nonRevertibleL2ToL1Messages, revertibleL2ToL1Messages] = splitOrderedSideEffects(
      l2ToL1Messages.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );
    const [nonRevertibleTaggedPrivateLogs, revertibleTaggedPrivateLogs] = splitOrderedSideEffects(
      filteredPrivateLogs,
      minRevertibleSideEffectCounter,
    );
    const [nonRevertibleContractClassLogHashes, revertibleContractClassLogHashes] = splitOrderedSideEffects(
      contractClassLogsHashes.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );
    const [nonRevertiblePublicCallRequests, revertiblePublicCallRequests] = splitOrderedSideEffects(
      publicCallRequests.sort(sortByCounter),
      minRevertibleSideEffectCounter,
    );

    const nonRevertibleData = new PrivateToPublicAccumulatedData(
      padArrayEnd(nonRevertibleUniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nonRevertibleNullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(nonRevertibleL2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(nonRevertibleTaggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(nonRevertibleContractClassLogHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(nonRevertiblePublicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );

    const revertibleData = new PrivateToPublicAccumulatedData(
      padArrayEnd(revertibleNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(revertibleNullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(revertibleL2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(revertibleTaggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(revertibleContractClassLogHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(revertiblePublicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );
    gasUsed = meterGasUsed(revertibleData, isPrivateOnlyTx).add(meterGasUsed(nonRevertibleData, isPrivateOnlyTx));
    if (publicTeardownCallRequest) {
      gasUsed = gasUsed.add(privateExecutionResult.entrypoint.publicInputs.txContext.gasSettings.teardownGasLimits);
    }

    inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      nonRevertibleData,
      revertibleData,
      publicTeardownCallRequest ?? PublicCallRequest.empty(),
    );
  }

  const publicInputs = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    /*gasUsed=*/ gasUsed.add(Gas.from({ l2Gas: FIXED_L2_GAS, daGas: FIXED_DA_GAS })),
    /*feePayer=*/ AztecAddress.zero(),
    /*expirationTimestamp=*/ 0n,
    hasPublicCalls ? inputsForPublic : undefined,
    !hasPublicCalls ? inputsForRollup : undefined,
  );

  return {
    publicInputs,
    chonkProof: ChonkProof.empty(),
    executionSteps,
  };
}

/**
 * Squashes transient note hashes and nullifiers, mimicking the behavior
 * of the reset kernels. Returns the filtered (surviving) scoped items and private logs.
 */
function squashTransientSideEffects(
  taggedPrivateLogs: OrderedSideEffect<PrivateLogData>[],
  scopedNoteHashesCLA: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  scopedNullifiersCLA: ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
  noteHashNullifierCounterMap: Map<number, number>,
  minRevertibleSideEffectCounter: number,
) {
  const { numTransientData, hints: transientDataHints } = buildTransientDataHints(
    scopedNoteHashesCLA,
    scopedNullifiersCLA,
    /*futureNoteHashReads=*/ [],
    /*futureNullifierReads=*/ [],
    noteHashNullifierCounterMap,
    minRevertibleSideEffectCounter,
  );

  const squashedNoteHashCounters = new Set<number>();
  const squashedNullifierCounters = new Set<number>();
  for (let i = 0; i < numTransientData; i++) {
    const hint = transientDataHints[i];
    squashedNoteHashCounters.add(scopedNoteHashesCLA.array[hint.noteHashIndex].counter);
    squashedNullifierCounters.add(scopedNullifiersCLA.array[hint.nullifierIndex].counter);
  }

  return {
    filteredNoteHashes: scopedNoteHashesCLA.getActiveItems().filter(nh => !squashedNoteHashCounters.has(nh.counter)),
    filteredNullifiers: scopedNullifiersCLA.getActiveItems().filter(n => !squashedNullifierCounters.has(n.counter)),
    filteredPrivateLogs: taggedPrivateLogs
      .filter(item => !squashedNoteHashCounters.has(item.sideEffect.noteHashCounter))
      .map(item => new OrderedSideEffect(item.sideEffect.log, item.counter)),
  };
}

/**
 * Verifies settled read requests by checking membership in the note hash and nullifier trees
 * at the tx's anchor block, mimicking the behavior of the kernels
 */
async function verifyReadRequests(
  node: Pick<AztecNode, 'getNoteHashMembershipWitness' | 'getNullifierMembershipWitness'>,
  anchorBlockHash: BlockParameter,
  noteHashReadRequests: ScopedReadRequest[],
  nullifierReadRequests: ScopedReadRequest[],
  scopedNoteHashesCLA: ClaimedLengthArray<ScopedNoteHash, typeof MAX_NOTE_HASHES_PER_TX>,
  scopedNullifiersCLA: ClaimedLengthArray<ScopedNullifier, typeof MAX_NULLIFIERS_PER_TX>,
) {
  const noteHashReadRequestsCLA = new ClaimedLengthArray<ScopedReadRequest, typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX>(
    padArrayEnd(noteHashReadRequests, ScopedReadRequest.empty(), MAX_NOTE_HASH_READ_REQUESTS_PER_TX),
    noteHashReadRequests.length,
  );
  const nullifierReadRequestsCLA = new ClaimedLengthArray<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>(
    padArrayEnd(nullifierReadRequests, ScopedReadRequest.empty(), MAX_NULLIFIER_READ_REQUESTS_PER_TX),
    nullifierReadRequests.length,
  );

  const noteHashResetActions = getNoteHashReadRequestResetActions(
    noteHashReadRequestsCLA,
    scopedNoteHashesCLA,
    /*futureNoteHashes=*/ [],
  );
  const nullifierResetActions = getNullifierReadRequestResetActions(
    nullifierReadRequestsCLA,
    scopedNullifiersCLA,
    /*futureNullifiers=*/ [],
  );

  const settledNoteHashReads: { index: number; value: Fr }[] = [];
  for (let i = 0; i < noteHashResetActions.actions.length; i++) {
    if (noteHashResetActions.actions[i] === ReadRequestActionEnum.READ_AS_SETTLED) {
      settledNoteHashReads.push({ index: i, value: noteHashReadRequests[i].value });
    }
  }

  const settledNullifierReads: { index: number; value: Fr }[] = [];
  for (let i = 0; i < nullifierResetActions.actions.length; i++) {
    if (nullifierResetActions.actions[i] === ReadRequestActionEnum.READ_AS_SETTLED) {
      settledNullifierReads.push({ index: i, value: nullifierReadRequests[i].value });
    }
  }

  const [noteHashWitnesses, nullifierWitnesses] = await Promise.all([
    Promise.all(settledNoteHashReads.map(({ value }) => node.getNoteHashMembershipWitness(anchorBlockHash, value))),
    Promise.all(settledNullifierReads.map(({ value }) => node.getNullifierMembershipWitness(anchorBlockHash, value))),
  ]);

  for (let i = 0; i < settledNoteHashReads.length; i++) {
    if (!noteHashWitnesses[i]) {
      throw new Error(
        `Note hash read request at index ${settledNoteHashReads[i].index} is reading an unknown note hash: ${settledNoteHashReads[i].value}`,
      );
    }
  }

  for (let i = 0; i < settledNullifierReads.length; i++) {
    if (!nullifierWitnesses[i]) {
      throw new Error(
        `Nullifier read request at index ${settledNullifierReads[i].index} is reading an unknown nullifier: ${settledNullifierReads[i].value}`,
      );
    }
  }
}

function splitOrderedSideEffects<T>(effects: OrderedSideEffect<T>[], minRevertibleSideEffectCounter: number) {
  const revertibleSideEffects: T[] = [];
  const nonRevertibleSideEffects: T[] = [];
  effects.forEach(effect => {
    if (minRevertibleSideEffectCounter === 0 || effect.counter < minRevertibleSideEffectCounter) {
      nonRevertibleSideEffects.push(effect.sideEffect);
    } else {
      revertibleSideEffects.push(effect.sideEffect);
    }
  });
  return [nonRevertibleSideEffects, revertibleSideEffects];
}

function meterGasUsed(data: PrivateToRollupAccumulatedData | PrivateToPublicAccumulatedData, isPrivateOnlyTx: boolean) {
  let meteredDAFields = 0;
  let meteredL2Gas = 0;

  const numNoteHashes = arrayNonEmptyLength(data.noteHashes, hash => hash.isEmpty());
  meteredDAFields += numNoteHashes;
  const noteHashBaseGas = isPrivateOnlyTx ? L2_GAS_PER_NOTE_HASH : AVM_EMITNOTEHASH_BASE_L2_GAS;
  meteredL2Gas += numNoteHashes * noteHashBaseGas;

  const numNullifiers = arrayNonEmptyLength(data.nullifiers, nullifier => nullifier.isEmpty());
  meteredDAFields += numNullifiers;
  const nullifierBaseGas = isPrivateOnlyTx ? L2_GAS_PER_NULLIFIER : AVM_EMITNULLIFIER_BASE_L2_GAS;
  meteredL2Gas += numNullifiers * nullifierBaseGas;

  const numL2toL1Messages = arrayNonEmptyLength(data.l2ToL1Msgs, msg => msg.isEmpty());
  meteredDAFields += numL2toL1Messages;
  const l2ToL1MessageBaseGas = isPrivateOnlyTx ? L2_GAS_PER_L2_TO_L1_MSG : AVM_SENDL2TOL1MSG_BASE_L2_GAS;
  meteredL2Gas += numL2toL1Messages * l2ToL1MessageBaseGas;

  const numPrivatelogs = arrayNonEmptyLength(data.privateLogs, log => log.isEmpty());
  // Every private log emits its length as an additional field
  meteredDAFields += data.privateLogs.reduce((acc, log) => (!log.isEmpty() ? acc + log.emittedLength + 1 : acc), 0);
  meteredL2Gas += numPrivatelogs * L2_GAS_PER_PRIVATE_LOG;

  const numContractClassLogs = arrayNonEmptyLength(data.contractClassLogsHashes, log => log.isEmpty());
  // Every contract class log emits its length and contract address as additional fields
  meteredDAFields += data.contractClassLogsHashes.reduce(
    (acc, log) => (!log.isEmpty() ? acc + log.logHash.length + 2 : acc),
    0,
  );
  meteredL2Gas += numContractClassLogs * L2_GAS_PER_CONTRACT_CLASS_LOG;

  const meteredDAGas = meteredDAFields * DA_GAS_PER_FIELD;

  if ((data as PrivateToPublicAccumulatedData).publicCallRequests) {
    const dataForPublic = data as PrivateToPublicAccumulatedData;

    const numPublicCallRequests = arrayNonEmptyLength(dataForPublic.publicCallRequests, req => req.isEmpty());
    meteredL2Gas += numPublicCallRequests * FIXED_AVM_STARTUP_L2_GAS;
  }
  return Gas.from({ l2Gas: meteredL2Gas, daGas: meteredDAGas });
}
