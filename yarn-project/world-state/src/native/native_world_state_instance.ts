import { MerkleTreeId } from '@aztec/circuit-types';
import {
  ARCHIVE_HEIGHT,
  Fr,
  GeneratorIndex,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';

import assert from 'assert';
import bindings from 'bindings';
import { Decoder, Encoder, addExtension } from 'msgpackr';
import { cpus } from 'os';
import { isAnyArrayBuffer } from 'util/types';

import { type WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
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

const NATIVE_LIBRARY_NAME = 'nodejs_module';
const NATIVE_CLASS_NAME = 'WorldState';

const NATIVE_MODULE = bindings(NATIVE_LIBRARY_NAME);
const MAX_WORLD_STATE_THREADS = +(process.env.HARDWARE_CONCURRENCY || '16');

export interface NativeWorldStateInstance {
  call<T extends WorldStateMessageType>(messageType: T, body: WorldStateRequest[T]): Promise<WorldStateResponse[T]>;
}

/**
 * Strongly-typed interface to access the WorldState class in the native nodejs_module library.
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
  constructor(
    dataDir: string,
    dbMapSizeKb: number,
    private instrumentation: WorldStateInstrumentation,
    private log = createLogger('world-state:database'),
  ) {
    const threads = Math.min(cpus().length, MAX_WORLD_STATE_THREADS);
    log.info(
      `Creating world state data store at directory ${dataDir} with map size ${dbMapSizeKb} KB and ${threads} threads.`,
    );
    this.instance = new NATIVE_MODULE[NATIVE_CLASS_NAME](
      dataDir,
      {
        [MerkleTreeId.NULLIFIER_TREE]: NULLIFIER_TREE_HEIGHT,
        [MerkleTreeId.NOTE_HASH_TREE]: NOTE_HASH_TREE_HEIGHT,
        [MerkleTreeId.PUBLIC_DATA_TREE]: PUBLIC_DATA_TREE_HEIGHT,
        [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: L1_TO_L2_MSG_TREE_HEIGHT,
        [MerkleTreeId.ARCHIVE]: ARCHIVE_HEIGHT,
      },
      {
        [MerkleTreeId.NULLIFIER_TREE]: 2 * MAX_NULLIFIERS_PER_TX,
        [MerkleTreeId.PUBLIC_DATA_TREE]: 2 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      },
      GeneratorIndex.BLOCK_HASH,
      dbMapSizeKb,
      threads,
    );
    this.queue.start();
  }

  /**
   * Sends a message to the native instance and returns the response.
   * @param messageType - The type of message to send
   * @param body - The message body
   * @param responseHandler - A callback accepting the response, executed on the job queue
   * @param errorHandler - A callback called on request error, executed on the job queue
   * @returns The response to the message
   */
  public call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T],
    // allows for the pre-processing of responses on the job queue before being passed back
    responseHandler = (response: WorldStateResponse[T]): WorldStateResponse[T] => response,
    errorHandler = (_: string) => {},
  ): Promise<WorldStateResponse[T]> {
    return this.queue.put(async () => {
      assert.notEqual(messageType, WorldStateMessageType.CLOSE, 'Use close() to close the native instance');
      assert.equal(this.open, true, 'Native instance is closed');
      let response: WorldStateResponse[T];
      try {
        response = await this._sendMessage(messageType, body);
      } catch (error: any) {
        errorHandler(error.message);
        throw error;
      }
      return responseHandler(response);
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
    const messageId = this.nextMessageId++;
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

      if ('toBlockNumber' in body) {
        data['toBlockNumber'] = body.toBlockNumber;
      }

      if ('leafIndex' in body) {
        data['leafIndex'] = body.leafIndex;
      }

      if ('blockHeaderHash' in body) {
        data['blockHeaderHash'] = '0x' + body.blockHeaderHash.toString('hex');
      }

      if ('leaves' in body) {
        data['leavesCount'] = body.leaves.length;
      }

      // sync operation
      if ('paddedNoteHashes' in body) {
        data['notesCount'] = body.paddedNoteHashes.length;
        data['nullifiersCount'] = body.paddedNullifiers.length;
        data['l1ToL2MessagesCount'] = body.paddedL1ToL2Messages.length;
        data['publicDataWritesCount'] = body.publicDataWrites.length;
      }

      this.log.trace(`Calling messageId=${messageId} ${WorldStateMessageType[messageType]}`, data);
    } else {
      this.log.trace(`Calling messageId=${messageId} ${WorldStateMessageType[messageType]}`);
    }

    const start = process.hrtime.bigint();

    const request = new TypedMessage(messageType, new MessageHeader({ messageId }), body);
    const encodedRequest = this.encoder.encode(request);
    const encodingEnd = process.hrtime.bigint();
    const encodingDuration = Number(encodingEnd - start) / 1_000_000;

    let encodedResponse: any;
    try {
      encodedResponse = await this.instance.call(encodedRequest);
    } catch (error) {
      this.log.error(`Call messageId=${messageId} ${WorldStateMessageType[messageType]} failed: ${error}`);
      throw error;
    }

    const callEnd = process.hrtime.bigint();

    const callDuration = Number(callEnd - encodingEnd) / 1_000_000;

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
    const decodingEnd = process.hrtime.bigint();
    const decodingDuration = Number(decodingEnd - callEnd) / 1_000_000;
    const totalDuration = Number(decodingEnd - start) / 1_000_000;
    this.log.trace(`Call messageId=${messageId} ${WorldStateMessageType[messageType]} took (ms)`, {
      totalDuration,
      encodingDuration,
      callDuration,
      decodingDuration,
    });

    if (response.header.requestId !== request.header.messageId) {
      throw new Error(
        'Response ID does not match request: ' + response.header.requestId + ' != ' + request.header.messageId,
      );
    }

    if (response.msgType !== messageType) {
      throw new Error('Invalid response message type: ' + response.msgType + ' != ' + messageType);
    }

    const callDurationUs = Number(callEnd - encodingEnd) / 1000;
    this.instrumentation.recordRoundTrip(callDurationUs, messageType);

    return response.value;
  }
}
