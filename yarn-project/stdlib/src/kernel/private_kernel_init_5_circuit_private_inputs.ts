import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { ProtocolContracts } from '../tx/protocol_contracts.js';
import { TxRequest } from '../tx/tx_request.js';
import { PrivateCallData } from './private_call_data.js';

/**
 * Input to the batched private kernel init circuit, which processes the first five app calls of a
 * transaction in a single iteration.
 */
export class PrivateKernelInit5CircuitPrivateInputs {
  constructor(
    public txRequest: TxRequest,
    public vkTreeRoot: Fr,
    public protocolContracts: ProtocolContracts,
    public privateCall0: PrivateCallData,
    public privateCall1: PrivateCallData,
    public privateCall2: PrivateCallData,
    public privateCall3: PrivateCallData,
    public privateCall4: PrivateCallData,
    public isPrivateOnly: boolean,
    public revertibleCounterHint: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.txRequest,
      this.vkTreeRoot,
      this.protocolContracts,
      this.privateCall0,
      this.privateCall1,
      this.privateCall2,
      this.privateCall3,
      this.privateCall4,
      this.revertibleCounterHint,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInit5CircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInit5CircuitPrivateInputs(
      reader.readObject(TxRequest),
      Fr.fromBuffer(reader),
      reader.readObject(ProtocolContracts),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readBoolean(),
      reader.readNumber(),
    );
  }
}
