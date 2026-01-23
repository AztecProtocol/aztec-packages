import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
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
import { ChonkProof } from '../proofs/chonk_proof.js';
import type { TxStats } from '../stats/stats.js';
import { HashedValues } from './hashed_values.js';
import { PublicCallRequestWithCalldata } from './public_call_request_with_calldata.js';
import { TxHash } from './tx_hash.js';

/**
 * The interface of an L2 transaction.
 */
// docs:start:tx_class
export class Tx extends Gossipable {
  static override p2pTopic = TopicType.tx;

  private calldataMap: Map<string, Fr[]> | undefined;

  constructor(
    /**
     * Identifier of the tx.
     * It's a hash of the public inputs of the tx's proof.
     * This claimed hash is reconciled against the tx's public inputs (`this.data`) in data_validator.ts.
     */
    public readonly txHash: TxHash,
    /**
     * Output of the private kernel circuit for this tx.
     */
    public readonly data: PrivateKernelTailCircuitPublicInputs,
    /**
     * Proof from the private kernel circuit.
     */
    public readonly chonkProof: ChonkProof,
    /**
     * Contract class log fields emitted from the tx.
     * Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`.
     * This claimed data is reconciled against a hash of this data (that is contained within
     * the tx's public inputs (`this.data`)), in data_validator.ts.
     */
    public readonly contractClassLogFields: ContractClassLogFields[],
    /**
     * An array of calldata for the enqueued public function calls and the teardown function call.
     * This claimed data is reconciled against hashes of this data (that are contained within
     * the tx's public inputs (`this.data`)), in data_validator.ts.
     */
    public readonly publicFunctionCalldata: HashedValues[],
  ) {
    super();
  }
  // docs:end:tx_class

