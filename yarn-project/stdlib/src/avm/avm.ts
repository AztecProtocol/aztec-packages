import { DEFAULT_MAX_DEBUG_LOG_MEMORY_READS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { z } from 'zod';

import { FunctionSelector } from '../abi/index.js';
import { AztecAddress } from '../aztec-address/index.js';
import { AllContractDeploymentData, ContractDeploymentData } from '../contract/index.js';
import { SimulationError } from '../errors/simulation_error.js';
import { computeEffectiveGasFees } from '../fees/transaction_fee.js';
import { Gas } from '../gas/gas.js';
import { GasFees } from '../gas/gas_fees.js';
import { GasSettings } from '../gas/gas_settings.js';
import { GasUsed } from '../gas/gas_used.js';
import { PublicKeys } from '../keys/public_keys.js';
import { DebugLog } from '../logs/debug_log.js';
import { PublicLog } from '../logs/public_log.js';
import { ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { NullishToUndefined, type ZodFor, schemas } from '../schemas/schemas.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierLeaf, NullifierLeafPreimage } from '../trees/nullifier_leaf.js';
import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '../trees/public_data_leaf.js';
import {
  GlobalVariables,
  NestedProcessReturnValues,
  ProtocolContracts,
  PublicCallRequestWithCalldata,
  TreeSnapshots,
  type Tx,
} from '../tx/index.js';
import { TxExecutionPhase } from '../tx/processed_tx.js';
import { WorldStateRevision } from '../world-state/world_state_revision.js';
import { AvmCircuitPublicInputs } from './avm_circuit_public_inputs.js';
import { serializeWithMessagePack } from './message_pack.js';
import { PublicDataWrite } from './public_data_write.js';
import { RevertCode } from './revert_code.js';

////////////////////////////////////////////////////////////////////////////
// Hints (contracts)
////////////////////////////////////////////////////////////////////////////
export class AvmContractClassHint {
  constructor(
    public readonly hintKey: number,
    public readonly classId: Fr,
    public readonly artifactHash: Fr,
    public readonly privateFunctionsRoot: Fr,
    public readonly packedBytecode: Buffer,
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: z.number().int().nonnegative(),
        classId: schemas.Fr,
        artifactHash: schemas.Fr,
        privateFunctionsRoot: schemas.Fr,
        packedBytecode: schemas.Buffer,
      })
      .transform(
        ({ hintKey, classId, artifactHash, privateFunctionsRoot, packedBytecode }) =>
          new AvmContractClassHint(hintKey, classId, artifactHash, privateFunctionsRoot, packedBytecode),
      );
  }

  /**
   * Creates an AvmContractClassHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmContractClassHint fields
   * @returns An AvmContractClassHint instance
   */
  static fromPlainObject(obj: any): AvmContractClassHint {
    if (obj instanceof AvmContractClassHint) {
      return obj;
    }
    return new AvmContractClassHint(
      obj.hintKey,
      Fr.fromPlainObject(obj.classId),
      Fr.fromPlainObject(obj.artifactHash),
      Fr.fromPlainObject(obj.privateFunctionsRoot),
      obj.packedBytecode instanceof Buffer ? obj.packedBytecode : Buffer.from(obj.packedBytecode),
    );
  }
}

export class AvmBytecodeCommitmentHint {
  constructor(
    public readonly hintKey: number,
    public readonly classId: Fr,
    public readonly commitment: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: z.number().int().nonnegative(),
        classId: schemas.Fr,
        commitment: schemas.Fr,
      })
      .transform(({ hintKey, classId, commitment }) => new AvmBytecodeCommitmentHint(hintKey, classId, commitment));
  }

  /**
   * Creates an AvmBytecodeCommitmentHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmBytecodeCommitmentHint fields
   * @returns An AvmBytecodeCommitmentHint instance
   */
  static fromPlainObject(obj: any): AvmBytecodeCommitmentHint {
    if (obj instanceof AvmBytecodeCommitmentHint) {
      return obj;
    }
    return new AvmBytecodeCommitmentHint(
      obj.hintKey,
      Fr.fromPlainObject(obj.classId),
      Fr.fromPlainObject(obj.commitment),
    );
  }
}

export class AvmContractInstanceHint {
  constructor(
    public readonly hintKey: number,
    public readonly address: AztecAddress,
    public readonly salt: Fr,
    public readonly deployer: AztecAddress,
    public readonly currentContractClassId: Fr,
    public readonly originalContractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: z.number().int().nonnegative(),
        address: AztecAddress.schema,
        salt: schemas.Fr,
        deployer: AztecAddress.schema,
        currentContractClassId: schemas.Fr,
        originalContractClassId: schemas.Fr,
        initializationHash: schemas.Fr,
        publicKeys: PublicKeys.schema,
      })
      .transform(
        ({
          hintKey,
          address,
          salt,
          deployer,
          currentContractClassId,
          originalContractClassId,
          initializationHash,
          publicKeys,
        }) =>
          new AvmContractInstanceHint(
            hintKey,
            address,
            salt,
            deployer,
            currentContractClassId,
            originalContractClassId,
            initializationHash,
            publicKeys,
          ),
      );
  }

  /**
   * Creates an AvmContractInstanceHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmContractInstanceHint fields
   * @returns An AvmContractInstanceHint instance
   */
  static fromPlainObject(obj: any): AvmContractInstanceHint {
    if (obj instanceof AvmContractInstanceHint) {
      return obj;
    }
    return new AvmContractInstanceHint(
      obj.hintKey,
      AztecAddress.fromPlainObject(obj.address),
      Fr.fromPlainObject(obj.salt),
      AztecAddress.fromPlainObject(obj.deployer),
      Fr.fromPlainObject(obj.currentContractClassId),
      Fr.fromPlainObject(obj.originalContractClassId),
      Fr.fromPlainObject(obj.initializationHash),
      PublicKeys.fromPlainObject(obj.publicKeys),
    );
  }
}

export class AvmDebugFunctionNameHint {
  constructor(
    public readonly address: AztecAddress,
    public readonly selector: Fr,
    public readonly name: string,
  ) {}

  static get schema() {
    return z
      .object({
        address: AztecAddress.schema,
        selector: schemas.Fr,
        name: z.string(),
      })
      .transform(({ address, selector, name }) => new AvmDebugFunctionNameHint(address, selector, name));
  }

  /**
   * Creates an AvmDebugFunctionNameHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmDebugFunctionNameHint fields
   * @returns An AvmDebugFunctionNameHint instance
   */
  static fromPlainObject(obj: any): AvmDebugFunctionNameHint {
    if (obj instanceof AvmDebugFunctionNameHint) {
      return obj;
    }
    return new AvmDebugFunctionNameHint(
      AztecAddress.fromPlainObject(obj.address),
      Fr.fromPlainObject(obj.selector),
      obj.name,
    );
  }
}

