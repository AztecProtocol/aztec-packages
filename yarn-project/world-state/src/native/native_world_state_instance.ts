import {
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateRequestCategories,
  type WorldStateResponse,
} from './message.js';

export interface NativeWorldStateInstance {
  call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
    responseHandler?: (response: WorldStateResponse[T]) => WorldStateResponse[T],
    errorHandler?: (error: string) => void,
  ): Promise<WorldStateResponse[T]>;
  close(): Promise<void>;
}
