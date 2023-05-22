import { CircuitsWasm, KernelCircuitPublicInputs, SignedTxRequest, UInt8Vector } from '@aztec/circuits.js';
import { computeContractLeaf, computeTxHash } from '@aztec/circuits.js/abis';

import { createTxHash } from './create_tx_hash.js';
import { TxHash } from './tx_hash.js';
import { UnverifiedData } from './unverified_data.js';
import { EncodedContractFunction } from './contract_data.js';
import { numToUInt32BE } from '@aztec/circuits.js/utils';

/**
 * Defines valid fields for a private transaction.
 */
type PrivateTxFields = 'data' | 'proof' | 'unverifiedData';

/**
 * Defines valid fields for a public transaction.
 */
type PublicTxFields = 'txRequest';

/**
 * Defines private tx type.
 */
export type PrivateTx = Required<Pick<Tx, PrivateTxFields>> & Tx;

/**
 * Defines public tx type.
 */
export type PublicTx = Required<Pick<Tx, PublicTxFields>> & Tx;

/**
 * Checks if a tx is public.
 */
export function isPublicTx(tx: Tx): tx is PublicTx {
  return !!tx.txRequest;
}

/**
 * Checks if a tx is private.
 */
export function isPrivateTx(tx: Tx): tx is PrivateTx {
  return !!tx.data && !!tx.proof && !!tx.unverifiedData;
}

/**
 * The interface of an L2 transaction.
 */
export class Tx {
  private hashPromise?: Promise<TxHash>;

  /**
   * Creates a new private transaction.
   * @param data - Public inputs of the private kernel circuit.
   * @param proof - Proof from the private kernel circuit.
   * @param unverifiedData - Unverified data created by this tx.
   * @param newContractPublicFunctions - Public functions made available by this tx.
   * @returns A new private tx instance.
   */
  public static createPrivate(
    data: KernelCircuitPublicInputs,
    proof: UInt8Vector,
    unverifiedData: UnverifiedData,
    newContractPublicFunctions?: EncodedContractFunction[],
  ): PrivateTx {
    return new this(data, proof, unverifiedData, undefined, newContractPublicFunctions) as PrivateTx;
  }

  /**
   * Creates a new public transaction from the given tx request.
   * @param txRequest - The tx request.
   * @returns New public tx instance.
   */
  public static createPublic(txRequest: SignedTxRequest): PublicTx {
    return new this(undefined, undefined, undefined, txRequest) as PublicTx;
  }

  /**
   * Creates a new transaction containing both private and public calls.
   * @param data - Public inputs of the private kernel circuit.
   * @param proof - Proof from the private kernel circuit.
   * @param unverifiedData - Unverified data created by this tx.
   * @param txRequest - The tx request defining the public call.
   * @returns A new tx instance.
   */
  public static createPrivatePublic(
    data: KernelCircuitPublicInputs,
    proof: UInt8Vector,
    unverifiedData: UnverifiedData,
    txRequest: SignedTxRequest,
  ): PrivateTx & PublicTx {
    return new this(data, proof, unverifiedData, txRequest) as PrivateTx & PublicTx;
  }

  /**
   * Creates a new transaction from the given tx request.
   * @param data - Public inputs of the private kernel circuit.
   * @param proof - Proof from the private kernel circuit.
   * @param unverifiedData - Unverified data created by this tx.
   * @param txRequest - The tx request defining the public call.
   * @returns A new tx instance.
   */
  public static create(
    data?: KernelCircuitPublicInputs,
    proof?: UInt8Vector,
    unverifiedData?: UnverifiedData,
    txRequest?: SignedTxRequest,
  ): Tx {
    return new this(data, proof, unverifiedData, txRequest);
  }

  /**
   * Checks if a tx is private.
   * @returns True if the tx is private, false otherwise.
   */
  public isPrivate(): this is PrivateTx {
    return isPrivateTx(this);
  }

  /**
   * Checks if a tx is public.
   * @returns True if the tx is public, false otherwise.
   */
  public isPublic(): this is PublicTx {
    return isPublicTx(this);
  }

  protected constructor(
    /**
     * Output of the private kernel circuit for this tx.
     */
    public readonly data?: KernelCircuitPublicInputs,
    /**
     * Proof from the private kernel circuit.
     */
    public readonly proof?: UInt8Vector,
    /**
     * Information not needed to verify the tx (e.g. Encrypted note pre-images etc.).
     */
    public readonly unverifiedData?: UnverifiedData,
    /**
     * Signed public function call data.
     */
    public readonly txRequest?: SignedTxRequest,
    /**
     * New public functions made available by this tx.
     */
    public readonly newContractPublicFunctions?: EncodedContractFunction[],
  ) {}

  /**
   * Construct & return transaction hash.
   * @returns The transaction's hash.
   */
  getTxHash(): Promise<TxHash> {
    if (!this.hashPromise) {
      this.hashPromise = Tx.createTxHash(this);
    }
    return this.hashPromise;
  }

  /**
   * Convenience function to get array of hashes for an array of txs.
   * @param txs - The txs to get the hashes from.
   * @returns The corresponding array of hashes.
   */
  static async getHashes(txs: Tx[]): Promise<TxHash[]> {
    return await Promise.all(txs.map(tx => tx.getTxHash()));
  }