////////////////////////////////////////////////////////////////////////////
// Hints (merkle db)
////////////////////////////////////////////////////////////////////////////
// Hint for MerkleTreeDB.getSiblingPath.
export class AvmGetSiblingPathHint {
  constructor(
    public readonly hintKey: AppendOnlyTreeSnapshot,
    // params
    public readonly treeId: MerkleTreeId,
    public readonly index: bigint,
    // return
    public readonly path: Fr[],
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: AppendOnlyTreeSnapshot.schema,
        treeId: z.number().int().nonnegative(),
        index: schemas.BigInt,
        path: schemas.Fr.array(),
      })
      .transform(({ hintKey, treeId, index, path }) => new AvmGetSiblingPathHint(hintKey, treeId, index, path));
  }

  /**
   * Creates an AvmGetSiblingPathHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmGetSiblingPathHint fields
   * @returns An AvmGetSiblingPathHint instance
   */
  static fromPlainObject(obj: any): AvmGetSiblingPathHint {
    if (obj instanceof AvmGetSiblingPathHint) {
      return obj;
    }
    return new AvmGetSiblingPathHint(
      AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
      obj.treeId,
      typeof obj.index === 'bigint' ? obj.index : BigInt(obj.index),
      obj.path.map((p: any) => Fr.fromPlainObject(p)),
    );
  }
}

// Hint for MerkleTreeDB.getPreviousValueIndex.
export class AvmGetPreviousValueIndexHint {
  constructor(
    public readonly hintKey: AppendOnlyTreeSnapshot,
    // params
    public readonly treeId: MerkleTreeId,
    public readonly value: Fr,
    // return
    public readonly index: bigint,
    public readonly alreadyPresent: boolean,
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: AppendOnlyTreeSnapshot.schema,
        treeId: z.number().int().nonnegative(),
        value: schemas.Fr,
        index: schemas.BigInt,
        alreadyPresent: z.boolean(),
      })
      .transform(
        ({ hintKey, treeId, value, index, alreadyPresent }) =>
          new AvmGetPreviousValueIndexHint(hintKey, treeId, value, index, alreadyPresent),
      );
  }

  /**
   * Creates an AvmGetPreviousValueIndexHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmGetPreviousValueIndexHint fields
   * @returns An AvmGetPreviousValueIndexHint instance
   */
  static fromPlainObject(obj: any): AvmGetPreviousValueIndexHint {
    if (obj instanceof AvmGetPreviousValueIndexHint) {
      return obj;
    }
    return new AvmGetPreviousValueIndexHint(
      AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
      obj.treeId,
      Fr.fromPlainObject(obj.value),
      typeof obj.index === 'bigint' ? obj.index : BigInt(obj.index),
      obj.alreadyPresent,
    );
  }
}

type IndexedTreeLeafPreimages = NullifierLeafPreimage | PublicDataTreeLeafPreimage;
type IndexedTreeLeafPreimagesClasses = typeof NullifierLeafPreimage | typeof PublicDataTreeLeafPreimage;

// Hint for MerkleTreeDB.getLeafPreimage.
// NOTE: I need this factory because in order to get hold of the schema, I need an actual instance of the class,
// having the type doesn't suffice since TS does type erasure in the end.
function AvmGetLeafPreimageHintFactory(klass: IndexedTreeLeafPreimagesClasses) {
  return class {
    constructor(
      public readonly hintKey: AppendOnlyTreeSnapshot,
      // params (tree id will be implicit)
      public readonly index: bigint,
      // return
      public readonly leafPreimage: IndexedTreeLeafPreimages,
    ) {}

    static get schema() {
      return z
        .object({
          hintKey: AppendOnlyTreeSnapshot.schema,
          index: schemas.BigInt,
          leafPreimage: klass.schema,
        })
        .transform(({ hintKey, index, leafPreimage }) => new this(hintKey, index, leafPreimage));
    }

    /**
     * Creates an instance from a plain object without Zod validation.
     * This method is optimized for performance and skips validation, making it suitable
     * for deserializing trusted data (e.g., from C++ via MessagePack).
     * @param obj - Plain object containing hint fields
     * @returns An instance
     */
    static fromPlainObject(obj: any): any {
      if (obj instanceof this) {
        return obj;
      }
      return new this(
        AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
        typeof obj.index === 'bigint' ? obj.index : BigInt(obj.index),
        klass.fromPlainObject(obj.leafPreimage),
      );
    }
  };
}

// Note: only supported for PUBLIC_DATA_TREE and NULLIFIER_TREE.
export class AvmGetLeafPreimageHintPublicDataTree extends AvmGetLeafPreimageHintFactory(PublicDataTreeLeafPreimage) {}
export class AvmGetLeafPreimageHintNullifierTree extends AvmGetLeafPreimageHintFactory(NullifierLeafPreimage) {}

// Hint for MerkleTreeDB.getLeafValue.
// Note: only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE.
export class AvmGetLeafValueHint {
  constructor(
    public readonly hintKey: AppendOnlyTreeSnapshot,
    // params
    public readonly treeId: MerkleTreeId,
    public readonly index: bigint,
    // return
    public readonly value: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: AppendOnlyTreeSnapshot.schema,
        treeId: z.number().int().nonnegative(),
        index: schemas.BigInt,
        value: schemas.Fr,
      })
      .transform(({ hintKey, treeId, index, value }) => new AvmGetLeafValueHint(hintKey, treeId, index, value));
  }

  /**
   * Creates an AvmGetLeafValueHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmGetLeafValueHint fields
   * @returns An AvmGetLeafValueHint instance
   */
  static fromPlainObject(obj: any): AvmGetLeafValueHint {
    if (obj instanceof AvmGetLeafValueHint) {
      return obj;
    }
    return new AvmGetLeafValueHint(
      AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
      obj.treeId,
      typeof obj.index === 'bigint' ? obj.index : BigInt(obj.index),
      Fr.fromPlainObject(obj.value),
    );
  }
}

