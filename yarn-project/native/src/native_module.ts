import { findNapiBinary } from '@aztec/bb.js';

import { createRequire } from 'module';

import type { MessageReceiver } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

function loadNativeModule(): Record<string, NativeClassCtor> {
  const require = createRequire(import.meta.url);
  const napiPath = findNapiBinary();
  if (!napiPath) {
    throw new Error('NAPI binary not found for current platform.');
  }
  return require(napiPath);
}

const nativeModule: Record<string, NativeClassCtor | Function> = loadNativeModule();

export const NativeLMDBStore: NativeClassCtor = nativeModule.LMDBStore as NativeClassCtor;
