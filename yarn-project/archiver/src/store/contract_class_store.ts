import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type {
  ContractClassPublic,
  ContractClassPublicWithBlockNumber,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import { Vector } from '@aztec/stdlib/types';

/**
 * LMDB-based contract class storage for the archiver.
 */
export class ContractClassStore {
  #contractClasses: AztecAsyncMap<string, Buffer>;
  #bytecodeCommitments: AztecAsyncMap<string, Buffer>;
  #prunedContractClasses: AztecAsyncMap<string, number>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractClasses = db.openMap('archiver_contract_classes');
    this.#bytecodeCommitments = db.openMap('archiver_bytecode_commitments');
    this.#prunedContractClasses = db.openMap('archiver_pruned_contract_classes');
  }

  async addContractClass(
    contractClass: ContractClassPublic,
    bytecodeCommitment: Fr,
    blockNumber: number,
  ): Promise<void> {
    await this.db.transactionAsync(async () => {
      const classIdStr = contractClass.id.toString();
      // If previously pruned, remove from pending-deletion map
      const wasPruned = await this.#prunedContractClasses.getAsync(classIdStr);
      if (wasPruned !== undefined) {
        await this.#contractClasses.delete(classIdStr);
        await this.#bytecodeCommitments.delete(classIdStr);
        await this.#prunedContractClasses.delete(classIdStr);
      }
      await this.#contractClasses.setIfNotExists(
        classIdStr,
        serializeContractClassPublic({ ...contractClass, l2BlockNumber: blockNumber }),
      );
      await this.#bytecodeCommitments.setIfNotExists(classIdStr, bytecodeCommitment.toBuffer());
    });
  }

  /** Soft-deletes a contract class, tracks it for pending deletion but keeps data accessible for in-flight block builds. */
  async deleteContractClasses(contractClass: ContractClassPublic, blockNumber: number): Promise<void> {
    const restoredContractClassBuf = await this.#contractClasses.getAsync(contractClass.id.toString());
    if (restoredContractClassBuf) {
      const restoredContractClass = deserializeContractClassPublic(restoredContractClassBuf);
      if (restoredContractClass.l2BlockNumber >= blockNumber) {
        await this.#prunedContractClasses.set(contractClass.id.toString(), restoredContractClass.l2BlockNumber);
      }
    }
  }

  async getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.#contractClasses.getAsync(id.toString());
    return contractClass && { ...deserializeContractClassPublic(contractClass), id };
  }

  async getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    const value = await this.#bytecodeCommitments.getAsync(id.toString());
    return value === undefined ? undefined : Fr.fromBuffer(value);
  }

  async getContractClassIds(): Promise<Fr[]> {
    return (await toArray(this.#contractClasses.keysAsync())).map(key => Fr.fromHexString(key));
  }

  /**
   * Hard-deletes pruned contract classes for blocks at or before the finalized block number.
   * Called when a checkpoint is finalized, at which point no in-flight fork can reference the pruned data.
   */
  async finalizeContractClasses(finalizedBlockNumber: number): Promise<void> {
    await this.db.transactionAsync(async () => {
      for await (const [classId, l2BlockNumber] of this.#prunedContractClasses.entriesAsync()) {
        if (l2BlockNumber <= finalizedBlockNumber) {
          await this.#contractClasses.delete(classId);
          await this.#bytecodeCommitments.delete(classId);
          await this.#prunedContractClasses.delete(classId);
        }
      }
    });
  }

  async addFunctions(
    contractClassId: Fr,
    newPrivateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    newUtilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean> {
    await this.db.transactionAsync(async () => {
      const existingClassBuffer = await this.#contractClasses.getAsync(contractClassId.toString());
      if (!existingClassBuffer) {
        throw new Error(`Unknown contract class ${contractClassId} when adding private functions to store`);
      }

      const existingClass = deserializeContractClassPublic(existingClassBuffer);
      const { privateFunctions: existingPrivateFns, utilityFunctions: existingUtilityFns } = existingClass;

      const updatedClass: Omit<ContractClassPublicWithBlockNumber, 'id'> = {
        ...existingClass,
        privateFunctions: [
          ...existingPrivateFns,
          ...newPrivateFunctions.filter(newFn => !existingPrivateFns.some(f => f.selector.equals(newFn.selector))),
        ],
        utilityFunctions: [
          ...existingUtilityFns,
          ...newUtilityFunctions.filter(newFn => !existingUtilityFns.some(f => f.selector.equals(newFn.selector))),
        ],
      };
      await this.#contractClasses.set(contractClassId.toString(), serializeContractClassPublic(updatedClass));
    });

    return true;
  }
}

function serializeContractClassPublic(contractClass: Omit<ContractClassPublicWithBlockNumber, 'id'>): Buffer {
  return serializeToBuffer(
    contractClass.l2BlockNumber,
    numToUInt8(contractClass.version),
    contractClass.artifactHash,
    contractClass.privateFunctions.length,
    contractClass.privateFunctions.map(serializePrivateFunction),
    contractClass.utilityFunctions.length,
    contractClass.utilityFunctions.map(serializeUtilityFunction),
    contractClass.packedBytecode.length,
    contractClass.packedBytecode,
    contractClass.privateFunctionsRoot,
  );
}

function serializePrivateFunction(fn: ExecutablePrivateFunctionWithMembershipProof): Buffer {
  return serializeToBuffer(
    fn.selector,
    fn.vkHash,
    fn.bytecode.length,
    fn.bytecode,
    fn.functionMetadataHash,
    fn.artifactMetadataHash,
    fn.utilityFunctionsTreeRoot,
    new Vector(fn.privateFunctionTreeSiblingPath),
    fn.privateFunctionTreeLeafIndex,
    new Vector(fn.artifactTreeSiblingPath),
    fn.artifactTreeLeafIndex,
  );
}

function serializeUtilityFunction(fn: UtilityFunctionWithMembershipProof): Buffer {
  return serializeToBuffer(
    fn.selector,
    fn.bytecode.length,
    fn.bytecode,
    fn.functionMetadataHash,
    fn.artifactMetadataHash,
    fn.privateFunctionsArtifactTreeRoot,
    new Vector(fn.artifactTreeSiblingPath),
    fn.artifactTreeLeafIndex,
  );
}

function deserializeContractClassPublic(buffer: Buffer): Omit<ContractClassPublicWithBlockNumber, 'id'> {
  const reader = BufferReader.asReader(buffer);
  return {
    l2BlockNumber: reader.readNumber(),
    version: reader.readUInt8() as 1,
    artifactHash: reader.readObject(Fr),
    privateFunctions: reader.readVector({ fromBuffer: deserializePrivateFunction }),
    utilityFunctions: reader.readVector({ fromBuffer: deserializeUtilityFunction }),
    packedBytecode: reader.readBuffer(),
    privateFunctionsRoot: reader.readObject(Fr),
  };
}

function deserializePrivateFunction(buffer: Buffer | BufferReader): ExecutablePrivateFunctionWithMembershipProof {
  const reader = BufferReader.asReader(buffer);
  return {
    selector: reader.readObject(FunctionSelector),
    vkHash: reader.readObject(Fr),
    bytecode: reader.readBuffer(),
    functionMetadataHash: reader.readObject(Fr),
    artifactMetadataHash: reader.readObject(Fr),
    utilityFunctionsTreeRoot: reader.readObject(Fr),
    privateFunctionTreeSiblingPath: reader.readVector(Fr),
    privateFunctionTreeLeafIndex: reader.readNumber(),
    artifactTreeSiblingPath: reader.readVector(Fr),
    artifactTreeLeafIndex: reader.readNumber(),
  };
}

function deserializeUtilityFunction(buffer: Buffer | BufferReader): UtilityFunctionWithMembershipProof {
  const reader = BufferReader.asReader(buffer);
  return {
    selector: reader.readObject(FunctionSelector),
    bytecode: reader.readBuffer(),
    functionMetadataHash: reader.readObject(Fr),
    artifactMetadataHash: reader.readObject(Fr),
    privateFunctionsArtifactTreeRoot: reader.readObject(Fr),
    artifactTreeSiblingPath: reader.readVector(Fr),
    artifactTreeLeafIndex: reader.readNumber(),
  };
}