  /**
   * Clones a tx, making a deep copy of all fields.
   * @param tx - The transaction to be cloned.
   * @returns The cloned transaction.
   */
  static clone(tx: Tx): Tx {
    const publicInputs = tx.data === undefined ? undefined : KernelCircuitPublicInputs.fromBuffer(tx.data.toBuffer());
    const proof = tx.proof === undefined ? undefined : new UInt8Vector(tx.proof.toBuffer());
    const unverified =
      tx.unverifiedData === undefined ? undefined : UnverifiedData.fromBuffer(tx.unverifiedData.toBuffer());
    const signedTxRequest =
      tx.txRequest === undefined ? undefined : SignedTxRequest.fromBuffer(tx.txRequest.toBuffer());
    const publicFunctions =
      tx.newContractPublicFunctions === undefined
        ? undefined
        : tx.newContractPublicFunctions.map(x => {
            return EncodedContractFunction.fromBuffer(x.toBuffer());
          });
    return new Tx(publicInputs, proof, unverified, signedTxRequest, publicFunctions);
  }

  /**
   * Creates a 'message' from this tx.
   * @param tx - The transaction to convert to a message.
   * @returns - The message.
   */
  static toMessage(tx: Tx): Buffer {
    // eslint-disable-next-line jsdoc/require-jsdoc
    const createMessageComponent = (obj?: { toBuffer: () => Buffer }) => {
      if (!obj) {
        // specify a length of 0 bytes
        return numToUInt32BE(0);
      }
      const buffer = obj.toBuffer();
      return Buffer.concat([numToUInt32BE(buffer.length), buffer]);
    };
    // eslint-disable-next-line jsdoc/require-jsdoc
    const createMessageComponents = (obj?: { toBuffer: () => Buffer }[]) => {
      if (!obj || !obj.length) {
        // specify a length of 0 bytes
        return numToUInt32BE(0);
      }
      const allComponents = Buffer.concat(obj.map(createMessageComponent));
      return Buffer.concat([numToUInt32BE(allComponents.length), allComponents]);
    };
    const messageBuffer = Buffer.concat([
      createMessageComponent(tx.data),
      createMessageComponent(tx.proof),
      createMessageComponent(tx.txRequest),
      createMessageComponent(tx.unverifiedData),
      createMessageComponents(tx.newContractPublicFunctions),
    ]);
    const messageLength = numToUInt32BE(messageBuffer.length);
    return Buffer.concat([messageLength, messageBuffer]);
  }

  /**
   * Creates a 'message' from this tx.
   * @param buffer - The message buffer to convert to a tx.
   * @returns - The message.
   */
  static fromMessage(buffer: Buffer): Tx {
    const functions: EncodedContractFunction[] = [];

    // eslint-disable-next-line jsdoc/require-jsdoc
    const toObject = <T>(objectBuffer: Buffer, factory: { fromBuffer: (b: Buffer) => T }) => {
      const objectSize = objectBuffer.readUint32BE(0);
      return {
        remainingData: objectBuffer.subarray(objectSize + 4),
        obj: objectSize === 0 ? undefined : factory.fromBuffer(objectBuffer.subarray(4, objectSize + 4)),
      };
    };
    // this is the opposite of the 'toMessage' function
    // so the first 4 bytes is the complete length, skip it
    const publicInputs = toObject(buffer.subarray(4), KernelCircuitPublicInputs);
    const proof = toObject(publicInputs.remainingData, UInt8Vector);
    const txRequest = toObject(proof.remainingData, SignedTxRequest);
    const unverified = toObject(txRequest.remainingData, UnverifiedData);
    const encodedFunctionsLength = unverified.remainingData.readUInt32BE(0);
    if (encodedFunctionsLength) {
      let workingBuffer = unverified.remainingData.subarray(4);
      while (workingBuffer.length > 0) {
        const func = toObject(workingBuffer, EncodedContractFunction);
        workingBuffer = func.remainingData;
        if (func.obj !== undefined) {
          functions.push(func.obj);
        }
      }
    }
    return new Tx(publicInputs.obj, proof.obj, unverified.obj, txRequest.obj, functions.length ? functions : undefined);
  }

  /**
   * Utility function to generate tx hash.
   * @param tx - The transaction from which to generate the hash.
   * @returns A hash of the tx data that identifies the tx.
   */
  static async createTxHash(tx: Tx): Promise<TxHash> {
    // TODO: Until we define how txs will be represented on the L2 block, we won't know how to
    // recreate their hash from the L2 block info. So for now we take the easy way out. If the
    // tx has only private data, we keep the same hash as before. If it has public data,
    // we hash it and return it. And if it has both, we compute both hashes
    // and hash them together. We'll probably want to change this later!
    // See https://github.com/AztecProtocol/aztec3-packages/issues/271

    // NOTE: We are using computeContractLeaf here to ensure consistency with how circuits compute
    // contract tree leaves, which then go into the L2 block, which are then used to regenerate
    // the tx hashes. This means we need the full circuits wasm, and cannot use the lighter primitives
    // wasm. Alternatively, we could stop using computeContractLeaf and manually use the same hash.
    const wasm = await CircuitsWasm.get();
    if (tx.data) {
      return createTxHash({
        ...tx.data.end,
        newContracts: tx.data.end.newContracts.map(cd => computeContractLeaf(wasm, cd)),
      });
    }

    // We hash the full signed tx request object (this is, the tx request along with the signature),
    // just like Ethereum does.
    if (tx.txRequest) {
      return new TxHash(computeTxHash(wasm, tx.txRequest).toBuffer());
    }

    throw new Error(`Unable to create Tx Hash`);
  }
}
