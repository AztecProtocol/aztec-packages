import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { schemas } from '@aztec/foundation/schemas';
import type { IndexedTreeLeaf } from '@aztec/foundation/trees';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { PublicKeys } from '../keys/public_keys.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { MerkleTreeId } from '../trees/merkle_tree_id.js';
import { NullifierLeaf } from '../trees/nullifier_leaf.js';
import { PublicDataTreeLeaf } from '../trees/public_data_leaf.js';
import { AvmCircuitPublicInputs } from './avm_circuit_public_inputs.js';
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
  constructor(public readonly classId: Fr, public readonly commitment: Fr) {}

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

// Hint for MerkleTreeDB.getLeafPreimage.
// NOTE: I need this factory because in order to get hold of the schema, I need an actual instance of the class,
// having the type doesn't suffice since TS does type erasure in the end.
function AvmGetLeafPreimageHintFactory<T extends IndexedTreeLeaf>(klass: {
  schema: z.ZodSchema;
  new (...args: any[]): T;
}) {
  return class AvmGetLeafPreimageHint {
    constructor(
      public readonly hintKey: AppendOnlyTreeSnapshot,
      // params (tree id will be implicit)
      public readonly index: bigint,
      // return
      public readonly leaf: T,
      public readonly nextIndex: bigint,
      public readonly nextValue: Fr,
    ) {}

    static get schema() {
      return z
        .object({
          hintKey: AppendOnlyTreeSnapshot.schema,
          index: schemas.BigInt,
          leaf: klass.schema,
          nextIndex: schemas.BigInt,
          nextValue: schemas.Fr,
        })
        .transform(
          ({ hintKey, index, leaf, nextIndex, nextValue }) =>
            new AvmGetLeafPreimageHint(hintKey, index, leaf, nextIndex, nextValue),
        );
    }
  };
}

// Note: only supported for PUBLIC_DATA_TREE and NULLIFIER_TREE.
export class AvmGetLeafPreimageHintPublicDataTree extends AvmGetLeafPreimageHintFactory(PublicDataTreeLeaf) {}
export class AvmGetLeafPreimageHintNullifierTree extends AvmGetLeafPreimageHintFactory(NullifierLeaf) {}

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

export class AvmExecutionHints {
  constructor(
    public readonly enqueuedCalls: AvmEnqueuedCallHint[] = [],
    // Contract hints.
    public readonly contractInstances: AvmContractInstanceHint[] = [],
    public readonly contractClasses: AvmContractClassHint[] = [],
    public readonly bytecodeCommitments: AvmBytecodeCommitmentHint[] = [],
    // Merkle DB hints.
    public readonly getSiblingPathHints: AvmGetSiblingPathHint[] = [],
    public readonly getPreviousValueIndexHints: AvmGetPreviousValueIndexHint[] = [],
    public readonly getLeafPreimageHintsPublicDataTree: AvmGetLeafPreimageHintPublicDataTree[] = [],
    public readonly getLeafPreimageHintsNullifierTree: AvmGetLeafPreimageHintNullifierTree[] = [],
    public readonly getLeafValueHints: AvmGetLeafValueHint[] = [],
  ) {}

  static empty() {
    return new AvmExecutionHints();
  }

  static get schema() {
    return z
      .object({
        enqueuedCalls: AvmEnqueuedCallHint.schema.array(),
        contractInstances: AvmContractInstanceHint.schema.array(),
        contractClasses: AvmContractClassHint.schema.array(),
        bytecodeCommitments: AvmBytecodeCommitmentHint.schema.array(),
        getSiblingPathHints: AvmGetSiblingPathHint.schema.array(),
        getPreviousValueIndexHints: AvmGetPreviousValueIndexHint.schema.array(),
        getLeafPreimageHintsPublicDataTree: AvmGetLeafPreimageHintPublicDataTree.schema.array(),
        getLeafPreimageHintsNullifierTree: AvmGetLeafPreimageHintNullifierTree.schema.array(),
        getLeafValueHints: AvmGetLeafValueHint.schema.array(),
      })
      .transform(
        ({
          enqueuedCalls,
          contractInstances,
          contractClasses,
          bytecodeCommitments,
          getSiblingPathHints,
          getPreviousValueIndexHints,
          getLeafPreimageHintsPublicDataTree,
          getLeafPreimageHintsNullifierTree,
          getLeafValueHints,
        }) =>
          new AvmExecutionHints(
            enqueuedCalls,
            contractInstances,
            contractClasses,
            bytecodeCommitments,
            getSiblingPathHints,
            getPreviousValueIndexHints,
            getLeafPreimageHintsPublicDataTree,
            getLeafPreimageHintsNullifierTree,
            getLeafValueHints,
          ),
      );
  }
}

export class AvmCircuitInputs {
  constructor(
    public readonly functionName: string, // only informational
    public readonly calldata: Fr[],
    public readonly hints: AvmExecutionHints,
    public publicInputs: AvmCircuitPublicInputs,
  ) {}

  static empty() {
    return new AvmCircuitInputs('', [], AvmExecutionHints.empty(), AvmCircuitPublicInputs.empty());
  }

  static get schema() {
    return z
      .object({
        functionName: z.string(),
        calldata: schemas.Fr.array(),
        hints: AvmExecutionHints.schema,
        publicInputs: AvmCircuitPublicInputs.schema,
      })
      .transform(
        ({ functionName, calldata, hints, publicInputs }) =>
          new AvmCircuitInputs(functionName, calldata, hints, publicInputs),
      );
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
