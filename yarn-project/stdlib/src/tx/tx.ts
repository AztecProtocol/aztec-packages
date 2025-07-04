import { Buffer32 } from '@aztec/foundation/buffer';
import { arraySerializedSizeOfNonEmpty } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeArrayOfBufferableToVector, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import type { GasSettings } from '../gas/gas_settings.js';
import type { GetPublicLogsResponse } from '../interfaces/get_logs_response.js';
import type { L2LogsSource } from '../interfaces/l2_logs_source.js';
import type { PublicCallRequest } from '../kernel/index.js';
import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ContractClassLog, ContractClassLogFields } from '../logs/contract_class_log.js';
import { Gossipable } from '../p2p/gossipable.js';
import { TopicType } from '../p2p/topic_type.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import type { TxStats } from '../stats/stats.js';
import { HashedValues } from './hashed_values.js';
import { PublicCallRequestWithCalldata } from './public_call_request_with_calldata.js';
import { TxHash } from './tx_hash.js';

/**
 * The interface of an L2 transaction.
 */
export class Tx extends Gossipable {
  static override p2pTopic = TopicType.tx;
  // For memoization
  protected txHash: TxHash | undefined;

  private calldataMap: Map<string, Fr[]> | undefined;

  constructor(
    /**
     * Output of the private kernel circuit for this tx.
     */
    public readonly data: PrivateKernelTailCircuitPublicInputs,
    /**
     * Proof from the private kernel circuit.
     * TODO(#7368): This client IVC object currently contains various VKs that will eventually be more like static data.
     */
    public readonly clientIvcProof: ClientIvcProof,
    /**
     * Contract class log fields emitted from the tx.
     * Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`.
     * It's checked in data_validator.ts
     */
    public contractClassLogFields: ContractClassLogFields[],
    /**
     * An array of calldata for the enqueued public function calls and the teardown function call.
     */
    public publicFunctionCalldata: HashedValues[],
  ) {
    super();
  }

  // Gossipable method
  override async generateP2PMessageIdentifier(): Promise<Buffer32> {
    return new Buffer32((await this.getTxHash()).toBuffer());
  }

  hasPublicCalls() {
    return this.numberOfPublicCalls() > 0;
  }

  numberOfPublicCalls() {
    return this.data.numberOfPublicCallRequests();
  }

