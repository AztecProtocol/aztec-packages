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

  private calldataMap: Map<string, Fr[]> | undefined;

  constructor(
    /** Identifier of the tx */
    public readonly txHash: TxHash,
    /**
     * Output of the private kernel circuit for this tx.
     */
    public readonly data: PrivateKernelTailCircuitPublicInputs,
    /**
     * Proof from the private kernel circuit.
     */
    public readonly clientIvcProof: ClientIvcProof,
    /**
     * Contract class log fields emitted from the tx.
     * Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`.
     * It's checked in data_validator.ts
     */
    public readonly contractClassLogFields: ContractClassLogFields[],
    /**
     * An array of calldata for the enqueued public function calls and the teardown function call.
     */
    public readonly publicFunctionCalldata: HashedValues[],
  ) {
    super();
  }

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
      this.txHash,
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
      fields.clientIvcProof,
      fields.contractClassLogFields,
      fields.publicFunctionCalldata,
    );
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

      proofSize: this.clientIvcProof.proof.length,
      size: this.toBuffer().length,

      feePaymentMethod:
        // needsSetup? then we pay through a fee payment contract
        this.data.forPublic?.needsSetup ? 'fpc' : 'fee_juice',
    };
  }

  getSize() {
    return (
      this.data.getSize() +
      this.clientIvcProof.proof.length * Fr.SIZE_IN_BYTES +
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
   * Clones a tx, making a deep copy of all fields.
   * @param tx - The transaction to be cloned.
   * @returns The cloned transaction.
   */
  static clone(tx: Tx): Tx {
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(tx.data.toBuffer());
    const clientIvcProof = ClientIvcProof.fromBuffer(tx.clientIvcProof.toBuffer());
    const contractClassLogFields = tx.contractClassLogFields.map(p => p.clone());
    const publicFunctionCalldata = tx.publicFunctionCalldata.map(cd => HashedValues.fromBuffer(cd.toBuffer()));
    const clonedTx = new Tx(tx.txHash, publicInputs, clientIvcProof, contractClassLogFields, publicFunctionCalldata);

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
      clientIvcProof: args.randomProof ? ClientIvcProof.random() : ClientIvcProof.empty(),
      contractClassLogFields: [ContractClassLogFields.random()],
      publicFunctionCalldata: [HashedValues.random()],
    });
  }

  /** Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated. */
  public async recomputeHash() {
    (this as any).txHash = await Tx.computeTxHash(this);
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
