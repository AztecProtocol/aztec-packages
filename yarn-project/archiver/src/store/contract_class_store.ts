import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { BufferReader, numToUInt8, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { isProtocolContractClass } from '@aztec/protocol-contracts';
import type {
  ContractClassPublic,
  ContractClassPublicWithBlockNumber,
  ContractClassPublicWithCommitment,
} from '@aztec/stdlib/contract';

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

  /**
   * Adds multiple contract classes to the store.
   * @param data - Contract classes (with bytecode commitments) to add.
   * @param blockNumber - L2 block number where the classes were registered.
   * @returns True if every insert succeeded.
   */
  async addContractClasses(data: ContractClassPublicWithCommitment[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.addContractClass(c, c.publicBytecodeCommitment, blockNumber)))).every(
      Boolean,
    );
  }

  /**
   * Removes multiple contract classes from the store, but only if they were registered at or after the given block.
   * @param data - Contract classes to delete.
   * @param blockNumber - Lower bound on the block number at which the classes were registered.
   * @returns True if every delete succeeded.
   */
  async deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.deleteContractClass(c, blockNumber)))).every(Boolean);
  }

  async addContractClass(
    contractClass: ContractClassPublic,
    bytecodeCommitment: Fr,
    blockNumber: number,
  ): Promise<void> {
    await this.db.transactionAsync(async () => {
      const key = contractClass.id.toString();
      if (await this.#contractClasses.hasAsync(key)) {
        // Protocol contracts are preloaded at block 0, so a later on-chain (re-)publish of a bundled
        // protocol class id is valid and must be a no-op. Keep the existing block-0 entry untouched
        // (do not bump its block number) so it survives reorgs of the publishing block.
        if (isProtocolContractClass(contractClass.id)) {
          return;
        }
        throw new Error(`Contract class ${key} already exists, cannot add again at block ${blockNumber}`);
      }
      await this.#contractClasses.set(
        key,
        serializeContractClassPublic({ ...contractClass, l2BlockNumber: blockNumber }),
      );
      await this.#bytecodeCommitments.set(key, bytecodeCommitment.toBuffer());
    });
  }

  async deleteContractClass(contractClass: ContractClassPublic, blockNumber: number): Promise<void> {
    // Protocol contracts are preloaded at block 0 and must never be deleted, even when the block that
    // (re-)published them on-chain is unwound by a reorg.
    if (isProtocolContractClass(contractClass.id)) {
      return;
    }
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