// Hint for MerkleTreeDB.sequentialInsert.
// NOTE: I need this factory because in order to get hold of the schema, I need an actual instance of the class,
// having the type doesn't suffice since TS does type erasure in the end.
function AvmSequentialInsertHintFactory(klass: IndexedTreeLeafPreimagesClasses) {
  return class {
    constructor(
      public readonly hintKey: AppendOnlyTreeSnapshot,
      public readonly stateAfter: AppendOnlyTreeSnapshot,
      // params
      public readonly treeId: MerkleTreeId,
      public readonly leaf: InstanceType<IndexedTreeLeafPreimagesClasses>['leaf'],
      // return
      public readonly lowLeavesWitnessData: {
        leaf: IndexedTreeLeafPreimages;
        index: bigint;
        path: Fr[];
      },
      public readonly insertionWitnessData: {
        leaf: IndexedTreeLeafPreimages;
        index: bigint;
        path: Fr[];
      },
    ) {}

    static get schema() {
      return z
        .object({
          hintKey: AppendOnlyTreeSnapshot.schema,
          stateAfter: AppendOnlyTreeSnapshot.schema,
          treeId: z.number().int().nonnegative(),
          leaf: klass.leafSchema,
          lowLeavesWitnessData: z.object({
            leaf: klass.schema,
            index: schemas.BigInt,
            path: schemas.Fr.array(),
          }),
          insertionWitnessData: z.object({
            leaf: klass.schema,
            index: schemas.BigInt,
            path: schemas.Fr.array(),
          }),
        })
        .transform(
          ({ hintKey, stateAfter, treeId, leaf, lowLeavesWitnessData, insertionWitnessData }) =>
            new this(hintKey, stateAfter, treeId, leaf, lowLeavesWitnessData, insertionWitnessData),
        );
    }

    /**
     * Creates an instance from a plain object without Zod validation.
     * This method is optimized for performance and skips validation, making it suitable
     * for deserializing trusted data (e.g., from C++ via MessagePack).
     * @param obj - Plain object containing hint fields
     * @returns An instance
     */
    static fromPlainObject(obj: any): any {
      if (obj instanceof this) {
        return obj;
      }
      // Determine the leaf class based on the klass parameter
      const LeafClass = klass === PublicDataTreeLeafPreimage ? PublicDataTreeLeaf : NullifierLeaf;
      return new this(
        AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
        AppendOnlyTreeSnapshot.fromPlainObject(obj.stateAfter),
        obj.treeId,
        LeafClass.fromPlainObject(obj.leaf),
        {
          leaf: klass.fromPlainObject(obj.lowLeavesWitnessData.leaf),
          index:
            typeof obj.lowLeavesWitnessData.index === 'bigint'
              ? obj.lowLeavesWitnessData.index
              : BigInt(obj.lowLeavesWitnessData.index),
          path: obj.lowLeavesWitnessData.path.map((p: any) => Fr.fromPlainObject(p)),
        },
        {
          leaf: klass.fromPlainObject(obj.insertionWitnessData.leaf),
          index:
            typeof obj.insertionWitnessData.index === 'bigint'
              ? obj.insertionWitnessData.index
              : BigInt(obj.insertionWitnessData.index),
          path: obj.insertionWitnessData.path.map((p: any) => Fr.fromPlainObject(p)),
        },
      );
    }
  };
}

// Note: only supported for PUBLIC_DATA_TREE and NULLIFIER_TREE.
export class AvmSequentialInsertHintPublicDataTree extends AvmSequentialInsertHintFactory(PublicDataTreeLeafPreimage) {}
export class AvmSequentialInsertHintNullifierTree extends AvmSequentialInsertHintFactory(NullifierLeafPreimage) {}

// Hint for MerkleTreeDB.appendLeaves.
// Note: only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE.
export class AvmAppendLeavesHint {
  constructor(
    public readonly hintKey: AppendOnlyTreeSnapshot,
    public readonly stateAfter: AppendOnlyTreeSnapshot,
    // params
    public readonly treeId: MerkleTreeId,
    public readonly leaves: Fr[],
  ) {}

  static get schema() {
    return z
      .object({
        hintKey: AppendOnlyTreeSnapshot.schema,
        stateAfter: AppendOnlyTreeSnapshot.schema,
        treeId: z.number().int().nonnegative(),
        leaves: schemas.Fr.array(),
      })
      .transform(
        ({ hintKey, stateAfter, treeId, leaves }) => new AvmAppendLeavesHint(hintKey, stateAfter, treeId, leaves),
      );
  }

  /**
   * Creates an AvmAppendLeavesHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmAppendLeavesHint fields
   * @returns An AvmAppendLeavesHint instance
   */
  static fromPlainObject(obj: any): AvmAppendLeavesHint {
    if (obj instanceof AvmAppendLeavesHint) {
      return obj;
    }
    return new AvmAppendLeavesHint(
      AppendOnlyTreeSnapshot.fromPlainObject(obj.hintKey),
      AppendOnlyTreeSnapshot.fromPlainObject(obj.stateAfter),
      obj.treeId,
      obj.leaves.map((l: any) => Fr.fromPlainObject(l)),
    );
  }
}

// Hint for checkpoint actions that don't change the state.
class AvmCheckpointActionNoStateChangeHint {
  constructor(
    // key
    public readonly actionCounter: number,
    // current checkpoint evolution
    public readonly oldCheckpointId: number,
    public readonly newCheckpointId: number,
  ) {}

  static get schema() {
    return z
      .object({
        actionCounter: z.number().int().nonnegative(),
        oldCheckpointId: z.number().int().nonnegative(),
        newCheckpointId: z.number().int().nonnegative(),
      })
      .transform(
        ({ actionCounter, oldCheckpointId, newCheckpointId }) =>
          new this(actionCounter, oldCheckpointId, newCheckpointId),
      );
  }

  /**
   * Creates an instance from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing hint fields
   * @returns An instance
   */
  static fromPlainObject(obj: any): any {
    if (obj instanceof this) {
      return obj;
    }
    return new this(obj.actionCounter, obj.oldCheckpointId, obj.newCheckpointId);
  }
}

// Hint for MerkleTreeDB.createCheckpoint.
export class AvmCreateCheckpointHint extends AvmCheckpointActionNoStateChangeHint {}

// Hint for MerkleTreeDB.commitCheckpoint.
export class AvmCommitCheckpointHint extends AvmCheckpointActionNoStateChangeHint {}

// Hint for MerkleTreeDB.revertCheckpoint.
export class AvmRevertCheckpointHint {
  // We use explicit fields for MessagePack.
  constructor(
    // key
    public readonly actionCounter: number,
    // current checkpoint evolution
    public readonly oldCheckpointId: number,
    public readonly newCheckpointId: number,
    // state evolution
    public readonly stateBefore: TreeSnapshots,
    public readonly stateAfter: TreeSnapshots,
  ) {}

  static create(
    actionCounter: number,
    oldCheckpointId: number,
    newCheckpointId: number,
    stateBefore: Record<MerkleTreeId, AppendOnlyTreeSnapshot>,
    stateAfter: Record<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ): AvmRevertCheckpointHint {
    return new AvmRevertCheckpointHint(
      actionCounter,
      oldCheckpointId,
      newCheckpointId,
      new TreeSnapshots(
        stateBefore[MerkleTreeId.L1_TO_L2_MESSAGE_TREE],
        stateBefore[MerkleTreeId.NOTE_HASH_TREE],
        stateBefore[MerkleTreeId.NULLIFIER_TREE],
        stateBefore[MerkleTreeId.PUBLIC_DATA_TREE],
      ),
      new TreeSnapshots(
        stateAfter[MerkleTreeId.L1_TO_L2_MESSAGE_TREE],
        stateAfter[MerkleTreeId.NOTE_HASH_TREE],
        stateAfter[MerkleTreeId.NULLIFIER_TREE],
        stateAfter[MerkleTreeId.PUBLIC_DATA_TREE],
      ),
    );
  }

  static get schema() {
    return z
      .object({
        actionCounter: z.number().int().nonnegative(),
        oldCheckpointId: z.number().int().nonnegative(),
        newCheckpointId: z.number().int().nonnegative(),
        stateBefore: TreeSnapshots.schema,
        stateAfter: TreeSnapshots.schema,
      })
      .transform(
        ({ actionCounter, oldCheckpointId, newCheckpointId, stateBefore, stateAfter }) =>
          new AvmRevertCheckpointHint(actionCounter, oldCheckpointId, newCheckpointId, stateBefore, stateAfter),
      );
  }

