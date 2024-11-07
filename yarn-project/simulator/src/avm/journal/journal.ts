import { type IndexedTreeId, MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/circuit-types';
import {
  AztecAddress,
  type Gas,
  type NullifierLeafPreimage,
  type PublicCallRequest,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

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

  /** Interface to perform merkle tree operations */
  public merkleTrees: MerkleTreeWriteOperations;

  constructor(
    /** Reference to node storage */
    private readonly worldStateDB: WorldStateDB,
    /** Side effect trace */
    // TODO(5818): make private once no longer accessed in executor
    public readonly trace: PublicSideEffectTraceInterface,
    /** Public storage, including cached writes */
    private readonly publicStorage: PublicStorage = new PublicStorage(worldStateDB),
    /** Nullifier set, including cached/recently-emitted nullifiers */
    private readonly nullifiers: NullifierManager = new NullifierManager(worldStateDB),
    private readonly doMerkleOperations: boolean = false,
    merkleTrees?: MerkleTreeWriteOperations,
  ) {
    if (merkleTrees) {
      this.merkleTrees = merkleTrees;
    } else {
      this.merkleTrees = worldStateDB.getMerkleInterface();
    }
  }

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
      this.doMerkleOperations,
    );
  }

  /**
   * Write to public storage, journal/trace the write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public async writeStorage(contractAddress: Fr, slot: Fr, value: Fr): Promise<void> {
    this.log.debug(`Storage write (address=${contractAddress}, slot=${slot}): value=${value}`);
    // Cache storage writes for later reference/reads
    this.publicStorage.write(contractAddress, slot, value);
    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    if (this.doMerkleOperations) {
      const result = await this.merkleTrees.batchInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        [new PublicDataTreeLeaf(leafSlot, value).toBuffer()],
        0,
      );
      assert(result !== undefined, 'Public data tree insertion error. You might want to disable skipMerkleOperations.');
      this.log.debug(`Inserted public data tree leaf at leafSlot ${leafSlot}, value: ${value}`);

      const lowLeafInfo = result.lowLeavesWitnessData![0];
      const lowLeafPreimage = lowLeafInfo.leafPreimage as PublicDataTreeLeafPreimage;
      const lowLeafIndex = lowLeafInfo.index;
      const lowLeafPath = lowLeafInfo.siblingPath.toFields();

      const insertionPath = result.newSubtreeSiblingPath.toFields();
      const newLeafPreimage = new PublicDataTreeLeafPreimage(
        leafSlot,
        value,
        lowLeafPreimage.nextSlot,
        lowLeafPreimage.nextIndex,
      );
      // FIXME: Why do we need to hint both preimages for public data writes, but not for nullifier insertions?
      this.trace.tracePublicStorageWrite(
        contractAddress,
        slot,
        value,
        lowLeafPreimage,
        new Fr(lowLeafIndex),
        lowLeafPath,
        newLeafPreimage,
        insertionPath,
      );
    } else {
      this.trace.tracePublicStorageWrite(contractAddress, slot, value);
    }
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

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);

    if (this.doMerkleOperations) {
      // Get leaf if present, low leaf if absent
      // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
      const [leafIndex, leafPreimage, leafPath, _alreadyPresent] = await getLeafOrLowLeaf<PublicDataTreeLeafPreimage>(
        MerkleTreeId.PUBLIC_DATA_TREE,
        leafSlot.toBigInt(),
        this.merkleTrees,
      );
      // FIXME: cannot have this assertion until "caching" is done via ephemeral merkle writes
      //assert(alreadyPresent == exists, 'WorldStateDB contains public data leaf, but merkle tree does not.... This is a bug!');
      this.log.debug(
        `leafPreimage.nextSlot: ${leafPreimage.nextSlot}, leafPreimage.nextIndex: ${Number(leafPreimage.nextIndex)}`,
      );
      this.log.debug(`leafPreimage.slot: ${leafPreimage.slot}, leafPreimage.value: ${leafPreimage.value}`);

      if (!exists) {
        // Sanity check that the leaf slot is skipped by low leaf when it doesn't exist
        assert(
          leafSlot.toBigInt() > leafPreimage.slot.toBigInt() && leafSlot.toBigInt() < leafPreimage.nextSlot.toBigInt(),
          'Public data tree low leaf should skip the target leaf slot when the target leaf does not exist.',
        );
      }
      this.log.debug(
        `Tracing storage leaf preimage slot=${slot}, leafSlot=${leafSlot}, value=${value}, nextKey=${leafPreimage.nextSlot}, nextIndex=${leafPreimage.nextIndex}`,
      );
      // On non-existence, AVM circuit will need to recognize that leafPreimage.slot != leafSlot,
      // prove that this is a low leaf that skips leafSlot, and then prove memebership of the leaf.
      this.trace.tracePublicStorageRead(contractAddress, slot, value, leafPreimage, new Fr(leafIndex), leafPath);
    } else {
      this.trace.tracePublicStorageRead(contractAddress, slot, value);
    }

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
    if (this.doMerkleOperations) {
      // TODO(8287): We still return exists here, but we need to transmit both the requested noteHash and the gotLeafValue
      // such that the VM can constrain the equality and decide on exists based on that.
      const path = await this.merkleTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex.toBigInt());
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists, path.toFields());
    } else {
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists);
    }
    return Promise.resolve(exists);
  }

  /**
   * Write a note hash, trace the write.
   * @param noteHash - the unsiloed note hash to write
   */
  public async writeNoteHash(contractAddress: Fr, noteHash: Fr): Promise<void> {
    this.log.debug(`noteHashes(${contractAddress}) += @${noteHash}.`);

    if (this.doMerkleOperations) {
      // TODO: We should track this globally here in the state manager
      const info = await this.merkleTrees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE);
      const leafIndex = new Fr(info.size + 1n);

      const path = await this.merkleTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex.toBigInt());
      const siloedNoteHash = siloNoteHash(contractAddress, noteHash);

      await this.merkleTrees.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [siloedNoteHash]);
      this.trace.traceNewNoteHash(contractAddress, noteHash, leafIndex, path.toFields());
    } else {
      this.trace.traceNewNoteHash(contractAddress, noteHash);
    }
  }

  /**
   * Check if a nullifier exists, trace the check.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to check
   * @returns exists - whether the nullifier exists in the nullifier set
   */
  public async checkNullifierExists(contractAddress: Fr, nullifier: Fr): Promise<boolean> {
    const [exists, isPending, _] = await this.nullifiers.checkExists(contractAddress, nullifier);

    const siloedNullifier = siloNullifier(contractAddress, nullifier);

    if (this.doMerkleOperations) {
      // Get leaf if present, low leaf if absent
      // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
      const [leafIndex, leafPreimage, leafPath, alreadyPresent] = await getLeafOrLowLeaf<NullifierLeafPreimage>(
        MerkleTreeId.NULLIFIER_TREE,
        siloedNullifier.toBigInt(),
        this.merkleTrees,
      );
      assert(
        alreadyPresent == exists,
        'WorldStateDB contains nullifier leaf, but merkle tree does not.... This is a bug!',
      );

      this.log.debug(
        `nullifiers(${contractAddress})@${nullifier} ?? leafIndex: ${leafIndex}, exists: ${exists}, pending: ${isPending}.`,
      );

      if (!exists) {
        // Sanity check that the leaf value is skipped by low leaf when it doesn't exist
        assert(
          siloedNullifier.toBigInt() > leafPreimage.nullifier.toBigInt() &&
            siloedNullifier.toBigInt() < leafPreimage.nextNullifier.toBigInt(),
          'Nullifier tree low leaf should skip the target leaf nullifier when the target leaf does not exist.',
        );
      }

      this.trace.traceNullifierCheck(
        contractAddress,
        nullifier, // FIXME: Should this be siloed?
        exists,
        leafPreimage,
        new Fr(leafIndex),
        leafPath,
      );
    } else {
      this.trace.traceNullifierCheck(
        contractAddress,
        nullifier, // FIXME: Should this be siloed?
        exists,
      );
    }
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

    const siloedNullifier = siloNullifier(contractAddress, nullifier);

    if (this.doMerkleOperations) {
      // Trace all nullifier creations, even duplicate insertions that fail
      const alreadyPresent = await this.merkleTrees.getPreviousValueIndex(
        MerkleTreeId.NULLIFIER_TREE,
        siloedNullifier.toBigInt(),
      );
      if (alreadyPresent) {
        this.log.verbose(`Nullifier already present in tree: ${nullifier} at index ${alreadyPresent.index}.`);
      }
      const insertionResult = await this.merkleTrees.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        [siloedNullifier.toBuffer()],
        0,
      );
      const lowLeafInfo = insertionResult.lowLeavesWitnessData![0];
      const lowLeafPreimage = lowLeafInfo.leafPreimage as NullifierLeafPreimage;
      const lowLeafIndex = lowLeafInfo.index;
      const lowLeafPath = lowLeafInfo.siblingPath.toFields();
      const insertionPath = insertionResult.newSubtreeSiblingPath.toFields();

      this.trace.traceNewNullifier(
        contractAddress,
        nullifier,
        lowLeafPreimage,
        new Fr(lowLeafIndex),
        lowLeafPath,
        insertionPath,
      );
    } else {
      this.trace.traceNewNullifier(contractAddress, nullifier);
    }
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

    if (this.doMerkleOperations) {
      // TODO(8287): We still return exists here, but we need to transmit both the requested msgHash and the value
      // such that the VM can constrain the equality and decide on exists based on that.
      const path = await this.merkleTrees.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, msgLeafIndex.toBigInt());
      this.trace.traceL1ToL2MessageCheck(contractAddress, valueAtIndex, msgLeafIndex, exists, path.toFields());
    } else {
      this.trace.traceL1ToL2MessageCheck(contractAddress, valueAtIndex, msgLeafIndex, exists);
    }
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

    // TODO: nullifier check!
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
  public acceptForkedState(forkedState: AvmPersistableStateManager) {
    this.publicStorage.acceptAndMerge(forkedState.publicStorage);
    this.nullifiers.acceptAndMerge(forkedState.nullifiers);
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
    forkedState: AvmPersistableStateManager,
    nestedEnvironment: AvmExecutionEnvironment,
    startGasLeft: Gas,
    endGasLeft: Gas,
    bytecode: Buffer,
    avmCallResults: AvmContractCallResult,
  ) {
    if (!avmCallResults.reverted) {
      this.acceptForkedState(forkedState);
    }
    const functionName = await getPublicFunctionDebugName(
      this.worldStateDB,
      nestedEnvironment.address,
      nestedEnvironment.functionSelector,
      nestedEnvironment.calldata,
    );

    this.log.verbose(`[AVM] Calling nested function ${functionName}`);

    this.trace.traceNestedCall(
      forkedState.trace,
      nestedEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public async mergeStateForEnqueuedCall(
    forkedState: AvmPersistableStateManager,
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ) {
    if (!reverted) {
      this.acceptForkedState(forkedState);
    }
    const functionName = await getPublicFunctionDebugName(
      this.worldStateDB,
      publicCallRequest.callContext.contractAddress,
      publicCallRequest.callContext.functionSelector,
      calldata,
    );

    this.log.verbose(`[AVM] Encountered enqueued public call starting with function ${functionName}`);

    this.trace.traceEnqueuedCall(forkedState.trace, publicCallRequest, calldata, reverted);
  }

  public mergeStateForPhase(
    /** The forked state manager used by app logic */
    forkedState: AvmPersistableStateManager,
    /** The call requests for each enqueued call in app logic. */
    publicCallRequests: PublicCallRequest[],
    /** The calldatas for each enqueued call in app logic */
    calldatas: Fr[][],
    /** Did the any enqueued call in app logic revert? */
    reverted: boolean,
  ) {
    if (!reverted) {
      this.acceptForkedState(forkedState);
    }

    this.log.verbose(`[AVM] Encountered app logic phase`);

    this.trace.traceExecutionPhase(forkedState.trace, publicCallRequests, calldatas, reverted);
  }
}

/**
 * Get leaf if present, low leaf if absent
 */
export async function getLeafOrLowLeaf<TreePreimageType extends IndexedTreeLeafPreimage>(
  treeId: IndexedTreeId,
  key: bigint,
  merkleTrees: MerkleTreeWriteOperations,
) {
  // "key" is siloed slot (leafSlot) or siloed nullifier
  const previousValueIndex = await merkleTrees.getPreviousValueIndex(treeId, key);
  assert(
    previousValueIndex !== undefined,
    `${MerkleTreeId[treeId]} low leaf index should always be found (even if target leaf does not exist)`,
  );
  const { index: leafIndex, alreadyPresent } = previousValueIndex;

  const leafPreimage = await merkleTrees.getLeafPreimage(treeId, leafIndex);
  assert(
    leafPreimage !== undefined,
    `${MerkleTreeId[treeId]}  low leaf preimage should never be undefined (even if target leaf does not exist)`,
  );

  const leafPath = await merkleTrees.getSiblingPath(treeId, leafIndex);

  return [leafIndex, leafPreimage as TreePreimageType, leafPath.toFields(), alreadyPresent] as const;
}
