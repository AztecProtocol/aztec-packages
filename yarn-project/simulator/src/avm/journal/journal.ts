import { type IndexedTreeId, type MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces/server';
import { AvmNullifierReadTreeHint, AvmPublicDataReadTreeHint, PublicDataWrite } from '@aztec/circuits.js/avm';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { type ContractClassIdPreimage, SerializableContractInstance } from '@aztec/circuits.js/contract';
import {
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computeUniqueNoteHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/circuits.js/hash';
import type { PublicCallRequest } from '@aztec/circuits.js/kernel';
import { SharedMutableValues, SharedMutableValuesWithHash } from '@aztec/circuits.js/shared-mutable';
import { MerkleTreeId } from '@aztec/circuits.js/trees';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/circuits.js/trees';
import {
  CANONICAL_AUTH_REGISTRY_ADDRESS,
  DEPLOYER_CONTRACT_ADDRESS,
  FEE_JUICE_ADDRESS,
  MULTI_CALL_ENTRYPOINT_ADDRESS,
  REGISTERER_CONTRACT_ADDRESS,
  ROUTER_ADDRESS,
} from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import type { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { strict as assert } from 'assert';
import cloneDeep from 'lodash.clonedeep';

import { getPublicFunctionDebugName } from '../../common/debug_fn_name.js';
import { type WorldStateDB } from '../../public/public_db_sources.js';
import { type PublicSideEffectTraceInterface } from '../../public/side_effect_trace_interface.js';
import { type AvmExecutionEnvironment } from '../avm_execution_environment.js';
import { NullifierCollisionError, NullifierManager } from './nullifiers.js';
import { PublicStorage } from './public_storage.js';

/**
 * The result of fetching a leaf from an indexed tree. Contains the preimage and wether the leaf was already present
 * or it's a low leaf.
 */
type GetLeafResult<T extends IndexedTreeLeafPreimage> = {
  preimage: T;
  leafOrLowLeafIndex: bigint;
  alreadyPresent: boolean;
};

type NullifierMembershipResult = {
  exists: boolean;
  leafOrLowLeafPreimage: NullifierLeafPreimage;
  leafOrLowLeafIndex: bigint;
  leafOrLowLeafPath: Fr[];
};

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
  private readonly log = createLogger('simulator:avm:state_manager');

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
    /** DB interface for merkle tree operations */
    public db: MerkleTreeWriteOperations,
    public readonly firstNullifier: Fr,
  ) {}

  /**
   * Create a new state manager
   */
  public static create(
    worldStateDB: WorldStateDB,
    trace: PublicSideEffectTraceInterface,
    doMerkleOperations: boolean = false,
    firstNullifier: Fr,
  ): AvmPersistableStateManager {
    // TODO(dbanks12): temporary until we establish a better world state interface
    const db = worldStateDB.getMerkleInterface();

    return new AvmPersistableStateManager(
      worldStateDB,
      trace,
      /*publicStorage=*/ new PublicStorage(worldStateDB),
      /*nullifiers=*/ new NullifierManager(worldStateDB),
      /*doMerkleOperations=*/ doMerkleOperations,
      db,
      firstNullifier,
    );
  }

  /**
   * Create a new state manager forked from this one
   */
  public async fork() {
    await this.worldStateDB.createCheckpoint();
    return new AvmPersistableStateManager(
      this.worldStateDB,
      this.trace.fork(),
      this.publicStorage.fork(),
      this.nullifiers.fork(),
      this.doMerkleOperations,
      this.db,
      this.firstNullifier,
    );
  }

  /**
   * Accept forked world state modifications & traced side effects / hints
   */
  public async merge(forkedState: AvmPersistableStateManager) {
    await this._merge(forkedState, /*reverted=*/ false);
  }

  /**
   * Reject forked world state modifications & traced side effects, keep traced hints
   */
  public async reject(forkedState: AvmPersistableStateManager) {
    await this._merge(forkedState, /*reverted=*/ true);
  }

  private async _merge(forkedState: AvmPersistableStateManager, reverted: boolean) {
    // sanity check to avoid merging the same forked trace twice
    assert(
      !forkedState.alreadyMergedIntoParent,
      'Cannot merge forked state that has already been merged into its parent!',
    );
    forkedState.alreadyMergedIntoParent = true;
    this.publicStorage.acceptAndMerge(forkedState.publicStorage);
    this.nullifiers.acceptAndMerge(forkedState.nullifiers);
    this.trace.merge(forkedState.trace, reverted);
    if (reverted) {
      await this.worldStateDB.revertCheckpoint();
      if (this.doMerkleOperations) {
        this.log.trace(
          `Rolled back nullifier tree to root ${new Fr((await this.db.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).root)}`,
        );
      }
    } else {
      this.log.trace('Merging forked state into parent...');
      await this.worldStateDB.commitCheckpoint();
    }
  }

  /**
   * Write to public storage, journal/trace the write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public async writeStorage(contractAddress: AztecAddress, slot: Fr, value: Fr, protocolWrite = false): Promise<void> {
    const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, slot);
    this.log.trace(`Storage write (address=${contractAddress}, slot=${slot}): value=${value}, leafSlot=${leafSlot}`);

    if (this.doMerkleOperations) {
      // write to native merkle trees
      const publicDataWrite = new PublicDataWrite(leafSlot, value);
      const result = await this.db.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);
      assert(result !== undefined, 'Public data tree insertion error. You might want to disable doMerkleOperations.');
      this.log.trace(`Inserted public data tree leaf at leafSlot ${leafSlot}, value: ${value}`);

      // low leaf hint
      const lowLeafPreimage = result.lowLeavesWitnessData[0].leafPreimage as PublicDataTreeLeafPreimage;
      const lowLeafIndex = result.lowLeavesWitnessData[0].index;
      const lowLeafPath = result.lowLeavesWitnessData[0].siblingPath.toFields();
      // new leaf insertion
      const newLeafPreimage: PublicDataTreeLeafPreimage = cloneDeep(lowLeafPreimage);
      let insertionPath: Fr[] | undefined;

      if (result.insertionWitnessData.length === 0) {
        assert(
          newLeafPreimage.value.equals(value),
          `Value mismatch when performing public data write (got value: ${value}, value in tree: ${newLeafPreimage.value})`,
        );
      } else {
        this.log.debug(`insertion witness data length: ${result.insertionWitnessData.length}`);
        // The new leaf preimage should have the new value and slot
        newLeafPreimage.slot = leafSlot;
        newLeafPreimage.value = value;
        // TODO: is this necessary?! Why doesn't sequentialInsert return the newLeafPreimage via
        // result.insertionWitnessData[0].leafPreimage?

        this.log.debug(
          `newLeafPreimage.slot: ${newLeafPreimage.slot}, newLeafPreimage.value: ${newLeafPreimage.value}`,
        );
        this.log.debug(`insertion index: ${result.insertionWitnessData[0].index}`);
        insertionPath = result.insertionWitnessData[0].siblingPath.toFields();
      }

      await this.trace.tracePublicStorageWrite(
        contractAddress,
        slot,
        value,
        protocolWrite,
        lowLeafPreimage,
        new Fr(lowLeafIndex),
        lowLeafPath,
        newLeafPreimage,
        insertionPath,
      );
    } else {
      // Cache storage writes for later reference/reads
      this.publicStorage.write(contractAddress, slot, value);
      await this.trace.tracePublicStorageWrite(contractAddress, slot, value, protocolWrite);
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
    if (this.doMerkleOperations) {
      const { value, leafPreimage, leafIndex, leafPath } = await this.getPublicDataMembership(contractAddress, slot);
      this.trace.tracePublicStorageRead(contractAddress, slot, value, leafPreimage, leafIndex, leafPath);
      return value;
    } else {
      const read = await this.publicStorage.read(contractAddress, slot);
      this.log.trace(
        `Storage read results (address=${contractAddress}, slot=${slot}): value=${read.value}, cached=${read.cached}`,
      );
      this.trace.tracePublicStorageRead(contractAddress, slot, read.value);
      return read.value;
    }
  }

  async getPublicDataMembership(
    contractAddress: AztecAddress,
    slot: Fr,
  ): Promise<{
    value: Fr;
    leafPreimage: PublicDataTreeLeafPreimage;
    leafIndex: Fr;
    leafPath: Fr[];
  }> {
    const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, slot);
    const treeId = MerkleTreeId.PUBLIC_DATA_TREE;

    // Get leaf if present, low leaf if absent
    // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
    const { preimage, leafOrLowLeafIndex, alreadyPresent } = await this.getLeafOrLowLeafInfo<
      typeof treeId,
      PublicDataTreeLeafPreimage
    >(treeId, leafSlot.toBigInt());
    // The index and preimage here is either the low leaf or the leaf itself (depending on the value of update flag)
    // In either case, we just want the sibling path to this leaf - it's up to the avm to distinguish if it's a low leaf or not
    const leafPath = await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, leafOrLowLeafIndex);
    const leafPreimage = preimage as PublicDataTreeLeafPreimage;

    const value = alreadyPresent ? leafPreimage.value : Fr.zero(); // default value of 0
    if (!alreadyPresent) {
      this.log.trace(`Slot has never been written before!`);
      // Sanity check that the leaf slot is skipped by low leaf when it doesn't exist
      assert(
        leafPreimage.slot.toBigInt() < leafSlot.toBigInt() &&
          (leafPreimage.nextIndex === 0n || leafPreimage.nextSlot.toBigInt() > leafSlot.toBigInt()),
        'Public data tree low leaf should skip the target leaf slot when the target leaf does not exist or is the max value.',
      );
    }

    this.log.trace(
      `Storage read results (address=${contractAddress}, slot=${slot}, leafSlot=${leafSlot}): value=${value}, previouslyWritten=${alreadyPresent}`,
    );

    return {
      value,
      leafPreimage,
      leafIndex: new Fr(leafOrLowLeafIndex),
      leafPath: leafPath.toFields(),
    };
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
    this.log.trace(`Storage peek  (address=${contractAddress}, slot=${slot}): value=${value},  cached=${cached}`);
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
    this.log.trace(
      `noteHashes(${contractAddress})@${noteHash} ?? leafIndex: ${leafIndex} | gotLeafValue: ${gotLeafValue}, exists: ${exists}.`,
    );
    if (this.doMerkleOperations) {
      const path = await this.db.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex.toBigInt());
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists, path.toFields());
    } else {
      this.trace.traceNoteHashCheck(contractAddress, gotLeafValue, leafIndex, exists);
    }
    return Promise.resolve(exists);
  }

  /**
   * Write a raw note hash, silo it and make it unique, then trace the write.
   * @param noteHash - the unsiloed note hash to write
   */
  public async writeNoteHash(contractAddress: AztecAddress, noteHash: Fr): Promise<void> {
    this.log.trace(`noteHashes(${contractAddress}) += ${noteHash}.`);
    const siloedNoteHash = await siloNoteHash(contractAddress, noteHash);

    await this.writeSiloedNoteHash(siloedNoteHash);
  }

  /**
   * Write a note hash, make it unique, trace the write.
   * @param siloedNoteHash - the non unique note hash to write
   */
  public async writeSiloedNoteHash(siloedNoteHash: Fr): Promise<void> {
    const nonce = await computeNoteHashNonce(this.firstNullifier, this.trace.getNoteHashCount());
    const uniqueNoteHash = await computeUniqueNoteHash(nonce, siloedNoteHash);

    await this.writeUniqueNoteHash(uniqueNoteHash);
  }

  /**
   * Write a note hash, trace the write.
   * @param uniqueNoteHash - the siloed unique hash to write
   */
  public async writeUniqueNoteHash(uniqueNoteHash: Fr): Promise<void> {
    this.log.trace(`noteHashes += @${uniqueNoteHash}.`);

    if (this.doMerkleOperations) {
      // Should write a helper for this
      const treeInfo = await this.db.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE);
      const leafIndex = new Fr(treeInfo.size);
      await this.db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [uniqueNoteHash]);
      const insertionPath = await this.db.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex.toBigInt());
      this.trace.traceNewNoteHash(uniqueNoteHash, leafIndex, insertionPath.toFields());
    } else {
      this.trace.traceNewNoteHash(uniqueNoteHash);
    }
  }

  /**
   * Check if a nullifier exists, trace the check.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to check
   * @returns exists - whether the nullifier exists in the nullifier set
   */
  public async checkNullifierExists(contractAddress: AztecAddress, nullifier: Fr): Promise<boolean> {
    this.log.trace(`Checking existence of nullifier (address=${contractAddress}, nullifier=${nullifier})`);
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);

    if (this.doMerkleOperations) {
      const { exists, leafOrLowLeafPreimage, leafOrLowLeafIndex, leafOrLowLeafPath } =
        await this.getNullifierMembership(siloedNullifier);
      this.trace.traceNullifierCheck(
        siloedNullifier,
        exists,
        leafOrLowLeafPreimage,
        new Fr(leafOrLowLeafIndex!),
        leafOrLowLeafPath,
      );
      return Promise.resolve(exists);
    } else {
      const { exists, cacheHit } = await this.nullifiers.checkExists(siloedNullifier);
      this.log.trace(`Checked siloed nullifier ${siloedNullifier} (exists=${exists}), cacheHit=${cacheHit}`);
      this.trace.traceNullifierCheck(siloedNullifier, exists);
      return Promise.resolve(exists);
    }
  }

  /**
   * Helper to get membership information for a siloed nullifier when checking its existence.
   * Optionally trace the nullifier check.
   *
   * @param siloedNullifier - the siloed nullifier to get membership information for
   * @returns
   *     - exists - whether the nullifier exists in the nullifier set
   *     - leafOrLowLeafPreimage - the preimage of the nullifier leaf or its low-leaf if it doesn't exist
   *     - leafOrLowLeafIndex - the leaf index of the nullifier leaf or its low-leaf if it doesn't exist
   *     - leafOrLowLeafPath - the sibling path of the nullifier leaf or its low-leaf if it doesn't exist
   */
  private async getNullifierMembership(siloedNullifier: Fr): Promise<NullifierMembershipResult> {
    // Get leaf if present, low leaf if absent
    // If leaf is present, hint/trace it. Otherwise, hint/trace the low leaf.
    const treeId = MerkleTreeId.NULLIFIER_TREE;
    const {
      preimage: leafPreimage,
      leafOrLowLeafIndex,
      alreadyPresent,
    } = await this.getLeafOrLowLeafInfo<typeof treeId, NullifierLeafPreimage>(treeId, siloedNullifier.toBigInt());
    this.log.trace(`Checked siloed nullifier ${siloedNullifier} (exists=${alreadyPresent})`);

    const leafPath = await this.db.getSiblingPath(treeId, leafOrLowLeafIndex!);

    if (alreadyPresent) {
      this.log.trace(`Siloed nullifier ${siloedNullifier} exists at leafIndex=${leafOrLowLeafIndex}`);
    } else {
      // Sanity check that the leaf value is skipped by low leaf when it doesn't exist
      assert(
        leafPreimage.nullifier.toBigInt() < siloedNullifier.toBigInt() &&
          (leafPreimage.nextIndex === 0n || leafPreimage.nextNullifier.toBigInt() > siloedNullifier.toBigInt()),
        'Nullifier tree low leaf should skip the target leaf nullifier when the target leaf does not exist.',
      );
    }
    return {
      exists: alreadyPresent,
      leafOrLowLeafPreimage: leafPreimage,
      leafOrLowLeafIndex,
      leafOrLowLeafPath: leafPath.toFields(),
    };
  }

  /**
   * Write a nullifier to the nullifier set, trace the write.
   * @param contractAddress - address of the contract that the nullifier is associated with
   * @param nullifier - the unsiloed nullifier to write
   */
  public async writeNullifier(contractAddress: AztecAddress, nullifier: Fr) {
    this.log.trace(`Inserting new nullifier (address=${nullifier}, nullifier=${contractAddress})`);
    const siloedNullifier = await siloNullifier(contractAddress, nullifier);
    await this.writeSiloedNullifier(siloedNullifier);
  }

  /**
   * Write a nullifier to the nullifier set, trace the write.
   * @param siloedNullifier - the siloed nullifier to write
   */
  public async writeSiloedNullifier(siloedNullifier: Fr) {
    this.log.trace(`Inserting siloed nullifier=${siloedNullifier}`);

    if (this.doMerkleOperations) {
      const treeId = MerkleTreeId.NULLIFIER_TREE;
      const {
        preimage: leafPreimage,
        leafOrLowLeafIndex,
        alreadyPresent,
      } = await this.getLeafOrLowLeafInfo<typeof treeId, NullifierLeafPreimage>(treeId, siloedNullifier.toBigInt());

      if (alreadyPresent) {
        this.log.verbose(`Siloed nullifier ${siloedNullifier} already present in tree at index ${leafOrLowLeafIndex}!`);
        // If the nullifier is already present, we should not insert it again
        // instead we provide the direct membership path
        const membershipPath = await this.db.getSiblingPath(treeId, leafOrLowLeafIndex);
        // This just becomes a nullifier read hint
        this.trace.traceNullifierCheck(
          siloedNullifier,
          /*exists=*/ alreadyPresent,
          leafPreimage,
          new Fr(leafOrLowLeafIndex),
          membershipPath.toFields(),
        );
        throw new NullifierCollisionError(
          `Siloed nullifier ${siloedNullifier} already exists in parent cache or host.`,
        );
      } else {
        const appendResult = await this.db.sequentialInsert(treeId, [siloedNullifier.toBuffer()]);
        const lowLeafWitnessData = appendResult.lowLeavesWitnessData![0];
        const lowLeafPreimage = lowLeafWitnessData.leafPreimage as NullifierLeafPreimage;
        const lowLeafIndex = lowLeafWitnessData.index;
        const lowLeafPath = lowLeafWitnessData.siblingPath.toFields();
        const insertionPath = appendResult.insertionWitnessData[0].siblingPath.toFields();

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
    this.log.trace(
      `l1ToL2Messages(@${msgLeafIndex}) ?? exists: ${exists}, expected: ${msgHash}, found: ${valueAtIndex}.`,
    );

    if (this.doMerkleOperations) {
      const path = await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, msgLeafIndex.toBigInt());
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
    this.log.trace(`L2ToL1Messages(${contractAddress}) += (recipient: ${recipient}, content: ${content}).`);
    this.trace.traceNewL2ToL1Message(contractAddress, recipient, content);
  }

  /**
   * Write a public log
   * @param contractAddress - address of the contract that emitted the log
   * @param log - log contents
   */
  public writePublicLog(contractAddress: AztecAddress, log: Fr[]) {
    this.log.trace(`PublicLog(${contractAddress}) += event with ${log.length} fields.`);
    this.trace.tracePublicLog(contractAddress, log);
  }

  /**
   * Get a contract instance.
   * @param contractAddress - address of the contract instance to retrieve.
   * @returns the contract instance or undefined if it does not exist.
   */
  public async getContractInstance(contractAddress: AztecAddress): Promise<SerializableContractInstance | undefined> {
    this.log.trace(`Getting contract instance for address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(contractAddress);
    const exists = instanceWithAddress !== undefined;

    const instance = exists ? new SerializableContractInstance(instanceWithAddress) : undefined;
    if (exists) {
      this.log.trace(`Got contract instance (address=${contractAddress}): instance=${jsonStringify(instance!)}`);
    } else {
      this.log.debug(`Contract instance NOT FOUND (address=${contractAddress})`);
    }

    if (!this.doMerkleOperations || contractAddressIsCanonical(contractAddress)) {
      // Canonical addresses do not trigger nullifier & public storage checks
      if (exists) {
        this.trace.traceGetContractInstance(contractAddress, exists, instance);
      } else {
        this.trace.traceGetContractInstance(contractAddress, exists);
      }
    } else {
      const contractAddressNullifier = await siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        contractAddress.toField(),
      );
      const {
        exists: nullifierExistsInTree,
        leafOrLowLeafPreimage: nullifierLeafOrLowLeafPreimage,
        leafOrLowLeafIndex: nullifierLeafOrLowLeafIndex,
        leafOrLowLeafPath: nullifierLeafOrLowLeafPath,
      } = await this.getNullifierMembership(/*siloedNullifier=*/ contractAddressNullifier);
      const nullifierMembership = new AvmNullifierReadTreeHint(
        nullifierLeafOrLowLeafPreimage,
        new Fr(nullifierLeafOrLowLeafIndex),
        nullifierLeafOrLowLeafPath,
      );
      assert(
        exists == nullifierExistsInTree,
        'WorldStateDB contains contract instance, but nullifier tree does not contain contract address (or vice versa).... This is a bug!',
      );

      const { updateMembership, updatePreimage } = await this.getContractUpdateHints(contractAddress);

      this.trace.traceGetContractInstance(
        contractAddress,
        exists,
        instance,
        nullifierMembership,
        updateMembership,
        updatePreimage,
      );
    }
    return instance;
  }

  /**
   * Get a contract's bytecode from the contracts DB, also trace the contract class and instance
   */
  public async getBytecode(contractAddress: AztecAddress): Promise<Buffer | undefined> {
    this.log.debug(`Getting bytecode for contract address ${contractAddress}`);
    const instanceWithAddress = await this.worldStateDB.getContractInstance(contractAddress);
    const exists = instanceWithAddress !== undefined;

    let instance: SerializableContractInstance | undefined;
    let bytecode: Buffer | undefined;
    let contractClassPreimage: ContractClassIdPreimage | undefined;

    if (exists) {
      instance = new SerializableContractInstance(instanceWithAddress);
      const contractClass = await this.worldStateDB.getContractClass(instance.currentContractClassId);
      const bytecodeCommitment = await this.worldStateDB.getBytecodeCommitment(instance.currentContractClassId);

      assert(
        contractClass,
        `Contract class not found in DB, but a contract instance was found with this class ID (${instance.currentContractClassId}). This should not happen!`,
      );

      assert(
        bytecodeCommitment,
        `Bytecode commitment was not found in DB for contract class (${instance.currentContractClassId}). This should not happen!`,
      );

      bytecode = contractClass.packedBytecode;
      contractClassPreimage = {
        artifactHash: contractClass.artifactHash,
        privateFunctionsRoot: contractClass.privateFunctionsRoot,
        publicBytecodeCommitment: bytecodeCommitment,
      };
    }

    if (exists) {
      this.log.trace(`Got contract instance (address=${contractAddress}): instance=${jsonStringify(instance!)}`);
    } else {
      this.log.debug(`Contract instance NOT FOUND (address=${contractAddress})`);
    }

    if (!this.doMerkleOperations || contractAddressIsCanonical(contractAddress)) {
      // Canonical addresses do not trigger nullifier check
      if (exists) {
        this.trace.traceGetBytecode(contractAddress, exists, bytecode, instance, contractClassPreimage);
      } else {
        this.trace.traceGetBytecode(contractAddress, exists);
      }
    } else {
      const contractAddressNullifier = await siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        contractAddress.toField(),
      );
      const {
        exists: nullifierExistsInTree,
        leafOrLowLeafPreimage: nullifierLeafOrLowLeafPreimage,
        leafOrLowLeafIndex: nullifierLeafOrLowLeafIndex,
        leafOrLowLeafPath: nullifierLeafOrLowLeafPath,
      } = await this.getNullifierMembership(/*siloedNullifier=*/ contractAddressNullifier);
      assert(
        exists == nullifierExistsInTree,
        'WorldStateDB contains contract instance, but nullifier tree does not contain contract address (or vice versa).... This is a bug!',
      );
      const nullifierMembership = new AvmNullifierReadTreeHint(
        nullifierLeafOrLowLeafPreimage,
        new Fr(nullifierLeafOrLowLeafIndex),
        nullifierLeafOrLowLeafPath,
      );

      const { updateMembership, updatePreimage } = await this.getContractUpdateHints(contractAddress);
      this.trace.traceGetBytecode(
        contractAddress,
        exists,
        bytecode,
        instance,
        contractClassPreimage,
        nullifierMembership,
        updateMembership,
        updatePreimage,
      );
    }
    // NOTE: If the contract instance is not found, we assume it has not been deployed.
    // It doesnt matter what the values of the contract instance are in this case, as long as we tag it with exists=false.
    // This will hint to the avm circuit to just perform the non-membership check on the address and disregard the bytecode hash
    return bytecode;
  }

  async getContractUpdateHints(contractAddress: AztecAddress) {
    const { sharedMutableSlot, sharedMutableHashSlot } = await SharedMutableValuesWithHash.getContractUpdateSlots(
      contractAddress,
    );

    const {
      value: hash,
      leafPreimage,
      leafIndex,
      leafPath,
    } = await this.getPublicDataMembership(ProtocolContractAddress.ContractInstanceDeployer, sharedMutableHashSlot);
    const updateMembership = new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, leafPath);

    const readStorage = async (storageSlot: Fr) =>
      (await this.publicStorage.read(ProtocolContractAddress.ContractInstanceDeployer, storageSlot)).value;

    const sharedMutableValues = await SharedMutableValues.readFromTree(sharedMutableSlot, readStorage);

    const updatePreimage = sharedMutableValues.toFields();

    if (!hash.isZero()) {
      const hashed = await poseidon2Hash(updatePreimage);
      if (!hashed.equals(hash)) {
        throw new Error(`Update hint hash mismatch: ${hash} != ${hashed}`);
      }
      this.log.trace(`Non empty update hint found for contract ${contractAddress}`);
    } else {
      if (updatePreimage.some(f => !f.isZero())) {
        throw new Error(`Update hint hash is zero, but update preimage is not: ${updatePreimage}`);
      }
      this.log.trace(`No update hint found for contract ${contractAddress}`);
    }

    return {
      updateMembership,
      updatePreimage,
    };
  }

  public traceEnqueuedCall(publicCallRequest: PublicCallRequest, calldata: Fr[], reverted: boolean) {
    this.trace.traceEnqueuedCall(publicCallRequest, calldata, reverted);
  }

  public async getPublicFunctionDebugName(avmEnvironment: AvmExecutionEnvironment): Promise<string> {
    return await getPublicFunctionDebugName(this.worldStateDB, avmEnvironment.address, avmEnvironment.calldata);
  }

  public async getLeafOrLowLeafInfo<ID extends IndexedTreeId, T extends IndexedTreeLeafPreimage>(
    treeId: ID,
    key: bigint,
  ): Promise<GetLeafResult<T>> {
    // "key" is siloed slot (leafSlot) or siloed nullifier
    const leafOrLowLeafInfo = await this.db.getPreviousValueIndex(treeId, key);
    assert(
      leafOrLowLeafInfo !== undefined,
      `${MerkleTreeId[treeId]} low leaf index should always be found (even if target leaf does not exist)`,
    );
    const { index: leafOrLowLeafIndex, alreadyPresent } = leafOrLowLeafInfo;

    const leafPreimage = await this.db.getLeafPreimage(treeId, leafOrLowLeafIndex);
    assert(
      leafPreimage !== undefined,
      `${MerkleTreeId[treeId]}  low leaf preimage should never be undefined (even if target leaf does not exist)`,
    );

    return { preimage: leafPreimage as T, leafOrLowLeafIndex, alreadyPresent };
  }
}

function contractAddressIsCanonical(contractAddress: AztecAddress): boolean {
  return (
    contractAddress.equals(AztecAddress.fromNumber(CANONICAL_AUTH_REGISTRY_ADDRESS)) ||
    contractAddress.equals(AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS)) ||
    contractAddress.equals(AztecAddress.fromNumber(REGISTERER_CONTRACT_ADDRESS)) ||
    contractAddress.equals(AztecAddress.fromNumber(MULTI_CALL_ENTRYPOINT_ADDRESS)) ||
    contractAddress.equals(AztecAddress.fromNumber(FEE_JUICE_ADDRESS)) ||
    contractAddress.equals(AztecAddress.fromNumber(ROUTER_ADDRESS))
  );
}