  /**
   * Creates an AvmRevertCheckpointHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmRevertCheckpointHint fields
   * @returns An AvmRevertCheckpointHint instance
   */
  static fromPlainObject(obj: any): AvmRevertCheckpointHint {
    if (obj instanceof AvmRevertCheckpointHint) {
      return obj;
    }
    return new AvmRevertCheckpointHint(
      obj.actionCounter,
      obj.oldCheckpointId,
      obj.newCheckpointId,
      TreeSnapshots.fromPlainObject(obj.stateBefore),
      TreeSnapshots.fromPlainObject(obj.stateAfter),
    );
  }
}

export class AvmContractDbCreateCheckpointHint extends AvmCheckpointActionNoStateChangeHint {}
export class AvmContractDbCommitCheckpointHint extends AvmCheckpointActionNoStateChangeHint {}
export class AvmContractDbRevertCheckpointHint extends AvmCheckpointActionNoStateChangeHint {}

////////////////////////////////////////////////////////////////////////////
// Hints (other)
////////////////////////////////////////////////////////////////////////////
export class AvmTxHint {
  constructor(
    public readonly hash: string,
    public readonly gasSettings: GasSettings,
    public readonly effectiveGasFees: GasFees,
    public readonly nonRevertibleContractDeploymentData: ContractDeploymentData,
    public readonly revertibleContractDeploymentData: ContractDeploymentData,
    public readonly nonRevertibleAccumulatedData: {
      noteHashes: Fr[];
      nullifiers: Fr[];
      l2ToL1Messages: ScopedL2ToL1Message[];
    },
    public readonly revertibleAccumulatedData: {
      noteHashes: Fr[];
      nullifiers: Fr[];
      l2ToL1Messages: ScopedL2ToL1Message[];
    },
    public readonly setupEnqueuedCalls: PublicCallRequestWithCalldata[],
    public readonly appLogicEnqueuedCalls: PublicCallRequestWithCalldata[],
    // We need this to be null and not undefined because that's what
    // MessagePack expects for an std::optional.
    public readonly teardownEnqueuedCall: PublicCallRequestWithCalldata | null,
    public readonly gasUsedByPrivate: Gas,
    public readonly feePayer: AztecAddress,
  ) {}

  static fromTx(tx: Tx, gasFees: GasFees): AvmTxHint {
    const setupCallRequests = tx.getNonRevertiblePublicCallRequestsWithCalldata();
    const appLogicCallRequests = tx.getRevertiblePublicCallRequestsWithCalldata();
    const teardownCallRequest = tx.getTeardownPublicCallRequestWithCalldata();
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const effectiveGasFees = computeEffectiveGasFees(gasFees, gasSettings);
    const allContractDeploymentData = AllContractDeploymentData.fromTx(tx);

    // For informational purposes. Assumed quick because it should be cached.
    const txHash = tx.getTxHash();

    return new AvmTxHint(
      txHash.hash.toString(),
      gasSettings,
      effectiveGasFees,
      allContractDeploymentData.getNonRevertibleContractDeploymentData(),
      allContractDeploymentData.getRevertibleContractDeploymentData(),
      {
        noteHashes: tx.data.forPublic!.nonRevertibleAccumulatedData.noteHashes.filter(x => !x.isZero()),
        nullifiers: tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers.filter(x => !x.isZero()),
        l2ToL1Messages: tx.data.forPublic!.nonRevertibleAccumulatedData.l2ToL1Msgs.filter(x => !x.isEmpty()),
      },
      {
        noteHashes: tx.data.forPublic!.revertibleAccumulatedData.noteHashes.filter(x => !x.isZero()),
        nullifiers: tx.data.forPublic!.revertibleAccumulatedData.nullifiers.filter(x => !x.isZero()),
        l2ToL1Messages: tx.data.forPublic!.revertibleAccumulatedData.l2ToL1Msgs.filter(x => !x.isEmpty()),
      },
      setupCallRequests,
      appLogicCallRequests,
      teardownCallRequest ?? null,
      tx.data.gasUsed,
      tx.data.feePayer,
    );
  }

  static empty() {
    return new AvmTxHint(
      '',
      GasSettings.empty(),
      GasFees.empty(),
      ContractDeploymentData.empty(),
      ContractDeploymentData.empty(),
      { noteHashes: [], nullifiers: [], l2ToL1Messages: [] },
      { noteHashes: [], nullifiers: [], l2ToL1Messages: [] },
      [],
      [],
      null,
      Gas.empty(),
      AztecAddress.zero(),
    );
  }

  /**
   * Creates an AvmTxHint from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmTxHint fields
   * @returns An AvmTxHint instance
   */
  static fromPlainObject(obj: any): AvmTxHint {
    if (obj instanceof AvmTxHint) {
      return obj;
    }
    return new AvmTxHint(
      obj.hash,
      GasSettings.fromPlainObject(obj.gasSettings),
      GasFees.fromPlainObject(obj.effectiveGasFees),
      ContractDeploymentData.fromPlainObject(obj.nonRevertibleContractDeploymentData),
      ContractDeploymentData.fromPlainObject(obj.revertibleContractDeploymentData),
      {
        noteHashes: obj.nonRevertibleAccumulatedData.noteHashes.map((h: any) => Fr.fromPlainObject(h)),
        nullifiers: obj.nonRevertibleAccumulatedData.nullifiers.map((n: any) => Fr.fromPlainObject(n)),
        l2ToL1Messages: obj.nonRevertibleAccumulatedData.l2ToL1Messages.map((m: any) =>
          ScopedL2ToL1Message.fromPlainObject(m),
        ),
      },
      {
        noteHashes: obj.revertibleAccumulatedData.noteHashes.map((h: any) => Fr.fromPlainObject(h)),
        nullifiers: obj.revertibleAccumulatedData.nullifiers.map((n: any) => Fr.fromPlainObject(n)),
        l2ToL1Messages: obj.revertibleAccumulatedData.l2ToL1Messages.map((m: any) =>
          ScopedL2ToL1Message.fromPlainObject(m),
        ),
      },
      obj.setupEnqueuedCalls.map((c: any) => PublicCallRequestWithCalldata.fromPlainObject(c)),
      obj.appLogicEnqueuedCalls.map((c: any) => PublicCallRequestWithCalldata.fromPlainObject(c)),
      obj.teardownEnqueuedCall ? PublicCallRequestWithCalldata.fromPlainObject(obj.teardownEnqueuedCall) : null,
      Gas.fromPlainObject(obj.gasUsedByPrivate),
      AztecAddress.fromPlainObject(obj.feePayer),
    );
  }

