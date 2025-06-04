import { MAX_ENQUEUED_CALLS_PER_TX } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, type Tuple, assertLength, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { Gas, GasFees, GasSettings } from '../gas/index.js';
import {
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
} from '../kernel/private_to_avm_accumulated_data.js';
import { PublicCallRequest, PublicCallRequestArrayLengths } from '../kernel/public_call_request.js';
import { GlobalVariables } from '../tx/global_variables.js';
import { TreeSnapshots } from '../tx/tree_snapshots.js';
import { AvmAccumulatedData, AvmAccumulatedDataArrayLengths } from './avm_accumulated_data.js';
import { serializeWithMessagePack } from './message_pack.js';

// Note: the {from,to}{Buffer,Fields,String} methods are needed by AvmProofData and PublicBaseRollupInputs.
// At some point it might be worth writing Zod schemas for all dependent types and get rid of that.
export class AvmCircuitPublicInputs {
  constructor(
    ///////////////////////////////////
    // Inputs.
    public globalVariables: GlobalVariables,
    public startTreeSnapshots: TreeSnapshots,
    public startGasUsed: Gas,
    public gasSettings: GasSettings,
    public effectiveGasFees: GasFees,
    public feePayer: AztecAddress,
    public publicCallRequestArrayLengths: PublicCallRequestArrayLengths,
    public publicSetupCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
    public publicAppLogicCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
    public publicTeardownCallRequest: PublicCallRequest,
    public previousNonRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths,
    public previousRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths,
    public previousNonRevertibleAccumulatedData: PrivateToAvmAccumulatedData,
    public previousRevertibleAccumulatedData: PrivateToAvmAccumulatedData,
    ///////////////////////////////////
    // Outputs.
    public endTreeSnapshots: TreeSnapshots,
    public endGasUsed: Gas,
    public accumulatedDataArrayLengths: AvmAccumulatedDataArrayLengths,
    public accumulatedData: AvmAccumulatedData,
    public transactionFee: Fr,
    public reverted: boolean,
  ) {}

  static get schema() {
    return z
      .object({
        globalVariables: GlobalVariables.schema,
        startTreeSnapshots: TreeSnapshots.schema,
        startGasUsed: Gas.schema,
        gasSettings: GasSettings.schema,
        effectiveGasFees: GasFees.schema,
        feePayer: AztecAddress.schema,
        publicCallRequestArrayLengths: PublicCallRequestArrayLengths.schema,
        publicSetupCallRequests: PublicCallRequest.schema.array().max(MAX_ENQUEUED_CALLS_PER_TX),
        publicAppLogicCallRequests: PublicCallRequest.schema.array().max(MAX_ENQUEUED_CALLS_PER_TX),
        publicTeardownCallRequest: PublicCallRequest.schema,
        previousNonRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths.schema,
        previousRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths.schema,
        previousNonRevertibleAccumulatedData: PrivateToAvmAccumulatedData.schema,
        previousRevertibleAccumulatedData: PrivateToAvmAccumulatedData.schema,
        endTreeSnapshots: TreeSnapshots.schema,
        endGasUsed: Gas.schema,
        accumulatedDataArrayLengths: AvmAccumulatedDataArrayLengths.schema,
        accumulatedData: AvmAccumulatedData.schema,
        transactionFee: schemas.Fr,
        reverted: z.boolean(),
      })
      .transform(
        ({
          globalVariables,
          startTreeSnapshots,
          startGasUsed,
          gasSettings,
          effectiveGasFees,
          feePayer,
          publicCallRequestArrayLengths,
          publicSetupCallRequests,
          publicAppLogicCallRequests,
          publicTeardownCallRequest,
          previousNonRevertibleAccumulatedDataArrayLengths,
          previousRevertibleAccumulatedDataArrayLengths,
          previousNonRevertibleAccumulatedData,
          previousRevertibleAccumulatedData,
          endTreeSnapshots,
          endGasUsed,
          accumulatedDataArrayLengths,
          accumulatedData,
          transactionFee,
          reverted,
        }) =>
          new AvmCircuitPublicInputs(
            globalVariables,
            startTreeSnapshots,
            startGasUsed,
            gasSettings,
            effectiveGasFees,
            feePayer,
            publicCallRequestArrayLengths,
            assertLength(publicSetupCallRequests, MAX_ENQUEUED_CALLS_PER_TX),
            assertLength(publicAppLogicCallRequests, MAX_ENQUEUED_CALLS_PER_TX),
            publicTeardownCallRequest,
            previousNonRevertibleAccumulatedDataArrayLengths,
            previousRevertibleAccumulatedDataArrayLengths,
            previousNonRevertibleAccumulatedData,
            previousRevertibleAccumulatedData,
            endTreeSnapshots,
            endGasUsed,
            accumulatedDataArrayLengths,
            accumulatedData,
            transactionFee,
            reverted,
          ),
      );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new AvmCircuitPublicInputs(
      reader.readObject(GlobalVariables),
      reader.readObject(TreeSnapshots),
      reader.readObject(Gas),
      reader.readObject(GasSettings),
      reader.readObject(GasFees),
      reader.readObject(AztecAddress),
      reader.readObject(PublicCallRequestArrayLengths),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readObject(PublicCallRequest),
      reader.readObject(PrivateToAvmAccumulatedDataArrayLengths),
      reader.readObject(PrivateToAvmAccumulatedDataArrayLengths),
      reader.readObject(PrivateToAvmAccumulatedData),
      reader.readObject(PrivateToAvmAccumulatedData),
      reader.readObject(TreeSnapshots),
      reader.readObject(Gas),
      reader.readObject(AvmAccumulatedDataArrayLengths),
      reader.readObject(AvmAccumulatedData),
      reader.readObject(Fr),
      reader.readBoolean(),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.globalVariables,
      this.startTreeSnapshots,
      this.startGasUsed,
      this.gasSettings,
      this.effectiveGasFees,
      this.feePayer,
      this.publicCallRequestArrayLengths,
      this.publicSetupCallRequests,
      this.publicAppLogicCallRequests,
      this.publicTeardownCallRequest,
      this.previousNonRevertibleAccumulatedDataArrayLengths,
      this.previousRevertibleAccumulatedDataArrayLengths,
      this.previousNonRevertibleAccumulatedData,
      this.previousRevertibleAccumulatedData,
      this.endTreeSnapshots,
      this.endGasUsed,
      this.accumulatedDataArrayLengths,
      this.accumulatedData,
      this.transactionFee,
      this.reverted,
    );
  }

