import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

import { AztecAddress } from '../aztec-address/index.js';
import { Gas } from '../gas/gas.js';
import type { PrivateLog } from '../logs/index.js';
import { TxConstantData } from '../tx/tx_constant_data.js';
import type { UInt64 } from '../types/shared.js';
import type { ScopedLogHash } from './log_hash.js';
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';
import { PrivateToPublicKernelCircuitPublicInputs } from './private_to_public_kernel_circuit_public_inputs.js';
import { PrivateToRollupAccumulatedData } from './private_to_rollup_accumulated_data.js';
import { PrivateToRollupKernelCircuitPublicInputs } from './private_to_rollup_kernel_circuit_public_inputs.js';
import { PublicCallRequest } from './public_call_request.js';
import { countAccumulatedItems } from './utils/order_and_comparison.js';

export class PartialPrivateTailPublicInputsForPublic {
  constructor(
    /**
     * Accumulated side effects and enqueued calls that are not revertible.
     */
    public nonRevertibleAccumulatedData: PrivateToPublicAccumulatedData,
    /**
     * Data accumulated from both public and private circuits.
     */
    public revertibleAccumulatedData: PrivateToPublicAccumulatedData,
    /**
     * Call request for the public teardown function.
     */
    public publicTeardownCallRequest: PublicCallRequest,
  ) {}

  getSize() {
    return (
      this.nonRevertibleAccumulatedData.getSize() +
      this.revertibleAccumulatedData.getSize() +
      this.publicTeardownCallRequest.getSize()
    );
  }

  get needsSetup() {
    return !this.nonRevertibleAccumulatedData.publicCallRequests[0].isEmpty();
  }

  get needsAppLogic() {
    return !this.revertibleAccumulatedData.publicCallRequests[0].isEmpty();
  }

  get needsTeardown() {
    return !this.publicTeardownCallRequest.isEmpty();
  }

  static fromBuffer(buffer: Buffer | BufferReader): PartialPrivateTailPublicInputsForPublic {
    const reader = BufferReader.asReader(buffer);
    return new PartialPrivateTailPublicInputsForPublic(
      reader.readObject(PrivateToPublicAccumulatedData),
      reader.readObject(PrivateToPublicAccumulatedData),
      reader.readObject(PublicCallRequest),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.nonRevertibleAccumulatedData,
      this.revertibleAccumulatedData,
      this.publicTeardownCallRequest,
    );
  }

  static empty() {
    return new PartialPrivateTailPublicInputsForPublic(
      PrivateToPublicAccumulatedData.empty(),
      PrivateToPublicAccumulatedData.empty(),
      PublicCallRequest.empty(),
    );
  }
}

export class PartialPrivateTailPublicInputsForRollup {
  constructor(public end: PrivateToRollupAccumulatedData) {}

  static fromBuffer(buffer: Buffer | BufferReader): PartialPrivateTailPublicInputsForRollup {
    const reader = BufferReader.asReader(buffer);
    return new PartialPrivateTailPublicInputsForRollup(reader.readObject(PrivateToRollupAccumulatedData));
  }

  getSize() {
    return this.end.getSize();
  }

  toBuffer() {
    return serializeToBuffer(this.end);
  }

  static empty() {
    return new PartialPrivateTailPublicInputsForRollup(PrivateToRollupAccumulatedData.empty());
  }
}

export class PrivateKernelTailCircuitPublicInputs {
  constructor(
    /**
     * Data which is not modified by the circuits.
     */
    public constants: TxConstantData,
    /**
     * The accumulated gas used after private execution.
     * If the tx has a teardown call request, the teardown gas limits will also be included.
     */
    public gasUsed: Gas,
    /**
     * The address of the fee payer for the transaction.
     */
    public feePayer: AztecAddress,
    /**
     * The timestamp by which the transaction must be included in a block.
     */
    public includeByTimestamp: UInt64,

    public forPublic?: PartialPrivateTailPublicInputsForPublic,
    public forRollup?: PartialPrivateTailPublicInputsForRollup,
  ) {
    if (!forPublic && !forRollup) {
      throw new Error('Missing partial public inputs for private tail circuit.');
    }
    if (forPublic && forRollup) {
      throw new Error(
        'Cannot create PrivateKernelTailCircuitPublicInputs that is for both public kernel circuit and rollup circuit.',
      );
    }
  }

  static get schema() {
    return bufferSchemaFor(PrivateKernelTailCircuitPublicInputs);
  }

  toJSON() {
    return this.toBuffer();
  }

  getSize() {
    return (
      (this.forPublic?.getSize() ?? 0) +
      (this.forRollup?.getSize() ?? 0) +
      this.constants.getSize() +
      this.gasUsed.getSize() +
      this.feePayer.size +
      8 // includeByTimestamp
    );
  }

  toPrivateToPublicKernelCircuitPublicInputs() {
    if (!this.forPublic) {
      throw new Error('Private tail public inputs is not for public circuit.');
    }
    return new PrivateToPublicKernelCircuitPublicInputs(
      this.constants,
      this.forPublic.nonRevertibleAccumulatedData,
      this.forPublic.revertibleAccumulatedData,
      this.forPublic.publicTeardownCallRequest,
      this.gasUsed,
      this.feePayer,
      this.includeByTimestamp,
    );
  }

  toPrivateToRollupKernelCircuitPublicInputs() {
    if (!this.forRollup) {
      throw new Error('Private tail public inputs is not for rollup circuit.');
    }
    const constants = new TxConstantData(
      this.constants.historicalHeader,
      this.constants.txContext,
      this.constants.vkTreeRoot,
      this.constants.protocolContractTreeRoot,
    );
    return new PrivateToRollupKernelCircuitPublicInputs(
      constants,
      this.forRollup.end,
      this.gasUsed,
      this.feePayer,
      this.includeByTimestamp,
    );
  }