  static get schema() {
    return z
      .object({
        hash: z.string(),
        gasSettings: GasSettings.schema,
        effectiveGasFees: GasFees.schema,
        nonRevertibleContractDeploymentData: ContractDeploymentData.schema,
        revertibleContractDeploymentData: ContractDeploymentData.schema,
        nonRevertibleAccumulatedData: z.object({
          noteHashes: schemas.Fr.array(),
          nullifiers: schemas.Fr.array(),
          l2ToL1Messages: ScopedL2ToL1Message.schema.array(),
        }),
        revertibleAccumulatedData: z.object({
          noteHashes: schemas.Fr.array(),
          nullifiers: schemas.Fr.array(),
          l2ToL1Messages: ScopedL2ToL1Message.schema.array(),
        }),
        setupEnqueuedCalls: PublicCallRequestWithCalldata.schema.array(),
        appLogicEnqueuedCalls: PublicCallRequestWithCalldata.schema.array(),
        teardownEnqueuedCall: PublicCallRequestWithCalldata.schema.nullable(),
        gasUsedByPrivate: Gas.schema,
        feePayer: AztecAddress.schema,
      })
      .transform(
        ({
          hash,
          gasSettings,
          effectiveGasFees,
          nonRevertibleContractDeploymentData,
          revertibleContractDeploymentData,
          nonRevertibleAccumulatedData,
          revertibleAccumulatedData,
          setupEnqueuedCalls,
          appLogicEnqueuedCalls,
          teardownEnqueuedCall,
          gasUsedByPrivate,
          feePayer,
        }) =>
          new AvmTxHint(
            hash,
            gasSettings,
            effectiveGasFees,
            nonRevertibleContractDeploymentData,
            revertibleContractDeploymentData,
            nonRevertibleAccumulatedData,
            revertibleAccumulatedData,
            setupEnqueuedCalls,
            appLogicEnqueuedCalls,
            teardownEnqueuedCall,
            gasUsedByPrivate,
            feePayer,
          ),
      );
  }
}

export class AvmExecutionHints {
  constructor(
    public readonly globalVariables: GlobalVariables,
    public tx: AvmTxHint,
    // Protocol contracts.
    public protocolContracts: ProtocolContracts,
    // Contract hints.
    public readonly contractInstances: AvmContractInstanceHint[] = [],
    public readonly contractClasses: AvmContractClassHint[] = [],
    public readonly bytecodeCommitments: AvmBytecodeCommitmentHint[] = [],
    public readonly debugFunctionNames: AvmDebugFunctionNameHint[] = [],
    public readonly contractDbCreateCheckpointHints: AvmContractDbCreateCheckpointHint[] = [],
    public readonly contractDbCommitCheckpointHints: AvmContractDbCommitCheckpointHint[] = [],
    public readonly contractDbRevertCheckpointHints: AvmContractDbRevertCheckpointHint[] = [],
    // Merkle DB hints.
    public startingTreeRoots: TreeSnapshots = TreeSnapshots.empty(),
    public readonly getSiblingPathHints: AvmGetSiblingPathHint[] = [],
    public readonly getPreviousValueIndexHints: AvmGetPreviousValueIndexHint[] = [],
    public readonly getLeafPreimageHintsPublicDataTree: AvmGetLeafPreimageHintPublicDataTree[] = [],
    public readonly getLeafPreimageHintsNullifierTree: AvmGetLeafPreimageHintNullifierTree[] = [],
    public readonly getLeafValueHints: AvmGetLeafValueHint[] = [],
    public readonly sequentialInsertHintsPublicDataTree: AvmSequentialInsertHintPublicDataTree[] = [],
    public readonly sequentialInsertHintsNullifierTree: AvmSequentialInsertHintNullifierTree[] = [],
    public readonly appendLeavesHints: AvmAppendLeavesHint[] = [],
    public readonly createCheckpointHints: AvmCreateCheckpointHint[] = [],
    public readonly commitCheckpointHints: AvmCommitCheckpointHint[] = [],
    public readonly revertCheckpointHints: AvmRevertCheckpointHint[] = [],
  ) {}

  /**
   * Creates an AvmExecutionHints from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing AvmExecutionHints fields
   * @returns An AvmExecutionHints instance
   */
  static fromPlainObject(obj: any): AvmExecutionHints {
    if (obj instanceof AvmExecutionHints) {
      return obj;
    }
    return new AvmExecutionHints(
      GlobalVariables.fromPlainObject(obj.globalVariables),
      AvmTxHint.fromPlainObject(obj.tx),
      ProtocolContracts.fromPlainObject(obj.protocolContracts),
      obj.contractInstances?.map((i: any) => AvmContractInstanceHint.fromPlainObject(i)) || [],
      obj.contractClasses?.map((c: any) => AvmContractClassHint.fromPlainObject(c)) || [],
      obj.bytecodeCommitments?.map((b: any) => AvmBytecodeCommitmentHint.fromPlainObject(b)) || [],
      obj.debugFunctionNames?.map((d: any) => AvmDebugFunctionNameHint.fromPlainObject(d)) || [],
      obj.contractDbCreateCheckpointHints?.map((h: any) => AvmContractDbCreateCheckpointHint.fromPlainObject(h)) || [],
      obj.contractDbCommitCheckpointHints?.map((h: any) => AvmContractDbCommitCheckpointHint.fromPlainObject(h)) || [],
      obj.contractDbRevertCheckpointHints?.map((h: any) => AvmContractDbRevertCheckpointHint.fromPlainObject(h)) || [],
      obj.startingTreeRoots ? TreeSnapshots.fromPlainObject(obj.startingTreeRoots) : TreeSnapshots.empty(),
      obj.getSiblingPathHints?.map((h: any) => AvmGetSiblingPathHint.fromPlainObject(h)) || [],
      obj.getPreviousValueIndexHints?.map((h: any) => AvmGetPreviousValueIndexHint.fromPlainObject(h)) || [],
      obj.getLeafPreimageHintsPublicDataTree?.map((h: any) =>
        AvmGetLeafPreimageHintPublicDataTree.fromPlainObject(h),
      ) || [],
      obj.getLeafPreimageHintsNullifierTree?.map((h: any) => AvmGetLeafPreimageHintNullifierTree.fromPlainObject(h)) ||
        [],
      obj.getLeafValueHints?.map((h: any) => AvmGetLeafValueHint.fromPlainObject(h)) || [],
      obj.sequentialInsertHintsPublicDataTree?.map((h: any) =>
        AvmSequentialInsertHintPublicDataTree.fromPlainObject(h),
      ) || [],
      obj.sequentialInsertHintsNullifierTree?.map((h: any) =>
        AvmSequentialInsertHintNullifierTree.fromPlainObject(h),
      ) || [],
      obj.appendLeavesHints?.map((h: any) => AvmAppendLeavesHint.fromPlainObject(h)) || [],
      obj.createCheckpointHints?.map((h: any) => AvmCreateCheckpointHint.fromPlainObject(h)) || [],
      obj.commitCheckpointHints?.map((h: any) => AvmCommitCheckpointHint.fromPlainObject(h)) || [],
      obj.revertCheckpointHints?.map((h: any) => AvmRevertCheckpointHint.fromPlainObject(h)) || [],
    );
  }

