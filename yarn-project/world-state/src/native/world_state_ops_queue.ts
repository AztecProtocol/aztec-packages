import { promiseWithResolvers } from '@aztec/foundation/promise';

import { WorldStateMessageType } from './message.js';

type WorldStateOp = {
  mutating: boolean;
  request: () => Promise<any>;
  promise: PromiseWithResolvers<any>;
};

// These type of messages are mutating
export const MUTATING_MSG_TYPES = new Set([
  WorldStateMessageType.APPEND_LEAVES,
  WorldStateMessageType.BATCH_INSERT,
  WorldStateMessageType.SEQUENTIAL_INSERT,
  WorldStateMessageType.UPDATE_ARCHIVE,
  WorldStateMessageType.COMMIT,
  WorldStateMessageType.ROLLBACK,
  WorldStateMessageType.SYNC_BLOCK,
  WorldStateMessageType.CREATE_FORK,
  WorldStateMessageType.DELETE_FORK,
  WorldStateMessageType.FINALISE_BLOCKS,
  WorldStateMessageType.UNWIND_BLOCKS,
  WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS,
]);

export class WorldStateOpsQueue {
  private requests: WorldStateOp[] = [];
  private inFlightMutatingCount = 0;
  private inFlightCount = 0;
  private stopPromise?: Promise<void>;
  private stopResolve?: () => void;

  public execute(request: () => Promise<any>, messageType: WorldStateMessageType, committedOnly: boolean) {
    const op: WorldStateOp = {
      mutating: MUTATING_MSG_TYPES.has(messageType),
      request,
      promise: promiseWithResolvers(),
    };
    if (op.mutating) {
      this.executeMutating(op);
    } else if (committedOnly === false) {
      this.executeNonMutatingUncommitted(op);
    } else {
      this.executeNonMutatingCommitted(op);
    }
    return op.promise.promise;
  }

  private executeMutating(op: WorldStateOp) {
    if (this.inFlightCount === 0) {
      this.sendEnqueuedRequest(op);
    } else {
      this.requests.push(op);
    }
  }

  private executeNonMutatingUncommitted(op: WorldStateOp) {
    if (this.inFlightMutatingCount == 0 && this.requests.length == 0) {
      this.sendEnqueuedRequest(op);
    } else {
      this.requests.push(op);
    }
  }

  private executeNonMutatingCommitted(op: WorldStateOp) {
    op.request()
      .then(resp => {
        op.promise.resolve(resp);
      })
      .catch(err => {
        op.promise.reject(err);
      });
  }

  private sendEnqueuedRequest(op: WorldStateOp) {
    ++this.inFlightCount;
    if (op.mutating) {
      ++this.inFlightMutatingCount;
    }

    const postOp = () => {
      if (op.mutating) {
        --this.inFlightMutatingCount;
      }
      --this.inFlightCount;

      // If there still requests in flight then do nothing
      if (this.inFlightCount != 0) {
        return;
      }

      // no requests in flight, send next queued requests
      while (this.requests.length > 0) {
        const next = this.requests[0];
        if (next.mutating) {
          if (this.inFlightCount == 0) {
            // send the mutating request
            this.requests.splice(0, 1);
            this.sendEnqueuedRequest(next);
          }
          // this request is mutating, we need to stop here
          break;
        } else {
          // not mutating, send and go round again
          this.requests.splice(0, 1);
          this.sendEnqueuedRequest(next);
        }
      }

      // If the queue is empty, there is nothing in flight and we have been told to stop, then resolve the stop promise
      if (this.inFlightCount == 0 && this.stopResolve !== undefined) {
        this.stopResolve();
      }
    };
    op.request()
      .then(resp => {
        op.promise.resolve(resp);
        postOp();
      })
      .catch(err => {
        op.promise.reject(err);
        postOp();
      });
  }

  public stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    this.stopPromise = new Promise(resolve => {
      this.stopResolve = resolve;
    });
    if (this.requests.length == 0 && this.inFlightCount == 0 && this.stopResolve !== undefined) {
      this.stopResolve();
    }
    return this.stopPromise;
  }
}