  numberOfPublicCallRequests() {
    return (
      this.numberOfNonRevertiblePublicCallRequests() +
      this.numberOfRevertiblePublicCallRequests() +
      (this.hasTeardownPublicCallRequest() ? 1 : 0)
    );
  }

  numberOfNonRevertiblePublicCallRequests() {
    return this.forPublic ? countAccumulatedItems(this.forPublic.nonRevertibleAccumulatedData.publicCallRequests) : 0;
  }

  numberOfRevertiblePublicCallRequests() {
    return this.forPublic ? countAccumulatedItems(this.forPublic.revertibleAccumulatedData.publicCallRequests) : 0;
  }

  hasTeardownPublicCallRequest() {
    return this.forPublic ? !this.forPublic.publicTeardownCallRequest.isEmpty() : false;
  }

  getNonRevertiblePublicCallRequests() {
    return this.forPublic
      ? this.forPublic.nonRevertibleAccumulatedData.publicCallRequests.filter(r => !r.isEmpty())
      : [];
  }

  getRevertiblePublicCallRequests() {
    return this.forPublic ? this.forPublic.revertibleAccumulatedData.publicCallRequests.filter(r => !r.isEmpty()) : [];
  }

  getTeardownPublicCallRequest() {
    const publicTeardownCallRequest = this.forPublic?.publicTeardownCallRequest;
    return !publicTeardownCallRequest?.isEmpty() ? publicTeardownCallRequest : undefined;
  }

  getNonEmptyNoteHashes() {
    const noteHashes = this.forPublic
      ? this.forPublic.nonRevertibleAccumulatedData.noteHashes.concat(
          this.forPublic.revertibleAccumulatedData.noteHashes,
        )
      : this.forRollup!.end.noteHashes;
    return noteHashes.filter(n => !n.isZero());
  }

  getNonEmptyNullifiers() {
    const nullifiers = this.forPublic
      ? this.forPublic.nonRevertibleAccumulatedData.nullifiers.concat(
          this.forPublic.revertibleAccumulatedData.nullifiers,
        )
      : this.forRollup!.end.nullifiers;
    return nullifiers.filter(n => !n.isZero());
  }

  getNonEmptyPrivateLogs() {
    const privateLogs = this.forPublic
      ? this.forPublic.nonRevertibleAccumulatedData.privateLogs.concat(
          this.forPublic.revertibleAccumulatedData.privateLogs,
        )
      : this.forRollup!.end.privateLogs;
    return privateLogs.filter(n => !n.isEmpty());
  }

  getNonEmptyContractClassLogsHashes() {
    const contractClassLogsHashes = this.forPublic
      ? this.forPublic.nonRevertibleAccumulatedData.contractClassLogsHashes.concat(
          this.forPublic.revertibleAccumulatedData.contractClassLogsHashes,
        )
      : this.forRollup!.end.contractClassLogsHashes;
    return contractClassLogsHashes.filter(h => !h.isEmpty());
  }

  getEmittedContractClassLogsLength() {
    const accumulateLengths = (logHashes: ScopedLogHash[]) =>
      logHashes.reduce((acc, log) => acc + log.logHash.length, 0);
    return this.forPublic
      ? accumulateLengths(this.forPublic.nonRevertibleAccumulatedData.contractClassLogsHashes) +
          accumulateLengths(this.forPublic.revertibleAccumulatedData.contractClassLogsHashes)
      : accumulateLengths(this.forRollup!.end.contractClassLogsHashes);
  }

  getEmittedPrivateLogsLength() {
    const accumulateLengths = (logs: PrivateLog[]) => logs.reduce((acc, log) => acc + log.emittedLength, 0);
    return this.forPublic
      ? accumulateLengths(this.forPublic.nonRevertibleAccumulatedData.privateLogs) +
          accumulateLengths(this.forPublic.revertibleAccumulatedData.privateLogs)
      : accumulateLengths(this.forRollup!.end.privateLogs);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelTailCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const isForPublic = reader.readBoolean();
    return new PrivateKernelTailCircuitPublicInputs(
      reader.readObject(TxConstantData),
      reader.readObject(Gas),
      reader.readObject(AztecAddress),
      reader.readUInt64(),
      isForPublic ? reader.readObject(PartialPrivateTailPublicInputsForPublic) : undefined,
      !isForPublic ? reader.readObject(PartialPrivateTailPublicInputsForRollup) : undefined,
    );
  }

  toBuffer() {
    const isForPublic = !!this.forPublic;
    return serializeToBuffer(
      isForPublic,
      this.constants,
      this.gasUsed,
      this.feePayer,
      bigintToUInt64BE(this.includeByTimestamp),
      isForPublic ? this.forPublic!.toBuffer() : this.forRollup!.toBuffer(),
    );
  }

  static empty() {
    return new PrivateKernelTailCircuitPublicInputs(
      TxConstantData.empty(),
      Gas.empty(),
      AztecAddress.ZERO,
      0n,
      undefined,
      PartialPrivateTailPublicInputsForRollup.empty(),
    );
  }

  /**
   * Creates an empty instance except for a nullifier in the combined accumulated data.
   * Useful for populating a tx, which relies on that nullifier for extracting its tx hash.
   * TODO(#9269): Remove this method as we move away from 1st nullifier as hash.
   */
  static emptyWithNullifier() {
    const data = PrivateToRollupAccumulatedData.empty();
    data.nullifiers[0] = Fr.random();
    return new PrivateKernelTailCircuitPublicInputs(
      TxConstantData.empty(),
      Gas.empty(),
      AztecAddress.ZERO,
      0n,
      undefined,
      new PartialPrivateTailPublicInputsForRollup(data),
    );
  }
}
