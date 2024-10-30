import {
  AztecAddress,
  type Gas,
  type PublicCallRequest,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';

import assert from 'assert';

import { getPublicFunctionDebugName } from '../../common/debug_fn_name.js';
import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContractCallResult } from '../avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { NullifierManager } from './nullifiers.js';
import { PublicStorage } from './public_storage.js';

/**
 * A class to manage persistable AVM state for contract calls.
 * Maintains a cache of the current world state,
 * a trace of all side effects.
 *
 * The simulator should make any world state / tree queries through this object.
 *
 * Manages merging of successful/reverted child state into current state.
 */
export class AvmPersistableStateManager {
  private readonly log = createDebugLogger('aztec:avm_simulator:state_manager');

  constructor(
    /** Reference to node storage */
    private readonly worldStateDB: WorldStateDB,
    /** Side effect trace */
    // TODO(5818): make private once no longer accessed in executor
    public readonly trace: PublicSideEffectTraceInterface,
    /** Public storage, including cached writes */
    // TODO(5818): make private once no longer accessed in executor
    public readonly publicStorage: PublicStorage = new PublicStorage(worldStateDB),
    /** Nullifier set, including cached/recently-emitted nullifiers */
    private readonly nullifiers: NullifierManager = new NullifierManager(worldStateDB),
  ) {}

  /**
   * Create a new state manager with some preloaded pending siloed nullifiers
   */
  public static newWithPendingSiloedNullifiers(
    worldStateDB: WorldStateDB,
    trace: PublicSideEffectTraceInterface,
    pendingSiloedNullifiers: Fr[],
  ) {
    const parentNullifiers = NullifierManager.newWithPendingSiloedNullifiers(worldStateDB, pendingSiloedNullifiers);
    return new AvmPersistableStateManager(
      worldStateDB,
      trace,
      /*publicStorage=*/ new PublicStorage(worldStateDB),
      /*nullifiers=*/ parentNullifiers.fork(),
    );
  }

  /**
   * Create a new state manager forked from this one
   */
  public fork(incrementSideEffectCounter: boolean = false) {
    return new AvmPersistableStateManager(
      this.worldStateDB,
      this.trace.fork(incrementSideEffectCounter),
      this.publicStorage.fork(),
      this.nullifiers.fork(),
    );
  }

  public forkWithPendingSiloedNullifiers(incrementSideEffectCounter: boolean, pendingSiloedNullifiers: Fr[]) {
    const prePhaseNullifiers = NullifierManager.newWithPendingSiloedNullifiers(
      this.worldStateDB,
      pendingSiloedNullifiers,
      this.nullifiers,
    );
    return new AvmPersistableStateManager(
      this.worldStateDB,
      this.trace.fork(incrementSideEffectCounter),
      this.publicStorage.fork(),
      prePhaseNullifiers, // TODO(dbanks12): need a fork()?
    );
  }

  /**
   * Write to public storage, journal/trace the write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public writeStorage(contractAddress: Fr, slot: Fr, value: Fr) {
    this.log.debug(`Storage write (address=${contractAddress}, slot=${slot}): value=${value}`);
    // Cache storage writes for later reference/reads
    this.publicStorage.write(contractAddress, slot, value);
    this.trace.tracePublicStorageWrite(contractAddress, slot, value);
  }

  /**
   * Read from public storage, trace the read.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns the latest value written to slot, or 0 if never written to before
   */
  public async readStorage(contractAddress: Fr, slot: Fr): Promise<Fr> {
    const { value, exists, cached } = await this.publicStorage.read(contractAddress, slot);
    this.log.debug(
      `Storage read  (address=${contractAddress}, slot=${slot}): value=${value}, exists=${exists}, cached=${cached}`,
    );
    this.trace.tracePublicStorageRead(contractAddress, slot, value, exists, cached);
    return Promise.resolve(value);
  }

  /**
   * Read from public storage, don't trace the read.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns the latest value written to slot, or 0 if never written to before
   */
  public async peekStorage(contractAddress: Fr, slot: Fr): Promise<Fr> {
    const { value, exists, cached } = await this.publicStorage.read(contractAddress, slot);
    this.log.debug(
      `Storage peek  (address=${contractAddress}, slot=${slot}): value=${value}, exists=${exists}, cached=${cached}`,
    );
    return Promise.resolve(value);
  }

