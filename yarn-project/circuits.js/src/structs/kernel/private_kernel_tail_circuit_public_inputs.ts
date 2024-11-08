import { AztecAddress } from '@aztec/foundation/aztec-address';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { countAccumulatedItems, mergeAccumulatedData } from '../../utils/index.js';
import { GlobalVariables } from '../global_variables.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { PublicCallRequest } from '../public_call_request.js';
import { RevertCode } from '../revert_code.js';
import { RollupValidationRequests } from '../rollup_validation_requests.js';
import { CombinedAccumulatedData } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { KernelCircuitPublicInputs } from './kernel_circuit_public_inputs.js';
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';
import { PrivateToPublicKernelCircuitPublicInputs } from './private_to_public_kernel_circuit_public_inputs.js';
import { TxConstantData } from './tx_constant_data.js';

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
  constructor(public end: CombinedAccumulatedData) {}

  static fromBuffer(buffer: Buffer | BufferReader): PartialPrivateTailPublicInputsForRollup {
    const reader = BufferReader.asReader(buffer);
    return new PartialPrivateTailPublicInputsForRollup(reader.readObject(CombinedAccumulatedData));
  }

  getSize() {
    return this.end.getSize();
  }

  toBuffer() {
    return serializeToBuffer(this.end);
  }

  static empty() {
    return new PartialPrivateTailPublicInputsForRollup(CombinedAccumulatedData.empty());
  }
}

export class PrivateKernelTailCircuitPublicInputs {
  constructor(
    /**
     * Data which is not modified by the circuits.
     */
    public constants: TxConstantData,
    public rollupValidationRequests: RollupValidationRequests,
    /**
     * The address of the fee payer for the transaction.
     */
    public feePayer: AztecAddress,

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

  getSize() {
    return (
      (this.forPublic?.getSize() ?? 0) +
      (this.forRollup?.getSize() ?? 0) +
      this.constants.getSize() +
      this.rollupValidationRequests.getSize() +
      this.feePayer.size
    );
  }

  toPublicKernelCircuitPublicInputs() {
    if (!this.forPublic) {
      throw new Error('Private tail public inputs is not for public circuit.');
    }
    return new PrivateToPublicKernelCircuitPublicInputs(
      this.constants,
      this.rollupValidationRequests,
      this.forPublic.nonRevertibleAccumulatedData,
      this.forPublic.revertibleAccumulatedData,
      this.forPublic.publicTeardownCallRequest,
      this.feePayer,
    );
  }

  toKernelCircuitPublicInputs() {
    if (!this.forRollup) {
      throw new Error('Private tail public inputs is not for rollup circuit.');
    }
    const constants = new CombinedConstantData(
      this.constants.historicalHeader,
      this.constants.txContext,
      this.constants.vkTreeRoot,
      this.constants.protocolContractTreeRoot,
      GlobalVariables.empty(),
    );
    return new KernelCircuitPublicInputs(
      this.rollupValidationRequests,
      this.forRollup.end,
      constants,
      PartialStateReference.empty(),
      RevertCode.OK,
      this.feePayer,
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
      ? mergeAccumulatedData(
          this.forPublic.nonRevertibleAccumulatedData.noteHashes,
          this.forPublic.revertibleAccumulatedData.noteHashes,
        )
      : this.forRollup!.end.noteHashes;
    return noteHashes.filter(n => !n.isZero());
  }

  getNonEmptyNullifiers() {
    const nullifiers = this.forPublic
      ? mergeAccumulatedData(
          this.forPublic.nonRevertibleAccumulatedData.nullifiers,
          this.forPublic.revertibleAccumulatedData.nullifiers,
        )
      : this.forRollup!.end.nullifiers;
    return nullifiers.filter(n => !n.isZero());
  }

  getNonEmptyL2toL1Msgs() {
    const msgs = this.forPublic
      ? mergeAccumulatedData(
          this.forPublic.nonRevertibleAccumulatedData.l2ToL1Msgs,
          this.forPublic.revertibleAccumulatedData.l2ToL1Msgs,
        )
      : this.forRollup!.end.l2ToL1Msgs;
    return msgs.filter(n => !n.isEmpty());
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelTailCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const isForPublic = reader.readBoolean();
    return new PrivateKernelTailCircuitPublicInputs(
      reader.readObject(TxConstantData),
      reader.readObject(RollupValidationRequests),
      reader.readObject(AztecAddress),
      isForPublic ? reader.readObject(PartialPrivateTailPublicInputsForPublic) : undefined,
      !isForPublic ? reader.readObject(PartialPrivateTailPublicInputsForRollup) : undefined,
    );
  }

  toBuffer() {
    const isForPublic = !!this.forPublic;
    return serializeToBuffer(
      isForPublic,
      this.constants,
      this.rollupValidationRequests,
      this.feePayer,
      isForPublic ? this.forPublic!.toBuffer() : this.forRollup!.toBuffer(),
    );
  }

  static empty() {
    return new PrivateKernelTailCircuitPublicInputs(
      TxConstantData.empty(),
      RollupValidationRequests.empty(),
      AztecAddress.ZERO,
      undefined,
      PartialPrivateTailPublicInputsForRollup.empty(),
    );
  }
}
