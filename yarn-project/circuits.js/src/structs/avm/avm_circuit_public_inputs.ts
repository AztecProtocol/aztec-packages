import { makeTuple } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';

import { MAX_ENQUEUED_CALLS_PER_TX } from '../../constants.gen.js';
import { Gas } from '../gas.js';
import { GasSettings } from '../gas_settings.js';
import { GlobalVariables } from '../global_variables.js';
import {
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
} from '../kernel/private_to_avm_accumulated_data.js';
import { PublicCallRequest } from '../public_call_request.js';
import { TreeSnapshots } from '../tree_snapshots.js';
import { AvmAccumulatedData } from './avm_accumulated_data.js';

export class AvmCircuitPublicInputs {
  constructor(
    public globalVariables: GlobalVariables,
    public startTreeSnapshots: TreeSnapshots,
    public startGasUsed: Gas,
    public gasSettings: GasSettings,
    public feePayer: AztecAddress,
    public publicSetupCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
    public publicAppLogicCallRequests: Tuple<PublicCallRequest, typeof MAX_ENQUEUED_CALLS_PER_TX>,
    public publicTeardownCallRequest: PublicCallRequest,
    public previousNonRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths,
    public previousRevertibleAccumulatedDataArrayLengths: PrivateToAvmAccumulatedDataArrayLengths,
    public previousNonRevertibleAccumulatedData: PrivateToAvmAccumulatedData,
    public previousRevertibleAccumulatedData: PrivateToAvmAccumulatedData,
    public endTreeSnapshots: TreeSnapshots,
    public endGasUsed: Gas,
    public accumulatedData: AvmAccumulatedData,
    public transactionFee: Fr,
    public reverted: boolean,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new AvmCircuitPublicInputs(
      reader.readObject(GlobalVariables),
      reader.readObject(TreeSnapshots),
      reader.readObject(Gas),
      reader.readObject(GasSettings),
      reader.readObject(AztecAddress),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readObject(PublicCallRequest),
      reader.readObject(PrivateToAvmAccumulatedDataArrayLengths),
      reader.readObject(PrivateToAvmAccumulatedDataArrayLengths),
      reader.readObject(PrivateToAvmAccumulatedData),
      reader.readObject(PrivateToAvmAccumulatedData),
      reader.readObject(TreeSnapshots),
      reader.readObject(Gas),
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
      this.feePayer,
      this.publicSetupCallRequests,
      this.publicAppLogicCallRequests,
      this.publicTeardownCallRequest,
      this.previousNonRevertibleAccumulatedDataArrayLengths,
      this.previousRevertibleAccumulatedDataArrayLengths,
      this.previousNonRevertibleAccumulatedData,
      this.previousRevertibleAccumulatedData,
      this.endTreeSnapshots,
      this.endGasUsed,
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
      AztecAddress.fromFields(reader),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      reader.readArray(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest),
      PublicCallRequest.fromFields(reader),
      PrivateToAvmAccumulatedDataArrayLengths.fromFields(reader),
      PrivateToAvmAccumulatedDataArrayLengths.fromFields(reader),
      PrivateToAvmAccumulatedData.fromFields(reader),
      PrivateToAvmAccumulatedData.fromFields(reader),
      TreeSnapshots.fromFields(reader),
      Gas.fromFields(reader),
      AvmAccumulatedData.fromFields(reader),
      reader.readField(),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new AvmCircuitPublicInputs(
      GlobalVariables.empty(),
      TreeSnapshots.empty(),
      Gas.empty(),
      GasSettings.empty(),
      AztecAddress.zero(),
      makeTuple(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest.empty),
      makeTuple(MAX_ENQUEUED_CALLS_PER_TX, PublicCallRequest.empty),
      PublicCallRequest.empty(),
      PrivateToAvmAccumulatedDataArrayLengths.empty(),
      PrivateToAvmAccumulatedDataArrayLengths.empty(),
      PrivateToAvmAccumulatedData.empty(),
      PrivateToAvmAccumulatedData.empty(),
      TreeSnapshots.empty(),
      Gas.empty(),
      AvmAccumulatedData.empty(),
      Fr.zero(),
      false,
    );
  }

  [inspect.custom]() {
    return `AvmCircuitPublicInputs {
      globalVariables: ${inspect(this.globalVariables)},
      startTreeSnapshots: ${inspect(this.startTreeSnapshots)},
      startGasUsed: ${inspect(this.startGasUsed)},
      gasSettings: ${inspect(this.gasSettings)},
      feePayer: ${inspect(this.feePayer)},
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
      accumulatedData: ${inspect(this.accumulatedData)},
      transactionFee: ${inspect(this.transactionFee)},
      reverted: ${this.reverted},
      }`;
  }
}
