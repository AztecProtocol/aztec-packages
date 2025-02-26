import bindings from 'bindings';

import type { MessageReceiver } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

const nativeModule: Record<string, NativeClassCtor> = bindings('nodejs_module');

export const NativeWorldState: NativeClassCtor = nativeModule.WorldState;
export const NativeLMDBStore: NativeClassCtor = nativeModule.LMDBStore;