  static empty() {
    return new AvmExecutionHints(GlobalVariables.empty(), AvmTxHint.empty(), ProtocolContracts.empty());
  }

  static get schema() {
    return z
      .object({
        globalVariables: GlobalVariables.schema,
        tx: AvmTxHint.schema,
        protocolContracts: ProtocolContracts.schema,
        contractInstances: AvmContractInstanceHint.schema.array(),
        contractClasses: AvmContractClassHint.schema.array(),
        bytecodeCommitments: AvmBytecodeCommitmentHint.schema.array(),
        debugFunctionNames: AvmDebugFunctionNameHint.schema.array(),
        contractDbCreateCheckpointHints: AvmContractDbCreateCheckpointHint.schema.array(),
        contractDbCommitCheckpointHints: AvmContractDbCommitCheckpointHint.schema.array(),
        contractDbRevertCheckpointHints: AvmContractDbRevertCheckpointHint.schema.array(),
        startingTreeRoots: TreeSnapshots.schema,
        getSiblingPathHints: AvmGetSiblingPathHint.schema.array(),
        getPreviousValueIndexHints: AvmGetPreviousValueIndexHint.schema.array(),
        getLeafPreimageHintsPublicDataTree: AvmGetLeafPreimageHintPublicDataTree.schema.array(),
        getLeafPreimageHintsNullifierTree: AvmGetLeafPreimageHintNullifierTree.schema.array(),
        getLeafValueHints: AvmGetLeafValueHint.schema.array(),
        sequentialInsertHintsPublicDataTree: AvmSequentialInsertHintPublicDataTree.schema.array(),
        sequentialInsertHintsNullifierTree: AvmSequentialInsertHintNullifierTree.schema.array(),
        appendLeavesHints: AvmAppendLeavesHint.schema.array(),
        createCheckpointHints: AvmCreateCheckpointHint.schema.array(),
        commitCheckpointHints: AvmCommitCheckpointHint.schema.array(),
        revertCheckpointHints: AvmRevertCheckpointHint.schema.array(),
      })
      .transform(
        ({
          globalVariables,
          tx,
          protocolContracts,
          contractInstances,
          contractClasses,
          bytecodeCommitments,
          debugFunctionNames,
          contractDbCreateCheckpointHints,
          contractDbCommitCheckpointHints,
          contractDbRevertCheckpointHints,
          startingTreeRoots,
          getSiblingPathHints,
          getPreviousValueIndexHints,
          getLeafPreimageHintsPublicDataTree,
          getLeafPreimageHintsNullifierTree,
          getLeafValueHints,
          sequentialInsertHintsPublicDataTree,
          sequentialInsertHintsNullifierTree,
          appendLeavesHints,
          createCheckpointHints,
          commitCheckpointHints,
          revertCheckpointHints,
        }) =>
          new AvmExecutionHints(
            globalVariables,
            tx,
            protocolContracts,
            contractInstances,
            contractClasses,
            bytecodeCommitments,
            debugFunctionNames,
            contractDbCreateCheckpointHints,
            contractDbCommitCheckpointHints,
            contractDbRevertCheckpointHints,
            startingTreeRoots,
            getSiblingPathHints,
            getPreviousValueIndexHints,
            getLeafPreimageHintsPublicDataTree,
            getLeafPreimageHintsNullifierTree,
            getLeafValueHints,
            sequentialInsertHintsPublicDataTree,
            sequentialInsertHintsNullifierTree,
            appendLeavesHints,
            createCheckpointHints,
            commitCheckpointHints,
            revertCheckpointHints,
          ),
      );
  }
}

export class AvmCircuitInputs {
  constructor(
    public readonly hints: AvmExecutionHints,
    public publicInputs: AvmCircuitPublicInputs,
  ) {}

  static empty() {
    return new AvmCircuitInputs(AvmExecutionHints.empty(), AvmCircuitPublicInputs.empty());
  }

  static fromPlainObject(obj: any): AvmCircuitInputs {
    return new AvmCircuitInputs(
      AvmExecutionHints.fromPlainObject(obj.hints),
      AvmCircuitPublicInputs.fromPlainObject(obj.publicInputs),
    );
  }

  static get schema() {
    return z
      .object({
        hints: AvmExecutionHints.schema,
        publicInputs: AvmCircuitPublicInputs.schema,
      })
      .transform(({ hints, publicInputs }) => new AvmCircuitInputs(hints, publicInputs));
  }

  public serializeWithMessagePack(): Buffer {
    return serializeWithMessagePack(this);
  }

  // These are used by the prover to generate an id, and also gcs_proof_store.ts.
  public toBuffer(): Buffer {
    return Buffer.from(jsonStringify(this));
  }
  static fromBuffer(buf: Buffer) {
    return jsonParseWithSchema(buf.toString(), this.schema);
  }
}

// Metadata about a given (enqueued or external) call.
export class CallStackMetadata {
  constructor(
    public phase: TxExecutionPhase,
    public contractAddress: Fr,
    public callerPc: number,
    public calldata: Fr[],
    public isStaticCall: boolean,
    public gasLimit: Gas,
    public output: Fr[], // returndata or revertdata.
    public internalCallStackAtExit: number[], // At return/revert time. Last one is exit PC.
    public haltingMessage: string | undefined,
    public reverted: boolean,
    public nested: CallStackMetadata[],
    public numNestedCalls: number, // This will be different from the size of the nested vector if we went past some limit.
  ) {}

  static get schema(): ZodFor<CallStackMetadata> {
    return z
      .object({
        phase: z.nativeEnum(TxExecutionPhase),
        contractAddress: Fr.schema,
        callerPc: z.number(),
        calldata: Fr.schema.array(),
        isStaticCall: z.boolean(),
        gasLimit: Gas.schema,
        output: Fr.schema.array(),
        internalCallStackAtExit: z.number().array(),
        haltingMessage: NullishToUndefined(z.string()),
        reverted: z.boolean(),
        nested: CallStackMetadata.schema.array(),
        numNestedCalls: z.number(),
      })
      .transform(
        ({
          phase,
          contractAddress,
          callerPc,
          calldata,
          isStaticCall,
          gasLimit,
          output,
          internalCallStackAtExit,
          haltingMessage,
          reverted,
          nested,
          numNestedCalls,
        }) =>
          new CallStackMetadata(
            phase,
            contractAddress,
            callerPc,
            calldata,
            isStaticCall,
            gasLimit,
            output,
            internalCallStackAtExit,
            haltingMessage,
            reverted,
            nested,
            numNestedCalls,
          ),
      );
  }

  /**
   * Creates a CallStackMetadata from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing CallStackMetadata fields
   * @returns A CallStackMetadata instance
   */
  static fromPlainObject(obj: any): CallStackMetadata {
    if (obj instanceof CallStackMetadata) {
      return obj;
    }
    return new CallStackMetadata(
      obj.phase,
      Fr.fromPlainObject(obj.contractAddress),
      obj.callerPc,
      obj.calldata.map((f: any) => Fr.fromPlainObject(f)),
      obj.isStaticCall,
      Gas.fromPlainObject(obj.gasLimit),
      obj.output.map((f: any) => Fr.fromPlainObject(f)),
      obj.internalCallStackAtExit.map((p: any) => Number(p)),
      obj.haltingMessage,
      obj.reverted,
      obj.nested.map((n: any) => CallStackMetadata.fromPlainObject(n)),
      obj.numNestedCalls,
    );
  }

