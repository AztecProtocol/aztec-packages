import { MerkleTreeId } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { createDebugLogger, fmtLogData } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';

import assert from 'assert';
import bindings from 'bindings';
import { Decoder, Encoder, addExtension } from 'msgpackr';
import { isAnyArrayBuffer } from 'util/types';

import {
  MessageHeader,
  TypedMessage,
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateResponse,
} from './message.js';

// small extension to pack an NodeJS Fr instance to a representation that the C++ code can understand
// this only works for writes. Unpacking from C++ can't create Fr instances because the data is passed
// as raw, untagged, buffers. On the NodeJS side we don't know what the buffer represents
// Adding a tag would be a solution, but it would have to be done on both sides and it's unclear where else
// C++ fr instances are sent/received/stored.
addExtension({
  Class: Fr,
  write: fr => fr.toBuffer(),
});

export interface NativeInstance {
  call(msg: Buffer | Uint8Array): Promise<any>;
}

const NATIVE_LIBRARY_NAME = 'world_state_napi';
const NATIVE_CLASS_NAME = 'WorldState';

const NATIVE_MODULE = bindings(NATIVE_LIBRARY_NAME);

export interface NativeWorldStateInstance {
  call<T extends WorldStateMessageType>(messageType: T, body: WorldStateRequest[T]): Promise<WorldStateResponse[T]>;
}

/**
 * Strongly-typed interface to access the WorldState class in the native world_state_napi module.
 */
export class NativeWorldState implements NativeWorldStateInstance {
  private open = true;

  /** Each message needs a unique ID */
  private nextMessageId = 0;

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

  /** The actual native instance */
  private instance: any;

  /** Calls to the same instance are serialized */
  private queue = new SerialQueue();

  /** Creates a new native WorldState instance */
  constructor(dataDir: string, private log = createDebugLogger('aztec:world-state:database')) {
    this.instance = new NATIVE_MODULE[NATIVE_CLASS_NAME](dataDir);
    this.queue.start();
  }

  /**
   * Sends a message to the native instance and returns the response.
   * @param messageType - The type of message to send
   * @param body - The message body
   * @returns The response to the message
   */
  public call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T],
  ): Promise<WorldStateResponse[T]> {
    return this.queue.put(() => {
      assert.notEqual(messageType, WorldStateMessageType.CLOSE, 'Use close() to close the native instance');
      assert.equal(this.open, true, 'Native instance is closed');
      return this._sendMessage(messageType, body);
    });
  }

  /**
   * Stops the native instance.
   */
  public async close(): Promise<void> {
    if (!this.open) {
      return;
    }
    this.open = false;
    await this._sendMessage(WorldStateMessageType.CLOSE, undefined);
    await this.queue.end();
  }

  private async _sendMessage<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T],
  ): Promise<WorldStateResponse[T]> {
    if (body) {
      let data: Record<string, any> = {};
      if ('treeId' in body) {
        data['treeId'] = MerkleTreeId[body.treeId];
      }

      if ('revision' in body) {
        data = { ...data, ...body.revision };
      }

      if ('forkId' in body) {
        data['forkId'] = body.forkId;
      }

      if ('blockNumber' in body) {
        data['blockNumber'] = body.blockNumber;
      }

      if ('leafIndex' in body) {
        data['leafIndex'] = body.leafIndex;
      }

      if ('blockHeaderHash' in body) {
        data['blockHeaderHash'] = '0x' + body.blockHeaderHash.toString('hex');
      }

      if ('leaf' in body) {
        if (Buffer.isBuffer(body.leaf)) {
          data['leaf'] = '0x' + body.leaf.toString('hex');
        } else if ('slot' in body.leaf) {
          data['slot'] = '0x' + body.leaf.slot.toString('hex');
          data['value'] = '0x' + body.leaf.value.toString('hex');
        } else {
          data['nullifier'] = '0x' + body.leaf.value.toString('hex');
        }
      }

      this.log.debug(`Calling ${WorldStateMessageType[messageType]} with ${fmtLogData(data)}`);
    } else {
      this.log.debug(`Calling ${WorldStateMessageType[messageType]}`);
    }

    const request = new TypedMessage(messageType, new MessageHeader({ messageId: this.nextMessageId++ }), body);

    const encodedRequest = this.encoder.encode(request);
    const encodedResponse = await this.instance.call(encodedRequest);

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

    const response = TypedMessage.fromMessagePack<T, WorldStateResponse[T]>(decodedResponse);

    if (response.header.requestId !== request.header.messageId) {
      throw new Error(
        'Response ID does not match request: ' + response.header.requestId + ' != ' + request.header.messageId,
      );
    }

    if (response.msgType !== messageType) {
      throw new Error('Invalid response message type: ' + response.msgType + ' != ' + messageType);
    }

    return response.value;
  }
}
