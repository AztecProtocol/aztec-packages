import {
  L1_TO_L2_MSG_TREE_LEAF_COUNT,
  NOTE_HASH_TREE_LEAF_COUNT,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_SUBTREE_HEIGHT,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  AllContractDeploymentData,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractDeploymentData,
  type ContractInstanceWithAddress,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { PublicDBAccessStats } from '@aztec/stdlib/stats';
import {
  MerkleTreeId,
  NullifierLeaf,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  getTreeName,
} from '@aztec/stdlib/trees';
import { TreeSnapshots, type Tx } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { strict as assert } from 'assert';

import { ContractsDbCheckpoint } from './contracts_db_checkpoint.js';
import type { PublicContractsDBInterface, PublicStateDBInterface } from './db_interfaces.js';
import { L1ToL2MessageIndexOutOfRangeError, NoteHashIndexOutOfRangeError } from './side_effect_errors.js';

/**
 * Implements the PublicContractsDBInterface using a ContractDataSource.
 * Uses a stack-based checkpoint model for managing contract state.
 */
export class PublicContractsDB implements PublicContractsDBInterface {
  private contractStateStack: ContractsDbCheckpoint[] = [new ContractsDbCheckpoint()];

  private log: Logger;

  constructor(
    private dataSource: ContractDataSource,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('simulator:contracts-data-source', bindings);
  }

  public async addContracts(contractDeploymentData: ContractDeploymentData): Promise<void> {
    const currentState = this.getCurrentState();

    await this.addContractClassesFromEvents(
      ContractClassPublishedEvent.extractContractClassEvents(contractDeploymentData.getContractClassLogs()),
      currentState,
    );

    this.addContractInstancesFromEvents(
      ContractInstancePublishedEvent.extractContractInstanceEvents(contractDeploymentData.getPrivateLogs()),
      currentState,
    );
  }

  public async addNewContracts(tx: Tx): Promise<void> {
    const contractDeploymentData = AllContractDeploymentData.fromTx(tx);
    await this.addContracts(contractDeploymentData.getNonRevertibleContractDeploymentData());
    await this.addContracts(contractDeploymentData.getRevertibleContractDeploymentData());
  }

  /**
   * Creates a new checkpoint, copying the current state for upcoming modifications,
   * and enabling rollbacks to current state in case of a revert.
   */
  public createCheckpoint(): void {
    const currentState = this.getCurrentState();
    const newState = currentState.deepCopy();
    this.contractStateStack.push(newState);
  }

  /**
   * Commits the current checkpoint, accepting its state latest.
   */
  public commitCheckpoint(): void {
    if (this.contractStateStack.length <= 1) {
      throw new Error('No checkpoint to commit');
    }
    const topState = this.contractStateStack.pop()!;
    this.contractStateStack[this.contractStateStack.length - 1] = topState;
  }

  /**
   * Commits the current checkpoint, not erroring if there is no checkpoint
   * to commit. This is useful to do a sanity commit at the end of tx execution,
   * doing nothing if the checkpoint was already reverted, but truly committing
   * otherwise.
   */
  public commitCheckpointOkIfNone(): void {
    if (this.contractStateStack.length <= 1) {
      return;
    }
    const topState = this.contractStateStack.pop()!;
    this.contractStateStack[this.contractStateStack.length - 1] = topState;
  }

  /**
   * Reverts the current checkpoint, discarding its state and rolling back
   * to the state as of the latest checkpoint.
   */
  public revertCheckpoint(): void {
    if (this.contractStateStack.length <= 1) {
      throw new Error('No checkpoint to revert');
    }
    this.contractStateStack.pop();
  }

  private getCurrentState(): ContractsDbCheckpoint {
    return this.contractStateStack[this.contractStateStack.length - 1];
  }

  // TODO(fcarreiro/alvaro): This method currently needs a blockNumber. Since this class
  // is only ever used for a given block, it should be possible to construct it with the
  // block number and then forget about it. However, since this class (and interface) is
  // currently more externally exposed than we'd want to, Facundo preferred to not add it
  // to the constructor right now. If we can make this class more private, we should
  // reconsider this. A litmus test is in how many places we need to initialize with a
  // dummy block number (tests or not) and pass block numbers to `super`.
  // Note: Block number got changed to timestamp so this comment ^ is outdated. Keeping
  // the comment as is as I am not part of the AVM cabal.
  public async getContractInstance(
    address: AztecAddress,
    timestamp: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const currentState = this.getCurrentState();
    return currentState.getInstance(address) ?? (await this.dataSource.getContract(address, timestamp));
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    const currentState = this.getCurrentState();
    return currentState.getClass(contractClassId) ?? (await this.dataSource.getContractClass(contractClassId));
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    const currentState = this.getCurrentState();
    const commitment =
      currentState.getBytecodeCommitment(contractClassId) ??
      (await this.dataSource.getBytecodeCommitment(contractClassId));
    if (commitment !== undefined) {
      return commitment;
    }
    // Not in the current state or the store, compute it here
    // Get the contract class
    const contractClass = await this.getContractClass(contractClassId);

    if (contractClass === undefined) {
      // cannot compute bytecode commitment if contract class is not found
      return undefined;
    }

    const value = await computePublicBytecodeCommitment(contractClass.packedBytecode);
    // Add to cache (current checkpoint state) so we don't compute again
    currentState.addBytecodeCommitment(contractClassId, value);
    return value;
  }

  public async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return await this.dataSource.getDebugFunctionName(address, selector);
  }

  private async addContractClassesFromEvents(
    contractClassEvents: ContractClassPublishedEvent[],
    state: ContractsDbCheckpoint,
  ) {
    await Promise.all(
      contractClassEvents.map(async (event: ContractClassPublishedEvent) => {
        this.log.debug(`Adding class ${event.contractClassId.toString()} to contract state`);
        const contractClass = await event.toContractClassPublic();
        state.addClass(event.contractClassId, contractClass);
      }),
    );
  }

  private addContractInstancesFromEvents(
    contractInstanceEvents: ContractInstancePublishedEvent[],
    state: ContractsDbCheckpoint,
  ) {
    contractInstanceEvents.forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to contract state`,
      );
      state.addInstance(e.address, e.toContractInstance());
    });
  }
}

/**
 * A high-level class that provides access to the merkle trees.
 *
 * This class is just a helper wrapper around a merkle db. Anything that you can do with it
 * can also be done directly with the merkle db. This class should NOT be exposed or used
 * outside of `simulator/src/public`.
 *
 * NOTE: This class is currently written in such a way that it would generate the
 * necessary hints if used with a hinting merkle db. This is a bit of a leak of concepts.
 * Eventually we can have everything depend on a config/factory at the TxSimulator level
 * to decide whether to use hints or not (same with tracing, etc).
 */
export class PublicTreesDB implements PublicStateDBInterface {
  private logger: Logger;

  constructor(
    private readonly db: MerkleTreeWriteOperations,
    bindings?: LoggerBindings,
  ) {
    this.logger = createLogger('simulator:public-trees-db', bindings);
  }

  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const timer = new Timer();
    const leafSlot = (await computePublicDataTreeLeafSlot(contract, slot)).toBigInt();

    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }

    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
    // Unconditionally fetching the preimage for the hints. Move it to the hinting layer?
    const preimage = (await this.db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    const result = lowLeafResult.alreadyPresent ? preimage.leaf.value : Fr.ZERO;
    this.logger.debug(`Storage read (contract=${contract}, slot=${slot}, value=${result})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'storage-read',
    } satisfies PublicDBAccessStats);

    return result;
  }

  public async storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void> {
    const timer = new Timer();
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);
    const publicDataWrite = new PublicDataWrite(leafSlot, newValue);
    await this.db.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);

    this.logger.debug(`Storage write (contract=${contract}, slot=${slot}, value=${newValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'storage-write',
    } satisfies PublicDBAccessStats);
  }

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr> {
    const timer = new Timer();
    if (leafIndex > L1_TO_L2_MSG_TREE_LEAF_COUNT) {
      throw new L1ToL2MessageIndexOutOfRangeError(Number(leafIndex));
    }
    const leafValue = await this.db.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    assert(leafValue !== undefined, 'Unexpected null response from l1 to l2 message tree');
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);

    this.logger.debug(`Fetched L1 to L2 message leaf value (leafIndex=${leafIndex}, value=${leafValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNoteHash(leafIndex: bigint): Promise<Fr> {
    const timer = new Timer();
    if (leafIndex > NOTE_HASH_TREE_LEAF_COUNT) {
      throw new NoteHashIndexOutOfRangeError(Number(leafIndex));
    }
    const leafValue = await this.db.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
    assert(leafValue !== undefined, 'Unexpected null response from note hash tree');
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex);

    this.logger.debug(`Fetched note hash leaf value (leafIndex=${leafIndex}, value=${leafValue})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-note-hash',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async writeNoteHash(noteHash: Fr): Promise<void> {
    const timer = new Timer();
    await this.db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [noteHash]);

    this.logger.debug(`Wrote note hash (noteHash=${noteHash})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'write-note-hash',
    } satisfies PublicDBAccessStats);
  }

  public async checkNullifierExists(nullifier: Fr): Promise<boolean> {
    const timer = new Timer();
    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!lowLeafResult) {
      throw new Error('Low leaf not found');
    }
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    // TODO: We need this for the hints. See class comment for more details.
    await this.db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, lowLeafResult.index);
    const exists = lowLeafResult.alreadyPresent;

    this.logger.debug(`Checked nullifier exists (nullifier=${nullifier}, exists=${exists})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'check-nullifier-exists',
    } satisfies PublicDBAccessStats);
    return exists;
  }

  public async writeNullifier(siloedNullifier: Fr): Promise<void> {
    const timer = new Timer();
    await this.db.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()]);

    this.logger.debug(`Wrote nullifier (nullifier=${siloedNullifier})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'write-nullifier',
    } satisfies PublicDBAccessStats);
  }

  public async padTree(treeId: MerkleTreeId, leavesToInsert: number): Promise<void> {
    const timer = new Timer();

    switch (treeId) {
      // Indexed trees.
      case MerkleTreeId.NULLIFIER_TREE:
        await this.db.batchInsert(
          treeId,
          Array(leavesToInsert).fill(NullifierLeaf.empty().toBuffer()),
          NULLIFIER_SUBTREE_HEIGHT,
        );
        break;
      case MerkleTreeId.PUBLIC_DATA_TREE:
        await this.db.batchInsert(
          treeId,
          Array(leavesToInsert).fill(PublicDataTreeLeaf.empty().toBuffer()),
          PUBLIC_DATA_SUBTREE_HEIGHT,
        );
        break;
      // Append-only trees.
      case MerkleTreeId.L1_TO_L2_MESSAGE_TREE:
      case MerkleTreeId.NOTE_HASH_TREE:
        await this.db.appendLeaves(treeId, Array(leavesToInsert).fill(Fr.ZERO));
        break;
      default:
        throw new Error(`Padding not supported for tree ${treeId}`);
    }

    this.logger.debug(`Padded tree (tree=${getTreeName(treeId)}, leavesToInsert=${leavesToInsert})`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'pad-tree',
    } satisfies PublicDBAccessStats);
  }

  public async createCheckpoint(): Promise<void> {
    await this.db.createCheckpoint();
  }

  public async commitCheckpoint(): Promise<void> {
    await this.db.commitCheckpoint();
  }

  public async revertCheckpoint(): Promise<void> {
    await this.db.revertCheckpoint();
  }

  public async getTreeSnapshots(): Promise<TreeSnapshots> {
    const stateReference = await this.db.getStateReference();
    return new TreeSnapshots(
      stateReference.l1ToL2MessageTree,
      stateReference.partial.noteHashTree,
      stateReference.partial.nullifierTree,
      stateReference.partial.publicDataTree,
    );
  }
}
