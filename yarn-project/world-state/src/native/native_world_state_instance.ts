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
import { NativeWorldState as BaseNativeWorldState } from '@aztec/native';

import assert from 'assert';
import { addExtension } from 'msgpackr';
import { cpus } from 'os';

import { type WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import {
  MessageHeader,
  TypedMessage,
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateRequestCategories,
  type WorldStateResponse,
  isWithCanonical,
  isWithForkId,
  isWithRevision,
} from './message.js';
import { WorldStateOpsQueue } from './world_state_ops_queue.js';

// small extension to pack an NodeJS Fr instance to a representation that the C++ code can understand
// this only works for writes. Unpacking from C++ can't create Fr instances because the data is passed
// as raw, untagged, buffers. On the NodeJS side we don't know what the buffer represents
// Adding a tag would be a solution, but it would have to be done on both sides and it's unclear where else
// C++ fr instances are sent/received/stored.
addExtension({
  Class: Fr,
  write: fr => fr.toBuffer(),
});

const MAX_WORLD_STATE_THREADS = +(process.env.HARDWARE_CONCURRENCY || '16');
const THREADS = Math.min(cpus().length, MAX_WORLD_STATE_THREADS);

export interface NativeWorldStateInstance {
  call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
  ): Promise<WorldStateResponse[T]>;
}

/**
 * Strongly-typed interface to access the WorldState class in the native nodejs_module library.
 */
export class NativeWorldState extends BaseNativeWorldState implements NativeWorldStateInstance {
  private open = true;

  /** Each message needs a unique ID */
  private nextMessageId = 0;

  // We maintain a map of queue to fork
  private queues = new Map<number, WorldStateOpsQueue>();

  /** Creates a new native WorldState instance */
  constructor(
    dataDir: string,
    dbMapSizeKb: number,
    private instrumentation: WorldStateInstrumentation,
    private log = createLogger('world-state:database'),
  ) {
    log.info(
      `Creating world state data store at directory ${dataDir} with map size ${dbMapSizeKb} KB and ${THREADS} threads.`,
    );

    super(
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
      THREADS,
    );
    // Manually create the queue for the canonical fork
    this.queues.set(0, new WorldStateOpsQueue());
  }

  /**
   * Sends a message to the native instance and returns the response.
   * @param messageType - The type of message to send
   * @param body - The message body
   * @param responseHandler - A callback accepting the response, executed on the job queue
   * @param errorHandler - A callback called on request error, executed on the job queue
   * @returns The response to the message
   */
  public async call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
    // allows for the pre-processing of responses on the job queue before being passed back
    responseHandler = (response: WorldStateResponse[T]): WorldStateResponse[T] => response,
  ): Promise<WorldStateResponse[T]> {
    // Here we determine which fork the request is being executed against and whether it requires uncommitted data
    let forkId = -1;
    // We assume it includes uncommitted unless explicitly told otherwise

    // Canonical requests ALWAYS go against the canonical fork
    // These include things like block syncs/unwinds etc
    // These requests don't contain a fork ID
    if (isWithCanonical(body)) {
      forkId = 0;
    } else if (isWithForkId(body)) {
      forkId = body.forkId;
    } else if (isWithRevision(body)) {
      forkId = body.revision.forkId;
      committedOnly = body.revision.includeUncommitted === false;
    } else {
      const _: never = body;
      throw new Error(`Unable to determine forkId for message=${WorldStateMessageType[messageType]}`);
    }

    // Get the queue or create a new one
    let requestQueue = this.queues.get(forkId);
    if (requestQueue === undefined) {
      requestQueue = new WorldStateOpsQueue();
      this.queues.set(forkId, requestQueue);
    }

    // Enqueue the request and wait for the response
    const response = await requestQueue.execute(
      async () => {
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
      },
      messageType,
      committedOnly,
    );

    // If the request was to delete the fork then we clean it up here
    if (messageType === WorldStateMessageType.DELETE_FORK) {
      await requestQueue.stop();
      this.queues.delete(forkId);
    }
    return response;
  }

  /**
   * Stops the native instance.
   */
  public async close(): Promise<void> {
    if (!this.open) {
      return;
    }
    this.open = false;
    const queue = this.queues.get(0)!;

    await queue.execute(
      async () => {
        await this._sendMessage(WorldStateMessageType.CLOSE, { canonical: true });
      },
      WorldStateMessageType.CLOSE,
      false,
    );
    await queue.stop();
  }

  private async _sendMessage<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
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

    try {
      const request = new TypedMessage(messageType, new MessageHeader({ messageId }), body);
      const { duration, response } = await this.sendMessage<T, WorldStateRequest[T], WorldStateResponse[T]>(request);

      this.log.trace(`Call messageId=${messageId} ${WorldStateMessageType[messageType]} took (ms)`, {
        totalDuration: duration.totalUs / 1e3,
        encodingDuration: duration.encodingUs / 1e3,
        callDuration: duration.callUs / 1e3,
        decodingDuration: duration.decodingUs / 1e3,
      });

      this.instrumentation.recordRoundTrip(duration.callUs, messageType);

      return response.value;
    } catch (error) {
      this.log.error(`Call messageId=${messageId} ${WorldStateMessageType[messageType]} failed: ${error}`);
      throw error;
    }
  }
}
