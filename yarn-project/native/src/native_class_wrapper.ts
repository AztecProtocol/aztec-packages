import { TypedMessage } from '@aztec/foundation/message';

import { Decoder, Encoder } from 'msgpackr';
import { isAnyArrayBuffer } from 'util/types';

export interface NativeInstance {
  call(msg: Buffer | Uint8Array): Promise<Buffer | Uint8Array>;
}

export interface NativeClass {
  new (...args: unknown[]): NativeInstance;
}

export type NativeModule = Record<string, NativeClass>;

export type WrappedNativeClass = { new (...args: unknown[]): NativeInstanceWrapper };
export type WrappedNativeModule = Record<string, WrappedNativeClass>;

export type NativeCallDuration = {
  encodingUs: number;
  callUs: number;
  decodingUs: number;
  totalUs: number;
};

export class NativeInstanceWrapper {
  /** A long-lived msgpack encoder */
  private encoder = new Encoder({
    // always encode JS objects as MessagePack maps
    // this makes it compatible with other MessagePack decoders
    useRecords: false,
    int64AsType: 'bigint',
  });

  /** A long-lived msgpack decoder */
  private decoder = new Decoder({
    useRecords: false,
    int64AsType: 'bigint',
  });

  protected instance: NativeInstance;

  protected constructor(protected klass: NativeClass, ...args: unknown[]) {
    this.instance = new klass(...args);
  }

  protected async sendMessage<T, REQ, RESP>(
    request: TypedMessage<T, REQ>,
  ): Promise<{ duration: NativeCallDuration; response: TypedMessage<T, RESP> }> {
    const duration: NativeCallDuration = {
      callUs: 0,
      totalUs: 0,
      decodingUs: 0,
      encodingUs: 0,
    };

    const start = process.hrtime.bigint();
    const encodedRequest = this.encoder.encode(request);
    const encodingEnd = process.hrtime.bigint();
    duration.encodingUs = Number((encodingEnd - start) / 1000n);

    const encodedResponse = await this.instance.call(encodedRequest);
    const callEnd = process.hrtime.bigint();
    duration.callUs = Number((callEnd - encodingEnd) / 1000n);

    const buf = Buffer.isBuffer(encodedResponse)
      ? encodedResponse
      : isAnyArrayBuffer(encodedResponse)
      ? Buffer.from(encodedResponse)
      : encodedResponse;

    if (!Buffer.isBuffer(buf)) {
      throw new TypeError(
        'Invalid encoded response: expected Buffer or ArrayBuffer, got ' +
          (encodedResponse === null ? 'null' : typeof encodedResponse),
      );
    }

    const decodedResponse = this.decoder.unpack(buf);
    if (!TypedMessage.isTypedMessageLike(decodedResponse)) {
      throw new TypeError(
        'Invalid response: expected TypedMessageLike, got ' +
          (decodedResponse === null ? 'null' : typeof decodedResponse),
      );
    }

    const response = TypedMessage.fromMessagePack<T, RESP>(decodedResponse);
    const decodingEnd = process.hrtime.bigint();
    duration.decodingUs = Number((decodingEnd - callEnd) / 1000n);

    if (response.header.requestId !== request.header.messageId) {
      throw new Error(
        'Response ID does not match request: ' + response.header.requestId + ' != ' + request.header.messageId,
      );
    }

    if (response.msgType !== request.msgType) {
      throw new Error('Invalid response message type: ' + response.msgType + ' != ' + response.msgType);
    }

    duration.totalUs = Number((process.hrtime.bigint() - start) / 1000n);

    return { duration, response };
  }
}

export function wrap(name: string, klass: NativeClass): WrappedNativeClass {
  // use a dummy object in order to give a name to this anonymous class
  const dummy = {
    [name]: class extends NativeInstanceWrapper {
      constructor(...args: unknown[]) {
        super(klass, ...args);
      }
    },
  };

  return dummy.name;
}

export function wrapModule(module: NativeModule): WrappedNativeModule {
  return Object.fromEntries(Object.entries(module).map(([name, klass]) => [name, wrap(name, klass)]));
}
