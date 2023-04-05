import { pedersenCompressInputs } from '@aztec/barretenberg.js/crypto';
import { PrimitivesWasm } from '@aztec/barretenberg.js/wasm';
import {
  NewContractData,
  PrivateKernelPublicInputs,
  UInt8Vector
} from '@aztec/circuits.js';
import { Fr, keccak } from '@aztec/foundation';
import { WasmWrapper } from '@aztec/foundation/wasm';
import { UnverifiedData } from '@aztec/unverified-data';
import { TxHash } from './tx_hash.js';

/**
 * The interface of an L2 transaction.
 */
export class Tx {
  private hashPromise?: Promise<TxHash>;

  /**
   *
   * @param data - Tx inputs.
   * @param proof - Tx proof.
   * @param unverifiedData  - Information not needed to verify the tx (e.g. encrypted note pre-images etc.)
   * @param isEmpty - Whether this is a placeholder empty tx.
   */
  constructor(
    public readonly data: PrivateKernelPublicInputs,
    public readonly proof: UInt8Vector,
    public readonly unverifiedData: UnverifiedData,
    public readonly isEmpty = false,
  ) {}

  /**
   * Construct & return transaction hash.
   * @returns The transaction's hash.
   */
  getTxHash() {
    if (!this.hashPromise) {
      this.hashPromise = Tx.createTxHash(this);
    }
    return this.hashPromise;
  }

  /**
   * Utility function to generate tx hash.
   * @param tx - The transaction from which to generate the hash.
   * @returns A hash of the tx data that identifies the tx.
   */
  static async createTxHash(tx: Tx): Promise<TxHash> {
    const wasm = await PrimitivesWasm.get();
    return hashTxData(
      tx.data.end.newCommitments,
      tx.data.end.newNullifiers,
      tx.data.end.newContracts.map(cd => hashNewContractData(wasm, cd)),
    );
  }
}

export function hashNewContractData(wasm: WasmWrapper, cd: NewContractData) {
  if (cd.contractAddress.isZero() && cd.portalContractAddress.isZero() && cd.functionTreeRoot.isZero()) {
    return Buffer.alloc(32, 0);
  }
  return pedersenCompressInputs(wasm, [
    cd.contractAddress.toBuffer(),
    cd.portalContractAddress.toBuffer32(),
    cd.functionTreeRoot.toBuffer(),
  ]);
}

export function hashTxData(
  newCommitments: Fr[] | Buffer[],
  newNullifiers: Fr[] | Buffer[],
  newContracts: Fr[] | Buffer[],
) {
  const dataToHash = Buffer.concat(
    [
      newCommitments.map(x => (Buffer.isBuffer(x) ? x : x.toBuffer())),
      newNullifiers.map(x => (Buffer.isBuffer(x) ? x : x.toBuffer())),
      newContracts.map(x => (Buffer.isBuffer(x) ? x : x.toBuffer())),
    ].flat(),
  );
  return new TxHash(keccak(dataToHash));
}
