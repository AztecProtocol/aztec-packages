import { MerkleTreeId } from '@aztec/circuit-types';
import {
  type AztecAddress,
  type Gas,
  type NullifierLeafPreimage,
  type PublicCallRequest,
  type PublicDataTreeLeafPreimage,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import { getPublicFunctionDebugName } from '../../common/debug_fn_name.js';
import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmContractCallResult } from '../avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { AvmEphemeralForest } from '../avm_tree.js';
import { NullifierCollisionError, NullifierManager } from './nullifiers.js';
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
  private readonly log = createLogger('avm_simulator:state_manager');

  /** Make sure a forked state is never merged twice. */
  private alreadyMergedIntoParent = false;

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
    /** Ephmeral forest for merkle tree operations */
    public merkleTrees: AvmEphemeralForest,
  ) {}

  /**
   * Create a new state manager with some preloaded pending siloed nullifiers
   */
  public static async newWithPendingSiloedNullifiers(
    worldStateDB: WorldStateDB,
    trace: PublicSideEffectTraceInterface,
    pendingSiloedNullifiers: Fr[],
    doMerkleOperations: boolean = false,
  ) {
    const parentNullifiers = NullifierManager.newWithPendingSiloedNullifiers(worldStateDB, pendingSiloedNullifiers);
    const ephemeralForest = await AvmEphemeralForest.create(worldStateDB.getMerkleInterface());
    return new AvmPersistableStateManager(
      worldStateDB,
      trace,
      /*publicStorage=*/ new PublicStorage(worldStateDB),
      /*nullifiers=*/ parentNullifiers.fork(),
      doMerkleOperations,
      ephemeralForest,
    );
  }

  /**
   * Create a new state manager
   */
  public static async create(
    worldStateDB: WorldStateDB,
    trace: PublicSideEffectTraceInterface,
    doMerkleOperations: boolean = false,
  ) {
    const ephemeralForest = await AvmEphemeralForest.create(worldStateDB.getMerkleInterface());
    return new AvmPersistableStateManager(
      worldStateDB,
      trace,
      /*publicStorage=*/ new PublicStorage(worldStateDB),
      /*nullifiers=*/ new NullifierManager(worldStateDB),
      /*doMerkleOperations=*/ doMerkleOperations,
      ephemeralForest,
    );
  }

  /**
   * Create a new state manager forked from this one
   */
  public fork() {
    return new AvmPersistableStateManager(
      this.worldStateDB,
      this.trace.fork(),
      this.publicStorage.fork(),
      this.nullifiers.fork(),
      this.doMerkleOperations,
      this.merkleTrees.fork(),
    );
  }

  /**
   * Accept forked world state modifications & traced side effects / hints
   */
  public merge(forkedState: AvmPersistableStateManager) {
    this._merge(forkedState, /*reverted=*/ false);
  }

  /**
   * Reject forked world state modifications & traced side effects, keep traced hints
   */
  public reject(forkedState: AvmPersistableStateManager) {
    this._merge(forkedState, /*reverted=*/ true);
  }

  private _merge(forkedState: AvmPersistableStateManager, reverted: boolean) {
    // sanity check to avoid merging the same forked trace twice
    assert(
      !forkedState.alreadyMergedIntoParent,
      'Cannot merge forked state that has already been merged into its parent!',
    );
    forkedState.alreadyMergedIntoParent = true;
    this.publicStorage.acceptAndMerge(forkedState.publicStorage);
    this.nullifiers.acceptAndMerge(forkedState.nullifiers);
    this.trace.merge(forkedState.trace, reverted);
    if (!reverted) {
      this.merkleTrees = forkedState.merkleTrees;
      if (this.doMerkleOperations) {
        this.log.debug(
          `Rolled back nullifier tree to root ${this.merkleTrees.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!.getRoot()}`,
        );
      }
    }
  }

  /**
   * Write to public storage, journal/trace the write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public async writeStorage(contractAddress: AztecAddress, slot: Fr, value: Fr): Promise<void> {
    this.log.debug(`Storage write (address=${contractAddress}, slot=${slot}): value=${value}`);
    // Cache storage writes for later reference/reads
    this.publicStorage.write(contractAddress, slot, value);
    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    if (this.doMerkleOperations) {
      const result = await this.merkleTrees.writePublicStorage(leafSlot, value);
      assert(result !== undefined, 'Public data tree insertion error. You might want to disable skipMerkleOperations.');
      this.log.debug(`Inserted public data tree leaf at leafSlot ${leafSlot}, value: ${value}`);

      const lowLeafInfo = result.lowWitness;
      const lowLeafPreimage = result.lowWitness.preimage as PublicDataTreeLeafPreimage;
      const lowLeafIndex = lowLeafInfo.index;
      const lowLeafPath = lowLeafInfo.siblingPath;

      const newLeafPreimage = result.element as PublicDataTreeLeafPreimage;
      let insertionPath;

      if (!result.update) {
        insertionPath = result.insertionPath;
      }

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
  public async readStorage(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    const { value, cached } = await this.publicStorage.read(contractAddress, slot);
    this.log.debug(`Storage read  (address=${contractAddress}, slot=${slot}): value=${value}, cached=${cached}`);

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);

    if (this.doMerkleOperations) {
      // Get leaf if present, low leaf if absent
      // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
      const {
        preimage,
        index: leafIndex,
        alreadyPresent,
      } = await this.merkleTrees.getLeafOrLowLeafInfo(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
      // The index and preimage here is either the low leaf or the leaf itself (depending on the value of update flag)
      // In either case, we just want the sibling path to this leaf - it's up to the avm to distinguish if it's a low leaf or not
      const leafPath = await this.merkleTrees.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, leafIndex);
      const leafPreimage = preimage as PublicDataTreeLeafPreimage;

      this.log.debug(
        `leafPreimage.nextSlot: ${leafPreimage.nextSlot}, leafPreimage.nextIndex: ${Number(leafPreimage.nextIndex)}`,
      );
      this.log.debug(`leafPreimage.slot: ${leafPreimage.slot}, leafPreimage.value: ${leafPreimage.value}`);

      if (!alreadyPresent) {
        // Sanity check that the leaf slot is skipped by low leaf when it doesn't exist
        assert(
          leafPreimage.slot.toBigInt() < leafSlot.toBigInt() &&
            (leafPreimage.nextIndex === 0n || leafPreimage.nextSlot.toBigInt() > leafSlot.toBigInt()),
          'Public data tree low leaf should skip the target leaf slot when the target leaf does not exist or is the max value.',
        );
      }
      this.log.debug(
        `Tracing storage leaf preimage slot=${slot}, leafSlot=${leafSlot}, value=${value}, nextKey=${leafPreimage.nextSlot}, nextIndex=${leafPreimage.nextIndex}`,
      );
      // On non-existence, AVM circuit will need to recognize that leafPreimage.slot != leafSlot,
      // prove that this is a low leaf that skips leafSlot, and then prove membership of the leaf.
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
  public async peekStorage(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    const { value, cached } = await this.publicStorage.read(contractAddress, slot);
    this.log.debug(`Storage peek  (address=${contractAddress}, slot=${slot}): value=${value},  cached=${cached}`);
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
  public async checkNoteHashExists(contractAddress: AztecAddress, noteHash: Fr, leafIndex: Fr): Promise<boolean> {
    const gotLeafValue = (await this.worldStateDB.getCommitmentValue(leafIndex.toBigInt())) ?? Fr.ZERO;
    const exists = gotLeafValue.equals(noteHash);
    this.log.debug(
      `noteHashes(${contractAddress})@${noteHash} ?? leafIndex: ${leafIndex} | gotLeafValue: ${gotLeafValue}, exists: ${exists}.`,
    );
    if (this.doMerkleOperations) {
      // TODO(8287): We still return exists here, but we need to transmit both the requested noteHash and the gotLeafValue
      // such that the VM can constrain the equality and decide on exists based on that.
      const path = await this.merkleTrees.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex.toBigInt());
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists, path);
    } else {
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists);
    }
    return Promise.resolve(exists);
  }

  /**
   * Write a note hash, trace the write.
   * @param noteHash - the unsiloed note hash to write
   */
  public writeNoteHash(contractAddress: AztecAddress, noteHash: Fr): void {
    this.log.debug(`noteHashes(${contractAddress}) += @${noteHash}.`);

    if (this.doMerkleOperations) {
      // Should write a helper for this
      const leafIndex = new Fr(this.merkleTrees.treeMap.get(MerkleTreeId.NOTE_HASH_TREE)!.leafCount);
      const siloedNoteHash = siloNoteHash(contractAddress, noteHash);
      const insertionPath = this.merkleTrees.appendNoteHash(siloedNoteHash);
      this.trace.traceNewNoteHash(contractAddress, noteHash, leafIndex, insertionPath);
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
  public async checkNullifierExists(contractAddress: AztecAddress, nullifier: Fr): Promise<boolean> {
    this.log.debug(`Checking existence of nullifier (address=${contractAddress}, nullifier=${nullifier})`);
    const siloedNullifier = siloNullifier(contractAddress, nullifier);
    const [exists, isPending, _] = await this.nullifiers.checkExists(siloedNullifier);
    this.log.debug(`Checked siloed nullifier ${siloedNullifier} (exists=${exists}, pending=${isPending})`);

    if (this.doMerkleOperations) {
      // Get leaf if present, low leaf if absent
      // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
      const {
        preimage,
        index: leafIndex,
        alreadyPresent,
      } = await this.merkleTrees.getLeafOrLowLeafInfo(MerkleTreeId.NULLIFIER_TREE, siloedNullifier);
      const leafPreimage = preimage as NullifierLeafPreimage;
      const leafPath = await this.merkleTrees.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, leafIndex);

      assert(
        alreadyPresent == exists,
        'WorldStateDB contains nullifier leaf, but merkle tree does not.... This is a bug!',
      );

      if (exists) {
        this.log.debug(`Siloed nullifier ${siloedNullifier} exists at leafIndex=${leafIndex}`);
      } else {
        // Sanity check that the leaf value is skipped by low leaf when it doesn't exist
        assert(
          siloedNullifier.toBigInt() > leafPreimage.nullifier.toBigInt() &&
            siloedNullifier.toBigInt() < leafPreimage.nextNullifier.toBigInt(),
          'Nullifier tree low leaf should skip the target leaf nullifier when the target leaf does not exist.',
        );
      }

      this.trace.traceNullifierCheck(siloedNullifier, exists, leafPreimage, new Fr(leafIndex), leafPath);
    } else {
      this.trace.traceNullifierCheck(siloedNullifier, exists);
    }
    return Promise.resolve(exists);
  }

  /**
   * Write a nullifier to the nullifier set, trace the write.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to write
   */
  public async writeNullifier(contractAddress: AztecAddress, nullifier: Fr) {
    this.log.debug(`Inserting new nullifier (address=${nullifier}, nullifier=${contractAddress})`);
    const siloedNullifier = siloNullifier(contractAddress, nullifier);
    await this.writeSiloedNullifier(siloedNullifier);
  }

  /**
   * Write a nullifier to the nullifier set, trace the write.
   * @param siloedNullifier - the siloed nullifier to write
   */
  public async writeSiloedNullifier(siloedNullifier: Fr) {
    this.log.debug(`Inserting siloed nullifier=${siloedNullifier}`);

    if (this.doMerkleOperations) {
      // Maybe overkill, but we should check if the nullifier is already present in the tree before attempting to insert
      // It might be better to catch the error from the insert operation
      // Trace all nullifier creations, even duplicate insertions that fail
      const { preimage, index, alreadyPresent } = await this.merkleTrees.getLeafOrLowLeafInfo(
        MerkleTreeId.NULLIFIER_TREE,
        siloedNullifier,
      );
      if (alreadyPresent) {
        this.log.verbose(`Siloed nullifier ${siloedNullifier} already present in tree at index ${index}!`);
        // If the nullifier is already present, we should not insert it again
        // instead we provide the direct membership path
        const path = await this.merkleTrees.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, index);
        // This just becomes a nullifier read hint
        this.trace.traceNullifierCheck(
          siloedNullifier,
          /*exists=*/ alreadyPresent,
          preimage as NullifierLeafPreimage,
          new Fr(index),
          path,
        );
        throw new NullifierCollisionError(
          `Siloed nullifier ${siloedNullifier} already exists in parent cache or host.`,
        );
      } else {
        // Cache pending nullifiers for later access
        await this.nullifiers.append(siloedNullifier);
        // We append the new nullifier
        const appendResult = await this.merkleTrees.appendNullifier(siloedNullifier);
        this.log.debug(
          `Nullifier tree root after insertion ${this.merkleTrees.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!.getRoot()}`,
        );
        const lowLeafPreimage = appendResult.lowWitness.preimage as NullifierLeafPreimage;
        const lowLeafIndex = appendResult.lowWitness.index;
        const lowLeafPath = appendResult.lowWitness.siblingPath;
        const insertionPath = appendResult.insertionPath;
        this.trace.traceNewNullifier(
          siloedNullifier,
          lowLeafPreimage,
          new Fr(lowLeafIndex),
          lowLeafPath,
          insertionPath,
        );
      }
    } else {
      // Cache pending nullifiers for later access
      await this.nullifiers.append(siloedNullifier);
      this.trace.traceNewNullifier(siloedNullifier);
    }
  }

  public async writeSiloedNullifiersFromPrivate(siloedNullifiers: Fr[]) {
    for (const siloedNullifier of siloedNullifiers.filter(n => !n.isEmpty())) {
      await this.writeSiloedNullifier(siloedNullifier);
    }
  }

  /**
   * Check if an L1 to L2 message exists, trace the check.
   * @param msgHash - the message hash to check existence of
   * @param msgLeafIndex - the message leaf index to use in the check
   * @returns exists - whether the message exists in the L1 to L2 Messages tree
   */
  public async checkL1ToL2MessageExists(
    contractAddress: AztecAddress,
    msgHash: Fr,
    msgLeafIndex: Fr,
  ): Promise<boolean> {
    const valueAtIndex = (await this.worldStateDB.getL1ToL2LeafValue(msgLeafIndex.toBigInt())) ?? Fr.ZERO;
    const exists = valueAtIndex.equals(msgHash);
    this.log.debug(
      `l1ToL2Messages(@${msgLeafIndex}) ?? exists: ${exists}, expected: ${msgHash}, found: ${valueAtIndex}.`,
    );

    if (this.doMerkleOperations) {
      // TODO(8287): We still return exists here, but we need to transmit both the requested msgHash and the value
      // such that the VM can constrain the equality and decide on exists based on that.
      // We should defintely add a helper here
      const path = await this.merkleTrees.treeDb.getSiblingPath(
        MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
        msgLeafIndex.toBigInt(),
      );
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
  public writeL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    this.log.debug(`L2ToL1Messages(${contractAddress}) += (recipient: ${recipient}, content: ${content}).`);
    this.trace.traceNewL2ToL1Message(contractAddress, recipient, content);
  }

  /**
   * Write an unencrypted log
   * @param contractAddress - address of the contract that emitted the log
   * @param event - log event selector
   * @param log - log contents
   */
  public writeUnencryptedLog(contractAddress: AztecAddress, log: Fr[]) {
    this.log.debug(`UnencryptedL2Log(${contractAddress}) += event with ${log.length} fields.`);
    this.trace.traceUnencryptedLog(contractAddress, log);
  }

  /**
   * Get a contract instance.
   * @param contractAddress - address of the contract instance to retrieve.
   * @returns the contract instance or undefined if it does not exist.
   */
  public async getContractInstance(contractAddress: AztecAddress): Promise<SerializableContractInstance | undefined> {
    this.log.debug(`Getting contract instance for address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(contractAddress);
    const exists = instanceWithAddress !== undefined;

    // TODO: nullifier check!
    if (exists) {
      const instance = new SerializableContractInstance(instanceWithAddress);
      this.log.debug(
        `Got contract instance (address=${contractAddress}): exists=${exists}, instance=${jsonStringify(instance)}`,
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
   * Get a contract's bytecode from the contracts DB, also trace the contract class and instance
   */
  public async getBytecode(contractAddress: AztecAddress): Promise<Buffer | undefined> {
    this.log.debug(`Getting bytecode for contract address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(contractAddress);
    const exists = instanceWithAddress !== undefined;

    if (exists) {
      const instance = new SerializableContractInstance(instanceWithAddress);
      const contractClass = await this.worldStateDB.getContractClass(instance.contractClassId);
      const bytecodeCommitment = await this.worldStateDB.getBytecodeCommitment(instance.contractClassId);

      assert(
        contractClass,
        `Contract class not found in DB, but a contract instance was found with this class ID (${instance.contractClassId}). This should not happen!`,
      );

      assert(
        bytecodeCommitment,
        `Bytecode commitment was not found in DB for contract class (${instance.contractClassId}). This should not happen!`,
      );

      const contractClassPreimage = {
        artifactHash: contractClass.artifactHash,
        privateFunctionsRoot: contractClass.privateFunctionsRoot,
        publicBytecodeCommitment: bytecodeCommitment,
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

  public async traceNestedCall(
    forkedState: AvmPersistableStateManager,
    nestedEnvironment: AvmExecutionEnvironment,
    startGasLeft: Gas,
    bytecode: Buffer,
    avmCallResults: AvmContractCallResult,
  ) {
    const functionName = await getPublicFunctionDebugName(
      this.worldStateDB,
      nestedEnvironment.address,
      nestedEnvironment.functionSelector,
      nestedEnvironment.calldata,
    );

    this.log.verbose(`[AVM] Tracing nested external contract call ${functionName}`);

    this.trace.traceNestedCall(
      forkedState.trace,
      nestedEnvironment,
      startGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public traceEnqueuedCall(publicCallRequest: PublicCallRequest, calldata: Fr[], reverted: boolean) {
    this.trace.traceEnqueuedCall(publicCallRequest, calldata, reverted);
  }
}