  // Gossipable method
  override generateP2PMessageIdentifier(): Promise<Buffer32> {
    return Promise.resolve(new Buffer32(this.getTxHash().toBuffer()));
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
      reader.readObject(TxHash),
      reader.readObject(PrivateKernelTailCircuitPublicInputs),
      reader.readObject(ChonkProof),
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
      this.txHash,
      this.data,
      this.chonkProof,
      serializeArrayOfBufferableToVector(this.contractClassLogFields, 1),
      serializeArrayOfBufferableToVector(this.publicFunctionCalldata, 1),
    ]);
  }

  static get schema(): ZodFor<Tx> {
    return z
      .object({
        data: PrivateKernelTailCircuitPublicInputs.schema,
        chonkProof: ChonkProof.schema,
        contractClassLogFields: z.array(ContractClassLogFields.schema),
        publicFunctionCalldata: z.array(HashedValues.schema),
      })
      .transform(Tx.create);
  }

  static async computeTxHash(fields: Pick<FieldsOf<Tx>, 'data'>) {
    const hash = fields.data.forPublic
      ? await fields.data.toPrivateToPublicKernelCircuitPublicInputs().hash()
      : await fields.data.toPrivateToRollupKernelCircuitPublicInputs().hash();
    return new TxHash(hash);
  }

  static async create(fields: Omit<FieldsOf<Tx>, 'txHash'>): Promise<Tx> {
    const txHash = await Tx.computeTxHash(fields);
    return Tx.from({ ...fields, txHash });
  }

  static from(fields: FieldsOf<Tx>) {
    return new Tx(
      fields.txHash,
      fields.data,
      fields.chonkProof,
      fields.contractClassLogFields,
      fields.publicFunctionCalldata,
    );
  }

  /**
   * Validates that the tx hash matches the computed hash from the tx data.
   * This should be called when deserializing a tx from an untrusted source.
   * @returns true if the hash is valid, false otherwise
   */
  async validateTxHash(): Promise<boolean> {
    const expectedHash = await Tx.computeTxHash(this);
    return this.txHash.equals(expectedHash);
  }

  /**
   * Gets public logs emitted by this tx.
   * @param logsSource - An instance of `L2LogsSource` which can be used to obtain the logs.
   * @returns The requested logs.
   */
  public getPublicLogs(logsSource: L2LogsSource): Promise<GetPublicLogsResponse> {
    return logsSource.getPublicLogs({ txHash: this.getTxHash() });
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
   * Return transaction hash.
   * @returns The hash of the public inputs of the private kernel tail circuit.
   */
  getTxHash(): TxHash {
    return this.txHash;
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
  getStats(): TxStats {
    return {
      txHash: this.txHash.toString(),

      noteHashCount: this.data.getNonEmptyNoteHashes().length,
      nullifierCount: this.data.getNonEmptyNullifiers().length,
      privateLogCount: this.data.getNonEmptyPrivateLogs().length,
      classPublishedCount: this.data.getNonEmptyContractClassLogsHashes().length,
      contractClassLogSize: this.data.getEmittedContractClassLogsLength(),

      proofSize: this.chonkProof.fields.length,
      size: this.getSize(),

      feePaymentMethod:
        // needsSetup? then we pay through a fee payment contract
        this.data.forPublic?.needsSetup ? 'fpc' : 'fee_juice',
    };
  }

  private sizeCache: number | undefined;

  getSize(): number {
    if (this.sizeCache == undefined) {
      this.sizeCache = this.toBuffer().length;
    }
    return this.sizeCache;
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
   * Clones a tx, making a deep copy of all fields.
   * @param tx - The transaction to be cloned.
   * @param cloneProof - Whether to clone the proof as well. If false, will shallow copy.
   * @returns The cloned transaction.
   */
  static clone(tx: Tx, cloneProof = true): Tx {
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(tx.data.toBuffer());
    const chonkProof = cloneProof ? ChonkProof.fromBuffer(tx.chonkProof.toBuffer()) : tx.chonkProof;
    const contractClassLogFields = tx.contractClassLogFields.map(p => p.clone());
    const publicFunctionCalldata = tx.publicFunctionCalldata.map(cd => HashedValues.fromBuffer(cd.toBuffer()));
    const clonedTx = new Tx(tx.txHash, publicInputs, chonkProof, contractClassLogFields, publicFunctionCalldata);

    return clonedTx;
  }

  /**
   * Creates a random tx.
   * @param randomProof - Whether to create a random proof - this will be random bytes of the full size.
   * @returns A random tx.
   */
  static random(args: { randomProof?: boolean; txHash?: string | TxHash } = {}): Tx {
    return Tx.from({
      txHash: (typeof args.txHash === 'string' ? TxHash.fromString(args.txHash) : args.txHash) ?? TxHash.random(),
      data: PrivateKernelTailCircuitPublicInputs.emptyWithNullifier(),
      chonkProof: args.randomProof ? ChonkProof.random() : ChonkProof.empty(),
      contractClassLogFields: [ContractClassLogFields.random()],
      publicFunctionCalldata: [HashedValues.random()],
    });
  }

  /** Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated. */
  public async recomputeHash(): Promise<TxHash> {
    (this as any).txHash = await Tx.computeTxHash(this);
    return this.txHash;
  }

  #combinePublicCallRequestWithCallData(request: PublicCallRequest) {
    const calldataMap = this.getCalldataMap();
    // Assume empty calldata if nothing is given for the hash.
    // The verification of calldata vs hash should be handled outside of this class.
    const calldata = calldataMap.get(request.calldataHash.toString()) ?? [];
    return new PublicCallRequestWithCalldata(request, calldata);
  }
}

/**
 * Helper class to handle Serialization and Deserialization of Txs array.
 */
export class TxArray extends Array<Tx> {
  static fromBuffer(buffer: Buffer | BufferReader): TxArray {
    const reader = BufferReader.asReader(buffer);
    try {
      const txs = reader.readVector(Tx);
      return new TxArray(...txs);
    } catch {
      throw new Error('Failed to deserialize TxArray from buffer');
    }
  }

  public toBuffer(): Buffer {
    return serializeArrayOfBufferableToVector(this);
  }
}
