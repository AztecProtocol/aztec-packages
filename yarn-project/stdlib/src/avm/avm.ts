import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { computeEffectiveGasFees } from '../fees/transaction_fee.js';
import { Gas } from '../gas/gas.js';
import { GasFees } from '../gas/gas_fees.js';
import { GasSettings } from '../gas/gas_settings.js';
import { PublicKeys } from '../keys/public_keys.js';
import { ScopedL2ToL1Message } from '../messaging/l2_to_l1_message.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierLeafPreimage } from '../trees/nullifier_leaf.js';
import { PublicDataTreeLeafPreimage } from '../trees/public_data_leaf.js';
import { GlobalVariables, TreeSnapshots, type Tx } from '../tx/index.js';
import { AvmCircuitPublicInputs } from './avm_circuit_public_inputs.js';
import { clampGasSettingsForAVM } from './gas.js';
import { serializeWithMessagePack } from './message_pack.js';

////////////////////////////////////////////////////////////////////////////
// Hints (contracts)
////////////////////////////////////////////////////////////////////////////
export class AvmContractClassHint {
  constructor(
    public readonly classId: Fr,
    public readonly artifactHash: Fr,
    public readonly privateFunctionsRoot: Fr,
    public readonly packedBytecode: Buffer,
  ) {}

  static get schema() {
    return z
      .object({
        classId: schemas.Fr,
        artifactHash: schemas.Fr,
        privateFunctionsRoot: schemas.Fr,
        packedBytecode: schemas.Buffer,
      })
      .transform(
        ({ classId, artifactHash, privateFunctionsRoot, packedBytecode }) =>
          new AvmContractClassHint(classId, artifactHash, privateFunctionsRoot, packedBytecode),
      );
  }
}

export class AvmBytecodeCommitmentHint {
  constructor(
    public readonly classId: Fr,
    public readonly commitment: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        classId: schemas.Fr,
        commitment: schemas.Fr,
      })
      .transform(({ classId, commitment }) => new AvmBytecodeCommitmentHint(classId, commitment));
  }
}

export class AvmContractInstanceHint {
  constructor(
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
          address,
          salt,
          deployer,
          currentContractClassId,
          originalContractClassId,
          initializationHash,
          publicKeys,
        }) =>
          new AvmContractInstanceHint(
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
}

////////////////////////////////////////////////////////////////////////////
// Hints (other)
////////////////////////////////////////////////////////////////////////////
export class AvmEnqueuedCallHint {
  constructor(
    public readonly msgSender: AztecAddress,
    public readonly contractAddress: AztecAddress,
    public readonly calldata: Fr[],
    public isStaticCall: boolean,
  ) {}

  static get schema() {
    return z
      .object({
        msgSender: AztecAddress.schema,
        contractAddress: AztecAddress.schema,
        calldata: schemas.Fr.array(),
        isStaticCall: z.boolean(),
      })
      .transform(
        ({ msgSender, contractAddress, calldata, isStaticCall }) =>
          new AvmEnqueuedCallHint(msgSender, contractAddress, calldata, isStaticCall),
      );
  }
}

export class AvmTxHint {
  constructor(
    public readonly hash: string,
    public readonly globalVariables: GlobalVariables,
    public readonly gasSettings: GasSettings,
    public readonly effectiveGasFees: GasFees,
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
    public readonly setupEnqueuedCalls: AvmEnqueuedCallHint[],
    public readonly appLogicEnqueuedCalls: AvmEnqueuedCallHint[],
    // We need this to be null and not undefined because that's what
    // MessagePack expects for an std::optional.
    public readonly teardownEnqueuedCall: AvmEnqueuedCallHint | null,
    public readonly gasUsedByPrivate: Gas,
  ) {}