  static fromString(str: string) {
    return AvmCircuitPublicInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new AvmCircuitPublicInputs(
      GlobalVariables.fromFields(reader),
      TreeSnapshots.fromFields(reader),
      Gas.fromFields(reader),
      GasSettings.fromFields(reader),
      GasFees.fromFields(reader),
      AztecAddress.fromFields(reader),
      PublicCallRequestArrayLengths.fromFields(reader),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      PublicCallRequest.fromFields(reader),
      PrivateToAvmAccumulatedDataArrayLengths.fromFields(reader),
      PrivateToAvmAccumulatedDataArrayLengths.fromFields(reader),
      PrivateToAvmAccumulatedData.fromFields(reader),
      PrivateToAvmAccumulatedData.fromFields(reader),
      TreeSnapshots.fromFields(reader),
      Gas.fromFields(reader),
      AvmAccumulatedDataArrayLengths.fromFields(reader),
      AvmAccumulatedData.fromFields(reader),
      reader.readField(),
      reader.readBoolean(),
    );
  }

  toFields() {
    return [
      ...this.globalVariables.toFields(),
      ...this.startTreeSnapshots.toFields(),
      ...this.startGasUsed.toFields(),
      ...this.gasSettings.toFields(),
      ...this.effectiveGasFees.toFields(),
      this.feePayer,
      ...this.publicCallRequestArrayLengths.toFields(),
      ...this.publicSetupCallRequests.map(request => request.toFields()),
      ...this.publicAppLogicCallRequests.map(request => request.toFields()),
      ...this.publicTeardownCallRequest.toFields(),
      ...this.previousNonRevertibleAccumulatedDataArrayLengths.toFields(),
      ...this.previousRevertibleAccumulatedDataArrayLengths.toFields(),
      ...this.previousNonRevertibleAccumulatedData.toFields(),
      ...this.previousRevertibleAccumulatedData.toFields(),
      ...this.endTreeSnapshots.toFields(),
      ...this.endGasUsed.toFields(),
      ...this.accumulatedDataArrayLengths.toFields(),
      ...this.accumulatedData.toFields(),
      this.transactionFee,
      this.reverted,
    ];
  }

  static empty() {
    return new AvmCircuitPublicInputs(
      GlobalVariables.empty(),
      TreeSnapshots.empty(),
      Gas.empty(),
      GasSettings.empty(),
      GasFees.empty(),
      AztecAddress.zero(),
      PublicCallRequestArrayLengths.empty(),
      makeTuple(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest.empty),
      makeTuple(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest.empty),
      PublicCallRequest.empty(),
      PrivateToAvmAccumulatedDataArrayLengths.empty(),
      PrivateToAvmAccumulatedDataArrayLengths.empty(),
      PrivateToAvmAccumulatedData.empty(),
      PrivateToAvmAccumulatedData.empty(),
      TreeSnapshots.empty(),
      Gas.empty(),
      AvmAccumulatedDataArrayLengths.empty(),
      AvmAccumulatedData.empty(),
      Fr.zero(),
      false,
    );
  }

  public serializeWithMessagePack(): Buffer {
    return serializeWithMessagePack(this);
  }

  [inspect.custom]() {
    return `AvmCircuitPublicInputs {
      globalVariables: ${inspect(this.globalVariables)},
      startTreeSnapshots: ${inspect(this.startTreeSnapshots)},
      startGasUsed: ${inspect(this.startGasUsed)},
      gasSettings: ${inspect(this.gasSettings)},
      effectiveGasFees: ${inspect(this.effectiveGasFees)},
      feePayer: ${inspect(this.feePayer)},
      publicCallRequestArrayLengths: ${inspect(this.publicCallRequestArrayLengths)},
      publicSetupCallRequests: [${this.publicSetupCallRequests
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}]},
      publicAppLogicCallRequests: [${this.publicAppLogicCallRequests
        .filter(x => !x.isEmpty())
        .map(h => inspect(h))
        .join(', ')}]},
      publicTeardownCallRequest: ${inspect(this.publicTeardownCallRequest)},
      previousNonRevertibleAccumulatedDataArrayLengths: ${inspect(
        this.previousNonRevertibleAccumulatedDataArrayLengths,
      )},
      previousRevertibleAccumulatedDataArrayLengths: ${inspect(this.previousRevertibleAccumulatedDataArrayLengths)},
      previousNonRevertibleAccumulatedData: ${inspect(this.previousNonRevertibleAccumulatedData)},
      previousRevertibleAccumulatedData: ${inspect(this.previousRevertibleAccumulatedData)},
      endTreeSnapshots: ${inspect(this.endTreeSnapshots)},
      endGasUsed: ${inspect(this.endGasUsed)},
      accumulatedDataArrayLengths: ${inspect(this.accumulatedDataArrayLengths)},
      accumulatedData: ${inspect(this.accumulatedData)},
      transactionFee: ${inspect(this.transactionFee)},
      reverted: ${this.reverted},
      }`;
  }
}