  public getRevertReason(): SimulationError | undefined {
    const failingCall = this.findDeepestRevert([this]);

    if (!failingCall) {
      return undefined;
    }

    const { stack, leaf } = failingCall;
    const aztecCallStack = stack.map(call => ({
      contractAddress: AztecAddress.fromField(call.contractAddress),
      functionSelector: call.calldata.length > 0 ? FunctionSelector.fromFieldOrUndefined(call.calldata[0]) : undefined,
    }));

    // The Noir call stack is the internal call stack at exit of the failing call
    const noirCallStack = leaf.internalCallStackAtExit.map(pc => `0.${pc}`);

    return new SimulationError(
      leaf.haltingMessage ?? 'Transaction reverted',
      aztecCallStack,
      leaf.output,
      noirCallStack,
    );
  }

  /**
   * Finds the "rightmost deepest" revert in the call tree.
   *
   * At each level, we select the LAST (rightmost) reverted call, then recurse into its
   * nested calls to find the deepest reverted leaf along that path. The chain stops
   * when we encounter a non-reverted call (since you can choose not to rethrow).
   *
   * Examples (X = reverted, O = passed):
   *
   * 1. [X, X, X] at depth 1 -> returns the last X (rightmost)
   *
   * 2. [X(depth2), X, X] where first X has a nested revert -> returns the last X at depth 1,
   *    NOT the deeper revert in the first X (rightmost takes priority over depth)
   *
   * 3. X -> X -> X -> O -> O -> X (nested chain)
   *    Returns the 3rd X, because the O's break the reverted chain (they didn't rethrow)
   *
   * @param calls - Array of call metadata at the current level
   * @param parentStack - Accumulated stack of parent calls (for building the result)
   * @returns The deepest reverted call along the rightmost reverted path, or undefined if none
   */
  private findDeepestRevert(
    calls: CallStackMetadata[],
    parentStack: CallStackMetadata[] = [],
  ): { stack: CallStackMetadata[]; leaf: CallStackMetadata } | undefined {
    const lastReverted = calls.findLast(call => call.reverted);
    if (!lastReverted) {
      return undefined;
    }
    const currentStack = [...parentStack, lastReverted];
    return this.findDeepestRevert(lastReverted.nested, currentStack) || { stack: currentStack, leaf: lastReverted };
  }
}

export class PublicTxEffect {
  constructor(
    public transactionFee: Fr,
    public noteHashes: Fr[],
    public nullifiers: Fr[],
    public l2ToL1Msgs: ScopedL2ToL1Message[],
    public publicLogs: PublicLog[],
    public publicDataWrites: PublicDataWrite[],
  ) {}

  static empty() {
    return new PublicTxEffect(Fr.ZERO, [], [], [], [], []);
  }

  static get schema(): ZodFor<PublicTxEffect> {
    return z
      .object({
        transactionFee: Fr.schema,
        noteHashes: Fr.schema.array(),
        nullifiers: Fr.schema.array(),
        l2ToL1Msgs: ScopedL2ToL1Message.schema.array(),
        publicLogs: PublicLog.schema.array(),
        publicDataWrites: PublicDataWrite.schema.array(),
      })
      .transform(PublicTxEffect.from);
  }

  static from(obj: any): PublicTxEffect {
    return new PublicTxEffect(
      obj.transactionFee,
      obj.noteHashes,
      obj.nullifiers,
      obj.l2ToL1Msgs,
      obj.publicLogs,
      obj.publicDataWrites,
    );
  }

  static fromPlainObject(obj: any): PublicTxEffect {
    return new PublicTxEffect(
      Fr.fromPlainObject(obj.transactionFee),
      obj.noteHashes.map((h: any) => Fr.fromPlainObject(h)),
      obj.nullifiers.map((n: any) => Fr.fromPlainObject(n)),
      obj.l2ToL1Msgs.map((m: any) => ScopedL2ToL1Message.fromPlainObject(m)),
      obj.publicLogs.map((l: any) => PublicLog.fromPlainObject(l)),
      obj.publicDataWrites.map((w: any) => PublicDataWrite.fromPlainObject(w)),
    );
  }

  equals(other: PublicTxEffect): boolean {
    return (
      this.transactionFee.equals(other.transactionFee) &&
      this.noteHashes.length === other.noteHashes.length &&
      this.noteHashes.every((h, i) => h.equals(other.noteHashes[i])) &&
      this.nullifiers.length === other.nullifiers.length &&
      this.nullifiers.every((h, i) => h.equals(other.nullifiers[i])) &&
      this.l2ToL1Msgs.length === other.l2ToL1Msgs.length &&
      this.l2ToL1Msgs.every((m, i) => m.equals(other.l2ToL1Msgs[i])) &&
      this.publicLogs.length === other.publicLogs.length &&
      this.publicLogs.every((l, i) => l.equals(other.publicLogs[i])) &&
      this.publicDataWrites.length === other.publicDataWrites.length &&
      this.publicDataWrites.every((w, i) => w.equals(other.publicDataWrites[i]))
    );
  }
}

export class PublicTxResult {
  constructor(
    // Simulation result.
    public gasUsed: GasUsed,
    public revertCode: RevertCode,
    public publicTxEffect: PublicTxEffect,
    // These are only guaranteed to be present if the simulator is configured to collect them.
    // TODO(fcarreiro): Remove NestedProcessReturnValues[] once we migrate to the C++ simulator.
    public callStackMetadata:
      | CallStackMetadata[] // One per enqueued call. All phases.
      | NestedProcessReturnValues[], // One per enqueued call. App logic only.
    public logs: DebugLog[] | undefined,
    // For the proving request.
    public hints: AvmExecutionHints | undefined,
    public publicInputs: AvmCircuitPublicInputs | undefined,
  ) {}

  static empty() {
    return new PublicTxResult(
      {
        totalGas: Gas.empty(),
        teardownGas: Gas.empty(),
        publicGas: Gas.empty(),
        billedGas: Gas.empty(),
      },
      RevertCode.OK,
      PublicTxEffect.empty(),
      /*callStackMetadata=*/ [] as CallStackMetadata[],
      /*logs=*/ [],
      /*hints=*/ AvmExecutionHints.empty(),
      /*publicInputs=*/ AvmCircuitPublicInputs.empty(),
    );
  }

