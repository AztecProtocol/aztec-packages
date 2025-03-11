import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { PublicKeys } from '../keys/public_keys.js';
import { NullifierLeafPreimage } from '../trees/nullifier_leaf.js';
import { PublicDataTreeLeafPreimage } from '../trees/public_data_leaf.js';
import { AvmCircuitPublicInputs } from './avm_circuit_public_inputs.js';
import { serializeWithMessagePack } from './message_pack.js';

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

export class AvmAppendTreeHint {
  constructor(public readonly leafIndex: Fr, public readonly value: Fr, public readonly siblingPath: Fr[]) {}

  static get schema() {
    return z
      .object({
        leafIndex: schemas.Fr,
        value: schemas.Fr,
        siblingPath: schemas.Fr.array(),
      })
      .transform(({ leafIndex, value, siblingPath }) => new AvmAppendTreeHint(leafIndex, value, siblingPath));
  }
}

export class AvmNullifierWriteTreeHint {
  constructor(public lowLeafRead: AvmNullifierReadTreeHint, public readonly insertionPath: Fr[]) {}

  static get schema() {
    return z
      .object({
        lowLeafRead: AvmNullifierReadTreeHint.schema,
        insertionPath: schemas.Fr.array(),
      })
      .transform(({ lowLeafRead, insertionPath }) => new AvmNullifierWriteTreeHint(lowLeafRead, insertionPath));
  }
}

export class AvmNullifierReadTreeHint {
  constructor(
    public readonly lowLeafPreimage: NullifierLeafPreimage,
    public readonly lowLeafIndex: Fr,
    public readonly lowLeafSiblingPath: Fr[],
  ) {}

  static get schema() {
    return z
      .object({
        lowLeafPreimage: NullifierLeafPreimage.schema,
        lowLeafIndex: schemas.Fr,
        lowLeafSiblingPath: schemas.Fr.array(),
      })
      .transform(
        ({ lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath }) =>
          new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafSiblingPath),
      );
  }
}

export class AvmPublicDataReadTreeHint {
  constructor(
    public readonly leafPreimage: PublicDataTreeLeafPreimage,
    public readonly leafIndex: Fr,
    public readonly siblingPath: Fr[],
  ) {}

  static empty() {
    return new AvmPublicDataReadTreeHint(PublicDataTreeLeafPreimage.empty(), Fr.ZERO, []);
  }

  static get schema() {
    return z
      .object({
        leafPreimage: PublicDataTreeLeafPreimage.schema,
        leafIndex: schemas.Fr,
        siblingPath: schemas.Fr.array(),
      })
      .transform(
        ({ leafPreimage, leafIndex, siblingPath }) =>
          new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, siblingPath),
      );
  }
}

export class AvmPublicDataWriteTreeHint {
  constructor(
    // To check the current slot has been written to
    public readonly lowLeafRead: AvmPublicDataReadTreeHint,
    public readonly newLeafPreimage: PublicDataTreeLeafPreimage,
    public readonly insertionPath: Fr[],
  ) {}

  static get schema() {
    return z
      .object({
        lowLeafRead: AvmPublicDataReadTreeHint.schema,
        newLeafPreimage: PublicDataTreeLeafPreimage.schema,
        insertionPath: schemas.Fr.array(),
      })
      .transform(
        ({ lowLeafRead, newLeafPreimage, insertionPath }) =>
          new AvmPublicDataWriteTreeHint(lowLeafRead, newLeafPreimage, insertionPath),
      );
  }
}

export class AvmExecutionHints {
  constructor(
    public readonly enqueuedCalls: AvmEnqueuedCallHint[] = [],
    public readonly contractInstances: AvmContractInstanceHint[] = [],
    public readonly contractClasses: AvmContractClassHint[] = [],
    public readonly bytecodeCommitments: AvmBytecodeCommitmentHint[] = [],
    public readonly publicDataReads: AvmPublicDataReadTreeHint[] = [],
    public readonly publicDataWrites: AvmPublicDataWriteTreeHint[] = [],
    public readonly nullifierReads: AvmNullifierReadTreeHint[] = [],
    public readonly nullifierWrites: AvmNullifierWriteTreeHint[] = [],
    public readonly noteHashReads: AvmAppendTreeHint[] = [],
    public readonly noteHashWrites: AvmAppendTreeHint[] = [],
    public readonly l1ToL2MessageReads: AvmAppendTreeHint[] = [],
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
        publicDataReads: AvmPublicDataReadTreeHint.schema.array(),
        publicDataWrites: AvmPublicDataWriteTreeHint.schema.array(),
        nullifierReads: AvmNullifierReadTreeHint.schema.array(),
        nullifierWrites: AvmNullifierWriteTreeHint.schema.array(),
        noteHashReads: AvmAppendTreeHint.schema.array(),
        noteHashWrites: AvmAppendTreeHint.schema.array(),
        l1ToL2MessageReads: AvmAppendTreeHint.schema.array(),
      })
      .transform(
        ({
          enqueuedCalls,
          contractInstances,
          contractClasses,
          bytecodeCommitments,
          publicDataReads,
          publicDataWrites,
          nullifierReads,
          nullifierWrites,
          noteHashReads,
          noteHashWrites,
          l1ToL2MessageReads,
        }) =>
          new AvmExecutionHints(
            enqueuedCalls,
            contractInstances,
            contractClasses,
            bytecodeCommitments,
            publicDataReads,
            publicDataWrites,
            nullifierReads,
            nullifierWrites,
            noteHashReads,
            noteHashWrites,
            l1ToL2MessageReads,
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
