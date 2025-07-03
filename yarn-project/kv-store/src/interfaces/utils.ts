import type { AztecAsyncKVStore, AztecKVStore } from './store.js';

/* eslint-disable no-console */
export const mockLogger = {
  debug: (msg: string, data: any) => console.log(msg, data),
  info: (msg: string, data: any) => console.log(msg, data),
  warn: (msg: string, data: any) => console.log(msg, data),
  error: (msg: string, data: any) => console.error(msg, data),
  fatal: (msg: string, data: any) => console.error(msg, data),
  silent: (_msg: string, _data: any) => {},
  verbose: (msg: string, data: any) => console.log(msg, data),
  trace: (msg: string, data: any) => console.log(msg, data),
  level: 'trace' as const,
  isLevelEnabled: (_level: string) => true,
  module: 'kv-store:mock-logger',
  createChild: () => mockLogger,
};
/* eslint-enable no-console */

export function isSyncStore(store: AztecKVStore | AztecAsyncKVStore): store is AztecAsyncKVStore {
  return (store as AztecKVStore).syncGetters === true;
}
