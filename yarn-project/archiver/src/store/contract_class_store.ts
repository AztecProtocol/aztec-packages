import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { ContractClassPublic, ContractClassPublicWithBlockNumber } from '@aztec/stdlib/contract';

/**
 * LMDB-based contract class storage for the archiver.
 */
export class ContractClassStore {
  #contractClasses: AztecAsyncMap<string, Buffer>;
  #bytecodeCommitments: AztecAsyncMap<string, Buffer>;

  constructor(private db: AztecAsyncKVStore) {
    this.#contractClasses = db.openMap('archiver_contract_classes');
    this.#bytecodeCommitments = db.openMap('archiver_bytecode_commitments');
  }

  async addContractClass(
    contractClass: ContractClassPublic,
    bytecodeCommitment: Fr,
    blockNumber: number,
  ): Promise<void> {
    await this.db.transactionAsync(async () => {
      await this.#contractClasses.setIfNotExists(
        contractClass.id.toString(),
        serializeContractClassPublic({ ...contractClass, l2BlockNumber: blockNumber }),
      );
      await this.#bytecodeCommitments.setIfNotExists(contractClass.id.toString(), bytecodeCommitment.toBuffer());
    });
  }

  async deleteContractClasses(contractClass: ContractClassPublic, blockNumber: number): Promise<void> {
    const restoredContractClass = await this.#contractClasses.getAsync(contractClass.id.toString());
    if (restoredContractClass && deserializeContractClassPublic(restoredContractClass).l2BlockNumber >= blockNumber) {
      await this.db.transactionAsync(async () => {
        await this.#contractClasses.delete(contractClass.id.toString());
        await this.#bytecodeCommitments.delete(contractClass.id.toString());
      });
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
}

function serializeContractClassPublic(contractClass: Omit<ContractClassPublicWithBlockNumber, 'id'>): Buffer {
  return serializeToBuffer(
    contractClass.l2BlockNumber,
    numToUInt8(contractClass.version),
    contractClass.artifactHash,
    contractClass.packedBytecode.length,
    contractClass.packedBytecode,
    contractClass.privateFunctionsRoot,
  );
}

function deserializeContractClassPublic(buffer: Buffer): Omit<ContractClassPublicWithBlockNumber, 'id'> {
  const reader = BufferReader.asReader(buffer);
  return {
    l2BlockNumber: reader.readNumber(),
    version: reader.readUInt8() as 1,
    artifactHash: reader.readObject(Fr),
    packedBytecode: reader.readBuffer(),
    privateFunctionsRoot: reader.readObject(Fr),
  };
}