  getNonRevertiblePublicCallRequestsWithCalldata(): PublicCallRequestWithCalldata[] {
    return this.data.getNonRevertiblePublicCallRequests().map(r => this.#combinePublicCallRequestWithCallData(r));
  }

  getRevertiblePublicCallRequestsWithCalldata(): PublicCallRequestWithCalldata[] {
    return this.data.getRevertiblePublicCallRequests().map(r => this.#combinePublicCallRequestWithCallData(r));
  }

  getTeardownPublicCallRequestWithCalldata(): PublicCallRequestWithCalldata | undefined {
    const request = this.data.getTeardownPublicCallRequest();
    return request ? this.#combinePublicCallRequestWithCallData(request) : undefined;
  }

  getPublicCallRequestsWithCalldata(): PublicCallRequestWithCalldata[] {
    const teardown = this.data.getTeardownPublicCallRequest();
    const callRequests = [
      ...this.data.getNonRevertiblePublicCallRequests(),
      ...this.data.getRevertiblePublicCallRequests(),
      ...(teardown ? [teardown] : []),
    ];
    return callRequests.map(r => this.#combinePublicCallRequestWithCallData(r));
  }

  getTotalPublicCalldataCount(): number {
    return this.publicFunctionCalldata.reduce((accum, cd) => accum + cd.values.length, 0);
  }

  getGasSettings(): GasSettings {
    return this.data.constants.txContext.gasSettings;
  }

  /**
   * Deserializes the Tx object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of Tx.
   */
  static fromBuffer(buffer: Buffer | BufferReader): Tx {
    const reader = BufferReader.asReader(buffer);
    return new Tx(
      reader.readObject(PrivateKernelTailCircuitPublicInputs),
      reader.readObject(ClientIvcProof),
      reader.readVectorUint8Prefix(ContractClassLogFields),
      reader.readVectorUint8Prefix(HashedValues),
    );
  }

  /**
   * Serializes the Tx object into a Buffer.
   * @returns Buffer representation of the Tx object.
   */
  toBuffer() {
    return serializeToBuffer([
      this.data,
      this.clientIvcProof,
      serializeArrayOfBufferableToVector(this.contractClassLogFields, 1),
      serializeArrayOfBufferableToVector(this.publicFunctionCalldata, 1),
    ]);
  }

  static get schema(): ZodFor<Tx> {
    return z
      .object({
        data: PrivateKernelTailCircuitPublicInputs.schema,
        clientIvcProof: ClientIvcProof.schema,
        contractClassLogFields: z.array(ContractClassLogFields.schema),
        publicFunctionCalldata: z.array(HashedValues.schema),
      })
      .transform(Tx.from);
  }

  static from(fields: FieldsOf<Tx>) {
    return new Tx(fields.data, fields.clientIvcProof, fields.contractClassLogFields, fields.publicFunctionCalldata);
  }

  /**
   * Gets public logs emitted by this tx.
   * @param logsSource - An instance of `L2LogsSource` which can be used to obtain the logs.
   * @returns The requested logs.
   */
  public async getPublicLogs(logsSource: L2LogsSource): Promise<GetPublicLogsResponse> {
    return logsSource.getPublicLogs({ txHash: await this.getTxHash() });
  }

  getContractClassLogs(): ContractClassLog[] {
    const logHashes = this.data.getNonEmptyContractClassLogsHashes();
    return logHashes.map((logHash, i) =>
      ContractClassLog.from({
        contractAddress: logHash.contractAddress,
        fields: this.contractClassLogFields[i],
        emittedLength: logHash.logHash.length,
      }),
    );
  }

  /**
   * Gets either revertible or non revertible contract class logs emitted by this tx.
   * @param revertible - true for revertible only logs, false for non revertible only logs.
   * @returns The requested logs.
   */
  getSplitContractClassLogs(revertible: boolean): ContractClassLog[] {
    if (!this.data.forPublic) {
      throw new Error('`getSplitContractClassLogs` should only be called on txs with public calls');
    }

    const contractClassLogs = this.getContractClassLogs();
    const numNonRevertible = this.data.forPublic.nonRevertibleAccumulatedData.contractClassLogsHashes.filter(
      h => !h.isEmpty(),
    ).length;
    return revertible ? contractClassLogs.slice(numNonRevertible) : contractClassLogs.slice(0, numNonRevertible);
  }

  /**
   * Computes (if necessary) & return transaction hash.
   * @returns The hash of the public inputs of the private kernel tail circuit.
   */
  async getTxHash(forceRecompute = false): Promise<TxHash> {
    if (!this.txHash || forceRecompute) {
      const hash = this.data.forPublic
        ? await this.data.toPrivateToPublicKernelCircuitPublicInputs().hash()
        : await this.data.toPrivateToRollupKernelCircuitPublicInputs().hash();
      this.txHash = new TxHash(hash);
    }
    return this.txHash!;
  }

  /**
   * Allows setting the hash of the Tx.
   * Use this when you want to skip computing it from the original data.
   * Don't set a Tx hash received from an untrusted source.
   * @param hash - The hash to set.
   */
  setTxHash(hash: TxHash) {
    this.txHash = hash;
    return this as unknown as TxWithHash;
  }

  getCalldataMap(): Map<string, Fr[]> {
    if (!this.calldataMap) {
      const calldataMap = new Map();
      this.publicFunctionCalldata.forEach(cd => calldataMap.set(cd.hash.toString(), cd.values));
      this.calldataMap = calldataMap;
    }

    return this.calldataMap;
  }

  /** Returns stats about this tx. */
  async getStats(): Promise<TxStats> {
    return {
      txHash: (await this.getTxHash()).toString(),

      noteHashCount: this.data.getNonEmptyNoteHashes().length,
      nullifierCount: this.data.getNonEmptyNullifiers().length,
      privateLogCount: this.data.getNonEmptyPrivateLogs().length,
      classRegisteredCount: this.data.getNonEmptyContractClassLogsHashes().length,
      contractClassLogSize: this.data.getEmittedContractClassLogsLength(),

      proofSize: this.clientIvcProof.clientIvcProofBuffer.length,
      size: this.toBuffer().length,

      feePaymentMethod:
        // needsSetup? then we pay through a fee payment contract
        this.data.forPublic?.needsSetup ? 'fpc' : 'fee_juice',
    };
  }

  getSize() {
    return (
      this.data.getSize() +
      this.clientIvcProof.clientIvcProofBuffer.length +
      arraySerializedSizeOfNonEmpty(this.contractClassLogFields) +
      this.publicFunctionCalldata.reduce((accum, cd) => accum + cd.getSize(), 0)
    );
  }

  /**
   * Estimates the tx size based on its private effects. Note that the actual size of the tx
   * after processing will probably be larger, as public execution would generate more data.
   */
  getEstimatedPrivateTxEffectsSize() {
    return (
      this.data.getNonEmptyNoteHashes().length * Fr.SIZE_IN_BYTES +
      this.data.getNonEmptyNullifiers().length * Fr.SIZE_IN_BYTES +
      this.data.getEmittedPrivateLogsLength() * Fr.SIZE_IN_BYTES +
      this.data.getEmittedContractClassLogsLength() * Fr.SIZE_IN_BYTES
    );
  }

  /**
   * Convenience function to get a hash out of a tx or a tx-like.
   * @param tx - Tx-like object.
   * @returns - The hash.
   */
  static async getHash(tx: Tx | HasHash): Promise<TxHash> {
    return hasHash(tx) ? tx.hash : await tx.getTxHash();
  }

  /**
   * Convenience function to get array of hashes for an array of txs.
   * @param txs - The txs to get the hashes from.
   * @returns The corresponding array of hashes.
   */
  static async getHashes(txs: (Tx | HasHash)[]): Promise<TxHash[]> {
    return await Promise.all(txs.map(Tx.getHash));
  }

  /**
   * Clones a tx, making a deep copy of all fields.
   * @param tx - The transaction to be cloned.
   * @returns The cloned transaction.
   */
  static clone(tx: Tx): Tx {
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(tx.data.toBuffer());
    const clientIvcProof = ClientIvcProof.fromBuffer(tx.clientIvcProof.toBuffer());
    const contractClassLogFields = tx.contractClassLogFields.map(p => p.clone());
    const publicFunctionCalldata = tx.publicFunctionCalldata.map(cd => HashedValues.fromBuffer(cd.toBuffer()));
    const clonedTx = new Tx(publicInputs, clientIvcProof, contractClassLogFields, publicFunctionCalldata);
    if (tx.txHash) {
      clonedTx.setTxHash(TxHash.fromBuffer(tx.txHash.toBuffer()));
    }

    return clonedTx;
  }

  /**
   * Creates a random tx.
   * @param randomProof - Whether to create a random proof - this will be random bytes of the full size.
   * @returns A random tx.
   */
  static random(randomProof = false) {
    return new Tx(
      PrivateKernelTailCircuitPublicInputs.emptyWithNullifier(),
      randomProof ? ClientIvcProof.random() : ClientIvcProof.empty(),
      [ContractClassLogFields.random()],
      [HashedValues.random()],
    );
  }

  #combinePublicCallRequestWithCallData(request: PublicCallRequest) {
    const calldataMap = this.getCalldataMap();
    // Assume empty calldata if nothing is given for the hash.
    // The verification of calldata vs hash should be handled outside of this class.
    const calldata = calldataMap.get(request.calldataHash.toString()) ?? [];
    return new PublicCallRequestWithCalldata(request, calldata);
  }

  public async toTxWithHash() {
    await this.getTxHash();
    return this as unknown as TxWithHash;
  }

  public static toTxsWithHashes(txs: Tx[]): Promise<TxWithHash[]> {
    return Promise.all(txs.map(tx => tx.toTxWithHash()));
  }
}

/** Utility type for an entity that has a hash property for a txhash */
type HasHash = { /** The tx hash */ hash: TxHash };

function hasHash(tx: Tx | HasHash): tx is HasHash {
  return (tx as HasHash).hash !== undefined;
}

export type TxWithHash = Tx & { txHash: TxHash };

/**
 * Helper class to handle Serialization and Deserialization of Txs array.
 **/
export class TxArray extends Array<Tx> {
  static fromBuffer(buffer: Buffer | BufferReader): TxArray {
    try {
      const reader = BufferReader.asReader(buffer);
      const txs = reader.readVector(Tx);

      return new TxArray(...txs);
    } catch {
      return new TxArray();
    }
  }

  public toBuffer(): Buffer {
    return serializeArrayOfBufferableToVector(this);
  }
}
