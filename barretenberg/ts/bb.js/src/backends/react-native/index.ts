import { createBackend, createBackendSync } from '@aztec-foundation/bb.js-api/react-native';
import type { IpcClientAsync, IpcClientSync } from '@aztec-foundation/ipc-runtime';

import { BackendOptions, BackendType } from '../index.js';

/** There is no bb binary in a React Native app; bb is a library linked into it. */
export function findBbBinary(_customPath?: string): string | null {
  throw new Error('findBbBinary is not available in React Native.');
}

/** React Native has no WebAssembly: bb runs in-process as the library the app links, over JSI. */
export const IN_PROCESS_BACKEND: BackendType = BackendType.Jsi;

/**
 * Create backend of specific type (no fallback)
 */
export async function createAsyncBackend(
  type: BackendType,
  _options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IpcClientAsync> {
  switch (type) {
    case BackendType.Jsi:
      logger('Using the JSI backend (bb on a native thread of its own)');
      return await createBackend();
    default:
      throw new Error(`Backend ${type} not supported in React Native (use BackendType.Jsi)`);
  }
}

/**
 * Create backend of specific type (no fallback)
 */
export async function createSyncBackend(
  type: BackendType,
  _options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IpcClientSync> {
  switch (type) {
    case BackendType.Jsi:
      logger('Using the JSI backend (bb on the calling thread)');
      return await createBackendSync();
    default:
      throw new Error(`Backend ${type} not supported in React Native (use BackendType.Jsi)`);
  }
}