  static async fromTx(tx: Tx): Promise<AvmTxHint> {
    const setupCallRequests = tx.getNonRevertiblePublicCallRequestsWithCalldata();
    const appLogicCallRequests = tx.getRevertiblePublicCallRequestsWithCalldata();
    const teardownCallRequest = tx.getTeardownPublicCallRequestWithCalldata();
    const gasSettings = clampGasSettingsForAVM(tx.data.constants.txContext.gasSettings, tx.data.gasUsed);
    const effectiveGasFees = computeEffectiveGasFees(
      tx.data.constants.historicalHeader.globalVariables.gasFees,
      gasSettings,
    );

    // For informational purposes. Assumed quick because it should be cached.
    const txHash = await tx.getTxHash();

    return new AvmTxHint(
      txHash.hash.toString(),
      tx.data.constants.historicalHeader.globalVariables,
      gasSettings,
      effectiveGasFees,
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
      setupCallRequests.map(
        call =>
          new AvmEnqueuedCallHint(
            call.request.msgSender,
            call.request.contractAddress,
            call.calldata,
            call.request.isStaticCall,
          ),
      ),
      appLogicCallRequests.map(
        call =>
          new AvmEnqueuedCallHint(
            call.request.msgSender,
            call.request.contractAddress,
            call.calldata,
            call.request.isStaticCall,
          ),
      ),
      teardownCallRequest
        ? new AvmEnqueuedCallHint(
            teardownCallRequest.request.msgSender,
            teardownCallRequest.request.contractAddress,
            teardownCallRequest.calldata,
            teardownCallRequest.request.isStaticCall,
          )
        : null,
      tx.data.gasUsed,
    );
  }

  static empty() {
    return new AvmTxHint(
      '',
      GlobalVariables.empty(),
      GasSettings.empty(),
      GasFees.empty(),
      { noteHashes: [], nullifiers: [], l2ToL1Messages: [] },
      { noteHashes: [], nullifiers: [], l2ToL1Messages: [] },
      [],
      [],
      null,
      Gas.empty(),
    );
  }

  static get schema() {
    return z
      .object({
        hash: z.string(),
        globalVariables: GlobalVariables.schema,
        gasSettings: GasSettings.schema,
        effectiveGasFees: GasFees.schema,
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
        setupEnqueuedCalls: AvmEnqueuedCallHint.schema.array(),
        appLogicEnqueuedCalls: AvmEnqueuedCallHint.schema.array(),
        teardownEnqueuedCall: AvmEnqueuedCallHint.schema.nullable(),
        gasUsedByPrivate: Gas.schema,
      })
      .transform(
        ({
          hash,
          globalVariables,
          gasSettings,
          effectiveGasFees,
          nonRevertibleAccumulatedData,
          revertibleAccumulatedData,
          setupEnqueuedCalls,
          appLogicEnqueuedCalls,
          teardownEnqueuedCall,
          gasUsedByPrivate,
        }) =>
          new AvmTxHint(
            hash,
            globalVariables,
            gasSettings,
            effectiveGasFees,
            nonRevertibleAccumulatedData,
            revertibleAccumulatedData,
            setupEnqueuedCalls,
            appLogicEnqueuedCalls,
            teardownEnqueuedCall,
            gasUsedByPrivate,
          ),
      );
  }
}

export class AvmExecutionHints {
  constructor(
    public tx: AvmTxHint,
    // Contract hints.
    public readonly contractInstances: AvmContractInstanceHint[] = [],
    public readonly contractClasses: AvmContractClassHint[] = [],
    public readonly bytecodeCommitments: AvmBytecodeCommitmentHint[] = [],
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

  static empty() {
    return new AvmExecutionHints(AvmTxHint.empty());
  }

  static get schema() {
    return z
      .object({
        tx: AvmTxHint.schema,
        contractInstances: AvmContractInstanceHint.schema.array(),
        contractClasses: AvmContractClassHint.schema.array(),
        bytecodeCommitments: AvmBytecodeCommitmentHint.schema.array(),
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
          tx,
          contractInstances,
          contractClasses,
          bytecodeCommitments,
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
            tx,
            contractInstances,
            contractClasses,
            bytecodeCommitments,
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
