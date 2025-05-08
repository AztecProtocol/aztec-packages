import {
  ARCHIVE_HEIGHT,
  GeneratorIndex,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { NativeWorldState as BaseNativeWorldState, MsgpackChannel } from '@aztec/native';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';

import assert from 'assert';
import { cpus } from 'os';

import type { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import {
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateRequestCategories,
  type WorldStateResponse,
  isWithCanonical,
  isWithForkId,
  isWithRevision,
} from './message.js';
import { WorldStateOpsQueue } from './world_state_ops_queue.js';

const MAX_WORLD_STATE_THREADS = +(process.env.HARDWARE_CONCURRENCY || '16');

export interface NativeWorldStateInstance {
  call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
  ): Promise<WorldStateResponse[T]>;
}

/**
 * Strongly-typed interface to access the WorldState class in the native world_state_napi module.
 */
export class NativeWorldState implements NativeWorldStateInstance {
  private open = true;

  // We maintain a map of queue to fork
  private queues = new Map<number, WorldStateOpsQueue>();

  private instance: MsgpackChannel<WorldStateMessageType, WorldStateRequest, WorldStateResponse>;

  /** Creates a new native WorldState instance */
  constructor(
    private readonly dataDir: string,
    private readonly wsTreeMapSizes: WorldStateTreeMapSizes,
    private readonly prefilledPublicData: PublicDataTreeLeaf[] = [],
    private readonly instrumentation: WorldStateInstrumentation,
    private readonly log: Logger = createLogger('world-state:database'),
  ) {
    const threads = Math.min(cpus().length, MAX_WORLD_STATE_THREADS);
    log.info(
      `Creating world state data store at directory ${dataDir} with map sizes ${JSON.stringify(
        wsTreeMapSizes,
      )} and ${threads} threads.`,
    );
    const prefilledPublicDataBufferArray = prefilledPublicData.map(d => [d.slot.toBuffer(), d.value.toBuffer()]);
    const ws = new BaseNativeWorldState(
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
      prefilledPublicDataBufferArray,
      GeneratorIndex.BLOCK_HASH,
      {
        [MerkleTreeId.NULLIFIER_TREE]: wsTreeMapSizes.nullifierTreeMapSizeKb,
        [MerkleTreeId.NOTE_HASH_TREE]: wsTreeMapSizes.noteHashTreeMapSizeKb,
        [MerkleTreeId.PUBLIC_DATA_TREE]: wsTreeMapSizes.publicDataTreeMapSizeKb,
        [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: wsTreeMapSizes.messageTreeMapSizeKb,
        [MerkleTreeId.ARCHIVE]: wsTreeMapSizes.archiveTreeMapSizeKb,
      },
      threads,
    );
    this.instance = new MsgpackChannel(ws);
    // Manually create the queue for the canonical fork
    this.queues.set(0, new WorldStateOpsQueue());
  }

  public getDataDir() {
    return this.dataDir;
  }

  public clone() {
    return new NativeWorldState(
      this.dataDir,
      this.wsTreeMapSizes,
      this.prefilledPublicData,
      this.instrumentation,
      this.log,
    );
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
    errorHandler = (_: string) => {},
  ): Promise<WorldStateResponse[T]> {
    // Here we determine which fork the request is being executed against and whether it requires uncommitted data
    // We use the fork Id to select the appropriate request queue and the uncommitted data flag to pass to the queue
    let forkId = -1;
    // We assume it includes uncommitted unless explicitly told otherwise
    let committedOnly = false;

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
    let logMetadata: Record<string, any> = {};

    if (body) {
      if ('treeId' in body) {
        logMetadata['treeId'] = MerkleTreeId[body.treeId];
      }

      if ('revision' in body) {
        logMetadata = { ...logMetadata, ...body.revision };
      }

      if ('forkId' in body) {
        logMetadata['forkId'] = body.forkId;
      }

      if ('blockNumber' in body) {
        logMetadata['blockNumber'] = body.blockNumber;
      }

      if ('toBlockNumber' in body) {
        logMetadata['toBlockNumber'] = body.toBlockNumber;
      }

      if ('leafIndex' in body) {
        logMetadata['leafIndex'] = body.leafIndex;
      }

      if ('blockHeaderHash' in body) {
        logMetadata['blockHeaderHash'] = '0x' + body.blockHeaderHash.toString('hex');
      }

      if ('leaves' in body) {
        logMetadata['leavesCount'] = body.leaves.length;
      }

      // sync operation
      if ('paddedNoteHashes' in body) {
        logMetadata['notesCount'] = body.paddedNoteHashes.length;
        logMetadata['nullifiersCount'] = body.paddedNullifiers.length;
        logMetadata['l1ToL2MessagesCount'] = body.paddedL1ToL2Messages.length;
        logMetadata['publicDataWritesCount'] = body.publicDataWrites.length;
      }
    }

    try {
      const { duration, response } = await this.instance.sendMessage(messageType, body);
      this.log.trace(`Call ${WorldStateMessageType[messageType]} took (ms)`, {
        duration,
        ...logMetadata,
      });

      this.instrumentation.recordRoundTrip(duration.totalUs, messageType);
      return response;
    } catch (error) {
      this.log.error(`Call ${WorldStateMessageType[messageType]} failed: ${error}`, error, logMetadata);
      throw error;
    }
  }
}