  static get schema(): ZodFor<PublicTxResult> {
    return z
      .object({
        gasUsed: schemas.GasUsed,
        revertCode: RevertCode.schema,
        revertReason: NullishToUndefined(SimulationError.schema),
        publicTxEffect: PublicTxEffect.schema,
        callStackMetadata: z.union([CallStackMetadata.schema.array(), NestedProcessReturnValues.schema.array()]),
        logs: NullishToUndefined(DebugLog.schema.array()),
        // For the proving request.
        publicInputs: NullishToUndefined(AvmCircuitPublicInputs.schema),
        hints: NullishToUndefined(AvmExecutionHints.schema),
      })
      .transform(
        ({ gasUsed, revertCode, publicTxEffect, callStackMetadata, logs, hints, publicInputs }) =>
          new PublicTxResult(
            gasUsed,
            revertCode as RevertCode,
            publicTxEffect,
            callStackMetadata,
            logs,
            hints,
            publicInputs,
          ),
      );
  }

  /**
   * Creates a PublicTxResult from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing PublicTxResult fields
   * @returns A PublicTxResult instance
   */
  static fromPlainObject(obj: any): PublicTxResult {
    return new PublicTxResult(
      GasUsed.fromPlainObject(obj.gasUsed),
      RevertCode.fromPlainObject(obj.revertCode),
      PublicTxEffect.fromPlainObject(obj.publicTxEffect),
      obj.callStackMetadata.map(CallStackMetadata.fromPlainObject), // Always CallStackMetadata[] from MessagePack.
      obj.logs?.map(DebugLog.fromPlainObject),
      obj.hints ? AvmExecutionHints.fromPlainObject(obj.hints) : undefined,
      obj.publicInputs ? AvmCircuitPublicInputs.fromPlainObject(obj.publicInputs) : undefined,
    );
  }

  /** Returns one level of return values for the app logic phase, one per enqueued call. */
  public getAppLogicReturnValues(): NestedProcessReturnValues[] {
    if (this.callStackMetadata.every(metadata => metadata instanceof CallStackMetadata)) {
      return this.callStackMetadata
        .filter(metadata => metadata.phase === TxExecutionPhase.APP_LOGIC)
        .map(metadata => new NestedProcessReturnValues(metadata.output));
    } else {
      return (this.callStackMetadata as NestedProcessReturnValues[]).map(
        metadata => new NestedProcessReturnValues(metadata.values, metadata.nested),
      );
    }
  }

  public findRevertReason(): SimulationError | undefined {
    if (this.revertCode.isOK()) {
      return undefined;
    }

    const callStackMetadata = this.callStackMetadata;
    // TODO(fcarreiro): Remove this after migration to the C++ simulator.
    // If the "stack" comes from TS, it will have this field.
    if ((callStackMetadata as any).revertReason !== undefined) {
      return (callStackMetadata as any).revertReason;
    }

    // Handle CallStackMetadata[].
    let revertReason: SimulationError | undefined = undefined;
    for (const call of callStackMetadata) {
      revertReason = (call as CallStackMetadata).getRevertReason();
      if (revertReason) {
        break;
      }
    }
    return revertReason;
  }
}

export class CollectionLimitsConfig {
  constructor(
    public readonly maxDebugLogMemoryReads: number,
    public readonly maxCalldataSizeInFields: number,
    public readonly maxReturndataSizeInFields: number,
    public readonly maxCallStackDepth: number,
    public readonly maxCallStackItems: number,
  ) {}

  static from(obj: Partial<CollectionLimitsConfig>): CollectionLimitsConfig {
    return new CollectionLimitsConfig(
      obj.maxDebugLogMemoryReads ?? DEFAULT_MAX_DEBUG_LOG_MEMORY_READS,
      obj.maxCalldataSizeInFields ?? 300,
      obj.maxReturndataSizeInFields ?? 300,
      obj.maxCallStackDepth ?? 5,
      obj.maxCallStackItems ?? 100,
    );
  }

  static empty() {
    return CollectionLimitsConfig.from({});
  }

  static get schema() {
    return z
      .object({
        maxDebugLogMemoryReads: z.number(),
        maxCalldataSizeInFields: z.number(),
        maxReturndataSizeInFields: z.number(),
        maxCallStackDepth: z.number(),
        maxCallStackItems: z.number(),
      })
      .transform(
        ({
          maxDebugLogMemoryReads,
          maxCalldataSizeInFields,
          maxReturndataSizeInFields,
          maxCallStackDepth,
          maxCallStackItems,
        }) =>
          new CollectionLimitsConfig(
            maxDebugLogMemoryReads,
            maxCalldataSizeInFields,
            maxReturndataSizeInFields,
            maxCallStackDepth,
            maxCallStackItems,
          ),
      );
  }
}

export class PublicSimulatorConfig {
  constructor(
    public readonly proverId: Fr,
    public readonly skipFeeEnforcement: boolean,
    public readonly collectCallMetadata: boolean, // appLogicReturnValues.
    public readonly collectHints: boolean, // hints.
    public readonly collectPublicInputs: boolean, // public inputs.
    public readonly collectDebugLogs: boolean, // logs.
    public readonly collectStatistics: boolean, // timings etc.
    public readonly collectionLimits: CollectionLimitsConfig,
  ) {}

  static from(obj: Partial<PublicSimulatorConfig>): PublicSimulatorConfig {
    return new PublicSimulatorConfig(
      obj.proverId ?? Fr.ZERO,
      obj.skipFeeEnforcement ?? false,
      obj.collectCallMetadata ?? false,
      obj.collectHints ?? false,
      obj.collectPublicInputs ?? false,
      obj.collectDebugLogs ?? false,
      obj.collectStatistics ?? false,
      obj.collectionLimits ?? CollectionLimitsConfig.empty(),
    );
  }

  static empty() {
    return PublicSimulatorConfig.from({});
  }

  static get schema() {
    return z
      .object({
        proverId: Fr.schema,
        skipFeeEnforcement: z.boolean(),
        collectCallMetadata: z.boolean(),
        collectHints: z.boolean(),
        collectPublicInputs: z.boolean(),
        collectDebugLogs: z.boolean(),
        collectStatistics: z.boolean(),
        collectionLimits: CollectionLimitsConfig.schema,
      })
      .transform(PublicSimulatorConfig.from);
  }
}

export class AvmFastSimulationInputs {
  constructor(
    public readonly wsRevision: WorldStateRevision,
    public readonly config: PublicSimulatorConfig,
    public tx: AvmTxHint,
    public globalVariables: GlobalVariables,
    public protocolContracts: ProtocolContracts,
  ) {}

  static empty() {
    return new AvmFastSimulationInputs(
      WorldStateRevision.empty(),
      PublicSimulatorConfig.empty(),
      AvmTxHint.empty(),
      GlobalVariables.empty(),
      ProtocolContracts.empty(),
    );
  }

  static get schema() {
    return z
      .object({
        wsRevision: WorldStateRevision.schema,
        config: PublicSimulatorConfig.schema,
        tx: AvmTxHint.schema,
        globalVariables: GlobalVariables.schema,
        protocolContracts: ProtocolContracts.schema,
      })
      .transform(
        ({ wsRevision, config, tx, globalVariables, protocolContracts }) =>
          new AvmFastSimulationInputs(wsRevision, config, tx, globalVariables, protocolContracts),
      );
  }

  public serializeWithMessagePack(): Buffer {
    return serializeWithMessagePack(this);
  }
}
