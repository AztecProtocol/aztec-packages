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
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublicWithCommitment, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { SharedMutableValues, SharedMutableValuesWithHash } from '@aztec/stdlib/shared-mutable';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TreeSnapshots } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import type { AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import type { PublicContractsDBInterface } from '../db_interfaces.js';
import { getPublicFunctionDebugName } from '../debug_fn_name.js';
import type { PublicTreesDB } from '../public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../side_effect_trace_interface.js';
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
export class PublicPersistableStateManager {
  private readonly log = createLogger('simulator:state_manager');

  /** Make sure a forked state is never merged twice. */
  private alreadyMergedIntoParent = false;

  constructor(
    private readonly treesDB: PublicTreesDB,
    private readonly contractsDB: PublicContractsDBInterface,
    private readonly trace: PublicSideEffectTraceInterface,
    private readonly firstNullifier: Fr, // Needed for note hashes.
    private readonly blockNumber: number, // Needed for contract updates.
    private readonly doMerkleOperations: boolean = false,
    private readonly publicStorage: PublicStorage = new PublicStorage(treesDB),
    private readonly nullifiers: NullifierManager = new NullifierManager(treesDB),
  ) {}

  /**
   * Create a new state manager
   */
  public static create(
    treesDB: PublicTreesDB,
    contractsDB: PublicContractsDBInterface,
    trace: PublicSideEffectTraceInterface,
    doMerkleOperations: boolean = false,
    firstNullifier: Fr,
    blockNumber: number,
  ): PublicPersistableStateManager {
    return new PublicPersistableStateManager(
      treesDB,
      contractsDB,
      trace,
      firstNullifier,
      blockNumber,
      doMerkleOperations,
    );
  }

  /**
   * Create a new state manager forked from this one
   */
  public async fork() {
    await this.treesDB.createCheckpoint();
    return new PublicPersistableStateManager(
      this.treesDB,
      this.contractsDB,
      this.trace.fork(),
      this.firstNullifier,
      this.blockNumber,
      this.doMerkleOperations,
      this.publicStorage.fork(),
      this.nullifiers.fork(),
    );
  }

  /**
   * Accept forked world state modifications & traced side effects / hints
   */
  public async merge(forkedState: PublicPersistableStateManager) {
    await this._merge(forkedState, /*reverted=*/ false);
  }

  /**
   * Reject forked world state modifications & traced side effects, keep traced hints
   */
  public async reject(forkedState: PublicPersistableStateManager) {
    await this._merge(forkedState, /*reverted=*/ true);
  }

  private async _merge(forkedState: PublicPersistableStateManager, reverted: boolean) {
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
      this.log.trace('Reverting forked state...');
      await this.treesDB.revertCheckpoint();
    } else {
      this.log.trace('Merging forked state into parent...');
      await this.treesDB.commitCheckpoint();
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
    this.log.trace(`Storage write (address=${contractAddress}, slot=${slot}): value=${value}`);

    if (this.doMerkleOperations) {
      // write to native merkle trees
      await this.treesDB.storageWrite(contractAddress, slot, value);
    } else {
      // Cache storage writes for later reference/reads
      this.publicStorage.write(contractAddress, slot, value);
    }

    await this.trace.tracePublicStorageWrite(contractAddress, slot, value, protocolWrite);
  }

  public isStorageCold(contractAddress: AztecAddress, slot: Fr): boolean {
    return this.trace.isStorageCold(contractAddress, slot);
  }

  /**
   * Read from public storage.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns the latest value written to slot, or 0 if never written to before
   */
  public async readStorage(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    if (this.doMerkleOperations) {
      return await this.treesDB.storageRead(contractAddress, slot);
    } else {
      // TODO(fcarreiro): I don't get this. PublicStorage CAN end up reading the tree. Why is it in the "dont do merkle operations" branch?
      const read = await this.publicStorage.read(contractAddress, slot);
      this.log.trace(
        `Storage read results (address=${contractAddress}, slot=${slot}): value=${read.value}, cached=${read.cached}`,
      );
      return read.value;
    }
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
    const gotLeafValue = await this.treesDB.getNoteHash(leafIndex.toBigInt());
    const exists = gotLeafValue !== undefined && gotLeafValue.equals(noteHash);
    this.log.trace(
      `noteHashes(${contractAddress})@${noteHash} ?? leafIndex: ${leafIndex} | gotLeafValue: ${gotLeafValue}, exists: ${exists}.`,
    );
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
    const noteNonce = await computeNoteHashNonce(this.firstNullifier, this.trace.getNoteHashCount());
    const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNoteHash);
    await this.writeUniqueNoteHash(uniqueNoteHash);
  }

  /**
   * Write a note hash, trace the write.
   * @param uniqueNoteHash - the siloed unique hash to write
   */
  public async writeUniqueNoteHash(uniqueNoteHash: Fr): Promise<void> {
    this.log.trace(`noteHashes += @${uniqueNoteHash}.`);
    if (this.doMerkleOperations) {
      await this.treesDB.writeNoteHash(uniqueNoteHash);
    }
    this.trace.traceNewNoteHash(uniqueNoteHash);
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
      const exists = await this.treesDB.checkNullifierExists(siloedNullifier);
      this.log.trace(`Checked siloed nullifier ${siloedNullifier} (exists=${exists})`);
      return Promise.resolve(exists);
    } else {
      const { exists, cacheHit } = await this.nullifiers.checkExists(siloedNullifier);
      this.log.trace(`Checked siloed nullifier ${siloedNullifier} (exists=${exists}), cacheHit=${cacheHit}`);
      return Promise.resolve(exists);
    }
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
      const exists = await this.treesDB.checkNullifierExists(siloedNullifier);

      if (exists) {
        this.log.verbose(`Siloed nullifier ${siloedNullifier} already present in tree!`);
        throw new NullifierCollisionError(
          `Siloed nullifier ${siloedNullifier} already exists in parent cache or host.`,
        );
      } else {
        await this.treesDB.writeNullifier(siloedNullifier);
      }
    } else {
      // Cache pending nullifiers for later access
      await this.nullifiers.append(siloedNullifier);
    }

    this.trace.traceNewNullifier(siloedNullifier);
  }

  /**
   * Check if an L1 to L2 message exists, trace the check.
   * @param msgHash - the message hash to check existence of
   * @param msgLeafIndex - the message leaf index to use in the check
   * @returns exists - whether the message exists in the L1 to L2 Messages tree
   */
  public async checkL1ToL2MessageExists(msgHash: Fr, msgLeafIndex: Fr): Promise<boolean> {
    const valueAtIndex = await this.treesDB.getL1ToL2LeafValue(msgLeafIndex.toBigInt());
    const exists = valueAtIndex !== undefined && valueAtIndex.equals(msgHash);
    this.log.trace(
      `l1ToL2Messages(@${msgLeafIndex}) ?? exists: ${exists}, expected: ${msgHash}, found: ${valueAtIndex}.`,
    );
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
   * Write a scoped L2 to L1 message.
   * @param l2ToL1Message - The L2 to L1 message to write.
   */
  public writeScopedL2ToL1Message(l2ToL1Message: ScopedL2ToL1Message) {
    this.writeL2ToL1Message(
      l2ToL1Message.contractAddress,
      l2ToL1Message.message.recipient.toField(),
      l2ToL1Message.message.content,
    );
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
    const instanceWithAddress = await this.contractsDB.getContractInstance(contractAddress, this.blockNumber);
    const exists = instanceWithAddress !== undefined;

    const instance = exists ? new SerializableContractInstance(instanceWithAddress) : undefined;
    if (!exists) {
      this.log.debug(`Contract instance NOT FOUND (address=${contractAddress})`);
      return undefined;
    }

    this.log.trace(`Got contract instance (address=${contractAddress}): instance=${jsonStringify(instance!)}`);
    // Canonical addresses do not trigger nullifier and update checks.
    if (contractAddressIsCanonical(contractAddress)) {
      return instance;
    }

    // This will decide internally whether to check the nullifier tree or not depending on doMerkleOperations.
    const nullifierExistsInTree = await this.checkNullifierExists(
      AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
      contractAddress.toField(),
    );
    assert(
      exists == nullifierExistsInTree,
      `Contract instance for address ${contractAddress} in DB: ${exists} != nullifier tree: ${nullifierExistsInTree}. This is a bug!`,
    );

    // All that is left is tocheck that the contract updatability information is correct.
    // That is, that the current and original contract class ids are correct.
    await this.checkContractUpdateInformation(instanceWithAddress);

    return instance;
  }

  private async checkContractUpdateInformation(instance: ContractInstanceWithAddress): Promise<void> {
    // If "merkle operations" are not requested, we trust the DB.
    // Otherwise we check that the contract updatability information is correct.
    // That is, that the current and original contract class ids are correct.
    // All failures are fatal and the simulation is not expected to be provable.
    if (this.doMerkleOperations) {
      // Conceptually, we want to do the following:
      // * Read a SharedMutable at the contract update slot.
      // * Obtain the expected current class id from the SharedMutable, at the current block.
      // * if expectedId == 0 then currentClassId should be original contract class id
      // * if expectedId != 0 then currentClassId should be expectedId
      //
      // However, we will also be checking the hash of the shared mutable values.
      // This is a bit of a leak of information, since the circuit will use it to prove
      // one public read insted of N of the shared mutable values.
      const { sharedMutableSlot, sharedMutableHashSlot } = await SharedMutableValuesWithHash.getContractUpdateSlots(
        instance.address,
      );
      const readDeployerStorage = async (storageSlot: Fr) =>
        await this.readStorage(ProtocolContractAddress.ContractInstanceDeployer, storageSlot);

      const hash = await readDeployerStorage(sharedMutableHashSlot);
      const sharedMutableValues = await SharedMutableValues.readFromTree(sharedMutableSlot, readDeployerStorage);
      const preImage = sharedMutableValues.toFields();

      // 1) update never scheduled: hash == 0 and preimage should be empty (but poseidon2hash(preimage) will not be 0s)
      if (hash.isZero()) {
        assert(
          preImage.every(f => f.isZero()),
          `Found updatability hash 0 but preimage is not empty for contract instance ${instance.address}.`,
        );
        assert(
          instance.currentContractClassId.equals(instance.originalContractClassId),
          `Found updatability hash 0 for contract instance ${instance.address} but original class id ${instance.originalContractClassId} != current class id ${instance.currentContractClassId}.`,
        );
        return;
      }

      // 2) At this point we know that the hash is not zero and this means that an update has at some point been scheduled.
      const computedHash = await poseidon2Hash(preImage);
      assert(
        hash.equals(computedHash),
        `Shared mutable values hash mismatch for contract instance ${instance.address}. Expected: ${hash}, computed: ${computedHash}`,
      );

      // We now check that, depending on the current block, the current class id is correct.
      const expectedClassIdRaw = sharedMutableValues.svc.getCurrentAt(this.blockNumber).at(0)!;
      const expectedClassId = expectedClassIdRaw.isZero() ? instance.originalContractClassId : expectedClassIdRaw;
      assert(
        instance.currentContractClassId.equals(expectedClassId),
        `Current class id mismatch
        for contract instance ${instance.address}. Expected: ${expectedClassId}, current: ${instance.currentContractClassId}`,
      );
    }
  }

  /**
   * Get a contract class.
   * @param classId - class id to retrieve.
   * @returns the contract class or undefined if it does not exist.
   */
  public async getContractClass(classId: Fr): Promise<ContractClassPublicWithCommitment | undefined> {
    this.log.trace(`Getting contract class for id ${classId}`);
    const contractClass = await this.contractsDB.getContractClass(classId);
    const exists = contractClass !== undefined;
    let extendedClass: ContractClassPublicWithCommitment | undefined = undefined;

    // Note: We currently do not generate info to check the nullifier tree, because
    // this is not needed for our use cases.
    if (exists) {
      this.log.trace(`Got contract class (id=${classId})`);
      // Extend class information with public bytecode commitment.
      const bytecodeCommitment = await this.contractsDB.getBytecodeCommitment(classId);
      assert(
        bytecodeCommitment,
        `Bytecode commitment was not found in DB for contract class (${classId}). This should not happen!`,
      );
      extendedClass = {
        ...contractClass,
        publicBytecodeCommitment: bytecodeCommitment,
      };
    } else {
      this.log.debug(`Contract instance NOT FOUND (id=${classId})`);
    }

    this.trace.traceGetContractClass(classId, exists);
    return extendedClass;
  }

  /**
   * Get a contract's bytecode from the contracts DB, also trace the contract class and instance indirectly.
   */
  public async getBytecode(contractAddress: AztecAddress): Promise<Buffer | undefined> {
    this.log.debug(`Getting bytecode for contract address ${contractAddress}`);
    const contractInstance = await this.getContractInstance(contractAddress);

    if (!contractInstance) {
      return undefined;
    }

    const contractClass = await this.getContractClass(contractInstance.currentContractClassId);
    assert(
      contractClass,
      `Contract class not found in DB, but a contract instance was found with this class ID (${contractInstance.currentContractClassId}). This should not happen!`,
    );

    return contractClass.packedBytecode;
  }

  public async getPublicFunctionDebugName(avmEnvironment: AvmExecutionEnvironment): Promise<string> {
    return await getPublicFunctionDebugName(this.contractsDB, avmEnvironment.address, avmEnvironment.calldata);
  }

  public async padTree(treeId: MerkleTreeId, leavesToInsert: number): Promise<void> {
    await this.treesDB.padTree(treeId, leavesToInsert);
  }

  public async getTreeSnapshots(): Promise<TreeSnapshots> {
    return await this.treesDB.getTreeSnapshots();
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