  // TODO(4886): We currently don't silo note hashes.
  /**
   * Check if a note hash exists at the given leaf index, trace the check.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param noteHash - the unsiloed note hash being checked
   * @param leafIndex - the leaf index being checked
   * @returns true if the note hash exists at the given leaf index, false otherwise
   */
  public async checkNoteHashExists(contractAddress: Fr, noteHash: Fr, leafIndex: Fr): Promise<boolean> {
    const gotLeafValue = (await this.worldStateDB.getCommitmentValue(leafIndex.toBigInt())) ?? Fr.ZERO;
    const exists = gotLeafValue.equals(noteHash);
    this.log.debug(
      `noteHashes(${contractAddress})@${noteHash} ?? leafIndex: ${leafIndex} | gotLeafValue: ${gotLeafValue}, exists: ${exists}.`,
    );
    // TODO(8287): We still return exists here, but we need to transmit both the requested noteHash and the gotLeafValue
    // such that the VM can constrain the equality and decide on exists based on that.
    this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists);
    return Promise.resolve(exists);
  }

  /**
   * Write a note hash, trace the write.
   * @param noteHash - the unsiloed note hash to write
   */
  public writeNoteHash(contractAddress: Fr, noteHash: Fr) {
    this.log.debug(`noteHashes(${contractAddress}) += @${noteHash}.`);
    this.trace.traceNewNoteHash(contractAddress, noteHash);
  }

  /**
   * Check if a nullifier exists, trace the check.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to check
   * @returns exists - whether the nullifier exists in the nullifier set
   */
  public async checkNullifierExists(contractAddress: Fr, nullifier: Fr): Promise<boolean> {
    const [exists, isPending, leafIndex] = await this.nullifiers.checkExists(contractAddress, nullifier);
    this.log.debug(
      `nullifiers(${contractAddress})@${nullifier} ?? leafIndex: ${leafIndex}, exists: ${exists}, pending: ${isPending}.`,
    );
    this.trace.traceNullifierCheck(contractAddress, nullifier, leafIndex, exists, isPending);
    return Promise.resolve(exists);
  }

  /**
   * Write a nullifier to the nullifier set, trace the write.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to write
   */
  public async writeNullifier(contractAddress: Fr, nullifier: Fr) {
    this.log.debug(`nullifiers(${contractAddress}) += ${nullifier}.`);
    // Cache pending nullifiers for later access
    await this.nullifiers.append(contractAddress, nullifier);
    // Trace all nullifier creations (even reverted ones)
    this.trace.traceNewNullifier(contractAddress, nullifier);
  }

  /**
   * Check if an L1 to L2 message exists, trace the check.
   * @param msgHash - the message hash to check existence of
   * @param msgLeafIndex - the message leaf index to use in the check
   * @returns exists - whether the message exists in the L1 to L2 Messages tree
   */
  public async checkL1ToL2MessageExists(contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr): Promise<boolean> {
    const valueAtIndex = (await this.worldStateDB.getL1ToL2LeafValue(msgLeafIndex.toBigInt())) ?? Fr.ZERO;
    const exists = valueAtIndex.equals(msgHash);
    this.log.debug(
      `l1ToL2Messages(@${msgLeafIndex}) ?? exists: ${exists}, expected: ${msgHash}, found: ${valueAtIndex}.`,
    );
    // TODO(8287): We still return exists here, but we need to transmit both the requested msgHash and the value
    // such that the VM can constrain the equality and decide on exists based on that.
    this.trace.traceL1ToL2MessageCheck(contractAddress, valueAtIndex, msgLeafIndex, exists);
    return Promise.resolve(exists);
  }

  /**
   * Write an L2 to L1 message.
   * @param contractAddress - L2 contract address that created this message
   * @param recipient - L1 contract address to send the message to.
   * @param content - Message content.
   */
  public writeL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr) {
    this.log.debug(`L2ToL1Messages(${contractAddress}) += (recipient: ${recipient}, content: ${content}).`);
    this.trace.traceNewL2ToL1Message(contractAddress, recipient, content);
  }

  /**
   * Write an unencrypted log
   * @param contractAddress - address of the contract that emitted the log
   * @param event - log event selector
   * @param log - log contents
   */
  public writeUnencryptedLog(contractAddress: Fr, log: Fr[]) {
    this.log.debug(`UnencryptedL2Log(${contractAddress}) += event with ${log.length} fields.`);
    this.trace.traceUnencryptedLog(contractAddress, log);
  }

  /**
   * Get a contract instance.
   * @param contractAddress - address of the contract instance to retrieve.
   * @returns the contract instance or undefined if it does not exist.
   */
  public async getContractInstance(contractAddress: Fr): Promise<SerializableContractInstance | undefined> {
    this.log.debug(`Getting contract instance for address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(AztecAddress.fromField(contractAddress));
    const exists = instanceWithAddress !== undefined;

    if (exists) {
      const instance = new SerializableContractInstance(instanceWithAddress);
      this.log.debug(
        `Got contract instance (address=${contractAddress}): exists=${exists}, instance=${JSON.stringify(instance)}`,
      );
      this.trace.traceGetContractInstance(contractAddress, exists, instance);

      return Promise.resolve(instance);
    } else {
      this.log.debug(`Contract instance NOT FOUND (address=${contractAddress})`);
      this.trace.traceGetContractInstance(contractAddress, exists);
      return Promise.resolve(undefined);
    }
  }

  /**
   * Accept nested world state modifications
   */
  public acceptNestedCallState(nestedState: AvmPersistableStateManager) {
    this.publicStorage.acceptAndMerge(nestedState.publicStorage);
    this.nullifiers.acceptAndMerge(nestedState.nullifiers);
  }

  /**
   * Get a contract's bytecode from the contracts DB, also trace the contract class and instance
   */
  public async getBytecode(contractAddress: AztecAddress): Promise<Buffer | undefined> {
    this.log.debug(`Getting bytecode for contract address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(contractAddress);
    const exists = instanceWithAddress !== undefined;

    if (exists) {
      const instance = new SerializableContractInstance(instanceWithAddress);

      const contractClass = await this.worldStateDB.getContractClass(instance.contractClassId);
      assert(
        contractClass,
        `Contract class not found in DB, but a contract instance was found with this class ID (${instance.contractClassId}). This should not happen!`,
      );

      const contractClassPreimage = {
        artifactHash: contractClass.artifactHash,
        privateFunctionsRoot: contractClass.privateFunctionsRoot,
        publicBytecodeCommitment: computePublicBytecodeCommitment(contractClass.packedBytecode),
      };

      this.trace.traceGetBytecode(
        contractAddress,
        exists,
        contractClass.packedBytecode,
        instance,
        contractClassPreimage,
      );
      return contractClass.packedBytecode;
    } else {
      // If the contract instance is not found, we assume it has not been deployed.
      // It doesnt matter what the values of the contract instance are in this case, as long as we tag it with exists=false.
      // This will hint to the avm circuit to just perform the non-membership check on the address and disregard the bytecode hash
      this.trace.traceGetBytecode(contractAddress, exists); // bytecode, instance, class undefined
      return undefined;
    }
  }

  /**
   * Accept the nested call's state and trace the nested call
   */
  public async processNestedCall(
    nestedState: AvmPersistableStateManager,
    nestedEnvironment: AvmExecutionEnvironment,
    startGasLeft: Gas,
    endGasLeft: Gas,
    bytecode: Buffer,
    avmCallResults: AvmContractCallResult,
  ) {
    if (!avmCallResults.reverted) {
      this.acceptNestedCallState(nestedState);
    }
    const functionName = await getPublicFunctionDebugName(
      this.worldStateDB,
      nestedEnvironment.address,
      nestedEnvironment.functionSelector,
      nestedEnvironment.calldata,
    );

    this.log.verbose(`[AVM] Calling nested function ${functionName}`);

    this.trace.traceNestedCall(
      nestedState.trace,
      nestedEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public async processEnqueuedCall(
    nestedState: AvmPersistableStateManager,
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ) {
    if (!reverted) {
      this.acceptNestedCallState(nestedState);
    }
    const functionName = await getPublicFunctionDebugName(
      this.worldStateDB,
      publicCallRequest.callContext.contractAddress,
      publicCallRequest.callContext.functionSelector,
      calldata,
    );

    this.log.verbose(`[AVM] Encountered enqueued public call starting with function ${functionName}`);

    this.trace.traceEnqueuedCall(nestedState.trace, publicCallRequest, calldata, reverted);
  }

  public processEntireAppLogicPhase(
    /** The forked state manager used by app logic */
    nestedState: AvmPersistableStateManager,
    /** The call requests for each enqueued call in app logic. */
    publicCallRequests: PublicCallRequest[],
    /** The calldatas for each enqueued call in app logic */
    calldatas: Fr[][],
    /** Did the any enqueued call in app logic revert? */
    reverted: boolean,
  ) {
    if (!reverted) {
      this.acceptNestedCallState(nestedState);
    }

    this.log.verbose(`[AVM] Encountered app logic phase`);

    this.trace.traceAppLogicPhase(nestedState.trace, publicCallRequests, calldatas, reverted);
  }
}
